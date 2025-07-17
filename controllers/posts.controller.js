const { elasticClient } = require("../config/elasticsearch");
const { PrismaClient } = require("@prisma/client");
const { buildQueryString } = require("../utils/query.utils");
const { format } = require("date-fns");
const prisma = new PrismaClient();

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
    req // Add req parameter to access middleware data
  } = params;

  // Build query_string parts in an array
  const qsParts = [];
  if (topicQueryString) qsParts.push(topicQueryString);

  // Source filtering - handle specific sources first
  if (postTypeSource !== 'All' && postTypeSource !== undefined) {
    switch (postTypeSource) {
      case "News":
        qsParts.push('source:("FakeNews" OR "News")');
        break;
      case "YouTube":
      case "Videos":
        qsParts.push('source:("Youtube" OR "Vimeo")');
        break;
      case "Web":
        qsParts.push('source:("FakeNews" OR "News" OR "Blogs" OR "Web")');
        break;
      case "GoogleMyBusiness":
        qsParts.push('source:("GoogleMyBusiness")');
        break;
      default:
        qsParts.push(`source:("${postTypeSource}")`);
    }
  } else {
    // Get available data sources from middleware
    const availableDataSources = req?.processedDataSources || [];
    console.log('Available data sources from middleware:', availableDataSources);
    
    // For special topic, only use Facebook and Twitter
    if (isSpecialTopic) {
      qsParts.push('source:("Facebook" OR "Twitter")');
    } else if (isScadUser === "true" && selectedTab === "GOOGLE") {
      qsParts.push('source:("GoogleMyBusiness")');
    } else {
      // Use exactly what's in the middleware, no fallback
      if (availableDataSources.length > 0) {
        const sourceFilter = availableDataSources.map(source => `"${source}"`).join(' OR ');
        qsParts.push(`source:(${sourceFilter})`);
        console.log('Applied source filter:', `source:(${sourceFilter})`);
      } else {
        console.log('Warning: No data sources available from middleware');
      }
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
      console.log("emotion", emotion);
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
      console.log("Applied emotion filter for:", emotion);
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
      console.log("Applied sentiment filter for:", sentiment);
    } else {
      // Handle single sentiment type
      must.push({
        term: { "predicted_sentiment_value.keyword": sentiment.trim() },
      });
      console.log("Applied sentiment filter for:", sentiment);
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

    // Handle special topic source filtering for entities
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
  } else if (postType === "socialMediaSourcesPosts") {
    // For social sources, force the source filter and a date range.
    qsParts.push(`source:("${postTypeSource}")`);
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
  };
};

/**
 * Category filter helper: normalizes the category and applies a multi_match clause
 * if no predefined filters exist.
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
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
        touchId,
        parentAccountId,
        limit,
        rating,
        category,
        click = "false",
        llm_mention_type,
      } = req.query;

      console.log('Request query parameters:', {
        topicId,
        postTypeSource,
        postType,
        processedDataSources: req.processedDataSources
      });

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      // Get googleUrls from middleware
      const googleUrls = req.googleUrls || [];

      // Get category data from middleware if available.
      const categoryData = req.processedCategories || {};

      // Parse and validate rating if provided.
      const requestedRatingValue = rating ? parseInt(rating, 10) : null;
      const isRatingFilterActive =
        postTypeSource === "GoogleMyBusiness" && requestedRatingValue !== null;

      // Build base topic query string if topicId provided.
      let topicQueryString = "";

      // Handle touchpoint query if provided.
      let touchPointQueryString = "";
      // if (touchId) {
      //   touchPointQueryString = await buildTouchPointQueryString(Number(touchId));
      // }

      // Determine date range - preserve full timestamp format for GoogleMyBusiness
      let greaterThanTime = inputGreaterThanTime;
      let lessThanTime = inputLessThanTime;

      // Handle special topic date range logic
      if (isSpecialTopic) {
        // For special topic, use wider range if no dates provided
        if (!greaterThanTime && !lessThanTime) {
          greaterThanTime = "2020-01-01";
          lessThanTime = "now";
        } else {
          // Use provided dates or fall back to environment defaults
          greaterThanTime = greaterThanTime || process.env.DATA_FETCH_FROM_TIME;
          lessThanTime = lessThanTime || process.env.DATA_FETCH_TO_TIME;
        }
      } else {
        // Original logic for regular topics
        greaterThanTime = greaterThanTime || process.env.DATA_FETCH_FROM_TIME;
        lessThanTime = lessThanTime || process.env.DATA_FETCH_TO_TIME;
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
        req // Pass the request object to access middleware data
      };

      const esQuery = buildElasticsearchQuery(queryParams);
      
      console.log('Final Elasticsearch query:', JSON.stringify(esQuery, null, 2));

      // Apply category filters if needed (for social media sources).
      const isSocialMedia =
        !postTypeSource ||
        [
          "Twitter",
          "Facebook",
          "Instagram",
          "Youtube",
          "Pinterest",
          "Reddit",
          "LinkedIn",
          "Web",
          "TikTok",
          "All",
        ].includes(postTypeSource);

      // Always apply category filters for social media when topicId is present
      if (isSocialMedia && topicId && Object.keys(categoryData).length > 0) {
        if (category && category !== "all") {
          // If a specific category is selected, apply that filter
          console.log(`Applying specific category filter for ${category}`);
          addCategoryFilters(esQuery.query, category, categoryData);
        } else {
          // If no specific category is selected but we have category data from topicId,
          // apply a combined filter from all categories
          console.log(
            `Applying combined category filters for topicId: ${topicId}`
          );

          const categoryKeys = Object.keys(categoryData);
          if (categoryKeys.length > 0) {
            const shouldClauses = [];

            // Collect all filters from all categories
            categoryKeys.forEach((categoryKey) => {
              const data = categoryData[categoryKey];
              const keywords = data.keywords || [];
              const hashtags = data.hashtags || [];
              const urls = data.urls || [];

              // Add each keyword, hashtag and URL as a should clause
              [...keywords, ...hashtags, ...urls].forEach((term) => {
                if (term && term.trim() !== "") {
                  shouldClauses.push({
                    multi_match: {
                      query: term,
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
              });
            });

            // Only add the filter if we have clauses to add
            if (shouldClauses.length > 0) {
              esQuery.query.bool.must.push({
                bool: {
                  should: shouldClauses,
                  minimum_should_match: 1,
                },
              });
            }
          }
        }
      } else if (
        !isSocialMedia &&
        category &&
        category !== "all" &&
        Object.keys(categoryData).length > 0
      ) {
        addCategoryFilters(esQuery.query, category, categoryData);
      }

      if (isSocialMedia) {
        const result = hasMultiMatchWithFields(esQuery);
        if (result == false) {
         return res.status(200).json({
            success: true,
            hits: [],
            responseArray: [],
            total: 0,
            dateRange: {
              greaterThanTime: "now-90d",
              lessThanTime: "now",
            },
          });
        }
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
