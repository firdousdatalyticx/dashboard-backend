const { elasticClient } = require("../config/elasticsearch");
const { PrismaClient } = require("@prisma/client");
const { buildQueryString } = require("../utils/query.utils");
const { format } = require("date-fns");
const prisma = new PrismaClient();
const processCategoryItems = require('../helpers/processedCategoryItems');

/**
 * Normalize source input - handles various formats
 * @param {string|string[]|undefined} source - Source parameter
 * @returns {string[]} Array of normalized sources
 */
function normalizeSourceInput(sourceParam) {
    if (!sourceParam || sourceParam === 'All') {
        return [];
    }

    if (Array.isArray(sourceParam)) {
        return sourceParam
            .filter(Boolean)
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    if (typeof sourceParam === 'string') {
        return sourceParam
            .split(',')
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    return [];
}

/**
 * Find matching category key with flexible matching
 * @param {string} selectedCategory - Category to find
 * @param {Object} categoryData - Category data object
 * @returns {string|null} Matched category key or null
 */
function findMatchingCategoryKey(selectedCategory, categoryData = {}) {
    if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'custom' || selectedCategory === '') {
        return selectedCategory;
    }

    const normalizedSelectedRaw = String(selectedCategory || '');
    const normalizedSelected = normalizedSelectedRaw.toLowerCase().replace(/\s+/g, '');
    const categoryKeys = Object.keys(categoryData || {});

    if (categoryKeys.length === 0) {
        return null;
    }

    let matchedKey = categoryKeys.find(
        key => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
    );

    if (!matchedKey) {
        matchedKey = categoryKeys.find(
            key => key.toLowerCase().replace(/\s+/g, '') === normalizedSelected
        );
    }

    if (!matchedKey) {
        matchedKey = categoryKeys.find(key => {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
            return normalizedKey.includes(normalizedSelected) || normalizedSelected.includes(normalizedKey);
        });
    }

    return matchedKey || null;
}
/**
 * Safely format a date for Elasticsearch (yyyy-MM-dd)
 */
const formatSafeDate = (date) => {
  if (!date) return "";
  try {
    return format(new Date(date), "yyyy-MM-dd");
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
};
/**
 * Build an Elasticsearch query based on the incoming parameters.
 * We separate query_string parts (strings that get AND joined)
 * from structured queries (multi_match, match, range, etc.)
 */
const buildElasticsearchQuery = (params) => {
  const {
    topicQueryString = "",
    postTypeSource,
    postType,
    postTypeData,
    sentiment,
    keyword,
    country,
    greaterThanTime,
    lessThanTime,
    touchPointQueryString,
    isScadUser,
    selectedTab,
    parentAccountId,
    limit = 50,
    rating,
    googleUrls = [],
    emotion,
    click,
    isSpecialTopic = false,
    llm_mention_type,
    topicId,
    source
  } = params;

  // Build query_string parts in an array
  const qsParts = [];
  if (topicQueryString) qsParts.push(topicQueryString);

  // Source filtering logic - only use sources parameter
  const normalizedSources = normalizeSourceInput(source);

  if (normalizedSources.length > 0) {
    // Specific sources provided via sources parameter - use these
    const sourcesStr = normalizedSources.map(s => `"${s}"`).join(' OR ');
    qsParts.push(`source:(${sourcesStr})`);
  }
  // No fallback logic - if no sources specified, don't filter by source
else {
        // Default logic based on topic
        if (topicId=== 2619 || topicId=== 2639 || topicId=== 2640 || topicId===2642) {
          qsParts.push(` source:("LinkedIn" OR "Linkedin")`);
        } else  if (topicId=== 2641 || topicId=== 2643 || topicId=== 2644 ) {
          qsParts.push(` source:("Twitter" OR "Instagram" OR "Facebook")`);
        }else {
          qsParts.push(` source:("Twitter" OR "Instagram" OR "Facebook" OR "TikTok" OR "Youtube" OR "LinkedIn" OR "Linkedin" OR "Pinterest" OR "Web" OR "Reddit")`);
        }
      }
  // Post type filtering – use a mapping for common cases.
  const typeMapping = {
    // Remove sentiment filters from here to avoid duplication
    Surprise: 'emotion_detector:("surprise")',
    Sadness: 'emotion_detector:("sadness")',
    Happy: 'emotion_detector:("happy")',
    Fear: 'emotion_detector:("fear")',
    Anger: 'emotion_detector:("anger")',
  };

  if (
    postType &&
    typeMapping[postType] &&
    postTypeSource !== "GoogleMyBusiness"
  ) {
    qsParts.push(typeMapping[postType]);
  }
  // Additional filtering based on postTypeData
  if (postTypeData === "llm_mention_type")
    qsParts.push(`llm_mention_type:("${postType}")`);
  else if (postTypeData === "predicted_category")
    qsParts.push(`predicted_category:("${postType}")`);
  else if (postTypeData === "llm_mention_touchpoint") {
    qsParts.push(`llm_mention_touchpoint:("${postType}")`);
    if (postTypeSource) qsParts.push(`llm_mention_type:("${postTypeSource}")`);
  }
  // Append touchpoint query if provided
  if (touchPointQueryString) qsParts.push(touchPointQueryString);

  // Prepare the final query string by joining with AND.
  const finalQueryString = qsParts.filter(Boolean).join(" AND ");

  // Build the structured "must" filters.
  const must = [];

  // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
  if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644) {
    must.push({
      term: { is_public_opinion: true }
    });
  }

  // Keyword multi_match search
  if (keyword && keyword.trim() !== "") {
    must.push({
      multi_match: {
        query: keyword.trim(),
        fields: [
          "p_message_text",
          "p_message",
          "keywords",
          "title",
          "hashtags",
          "u_source",
          "p_url",
        ],
        type: "phrase",
      },
    });
  }
  // Country filter
  if (country && country.trim() !== "") {
    must.push({
      match: {
        "u_country.keyword": country.trim(),
      },
    });
    // must.push({ match: { 'u_country': country.trim() } });
  }
  // Always add a range filter for the creation date.
  must.push({
    range: {
      p_created_time: {
        gte: greaterThanTime,
        lte: lessThanTime,
        format:
          "strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd'T'HH:mm:ss",
      },
    },
  });

  // Add emotion filter
  if (emotion && emotion !== "undefined" && emotion !== "null") {
    if (postTypeSource === "GoogleMyBusiness") {
    } else {
      // Use a should query that supports both exact and partial matching
      must.push({
        bool: {
          should: [
            // Exact match on the keyword field
            { term: { "llm_emotion.keyword": emotion.trim() } },

            // Partial match that is more lenient but gives lower score
            { match: { llm_emotion: emotion.trim() } },
          ],
          minimum_should_match: 1,
        },
      });
    }
  }

  // Add sentiment filter
  if (
    sentiment &&
    sentiment !== "undefined" &&
    sentiment !== "null" &&
    postTypeSource !== "GoogleMyBusiness"
  ) {
    if (sentiment.includes(",")) {
      // Handle multiple sentiment types
      const sentimentArray = sentiment.split(",");
      const sentimentFilter = {
        bool: {
          should: sentimentArray.map((s) => ({
            term: { "predicted_sentiment_value.keyword": s.trim() },
          })),
          minimum_should_match: 1,
        },
      };
      must.push(sentimentFilter);
    } else {
      // Handle single sentiment type
      must.push({
        term: { "predicted_sentiment_value.keyword": sentiment.trim() },
      });
    }
  } else if (sentiment && sentiment != "") {
    must.push({
      term: { "predicted_sentiment_value.keyword": sentiment.trim() },
    });
  }

  const mentionTypesArray =
    llm_mention_type && typeof llm_mention_type === "string"
      ? llm_mention_type.split(",").map((s) => s.trim())
      : llm_mention_type;

  // Apply LLM Mention Type filter if provided
  if (
    llm_mention_type &&
    llm_mention_type !== "" &&
    mentionTypesArray &&
    Array.isArray(mentionTypesArray) &&
    mentionTypesArray.length > 0 &&
    postTypeSource !== "GoogleMyBusiness"
  ) {
    const mentionTypeFilter = {
      terms: {
        "llm_mention_type.keyword": mentionTypesArray,
      },
    };

    must.push(mentionTypeFilter);
  }

  // Add Google URLs filter for GoogleMyBusiness source
  if (
    postTypeSource === "GoogleMyBusiness" &&
    googleUrls &&
    googleUrls.length > 0
  ) {
    const urlTerms = googleUrls.map((url) => `"${url}"`).join(" OR ");
    must.push({
      bool: {
        should: [
          { query_string: { query: `u_source:(${urlTerms})` } },
          { query_string: { query: `place_url:(${urlTerms})` } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  // For special post types that require customized query_string clauses…
  if (postType === "postsByDate" || postType === "postsByDateUNtopic") {
    let qs = finalQueryString;
    if (postType === "postsByDateUNtopic") qs += ' AND Keywords:("Yes")';
    qs += ` AND p_created_time:("${postTypeData}")`;
    must.push({ query_string: { query: qs } });
  } else {
    if (finalQueryString)
      must.push({ query_string: { query: finalQueryString } });
  }

  // Specific branch: twitter direct messages
  if (postType === "twitter_dm") {
    must.push({
      query_string: {
        query: `source:("DM") AND db_customer_id:("${parentAccountId}")`,
      },
    });
  }
  // For GoogleMyBusiness posts, add rating or sentiment-based filters
  else if (postTypeSource === "GoogleMyBusiness") {
    if (rating) {
      const ratingValue = parseInt(rating, 10);
      must.push({
        term: { rating: ratingValue },
      });
      console.log(`Filtering for exact rating: ${ratingValue}`);
    } else if (sentiment === "Positive" && !emotion && click != "true") {
      // Only apply sentiment filters if no emotion filter is already applied
      must.push({ range: { rating: { gte: 4, lte: 5 } } });
    } else if (sentiment === "Negative" && !emotion && click != "true") {
      must.push({ range: { rating: { gte: 1, lte: 2 } } });
    } else if (sentiment === "Neutral" && !emotion && click != "true") {
      must.push({ term: { rating: 3 } });
    }
  }
  // Other special conditions (score, churn, top entities, etc.)
  else if (
    [
      "satisfactionScore",
      "churnProbability",
      "Low Score",
      "Medium Score",
      "High Score",
      "Low Probability",
      "Medium Probability",
      "High Probability",
    ].includes(postType)
  ) {
    if (postTypeData) {
      const [gtv, ltv] = postTypeData.split("-");
      const divisor = postType.includes("Score") ? 100 : 1;
      must.push({
        range: {
          [postType.includes("Score") ? "satisfaction_sore" : "churn_prob"]: {
            gte: Number(gtv) / divisor,
            lte: Number(ltv) / divisor,
          },
        },
      });
    }
  } else if (postTypeSource === "topTenEntities") {
    must.push({
      range: { p_created_time: { gte: greaterThanTime, lte: lessThanTime } },
    });
    must.push({ match_phrase: { "llm_entities.Organization": postType } });

    // Only add source filters if sources parameter is not provided
    if (!source || source === '') {
      if (isSpecialTopic) {
        must.push({
          bool: {
            should: [
              { match_phrase: { source: "Facebook" } },
              { match_phrase: { source: "Twitter" } },
            ],
            minimum_should_match: 1,
          },
        });
      } else if (topicId==2641 || topicId === 2643 || topicId === 2644) {
        must.push({
          bool: {
            should: [
              { match_phrase: { source: "Facebook" } },
              { match_phrase: { source: "Twitter" } },
              { match_phrase: { source: "Instagram" } },
            ],
            minimum_should_match: 1,
          },
        });
      } else {
        must.push({
          bool: {
            should: [
              { match_phrase: { source: "Facebook" } },
              { match_phrase: { source: "Twitter" } },
              { match_phrase: { source: "Instagram" } },
              { match_phrase: { source: "Youtube" } },
              { match_phrase: { source: "Pinterest" } },
              { match_phrase: { source: "Reddit" } },
              { match_phrase: { source: "LinkedIn" } },
              { match_phrase: { source: "Web" } },
              { match_phrase: { source: "TikTok" } },
            ],
            minimum_should_match: 1,
          },
        });
      }
    }
  } else if (postType === "socialMediaSourcesPosts") {
    // For social sources, only add source filter if sources parameter is not provided
    if (!source || source === '') {
      qsParts.push(`source:("${postTypeSource}")`);
    }
    must.push({ query_string: { query: qsParts.join(" AND ") } });
    must.push({ range: { p_created_time: { gte: "now-90d", lte: "now" } } });
  }

  return {
    from: 0,
    size: limit,
    query: { bool: { must } },
    sort: [{ p_created_time: { order: "desc" } }],
  };
};

/**
 * Process an Elasticsearch hit and format it for the frontend.
 */
const formatPostData = async (hit) => {
  const source = hit._source;

  // Use a default image if a profile picture is not provided.
  const profilePic =
    source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
  const following = source.u_following > 0 ? `${source.u_following}` : "";
  const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
  const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

  // Emotion: use either provided llm_emotion or derive it from rating for GoogleMyBusiness.
  const llm_emotion =
    source.llm_emotion ||
    (source.source === "GoogleMyBusiness" && source.rating
      ? source.rating >= 4
        ? "Supportive"
        : source.rating <= 2
        ? "Frustrated"
        : "Neutral"
      : "");

  // Clean up comments URL if available.
  const commentsUrl =
    source.p_comments_text && source.p_comments_text.trim() !== ""
      ? source.p_url.trim().replace("https: // ", "https://")
      : "";

  const comments = `${source.p_comments}`;
  const shares = source.p_shares > 0 ? `${source.p_shares}` : "";
  const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : "";

  const content =
    source.p_content && source.p_content.trim() !== "" ? source.p_content : "";
  const imageUrl =
    source.p_picture_url && source.p_picture_url.trim() !== ""
      ? source.p_picture_url
      : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Determine sentiment. If updated manually in the DB, prefer that.
  let predicted_sentiment = "";
  let predicted_category = "";
  const labelData = await prisma.customers_label_data.findMany({
    where: { p_id: hit._id },
    orderBy: { label_id: "desc" },
    take: 1,
  });

  if (labelData.length > 0 && labelData[0]?.predicted_sentiment_value_requested)
    predicted_sentiment = `${labelData[0].predicted_sentiment_value_requested}`;
  else if (source.predicted_sentiment_value)
    predicted_sentiment = `${source.predicted_sentiment_value}`;
  else if (source.source === "GoogleMyBusiness" && source.rating) {
    predicted_sentiment =
      source.rating >= 4
        ? "Positive"
        : source.rating <= 2
        ? "Negative"
        : "Neutral";
  }

  if (source.predicted_category) predicted_category = source.predicted_category;

  // Handle YouTube-specific fields.
  let youtubeVideoUrl = "";
  let profilePicture2 = "";
  if (source.source === "Youtube") {
    if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
    else if (source.p_id)
      youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
  } else {
    profilePicture2 = source.p_picture ? source.p_picture : "";
  }

  // Determine source icon based on source name.
  let sourceIcon = "";
  const userSource = source.source;
  if (
    ["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(
      userSource
    )
  )
    sourceIcon = "Blog";
  else if (userSource === "Reddit") sourceIcon = "Reddit";
  else if (["FakeNews", "News"].includes(userSource)) sourceIcon = "News";
  else if (userSource === "Tumblr") sourceIcon = "Tumblr";
  else if (userSource === "Vimeo") sourceIcon = "Vimeo";
  else if (["Web", "DeepWeb"].includes(userSource)) sourceIcon = "Web";
  else sourceIcon = userSource;

  // Format message text – with special handling for GoogleMaps/Tripadvisor.
  let message_text = "";
  if (["GoogleMaps", "Tripadvisor"].includes(source.source)) {
    const parts = source.p_message_text.split("***|||###");
    message_text = parts[0].replace(/\n/g, "<br>");
  } else {
    message_text = source.p_message_text
      ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
      : "";
  }

  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: source.u_fullname,
    user_data_string: "",
    followers,
    following,
    posts,
    likes,
    llm_emotion,
    llm_language: source.llm_language,
    commentsUrl,
    comments,
    shares,
    engagements,
    content,
    image_url: imageUrl,
    predicted_sentiment,
    predicted_category,
    youtube_video_url: youtubeVideoUrl,
    source_icon: `${source.p_url},${sourceIcon}`,
    message_text,
    source: source.source,
    rating: source.rating,
    comment: source.comment,
    businessResponse: source.business_response,
    uSource: source.u_source,
    googleName: source.name,
    created_at: new Date(source.p_created_time).toLocaleString(),
    p_comments_data:source.p_comments_data,
    
  };
};

/**
 * Category items filter helper: applies filters based on provided category items
 * with fuzzy matching and predefined category data.
 */
function addCategoryItemsFilters(query, selectedCategory, categoryData) {
  if (!selectedCategory || selectedCategory.trim().toLowerCase() === "all")
    return;

  // Clean up the category name by removing leading/trailing spaces
  const normalizedCategory = selectedCategory.trim();

  // First try exact match
  let data = categoryData[normalizedCategory];

  // If no exact match, try case-insensitive search
  if (!data) {
    const categoryKeys = Object.keys(categoryData);
    const matchingKey = categoryKeys.find(
      (key) =>
        key.toLowerCase() === normalizedCategory.toLowerCase() ||
        key.trim().toLowerCase() === normalizedCategory.toLowerCase()
    );

    if (matchingKey) {
      data = categoryData[matchingKey];
    }
  }

  if (data) {
    const hasKeywords =
      Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags =
      Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).map((keyword) => ({
              multi_match: {
                query: keyword,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            })),
            ...(data.hashtags || []).map((hashtag) => ({
              multi_match: {
                query: hashtag,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            })),
            ...(data.urls || []).map((url) => ({
              multi_match: {
                query: url,
                fields: [
                  "p_message_text",
                  "p_message",
                  "keywords",
                  "title",
                  "hashtags",
                  "u_source",
                  "p_url",
                ],
                type: "phrase",
              },
            })),
          ],
          minimum_should_match: 1,
        },
      });
      return;
    }
  }

  // Fallback: simple multi_match filter on the given category.
  query.bool.must.push({
    multi_match: {
      query: selectedCategory,
      fields: [
        "p_message_text",
        "p_message",
        "keywords",
        "title",
        "hashtags",
        "u_source",
        "p_url",
      ],
      type: "phrase",
    },
  });
}

const postsController = {
  /**
   * Get posts based on filtering criteria.
   */
  getPosts: async (req, res) => {
    try {
      const {
        topicId,
        isScadUser,
        selectedTab,
        postTypeSource,
        postType,
        postTypeData,
        sentiment,
        emotion,
        keyword,
        country,
        greaterThanTime: inputGreaterThanTime,
        lessThanTime: inputLessThanTime,
        timeSlot,
        touchId,
        parentAccountId,
        limit,
        rating,
        category,
        click = "false",
        llm_mention_type,
        type,
        categoryItems,
        sources // URL parameter is 'sources'
      } = req.query;

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Get googleUrls from middleware
      const googleUrls = req.googleUrls || [];

      // Parse categoryItems from URL-encoded comma-separated string
      let parsedCategoryItems = [];
      if (categoryItems && typeof categoryItems === 'string') {
        // Decode URL encoding and split by comma
        const decodedItems = decodeURIComponent(categoryItems);
        parsedCategoryItems = decodedItems.split(',').map(item => item.trim()).filter(item => item.length > 0);
      }

      // Get category data from middleware if available.
      let categoryData = {};

      if (parsedCategoryItems && parsedCategoryItems.length > 0) {
        categoryData = processCategoryItems(parsedCategoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && Object.keys(categoryData).length > 0) {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
               selectedCategory = matchedKey;
        }else{
          selectedCategory="all";
        }
      }

      // Parse and validate rating if provided.
      const requestedRatingValue = rating ? parseInt(rating, 10) : null;
      const isRatingFilterActive =
        postTypeSource === "GoogleMyBusiness" && requestedRatingValue !== null;

      // Build base topic query string if topicId provided.
      let topicQueryString = "";
      if (topicId) {
        topicQueryString = await buildQueryString(
          parseInt(topicId),
          isScadUser,
          selectedTab
        );
      }

      // Handle touchpoint query if provided.
      let touchPointQueryString = "";
      // if (touchId) {
      //   touchPointQueryString = await buildTouchPointQueryString(Number(touchId));
      // }

      // Determine date range - preserve full timestamp format for GoogleMyBusiness
      let greaterThanTime = inputGreaterThanTime;
      let lessThanTime = inputLessThanTime;

      // Handle timeSlot parameter - only use if explicit dates are not provided
      if (timeSlot && !inputGreaterThanTime && !inputLessThanTime) {
        // When timeSlot is provided and no explicit dates, calculate based on timeSlot
        const now = new Date();
        let daysAgo = 90; // default

        switch (timeSlot) {
          case 'last24hours':
            daysAgo = 1;
            break;
          case 'last7days':
            daysAgo = 7;
            break;
          case 'last30days':
            daysAgo = 30;
            break;
          case 'last60days':
            daysAgo = 60;
            break;
          case 'last90days':
            daysAgo = 90;
            break;
          case 'last120days':
            daysAgo = 120;
            break;
          default:
            daysAgo = 90; // fallback
        }

        const pastDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        greaterThanTime = pastDate.toISOString();
        lessThanTime = now.toISOString();
      } else {
        // Use explicit dates or fall back to environment defaults
        greaterThanTime = inputGreaterThanTime || process.env.DATA_FETCH_FROM_TIME;
        lessThanTime = inputLessThanTime || process.env.DATA_FETCH_TO_TIME;
      }
      

      // For GoogleMyBusiness, make sure time is properly formatted for consistency with review-trends
      if (postTypeSource === "GoogleMyBusiness") {
        // Make sure we handle date formats consistently
        if (
          greaterThanTime &&
          !greaterThanTime.includes("T") &&
          !greaterThanTime.includes("now")
        ) {
          greaterThanTime = `${greaterThanTime}T00:00:00`;
        }
        if (
          lessThanTime &&
          !lessThanTime.includes("T") &&
          !lessThanTime.includes("now")
        ) {
          lessThanTime = `${lessThanTime}T23:59:59`;
        }
      }

      // Build the Elasticsearch query parameters.
      const queryParams = {
        topicQueryString,
        postTypeSource,
        postType,
        postTypeData,
        sentiment,
        emotion,
        keyword,
        country,
        greaterThanTime,
        lessThanTime,
        touchPointQueryString,
        isScadUser,
        selectedTab,
        parentAccountId,
        limit: parseInt(limit, 10) || 50,
        rating,
        googleUrls,
        click,
        isSpecialTopic,
        llm_mention_type,
        topicId: parseInt(topicId),
        source: sources
      };

      const esQuery = buildElasticsearchQuery(queryParams);

      // Apply category filters based on provided arguments
      if (parsedCategoryItems && parsedCategoryItems.length > 0 && Object.keys(categoryData).length > 0) {
        // Use category items filtering when categoryItems parameter is provided
        addCategoryItemsFilters(esQuery.query, selectedCategory, categoryData);

        // Check if we have valid category filters
        const result = hasMultiMatchWithFields(esQuery);
        if (result == false) {
         return res.status(200).json({
            success: true,
            hits: [],
            responseArray: [],
            total: 0,
            dateRange: {
              greaterThanTime: greaterThanTime,
              lessThanTime: lessThanTime,
            },
          });
        }
      } else if (selectedCategory && selectedCategory !== 'all' && Object.keys(categoryData).length > 0) {
        // Use selected category filtering when category parameter is provided
        addCategoryFilters(esQuery.query, selectedCategory, categoryData);

        // Check if we have valid category filters
        const result = hasMultiMatchWithFields(esQuery);
        if (result == false) {
         return res.status(200).json({
            success: true,
            hits: [],
            responseArray: [],
            total: 0,
            dateRange: {
              greaterThanTime: greaterThanTime,
              lessThanTime: lessThanTime,
            },
          });
        }
      }


      if(type==="Popular Posts"){
        esQuery.sort=[
          {
            "p_engagement": {
                "order": "desc",
                "missing": "_last"
            }
        },
        {
            "p_likes": {
                "order": "desc",
                "missing": "_last"
            }
        },
        {
            "p_comments": {
                "order": "desc",
                "missing": "_last"
            }
        },
        {
            "p_shares": {
                "order": "desc",
                "missing": "_last"
            }
        }
      ];
      }

      // Execute the Elasticsearch query.
      const results = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: esQuery,
      });
      // If rating filtering is active, filter hits accordingly.
      const hits = results?.hits?.hits || [];
      const filteredHits = isRatingFilterActive
        ? hits.filter((hit) => {
            const hitRating =
              hit._source.rating !== undefined
                ? Number(hit._source.rating)
                : null;
            return hitRating === requestedRatingValue;
          })
        : hits;

      // Format results concurrently.
      const ratingsFound = new Set();
      const responseArray = await Promise.all(
        filteredHits.map(async (hit) => {
          const formatted = await formatPostData(hit);
          if (
            postTypeSource === "GoogleMyBusiness" &&
            hit._source.rating !== undefined
          )
            ratingsFound.add(hit._source.rating);
          return formatted;
        })
      );

      return res.status(200).json({
        success: true,
        hits,
        responseArray,
        total: isRatingFilterActive
          ? responseArray.length
          : results?.hits?.total?.value || 0,
        foundRatings:
          postTypeSource === "GoogleMyBusiness"
            ? Array.from(ratingsFound)
            : undefined,
        filtered: isRatingFilterActive
          ? `${filteredHits.length}/${hits.length}`
          : undefined,
        dateRange: { greaterThanTime, lessThanTime },
        esQuery
      });
    } catch (error) {
      console.error("Error fetching posts:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

/**
 * Add category filters to the query
 * @param {Object} query - Elasticsearch query object
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data with filters
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
  if (selectedCategory === 'all') {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap(data =>
            (data.keywords || []).map(keyword => ({
              multi_match: {
                query: keyword,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            }))
          ),
          ...Object.values(categoryData).flatMap(data =>
            (data.hashtags || []).map(hashtag => ({
              multi_match: {
                query: hashtag,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            }))
          ),
          ...Object.values(categoryData).flatMap(data =>
            (data.urls || []).map(url => ({
              multi_match: {
                query: url,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            }))
          )
        ],
        minimum_should_match: 1
      }
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];

    // Check if the category has any filtering criteria
    const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    // Only add the filter if there's at least one criteria
    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).map(keyword => ({
              multi_match: {
                query: keyword,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            })),
            ...(data.hashtags || []).map(hashtag => ({
              multi_match: {
                query: hashtag,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            })),
            ...(data.urls || []).map(url => ({
              multi_match: {
                query: url,
                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                type: 'phrase'
              }
            }))
          ],
          minimum_should_match: 1
        }
      });
    } else {
      // If the category has no filtering criteria, add a condition that will match nothing
      query.bool.must.push({
        bool: {
          must_not: {
            match_all: {}
          }
        }
      });
    }
  }
}

function hasMultiMatchWithFields(query) {
  const mustClauses = query?.query?.bool?.must || [];

  for (const clause of mustClauses) {
    const shouldClause = clause.bool?.should;
    const minimumMatch = clause.bool?.minimum_should_match;

    if (shouldClause && minimumMatch === 1) {
      return shouldClause.some(
        (item) =>
          item.multi_match &&
          Array.isArray(item.multi_match.fields) &&
          item.multi_match.fields.includes("p_message_text") &&
          item.multi_match.fields.includes("p_message") &&
          item.multi_match.fields.includes("keywords") &&
          item.multi_match.fields.includes("title") &&
          item.multi_match.fields.includes("hashtags") &&
          item.multi_match.fields.includes("u_source") &&
          item.multi_match.fields.includes("p_url")
      );
    }
  }

  return false;
}

module.exports = postsController;
