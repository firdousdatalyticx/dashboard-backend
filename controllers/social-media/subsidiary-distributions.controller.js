const { elasticClient } = require("../../config/elasticsearch");
const { processFilters } = require("./filter.utils");
// Removed date-fns import as counts endpoint no longer needs date formatting
const processCategoryItems = require("../../helpers/processedCategoryItems");
const normalizeSourceInput = (sourceParam) => {
  if (!sourceParam || sourceParam === "All") {
    return [];
  }

  if (Array.isArray(sourceParam)) {
    return sourceParam
      .filter(Boolean)
      .map((src) => src.trim())
      .filter((src) => src.length > 0 && src.toLowerCase() !== "all");
  }

  if (typeof sourceParam === "string") {
    return sourceParam
      .split(",")
      .map((src) => src.trim())
      .filter((src) => src.length > 0 && src.toLowerCase() !== "all");
  }

  return [];
};

const findMatchingCategoryKey = (selectedCategory, categoryData = {}) => {
  if (
    !selectedCategory ||
    selectedCategory === "all" ||
    selectedCategory === "custom" ||
    selectedCategory === ""
  ) {
    return selectedCategory;
  }

  const normalizedSelectedRaw = String(selectedCategory || "");
  const normalizedSelected = normalizedSelectedRaw
    .toLowerCase()
    .replace(/\s+/g, "");
  const categoryKeys = Object.keys(categoryData || {});

  if (categoryKeys.length === 0) {
    return null;
  }

  let matchedKey = categoryKeys.find(
    (key) => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
  );

  if (!matchedKey) {
    matchedKey = categoryKeys.find(
      (key) => key.toLowerCase().replace(/\s+/g, "") === normalizedSelected
    );
  }

  if (!matchedKey) {
    matchedKey = categoryKeys.find((key) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      return (
        normalizedKey.includes(normalizedSelected) ||
        normalizedSelected.includes(normalizedKey)
      );
    });
  }

  return matchedKey || null;
};

const socialsSubsidiaryDistributionsController = {
  getSubsidiaryDistributions: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
      } = req.body;

      // Check if this is the special topicId
      const isSpecialTopic =
        (topicId && parseInt(topicId) === 2600) || parseInt(topicId) === 2627;

      // Get category data from middleware
      let categoryData = {};

      if (
        req.body.categoryItems &&
        Array.isArray(req.body.categoryItems) &&
        req.body.categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }
      // If there's nothing to search for, return zero counts
      if (Object.keys(categoryData).length === 0) {
        return res.json({});
      }
      let workingCategory = category;
      // Only filter categoryData if category is not 'all', not empty, not 'custom' AND exists
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(
          workingCategory,
          categoryData
        );

        if (matchedKey) {
          // Category found - filter to only this category
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          // Category not found - keep all categoryData and set workingCategory to 'all'
          // This maintains existing functionality
          workingCategory = "all";
        }
      }

      // Build base query for filters processing
      const baseQueryString = buildBaseQueryString(
        workingCategory,
        categoryData
      );
      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });


      let queryTimeRange = null;
    
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      

      if (Number(topicId) == 2473) {
        queryTimeRange = {
          gte: "2023-01-01",
          lte: "2023-04-30",
        };
      }

      // Build base query
      const query = buildBaseQuery(
        queryTimeRange
          ? {
              greaterThanTime: queryTimeRange.gte,
              lessThanTime: queryTimeRange.lte,
            }
          : null,
        source,
        isSpecialTopic,
        parseInt(topicId)
      );

      if (workingCategory == "all" && category !== "all") {
        const categoryFilter = {
          bool: {
            should: [
              {
                multi_match: {
                  query: category,
                  fields: [
                    "p_message_text",
                    "p_message",
                    "hashtags",
                    "u_source",
                    "p_url",
                  ],
                  type: "phrase",
                },
              },
            ],
            minimum_should_match: 1,
          },
        };
        query.bool.must.push(categoryFilter);
      }

      //    return res.send(query)
      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      // Apply sentiment filter if provided
      if (
        sentimentType &&
        sentimentType !== "undefined" &&
        sentimentType !== "null"
      ) {
        if (sentimentType.includes(",")) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(",");
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map((sentiment) => ({
                match: { predicted_sentiment_value: sentiment.trim() },
              })),
              minimum_should_match: 1,
            },
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() },
          });
        }
      }

      // Normalize input into array
      let mentionTypesArray = [];

      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true

      // CASE 1: If mentionTypesArray has valid values → apply should-match filter
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        });
      }
   

      query.bool = {
        ...query.bool,
        should: [
          { match_phrase: { u_fullname: "Help AG" } },
          { match_phrase: { u_fullname: "Bespin Global" } },
          { match_phrase: { u_fullname: "GlassHouse" } },
          { match_phrase: { u_fullname: "Beehive" } },
          { match_phrase: { u_fullname: "Haifin" } },
        ],
        minimum_should_match: 1,
      };


      // Aggregation query with both sentiment and emotion
      const aggQuery = {
        query: query, // your existing bool query with filters
        size: 0,
        aggs: {
          subsidiary_counts: {
            terms: {
              field: "u_fullname.keyword",
              size: 10,
            },
            aggs: {
              sentiment_counts: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 5,
                },
              },
              emotion_counts: {
                terms: {
                  field: "llm_emotion.keyword",
                  size: 10,
                },
              },
            },
          },
        },
      };


      // Execute aggregation
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Process buckets
      const buckets = aggResponse.aggregations.subsidiary_counts.buckets;
      const formattedCounts = {};

      buckets.forEach((bucket) => {
        const subsidiaryName = bucket.key;
        const totalCount = bucket.doc_count;

        // Sentiment counts
        const sentimentCounts = {};
        if (bucket.sentiment_counts && bucket.sentiment_counts.buckets) {
          bucket.sentiment_counts.buckets.forEach((sentBucket) => {
            sentimentCounts[sentBucket.key] = sentBucket.doc_count;
          });
        }

        // Emotion counts
        const emotionCounts = {};
        if (bucket.emotion_counts && bucket.emotion_counts.buckets) {
          bucket.emotion_counts.buckets.forEach((emotionBucket) => {
            emotionCounts[emotionBucket.key] = emotionBucket.doc_count;
          });
        }

        formattedCounts[subsidiaryName] = {
          total: totalCount,
          sentiments: sentimentCounts,
          emotions: emotionCounts,
        };
      });


      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getSubsidiaryDistributionsPosts: async (req, res) => {
  try {
    const {
      timeSlot,
      fromDate,
      toDate,
      sentimentType,
      category = "all",
      source = "All",
      topicId,
      llm_mention_type,
      subsidiary,      // Added: subsidiary clicked
      type,            // Added: 'sentiment' or 'emotion'
      value,           // Added: selected sentiment/emotion value
      limit = 30
    } = req.query;

    // Check if this is the special topicId
    const isSpecialTopic =
      (topicId && parseInt(topicId) === 2600) || parseInt(topicId) === 2627;

    // Category data from middleware
    let categoryData = {};
    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
      categoryData = processCategoryItems(req.body.categoryItems);
    } else {
      categoryData = req.processedCategories || {};
    }
    if (Object.keys(categoryData).length === 0) return res.json({});

    let workingCategory = category;
    if (workingCategory !== "all" && workingCategory !== "" && workingCategory !== "custom") {
      const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
      if (matchedKey) {
        categoryData = { [matchedKey]: categoryData[matchedKey] };
        workingCategory = matchedKey;
      } else {
        workingCategory = "all";
      }
    }

    // Build base query for filters processing
    const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
    const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString });

      queryTimeRange = { gte: filters.greaterThanTime, lte: filters.lessThanTime };

    const query = buildBaseQuery(
      queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
      source,
      isSpecialTopic,
      parseInt(topicId)
    );

    if (workingCategory == "all" && category !== "all") {
      query.bool.must.push({
        bool: {
          should: [
            { multi_match: { query: category, fields: ["p_message_text","p_message","hashtags","u_source","p_url"], type: "phrase" } }
          ],
          minimum_should_match: 1
        }
      });
    }

    addCategoryFilters(query, workingCategory, categoryData);

    // Sentiment filter from general request
    if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
      const sentimentArray = sentimentType.includes(",") ? sentimentType.split(",") : [sentimentType];
      query.bool.must.push({
        bool: {
          should: sentimentArray.map(s => ({ match: { predicted_sentiment_value: s.trim() } })),
          minimum_should_match: 1
        }
      });
    }

    // LLM mention type filter
    let mentionTypesArray = [];
    if (llm_mention_type) {
      mentionTypesArray = Array.isArray(llm_mention_type) ? llm_mention_type : llm_mention_type.split(",").map(s => s.trim());
    }
    if (mentionTypesArray.length > 0) {
      query.bool.must.push({ bool: { should: mentionTypesArray.map(t => ({ match: { llm_mention_type: t } })), minimum_should_match: 1 } });
    } else if ([2641, 2643, 2644, 2651, 2652, 2653, 2654, 2655, 2663].includes(Number(topicId))) {
      query.bool.must.push({ bool: { must_not: [{ match: { llm_mention_type: "Promotion" } }, { match: { llm_mention_type: "Booking" } }, { match: { llm_mention_type: "Others" } }] } });
    }

    // Filter for clicked subsidiary
    if (subsidiary) {
      query.bool.must.push({ match_phrase: { u_fullname: subsidiary } });
    }

    // Filter for clicked sentiment or emotion
    if (type && value) {
      if (type === "sentiment") {
        query.bool.must.push({ match: { predicted_sentiment_value: value } });
      } else if (type === "emotion") {
        query.bool.must.push({ match: { llm_emotion: value } });
      }
    }

    // Execute search for posts
    const searchResponse = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: {
        query: query,
        size: Number(limit),
        sort: [{ created_at: { order: "desc" } }]
      }
    });


 const posts = searchResponse.hits.hits.map(hit => formatPostData(hit));
    return res.json({responseArray: posts });

  } catch (error) {
    console.error("Error fetching social media distributions posts:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

};


const formatPostData = (hit) => {
  const s = hit._source;
  const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  const followers = s.u_followers > 0 ? `${s.u_followers}` : '';
  const following = s.u_following > 0 ? `${s.u_following}` : '';
  const posts = s.u_posts > 0 ? `${s.u_posts}` : '';
  const likes = s.p_likes > 0 ? `${s.p_likes}` : '';
  const llm_emotion = s.llm_emotion || '';
  const commentsUrl = s.p_comments_text && s.p_comments_text.trim() ? s.p_url.trim().replace('https: // ', 'https://') : '';
  const comments = `${s.p_comments}`;
  const shares = s.p_shares > 0 ? `${s.p_shares}` : '';
  const engagements = s.p_engagement > 0 ? `${s.p_engagement}` : '';
  const content = s.p_content?.trim() || '';
  const imageUrl = s.p_picture_url?.trim() || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  let predicted_sentiment = s.predicted_sentiment_value || '';
  const predicted_category = s.predicted_category || '';
  let youtubeVideoUrl = '';
  let profilePicture2 = '';
  if (s.source === 'Youtube') {
    youtubeVideoUrl = s.video_embed_url ? s.video_embed_url : (s.p_id ? `https://www.youtube.com/embed/${s.p_id}` : '');
  } else {
    profilePicture2 = s.p_picture || '';
  }
  const sourceIcon = ['Web', 'DeepWeb'].includes(s.source) ? 'Web' : s.source;
  const message_text = (s.p_message_text || '').replace(/<\/?[^>]+(>|$)/g, '');
  return {
    profilePicture: profilePic,
    profilePicture2,
    userFullname: s.u_fullname,
    user_data_string: '',
    followers,
    following,
    posts,
    likes,
    llm_emotion,
    llm_language: s.llm_language,
    commentsUrl,
    comments,
    shares,
    engagements,
    content,
    image_url: imageUrl,
    predicted_sentiment,
    predicted_category,
    youtube_video_url: youtubeVideoUrl,
    source_icon: `${s.p_url},${sourceIcon}`,
    message_text,
    source: s.source,
    rating: s.rating,
    comment: s.comment,
    businessResponse: s.business_response,
    uSource: s.u_source,
    googleName: s.name,
    created_at: new Date(s.p_created_time || s.created_at).toLocaleString(),
    p_comments_data:s.p_comments_data,
    p_id: s.p_id
  };
};
/**
 * Build a base query string from category data for filters processing
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {string} Query string
 */
function buildBaseQueryString(selectedCategory, categoryData) {
  let queryString = "";
  const allTerms = [];

  if (selectedCategory === "all") {
    // Combine all keywords, hashtags, and urls from all categories
    Object.values(categoryData).forEach((data) => {
      if (data.keywords && data.keywords.length > 0) {
        allTerms.push(...data.keywords);
      }
      if (data.hashtags && data.hashtags.length > 0) {
        allTerms.push(...data.hashtags);
      }
      if (data.urls && data.urls.length > 0) {
        allTerms.push(...data.urls);
      }
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];
    if (data.keywords && data.keywords.length > 0) {
      allTerms.push(...data.keywords);
    }
    if (data.hashtags && data.hashtags.length > 0) {
      allTerms.push(...data.hashtags);
    }
    if (data.urls && data.urls.length > 0) {
      allTerms.push(...data.urls);
    }
  }

  // Create a query string with all terms as ORs
  if (allTerms.length > 0) {
    const terms = allTerms.map((term) => `"${term}"`).join(" OR ");
    queryString = `(p_message_text:(${terms}) OR u_fullname:(${terms}))`;
  }

  return queryString;
}

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
  const query = {
    bool: {
      must: [],
      must_not: [
        {
          term: {
            source: "DM",
          },
        },
      ],
    },
  };
  // Only apply time range if provided
  if (dateRange && dateRange.greaterThanTime && dateRange.lessThanTime) {
    query.bool.must.push({
      range: {
        p_created_time: {
          gte: dateRange.greaterThanTime,
          lte: dateRange.lessThanTime,
        },
      },
    });
  }
  const normalizedSources = normalizeSourceInput(source);
  if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (normalizedSources.length > 0) {
    query.bool.must.push({
      bool: {
        should: normalizedSources.map((src) => ({
          match_phrase: { source: src },
        })),
        minimum_should_match: 1,
      },
    });
  }

  // Handle special topic source filtering
  else if (isSpecialTopic) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (topicId === 2634) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if (
    topicId === 2641 ||
    parseInt(topicId) === 2643 ||
    parseInt(topicId) === 2644 ||
    parseInt(topicId) === 2651 ||
    parseInt(topicId) === 2652 ||
    parseInt(topicId) === 2663 ||
    parseInt(topicId) === 2653 ||
    parseInt(topicId) === 2654 ||
    parseInt(topicId) === 2655 ||
    parseInt(topicId) === 2658 ||
    parseInt(topicId) === 2659 ||
    parseInt(topicId) === 2660 ||
    parseInt(topicId) === 2661 ||
    parseInt(topicId) === 2662
  ) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
        ],
        minimum_should_match: 1,
      },
    });
  } 
  
    else if (parseInt(topicId) === 2656 || parseInt(topicId) === 2657) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  
  else {
    // Default: include standard set of sources
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Pinterest" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Reddit" } },
          { match_phrase: { source: "TikTok" } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return query;
}

/**
 * Add category filters to the query
 * @param {Object} query - Elasticsearch query object
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data with filters
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
  if (selectedCategory === "all") {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap((data) =>
            (data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } },
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } },
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } },
            ])
          ),
        ],
        minimum_should_match: 1,
      },
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];

    // Check if the category has any filtering criteria
    const hasKeywords =
      Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags =
      Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    // Only add the filter if there's at least one criteria
    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } },
            ]),
            ...(data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } },
            ]),
            ...(data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } },
            ]),
          ],
          minimum_should_match: 1,
        },
      });
    } else {
      // If the category has no filtering criteria, add a condition that will match nothing
      query.bool.must.push({
        bool: {
          must_not: {
            match_all: {},
          },
        },
      });
    }
  }
}

// Removed post formatting and helpers to keep this controller lean for counts-only

module.exports = socialsSubsidiaryDistributionsController;
