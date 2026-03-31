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


const formatPostData = (hit) => {
  const s = hit._source;
  const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
  const followers = s.u_followers > 0 ? `${s.u_followers}` : '';
  const following = s.u_following > 0 ? `${s.u_following}` : '';
  const posts = s.u_posts > 0 ? `${s.u_posts}` : '';
  const likes = s.p_likes > 0 ? `${s.p_likes}` : '';
  const llm_emotion = s.llm_emotion || '';
  const llm_emotion_arabic = s.llm_emotion_arabic || '';
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
    llm_emotion_arabic,
    llm_language: s.llm_language,
    u_country: s.u_country,
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
    p_comments_data: s.p_comments_data,
    llm_comments: s.llm_comments,
    llm_category_confidence: s.llm_category_confidence,
    u_verified: s.u_verified,
    p_id: s.p_id,
  };
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

const applyCountryLocationFilter = (query, country) => {
  const countryValue = String(country || '').trim();
  if (!countryValue) return;
  query.bool.must.push({ term: { 'llm_location.keyword': countryValue } });
};
const socialsDistributionsController = {
  getDistributions: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
applyCountryLocationFilter(query,country)
      
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Now create the aggregation query with the same base query
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Get total count using the same query (for comparison with mentions-trend)
      // Note: total count is not returned in this endpoint for performance
      // If needed, it can be added back with a lightweight count aggregation

      // Extract the aggregation buckets
      const buckets = aggResponse.aggregations.source_counts.buckets;

      const sourceCounts = buckets.reduce((acc, bucket) => {
        if (bucket.doc_count > 0) {
          // Normalize key (e.g., treat Linkedin and LinkedIn as same)
          const normalizedKey = bucket.key.toLowerCase();

          // Add or update count
          acc[normalizedKey] = (acc[normalizedKey] || 0) + bucket.doc_count;
        }
        return acc;
      }, {});

      // Reformat keys properly (capitalize "LinkedIn" etc. if you want)
      const formattedCounts = {};
      for (const key in sourceCounts) {
        // Handle special cases like LinkedIn
        let formattedKey;
        if (key.toLowerCase() === "linkedin") {
          formattedKey = "LinkedIn";
        } else {
          // Capitalize the first letter dynamically
          formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
        }

        formattedCounts[formattedKey] = sourceCounts[key];
      }

      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getLocationDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

      applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Aggregate by llm_location for heatmap
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          locations: {
            terms: {
              field: "llm_location.keyword",
              size: 200,
              exclude: ["null", "Not Specified", "not specified", ""],
            },
          },
        },
      };

      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = aggResponse.aggregations.locations.buckets;

      const formattedCounts = buckets.reduce((acc, bucket) => {
        if (bucket.doc_count > 0 && bucket.key && bucket.key.trim() !== "") {
          acc[bucket.key] = (acc[bucket.key] || 0) + bucket.doc_count;
        }
        return acc;
      }, {});

      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getkeywordsDistribution:async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

      applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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


// Aggregate by keywords
const aggQuery = {
  query: query,
  size: 0,
  aggs: {
    signals: {
      terms: {
        field: "llm_signals.keyword",
        size: 200
      }
    }
  }
};

const aggResponse = await elasticClient.search({
  index: process.env.ELASTICSEARCH_DEFAULTINDEX,
  body: aggQuery,
});

const phrases = aggResponse.aggregations.signals.buckets;

// Final response
return res.json({
  success: true,
  phrases
});
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  // llm_keywords
  getkeywordsDistributionPosts:async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        llm_keywords,
        country,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
          limit = 30
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Filter by llm_keywords if provided
      if (llm_keywords && llm_keywords !== "" && llm_keywords !== "null" && llm_keywords !== "undefined") {
        const keywordsArray = Array.isArray(llm_keywords)
          ? llm_keywords
          : llm_keywords.split(",").map((s) => s.trim()).filter(Boolean);

        if (keywordsArray.length > 0) {
          query.bool.must.push({
            bool: {
              should: keywordsArray.map((loc) => ({
                match: { "llm_keywords.keyword": loc },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }



      // ✅ Fetch latest posts instead of aggregation
const postsResponse = await elasticClient.search({
  index: process.env.ELASTICSEARCH_DEFAULTINDEX,
  body: {
    size: Math.min(Number(req.body.limit) || 30, 100),
    query,
    sort: [
      { p_created_time: { order: "desc" } } // latest posts first
    ]
  }
});


// Format posts
const posts = postsResponse.hits.hits.map(hit => formatPostData(hit));

// ✅ Return posts only
return res.json({ posts });

    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
   getEntityDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
        topicId,
        llm_mention_type,
        llm_entity,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

       applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Filter by llm_entity if provided
      if (llm_entity && llm_entity !== "" && llm_entity !== "null" && llm_entity !== "undefined") {
        const entitiesArray = Array.isArray(llm_entity)
          ? llm_entity
          : llm_entity.split(",").map((s) => s.trim()).filter(Boolean);
        if (entitiesArray.length > 0) {
          query.bool.must.push({
            bool: {
              should: entitiesArray.map((e) => ({ match: { "llm_categories.keyword": e } })),
              minimum_should_match: 1,
            },
          });
        }
      }

      // Aggregate by llm_entity
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          entities: {
            terms: {
              field: "llm_categories.keyword",
              size: 200,
              exclude: ["null", "Not Specified", "not specified", ""],
            },
          },
        },
      };

      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = aggResponse.aggregations.entities.buckets;

      const formattedCounts = buckets.reduce((acc, bucket) => {
        if (bucket.doc_count > 0 && bucket.key && bucket.key.trim() !== "") {
          acc[bucket.key] = (acc[bucket.key] || 0) + bucket.doc_count;
        }
        return acc;
      }, {});

      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
   getEntityDistributionComments: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        llm_location,
        category = "all",
        country,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
       applyCountryLocationFilter(query,country)

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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      if (llm_location && llm_location !== "" && llm_location !== "null" && llm_location !== "undefined") {
        const locationsArray = Array.isArray(llm_location)
          ? llm_location
          : llm_location.split(",").map((s) => s.trim()).filter(Boolean);

        if (locationsArray.length > 0) {
          query.bool.must.push({
            bool: {
              should: locationsArray.map((loc) => ({
                match: { "llm_location.keyword": loc },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }

      // Scroll posts and aggregate llm_location from inside llm_comments
      const firstResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: {
          query: query,
          size: 500,
          _source: { includes: ["source", "llm_comments"] },
        },
      });

      let allHits = [...(firstResponse.hits?.hits || [])];
      let scrollId = firstResponse._scroll_id;

      while (scrollId) {
        const scrollResponse = await elasticClient.scroll({
          scroll_id: scrollId,
          scroll: "2m",
        });
        if (!scrollResponse.hits?.hits?.length) break;
        allHits = [...allHits, ...scrollResponse.hits.hits];
        scrollId = scrollResponse._scroll_id;
      }

      // Count llm_entity per comment
      const entityMap = {};

      for (const hit of allHits) {
        const llmComments = hit._source?.llm_comments || [];

        for (const commentStr of llmComments) {
          try {
            const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;
            const entity = comment.llm_entity;
            if (entity && entity !== "null" && entity !== "Not Specified" && entity !== "not specified" && entity.trim() !== "") {
              entityMap[entity] = (entityMap[entity] || 0) + 1;
            }
          } catch (_) {
            // skip malformed comment
          }
        }
      }

      return res.json(entityMap);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getEntityDistributionPostsData: async (req, res) => {
    try {
      const {
        timeSlot, fromDate, toDate, sentimentType,
        category = "all", source = "All", topicId,country,
        llm_mention_type, llm_entity, sourceName, limit = 30,
      } = req.body;

      const isSpecialTopic = (topicId && parseInt(topicId) === 2600) || parseInt(topicId) === 2627;
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) return res.json({ posts: [] });

      let workingCategory = category;
      if (workingCategory !== "all" && workingCategory !== "" && workingCategory !== "custom") {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) { categoryData = { [matchedKey]: categoryData[matchedKey] }; workingCategory = matchedKey; }
        else { workingCategory = "all"; }
      }

      const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
      const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString });

      const noDateProvided = parseInt(topicId) === 2641
        ? (fromDate == null || fromDate === "") && (toDate == null || toDate === "")
        : (timeSlot == null || timeSlot === "") && (fromDate == null || fromDate === "") && (toDate == null || toDate === "");
      let queryTimeRange = noDateProvided ? null : { gte: filters.greaterThanTime, lte: filters.lessThanTime };
      if (Number(topicId) == 2473) queryTimeRange = { gte: "2023-01-01", lte: "2023-04-30" };

      const query = buildBaseQuery(
        queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
        source, isSpecialTopic, parseInt(topicId),
      );

      applyCountryLocationFilter(query,country)
      if (workingCategory == "all" && category !== "all") {
        query.bool.must.push({ bool: { should: [{ multi_match: { query: category, fields: ["p_message_text","p_message","hashtags","u_source","p_url"], type: "phrase" } }], minimum_should_match: 1 } });
      }
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);
      const termToAdd = topic === 2646 ? { term: { "customer_name.keyword": "oia" } } : topic === 2650 ? { term: { "customer_name.keyword": "omantel" } } : null;
      if (termToAdd) {
        const block = query.bool.must.find((m) => m.bool && Array.isArray(m.bool.should) && m.bool.should.some((s) => s.match_phrase && s.match_phrase.p_message_text));
        if (block) { block.bool.should.push(termToAdd); block.bool.minimum_should_match = 1; }
        else { query.bool.must.push({ bool: { should: [termToAdd], minimum_should_match: 1 } }); }
      }
      if (topic === 2651) query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      if (topic === 2652 || topic === 2663) query.bool.must.push({ term: { "p_tag_cat.keyword": "Food and Beverages" } });

      if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
        if (sentimentType.includes(",")) {
          query.bool.must.push({ bool: { should: sentimentType.split(",").map((s) => ({ match: { predicted_sentiment_value: s.trim() } })), minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
        }
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        mentionTypesArray = Array.isArray(llm_mention_type) ? llm_mention_type : llm_mention_type.split(",").map((s) => s.trim());
      }
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({ bool: { should: mentionTypesArray.map((t) => ({ match: { llm_mention_type: t } })), minimum_should_match: 1 } });
      }

      // Filter by llm_entity
      if (llm_entity && llm_entity !== "" && llm_entity !== "null" && llm_entity !== "undefined") {
        const entitiesArray = Array.isArray(llm_entity) ? llm_entity : llm_entity.split(",").map((s) => s.trim()).filter(Boolean);
        if (entitiesArray.length > 0) {
          query.bool.must.push({ bool: { should: entitiesArray.map((e) => ({ match: { "llm_categories.keyword": e } })), minimum_should_match: 1 } });
        }
      }

      if (sourceName) {
        if (sourceName === "LinkedIn") {
          query.bool.must.push({ bool: { should: [{ match_phrase: { source: "LinkedIn" } }, { match_phrase: { source: "Linkedin" } }], minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match_phrase: { source: sourceName } });
        }
      }

      const postsResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: Math.min(Number(limit) || 30, 100),
          query,
          sort: [{ p_created_time: { order: "desc" } }],
          _source: { includes: ["p_message_text","source","p_created_time","u_fullname","u_profile_photo","p_url","predicted_sentiment_value","llm_entity","llm_comments","p_id"] },
        },
      });

      const posts = postsResponse.hits.hits.map(hit => formatPostData(hit));
      return res.json({ posts });
    } catch (error) {
      console.error("Error fetching entity distribution posts:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
  getEntityDistributionCommentsData: async (req, res) => {
    try {
      const {
        timeSlot, fromDate, toDate, sentimentType,
        category = "all", source = "All", topicId,country,
        llm_mention_type, llm_entity, sourceName, limit = 30,
      } = req.body;

      const isSpecialTopic = (topicId && parseInt(topicId) === 2600) || parseInt(topicId) === 2627;
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) return res.json({ posts: [] });

      let workingCategory = category;
      if (workingCategory !== "all" && workingCategory !== "" && workingCategory !== "custom") {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) { categoryData = { [matchedKey]: categoryData[matchedKey] }; workingCategory = matchedKey; }
        else { workingCategory = "all"; }
      }

      const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
      const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString });

      const noDateProvided = parseInt(topicId) === 2641
        ? (fromDate == null || fromDate === "") && (toDate == null || toDate === "")
        : (timeSlot == null || timeSlot === "") && (fromDate == null || fromDate === "") && (toDate == null || toDate === "");
      let queryTimeRange = noDateProvided ? null : { gte: filters.greaterThanTime, lte: filters.lessThanTime };
      if (Number(topicId) == 2473) queryTimeRange = { gte: "2023-01-01", lte: "2023-04-30" };

      const query = buildBaseQuery(
        queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
        source, isSpecialTopic, parseInt(topicId),
      );

       applyCountryLocationFilter(query,country)
      if (workingCategory == "all" && category !== "all") {
        query.bool.must.push({ bool: { should: [{ multi_match: { query: category, fields: ["p_message_text","p_message","hashtags","u_source","p_url"], type: "phrase" } }], minimum_should_match: 1 } });
      }
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);
      const termToAdd = topic === 2646 ? { term: { "customer_name.keyword": "oia" } } : topic === 2650 ? { term: { "customer_name.keyword": "omantel" } } : null;
      if (termToAdd) {
        const block = query.bool.must.find((m) => m.bool && Array.isArray(m.bool.should) && m.bool.should.some((s) => s.match_phrase && s.match_phrase.p_message_text));
        if (block) { block.bool.should.push(termToAdd); block.bool.minimum_should_match = 1; }
        else { query.bool.must.push({ bool: { should: [termToAdd], minimum_should_match: 1 } }); }
      }
      if (topic === 2651) query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      if (topic === 2652 || topic === 2663) query.bool.must.push({ term: { "p_tag_cat.keyword": "Food and Beverages" } });

      if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
        if (sentimentType.includes(",")) {
          query.bool.must.push({ bool: { should: sentimentType.split(",").map((s) => ({ match: { predicted_sentiment_value: s.trim() } })), minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
        }
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        mentionTypesArray = Array.isArray(llm_mention_type) ? llm_mention_type : llm_mention_type.split(",").map((s) => s.trim());
      }
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({ bool: { should: mentionTypesArray.map((t) => ({ match: { llm_mention_type: t } })), minimum_should_match: 1 } });
      }

      if (sourceName) {
        if (sourceName === "LinkedIn") {
          query.bool.must.push({ bool: { should: [{ match_phrase: { source: "LinkedIn" } }, { match_phrase: { source: "Linkedin" } }], minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match_phrase: { source: sourceName } });
        }
      }

      // Scroll posts and collect comments filtered by llm_entity
      const firstResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: { query, size: 500, _source: { includes: ["source", "llm_comments", "p_id"] } },
      });

      let allHits = [...(firstResponse.hits?.hits || [])];
      let scrollId = firstResponse._scroll_id;
      while (scrollId) {
        const scrollResp = await elasticClient.scroll({ scroll_id: scrollId, scroll: "2m" });
        if (!scrollResp.hits?.hits?.length) break;
        allHits = [...allHits, ...scrollResp.hits.hits];
        scrollId = scrollResp._scroll_id;
      }

      const matchedComments = [];
      const maxLimit = Math.min(Number(limit) || 30, 200);

      for (const hit of allHits) {
        if (matchedComments.length >= maxLimit) break;
        const llmComments = hit._source?.llm_comments || [];
        for (const commentStr of llmComments) {
          if (matchedComments.length >= maxLimit) break;
          try {
            const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;
            const entityMatch = !llm_entity || comment.llm_entity === llm_entity;
            if (entityMatch) {
              matchedComments.push({ ...comment, source: hit._source?.source, p_id: hit._source?.p_id });
            }
          } catch (_) {}
        }
      }

      return res.json({ posts: matchedComments });
    } catch (error) {
      console.error("Error fetching entity distribution comments:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
  getLocationDistributionComments: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        country,
        llm_mention_type,
        llm_location,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

       applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Filter by llm_location if provided
      if (llm_location && llm_location !== "" && llm_location !== "null" && llm_location !== "undefined") {
        const locationsArray = Array.isArray(llm_location)
          ? llm_location
          : llm_location.split(",").map((s) => s.trim()).filter(Boolean);

        if (locationsArray.length > 0) {
          query.bool.must.push({
            bool: {
              should: locationsArray.map((loc) => ({
                match: { "llm_location.keyword": loc },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }

      // Scroll posts and aggregate llm_location from inside llm_comments
      const firstResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: {
          query: query,
          size: 500,
          _source: { includes: ["source", "llm_comments"] },
        },
      });

      let allHits = [...(firstResponse.hits?.hits || [])];
      let scrollId = firstResponse._scroll_id;

      while (scrollId) {
        const scrollResponse = await elasticClient.scroll({
          scroll_id: scrollId,
          scroll: "2m",
        });
        if (!scrollResponse.hits?.hits?.length) break;
        allHits = [...allHits, ...scrollResponse.hits.hits];
        scrollId = scrollResponse._scroll_id;
      }

      // Count llm_location per comment
      const locationMap = {};

      for (const hit of allHits) {
        const llmComments = hit._source?.llm_comments || [];

        for (const commentStr of llmComments) {
          try {
            const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;
            const loc = comment.llm_location;
            if (loc && loc !== "null" && loc !== "Not Specified" && loc !== "not specified" && loc.trim() !== "") {
              locationMap[loc] = (locationMap[loc] || 0) + 1;
            }
          } catch (_) {
            // skip malformed comment
          }
        }
      }

      return res.json(locationMap);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  
  getLocationDistributionCommentsData: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        country,
        llm_mention_type,
        sourceName,
        llm_location,
        limit = 30,
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
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) {
        return res.json({ posts: [] });
      }
      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
      const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString });

      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = { gte: filters.greaterThanTime, lte: filters.lessThanTime };
      }
      if (Number(topicId) == 2473) {
        queryTimeRange = { gte: "2023-01-01", lte: "2023-04-30" };
      }

      const query = buildBaseQuery(
        queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
        source,
        isSpecialTopic,
        parseInt(topicId),
      );

      applyCountryLocationFilter(query,country)
      if (workingCategory == "all" && category !== "all") {
        query.bool.must.push({
          bool: {
            should: [{ multi_match: { query: category, fields: ["p_message_text", "p_message", "hashtags", "u_source", "p_url"], type: "phrase" } }],
            minimum_should_match: 1,
          },
        });
      }

      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);
      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        let messageTextShouldBlock = query.bool.must.find(
          (m) => m.bool && Array.isArray(m.bool.should) && m.bool.should.some((s) => s.match_phrase && s.match_phrase.p_message_text)
        );
        if (messageTextShouldBlock) {
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          query.bool.must.push({ bool: { should: [termToAdd], minimum_should_match: 1 } });
        }
      }

      if (topic === 2651) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      }
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Food and Beverages" } });
      }

      if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
        if (sentimentType.includes(",")) {
          query.bool.must.push({ bool: { should: sentimentType.split(",").map((s) => ({ match: { predicted_sentiment_value: s.trim() } })), minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
        }
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({ bool: { should: mentionTypesArray.map((type) => ({ match: { llm_mention_type: type } })), minimum_should_match: 1 } });
      }

      // Add source filter
      if (sourceName) {
        if (sourceName === "LinkedIn") {
          query.bool.must.push({ bool: { should: [{ match_phrase: { source: "LinkedIn" } }, { match_phrase: { source: "Linkedin" } }], minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match_phrase: { source: sourceName } });
        }
      }

      query.bool.must = query.bool.must.filter((item) => {
  if (!item) return true;

  if (item.match_phrase && item.match_phrase.source === "All") {
    return false; // ❌ remove it
  }

  return true; // ✅ keep others
});


   
      // Fetch posts with llm_comments via scroll
      const firstResponse2 = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: {
          query: query,
          size: 500,
          _source: { includes: ["source", "llm_comments","p_url", "p_id"] },
        },
      });


      // Collect comments filtered by llm_location
      const matchedComments = [];
      const maxLimit = Math.min(Number(limit) || 30, 200);


        const extractComments = (hits) => {
        for (const hit of hits) {
          if (matchedComments.length >= maxLimit) break;
          const hitSource = hit._source?.source || "Source";
          const hitPId = hit._source?.p_id || null;
          const hitPUrl = hit._source?.p_url || "";

          for (const commentStr of (hit._source?.llm_comments || [])) {
            if (matchedComments.length >= maxLimit) break;
            try {
              const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;

           
                const locationMatch = !llm_location || comment.llm_location === llm_location;
            if (locationMatch) {
            

                const originalText =
                  comment?.original_comment_text ||
                  comment?.translated_comment_text ||
                  comment?.text ||
                  comment?.comment ||
                  comment?.message ||
                  comment?.content ||
                  "";

                matchedComments.push({
                  ...comment,
                  p_id: hitPId,
                  original_comment_text: originalText,
                  predicted_sentiment_value:
                    comment?.predicted_sentiment_value ||
                    comment?.mapped_sentiment ||
                    "Neutral",
                  mapped_sentiment:
                    comment?.mapped_sentiment ||
                    comment?.predicted_sentiment_value ||
                    "Neutral",
                  llm_emotion: comment?.llm_emotion || "N/A",
                  llm_language: comment?.llm_language || comment?.language || "Unknown",
                  llm_intent: comment?.llm_intent || comment?.intent || "N/A",
                  llm_key_topic: comment?.llm_key_topic || comment?.key_topic || "N/A",
                  llm_category: comment?.llm_category || "N/A",
                  llm_sub_category: comment?.llm_sub_category || "N/A",
                  llm_location: comment?.llm_location || "N/A",
                  post_context: {
                    ...(comment?.post_context || {}),
                    source: comment?.post_context?.source || comment?.source || hitSource,
                    p_created_time:
                      comment?.post_context?.p_created_time ||
                      comment?.p_created_time ||
                      comment?.createdAt ||
                      comment?.created_at ||
                      null,
                    p_url: comment?.post_context?.p_url || comment?.p_url || hitPUrl,
                  },
                });
              }
            } catch (_) {
              // skip malformed comment
            }
          }
        }
      };
      
      extractComments(firstResponse2.hits?.hits)
      let scrollId2 = firstResponse2._scroll_id;

      while (scrollId2) {
        const scrollResponse2 = await elasticClient.scroll({ scroll_id: scrollId2, scroll: "2m" });
        if (!scrollResponse2.hits?.hits?.length) break;
        extractComments(scrollResponse2.hits.hits)
        scrollId2 = scrollResponse2._scroll_id;
      }

          if (scrollId2) {
        elasticClient.clearScroll({ scroll_id: scrollId2 }).catch(() => {});
      }

      matchedComments.sort((a, b) => {
        const dateA = new Date(a.post_context?.p_created_time || a.p_created_time || 0).getTime();
        const dateB = new Date(b.post_context?.p_created_time || b.p_created_time || 0).getTime();
        return dateB - dateA;
      });

      return res.json({ posts: matchedComments, total: matchedComments.length });

    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getDistributionComments: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        topicId,
        country,
        llm_mention_type,
        sourceName,
        llm_location,
        limit = 200,
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
        categoryData = req.processedCategories || {};
      }
      if (Object.keys(categoryData).length === 0) {
        return res.json({ posts: [] });
      }
      let workingCategory = category;
      if (
        workingCategory !== "all" &&
        workingCategory !== "" &&
        workingCategory !== "custom"
      ) {
        const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
        if (matchedKey) {
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          workingCategory = matchedKey;
        } else {
          workingCategory = "all";
        }
      }

      const baseQueryString = buildBaseQueryString(workingCategory, categoryData);
      const filters = processFilters({ sentimentType, timeSlot, fromDate, toDate, queryString: baseQueryString });

      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = { gte: filters.greaterThanTime, lte: filters.lessThanTime };
      }
      if (Number(topicId) == 2473) {
        queryTimeRange = { gte: "2023-01-01", lte: "2023-04-30" };
      }

      const query = buildBaseQuery(
        queryTimeRange ? { greaterThanTime: queryTimeRange.gte, lessThanTime: queryTimeRange.lte } : null,
        source,
        isSpecialTopic,
        parseInt(topicId),
      );

      applyCountryLocationFilter(query,llm_location)
      if (workingCategory == "all" && category !== "all") {
        query.bool.must.push({
          bool: {
            should: [{ multi_match: { query: category, fields: ["p_message_text", "p_message", "hashtags", "u_source", "p_url"], type: "phrase" } }],
            minimum_should_match: 1,
          },
        });
      }

      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);
      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        let messageTextShouldBlock = query.bool.must.find(
          (m) => m.bool && Array.isArray(m.bool.should) && m.bool.should.some((s) => s.match_phrase && s.match_phrase.p_message_text)
        );
        if (messageTextShouldBlock) {
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          query.bool.must.push({ bool: { should: [termToAdd], minimum_should_match: 1 } });
        }
      }

      if (topic === 2651) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Healthcare" } });
      }
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({ term: { "p_tag_cat.keyword": "Food and Beverages" } });
      }

      if (sentimentType && sentimentType !== "undefined" && sentimentType !== "null") {
        if (sentimentType.includes(",")) {
          query.bool.must.push({ bool: { should: sentimentType.split(",").map((s) => ({ match: { predicted_sentiment_value: s.trim() } })), minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match: { predicted_sentiment_value: sentimentType.trim() } });
        }
      }

      let mentionTypesArray = [];
      if (llm_mention_type) {
        if (Array.isArray(llm_mention_type)) {
          mentionTypesArray = llm_mention_type;
        } else if (typeof llm_mention_type === "string") {
          mentionTypesArray = llm_mention_type.split(",").map((s) => s.trim());
        }
      }
      if (mentionTypesArray.length > 0) {
        query.bool.must.push({ bool: { should: mentionTypesArray.map((type) => ({ match: { llm_mention_type: type } })), minimum_should_match: 1 } });
      }

      // Add source filter
      if (sourceName) {
        if (sourceName === "LinkedIn") {
          query.bool.must.push({ bool: { should: [{ match_phrase: { source: "LinkedIn" } }, { match_phrase: { source: "Linkedin" } }], minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match_phrase: { source: sourceName } });
        }
      }

      query.bool.must = query.bool.must.filter((item) => {
        if (!item) return true;
        if (item.match_phrase && item.match_phrase.source === 'All') return false;
        return true;
      });

      // Fetch posts with llm_comments via scroll, stop early once limit is reached
      const maxLimit = Math.min(Number(limit) || 30, 200);
      const matchedComments = [];

      
      
      const firstResponse2 = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: '2m',
        body: {
          query: query,
          size: 500,
          _source: { includes: ['source', 'llm_comments','p_url', 'p_id'] },
        },
      });

// return res.json({
//           query: query,
//           size: 500,
//           _source: { includes: ['source', 'llm_comments','p_url', 'p_id'] },
//         });

      let scrollId2 = firstResponse2._scroll_id;

      
      const extractComments = (hits) => {
        for (const hit of hits) {
          if (matchedComments.length >= maxLimit) break;
          const hitSource = hit._source?.source || "Source";
          const hitPId = hit._source?.p_id || null;
          const hitPUrl = hit._source?.p_url || "";
          for (const commentStr of (hit._source?.llm_comments || [])) {
            if (matchedComments.length >= maxLimit) break;
            try {
              const comment = typeof commentStr === 'string' ? JSON.parse(commentStr) : commentStr;
              // if (!llm_location || comment.llm_location === llm_location) {
                const originalText =
                  comment?.original_comment_text ||
                  comment?.translated_comment_text ||
                  comment?.text ||
                  comment?.comment ||
                  comment?.message ||
                  comment?.content ||
                  "";

                matchedComments.push({
                  ...comment,
                  p_id: hitPId,
                  original_comment_text: originalText,
                  predicted_sentiment_value:
                    comment?.predicted_sentiment_value ||
                    comment?.mapped_sentiment ||
                    "Neutral",
                  mapped_sentiment:
                    comment?.mapped_sentiment ||
                    comment?.predicted_sentiment_value ||
                    "Neutral",
                  llm_emotion: comment?.llm_emotion || "N/A",
                  llm_language: comment?.llm_language || comment?.language || "Unknown",
                  llm_intent: comment?.llm_intent || comment?.intent || "N/A",
                  llm_key_topic: comment?.llm_key_topic || comment?.key_topic || "N/A",
                  llm_category: comment?.llm_category || "N/A",
                  llm_sub_category: comment?.llm_sub_category || "N/A",
                  llm_location: comment?.llm_location || "N/A",
                  post_context: {
                    ...(comment?.post_context || {}),
                    source: comment?.post_context?.source || comment?.source || hitSource,
                    p_created_time:
                      comment?.post_context?.p_created_time ||
                      comment?.p_created_time ||
                      comment?.createdAt ||
                      comment?.created_at ||
                      null,
                    p_url: comment?.post_context?.p_url || comment?.p_url || hitPUrl,
                  },
                });
              // }
            } catch (_) {
              // skip malformed comment
            }
          }
        }
      };

      extractComments(firstResponse2.hits?.hits || []);

      while (scrollId2 && matchedComments.length < maxLimit) {
        const scrollResponse2 = await elasticClient.scroll({ scroll_id: scrollId2, scroll: '2m' });
        if (!scrollResponse2.hits?.hits?.length) break;
        extractComments(scrollResponse2.hits.hits);
        scrollId2 = scrollResponse2._scroll_id;
      }

      if (scrollId2) {
        elasticClient.clearScroll({ scroll_id: scrollId2 }).catch(() => {});
      }

      matchedComments.sort((a, b) => {
        const dateA = new Date(a.post_context?.p_created_time || a.p_created_time || 0).getTime();
        const dateB = new Date(b.post_context?.p_created_time || b.p_created_time || 0).getTime();
        return dateB - dateA;
      });

      return res.json({ posts: matchedComments, total: matchedComments.length });
    } catch (error) {
      console.error('Error fetching social media distributions:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  getLocationDistributionPosts: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        llm_location,
        country,
        category = "all",
        source = "All",
        topicId,
        llm_mention_type,
          limit = 30
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Filter by llm_location if provided
      if (llm_location && llm_location !== "" && llm_location !== "null" && llm_location !== "undefined") {
        const locationsArray = Array.isArray(llm_location)
          ? llm_location
          : llm_location.split(",").map((s) => s.trim()).filter(Boolean);

        if (locationsArray.length > 0) {
          query.bool.must.push({
            bool: {
              should: locationsArray.map((loc) => ({
                match: { "llm_location.keyword": loc },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }



      // ✅ Fetch latest posts instead of aggregation
const postsResponse = await elasticClient.search({
  index: process.env.ELASTICSEARCH_DEFAULTINDEX,
  body: {
    size: Math.min(Number(req.body.limit) || 30, 100),
    query,
    sort: [
      { p_created_time: { order: "desc" } } // latest posts first
    ]
  }
});


// Format posts
const posts = postsResponse.hits.hits.map(hit => formatPostData(hit));

// ✅ Return posts only
return res.json({ posts });

    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
    getContentDistributionBySource: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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
          categoryData,
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
        categoryData,
      );
      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
        parseInt(topicId),
      );

      applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
            ? { term: { "customer_name.keyword": "omantel" } }
            : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text,
            ),
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

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
      // Now create the aggregation query with the same base query
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
            aggs: {
              total_comments: {
                sum: {
                  script: {
                    source: `
                      def val = params._source['llm_comments'];
                      if (val == null) return 0;
                      if (val instanceof List) return val.size();
                      def s = val.toString();
                      int cnt = 0;
                      int i = 0;
                      String marker = '"comment_id"';
                      while ((i = s.indexOf(marker, i)) != -1) { cnt++; i += marker.length(); }
                      return cnt;
                    `,
                    lang: "painless",
                  },
                },
              },
              total_engagement: {
                bucket_script: {
                  buckets_path: {
                    posts: "_count",
                    comments: "total_comments",
                  },
                  script: "params.posts + params.comments",
                },
              },
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

    
      // Get total count using the same query (for comparison with mentions-trend)
      // Note: total count is not returned in this endpoint for performance
      // If needed, it can be added back with a lightweight count aggregation

      // Extract the aggregation buckets
const buckets = aggResponse.aggregations.source_counts.buckets;

const formattedCounts = buckets.reduce((acc, bucket) => {
  if (bucket.doc_count > 0) {
    const normalizedKey = bucket.key.toLowerCase();

    // Format key (LinkedIn fix etc.)
    let formattedKey;
    if (normalizedKey === "linkedin") {
      formattedKey = "LinkedIn";
    } else {
      formattedKey =
        normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
    }

    acc[formattedKey] = {
      posts: bucket.doc_count,
      comments: bucket.total_comments?.value || 0,
      total: bucket.total_engagement?.value || 0,
    };
  }

  return acc;
}, {});

return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getIndustrySubIndustryDistributionBySource: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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
          categoryData,
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
        categoryData,
      );
      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
        parseInt(topicId),
      );

      applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
            ? { term: { "customer_name.keyword": "omantel" } }
            : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text,
            ),
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

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
      // Now create the aggregation query with industry/sub_industry breakdown per source
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
            aggs: {
              industries: {
                terms: {
                  field: "industry.keyword",
                  size: 10,
                  exclude: "null",
                },
              },
              sub_industries: {
                terms: {
                  field: "sub_industry.keyword",
                  size: 10,
                  exclude: "null",
                },
              },
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract the aggregation buckets
      const buckets = aggResponse.aggregations.source_counts.buckets;

      const formattedCounts = buckets.reduce((acc, bucket) => {
        if (bucket.doc_count > 0) {
          const normalizedKey = bucket.key.toLowerCase();
          const formattedKey =
            normalizedKey === "linkedin"
              ? "LinkedIn"
              : normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);

          const industries = (bucket.industries?.buckets || []).map((ib) => ({
            name: ib.key,
            count: ib.doc_count,
          }));

          const sub_industries = (bucket.sub_industries?.buckets || []).map((sb) => ({
            name: sb.key,
            count: sb.doc_count,
          }));

          acc[formattedKey] = {
            posts: bucket.doc_count,
            industries,
            sub_industries,
          };
        }

        return acc;
      }, {});

      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getIndustrySubIndustryDistributionByComments:async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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
          categoryData,
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
        categoryData,
      );
      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
        parseInt(topicId),
      );

      applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
            ? { term: { "customer_name.keyword": "omantel" } }
            : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text,
            ),
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

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
      // Fetch posts with llm_comments via scroll, count llm_category & llm_sub_category per source
      const firstResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: {
          query: query,
          size: 500,
          _source: { includes: ["source", "llm_comments"] },
        },
      });

      let allHits = [...(firstResponse.hits?.hits || [])];
      let scrollId = firstResponse._scroll_id;

      while (scrollId) {
        const scrollResponse = await elasticClient.scroll({
          scroll_id: scrollId,
          scroll: "2m",
        });
        if (!scrollResponse.hits?.hits?.length) break;
        allHits = [...allHits, ...scrollResponse.hits.hits];
        scrollId = scrollResponse._scroll_id;
      }

      // Count llm_category and llm_sub_category per source from comments
      const sourceMap = {};

      for (const hit of allHits) {
        const sourceName = hit._source?.source;
        const llmComments = hit._source?.llm_comments || [];
        if (!sourceName) continue;

        if (!sourceMap[sourceName]) {
          sourceMap[sourceName] = { comments: 0, industries: {}, sub_industries: {} };
        }

        for (const commentStr of llmComments) {
          try {
            const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;

            sourceMap[sourceName].comments += 1;

            const category = comment.llm_category;
            if (category && category !== "null" && category !== "") {
              sourceMap[sourceName].industries[category] =
                (sourceMap[sourceName].industries[category] || 0) + 1;
            }

            const subCategory = comment.llm_sub_category;
            if (subCategory && subCategory !== "null" && subCategory !== "") {
              sourceMap[sourceName].sub_industries[subCategory] =
                (sourceMap[sourceName].sub_industries[subCategory] || 0) + 1;
            }
          } catch (_) {
            // skip malformed comment
          }
        }
      }

      // Format response
      const formattedCounts = {};
      for (const [sourceName, srcData] of Object.entries(sourceMap)) {
        if (srcData.comments === 0) continue;

        const normalizedKey = sourceName.toLowerCase();
        const formattedKey =
          normalizedKey === "linkedin"
            ? "LinkedIn"
            : normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);

        const industries = Object.entries(srcData.industries)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const sub_industries = Object.entries(srcData.sub_industries)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        formattedCounts[formattedKey] = {
          comments: srcData.comments,
          industries,
          sub_industries,
        };
      }

      return res.json(formattedCounts);
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  
   getIndustrySubIndustryDistributionByCommentsData:async (req, res) => {
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
        country,
        sourceName,
        industry,
        sub_industry,
        limit = 30,
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
          categoryData,
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
        categoryData,
      );
      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
        parseInt(topicId),
      );
applyCountryLocationFilter(query,country)
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

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
            ? { term: { "customer_name.keyword": "omantel" } }
            : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text,
            ),
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" },
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" },
        });
      }

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
      // Add source filter
      if (sourceName) {
        if (sourceName === 'LinkedIn') {
          query.bool.must.push({ bool: { should: [ { match_phrase: { source: 'LinkedIn' } }, { match_phrase: { source: 'Linkedin' } } ], minimum_should_match: 1 } });
        } else {
          query.bool.must.push({ match_phrase: { source: sourceName } });
        }
      }

      // Fetch posts with llm_comments via scroll, stop early once limit is reached
      const maxLimit = Math.min(Number(limit) || 30, 200);
      const matchedComments = [];

      const firstResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        scroll: "2m",
        body: {
          query: query,
          size: 500,
          _source: { includes: ["source", "llm_comments", "p_id", "p_url"] },
        },
      });

      let scrollId = firstResponse._scroll_id;

      const extractComments = (hits) => {
        for (const hit of hits) {
          if (matchedComments.length >= maxLimit) break;
          const hitSource = hit._source?.source || "Source";
          const hitPId = hit._source?.p_id || null;
          const hitPUrl = hit._source?.p_url || "";

          for (const commentStr of (hit._source?.llm_comments || [])) {
            if (matchedComments.length >= maxLimit) break;
            try {
              const comment = typeof commentStr === "string" ? JSON.parse(commentStr) : commentStr;

              const categoryMatch = !industry || comment.llm_category === industry;
              const subCategoryMatch = !sub_industry || comment.llm_sub_category === sub_industry;

              if (categoryMatch && subCategoryMatch) {
                const originalText =
                  comment?.original_comment_text ||
                  comment?.translated_comment_text ||
                  comment?.text ||
                  comment?.comment ||
                  comment?.message ||
                  comment?.content ||
                  "";

                matchedComments.push({
                  ...comment,
                  p_id: hitPId,
                  original_comment_text: originalText,
                  predicted_sentiment_value:
                    comment?.predicted_sentiment_value ||
                    comment?.mapped_sentiment ||
                    "Neutral",
                  mapped_sentiment:
                    comment?.mapped_sentiment ||
                    comment?.predicted_sentiment_value ||
                    "Neutral",
                  llm_emotion: comment?.llm_emotion || "N/A",
                  llm_language: comment?.llm_language || comment?.language || "Unknown",
                  llm_intent: comment?.llm_intent || comment?.intent || "N/A",
                  llm_key_topic: comment?.llm_key_topic || comment?.key_topic || "N/A",
                  llm_category: comment?.llm_category || "N/A",
                  llm_sub_category: comment?.llm_sub_category || "N/A",
                  llm_location: comment?.llm_location || "N/A",
                  post_context: {
                    ...(comment?.post_context || {}),
                    source: comment?.post_context?.source || comment?.source || hitSource,
                    p_created_time:
                      comment?.post_context?.p_created_time ||
                      comment?.p_created_time ||
                      comment?.createdAt ||
                      comment?.created_at ||
                      null,
                    p_url: comment?.post_context?.p_url || comment?.p_url || hitPUrl,
                  },
                });
              }
            } catch (_) {
              // skip malformed comment
            }
          }
        }
      };

      extractComments(firstResponse.hits?.hits || []);

      while (scrollId && matchedComments.length < maxLimit) {
        const scrollResponse = await elasticClient.scroll({ scroll_id: scrollId, scroll: "2m" });
        if (!scrollResponse.hits?.hits?.length) break;
        extractComments(scrollResponse.hits.hits);
        scrollId = scrollResponse._scroll_id;
      }

      if (scrollId) {
        elasticClient.clearScroll({ scroll_id: scrollId }).catch(() => {});
      }

      matchedComments.sort((a, b) => {
        const dateA = new Date(a.post_context?.p_created_time || a.p_created_time || 0).getTime();
        const dateB = new Date(b.post_context?.p_created_time || b.p_created_time || 0).getTime();
        return dateB - dateA;
      });

      return res.json({ posts: matchedComments, total: matchedComments.length });
    } catch (error) {
      console.error("Error fetching social media distributions:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  
  getSentimentBySource: async (req, res) => {
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
        country
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

      applyCountryLocationFilter(query,country)
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

      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

      // Apply sentiment filter if provided (this filters the overall results)
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

      // Create the aggregation query with nested aggregations
      // First aggregate by source, then within each source aggregate by sentiment
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
            aggs: {
              sentiment_counts: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 10,
                },
              },
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract the aggregation buckets
      const sourceBuckets = aggResponse.aggregations.source_counts.buckets;

      // Process the nested aggregations to create the final structure
      const sentimentBySource = {};

      sourceBuckets.forEach((sourceBucket) => {
        if (sourceBucket.doc_count > 0) {
          // Normalize source key
          const normalizedSourceKey = sourceBucket.key.toLowerCase();
          let formattedSourceKey;
          if (normalizedSourceKey === "linkedin") {
            formattedSourceKey = "LinkedIn";
          } else {
            formattedSourceKey = normalizedSourceKey.charAt(0).toUpperCase() + normalizedSourceKey.slice(1);
          }

          // Initialize sentiment counts for this source
          sentimentBySource[formattedSourceKey] = {};

          // Process sentiment sub-aggregations
          const sentimentBuckets = sourceBucket.sentiment_counts.buckets;
          sentimentBuckets.forEach((sentimentBucket) => {
            if (sentimentBucket.doc_count > 0) {
              // Capitalize first letter of sentiment
              const formattedSentimentKey = sentimentBucket.key.charAt(0).toUpperCase() + sentimentBucket.key.slice(1);
              sentimentBySource[formattedSourceKey][formattedSentimentKey] = sentimentBucket.doc_count;
            }
          });
        }
      });

      return res.json(sentimentBySource);
    } catch (error) {
      console.error("Error fetching sentiment by source:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getEmotionBySource: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
applyCountryLocationFilter(query,country)
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

      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

      // Apply sentiment filter if provided (this filters the overall results)
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

      // Create the aggregation query with nested aggregations
      // First aggregate by source, then within each source aggregate by emotion
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
            aggs: {
              emotion_counts: {
                terms: {
                  field: "llm_emotion.keyword",
                  size: 20,
                },
              },
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract the aggregation buckets
      const sourceBuckets = aggResponse.aggregations.source_counts.buckets;

      // Process the nested aggregations to create the final structure
      const emotionBySource = {};

      sourceBuckets.forEach((sourceBucket) => {
        if (sourceBucket.doc_count > 0) {
          // Normalize source key
          const normalizedSourceKey = sourceBucket.key.toLowerCase();
          let formattedSourceKey;
          if (normalizedSourceKey === "linkedin") {
            formattedSourceKey = "LinkedIn";
          } else {
            formattedSourceKey = normalizedSourceKey.charAt(0).toUpperCase() + normalizedSourceKey.slice(1);
          }

          // Initialize emotion counts for this source
          emotionBySource[formattedSourceKey] = {};

          // Process emotion sub-aggregations
          const emotionBuckets = sourceBucket.emotion_counts.buckets;
          emotionBuckets.forEach((emotionBucket) => {
            if (emotionBucket.doc_count > 0) {
              // Capitalize first letter of emotion
              const formattedEmotionKey = emotionBucket.key.charAt(0).toUpperCase() + emotionBucket.key.slice(1);
              emotionBySource[formattedSourceKey][formattedEmotionKey] = emotionBucket.doc_count;
            }
          });
        }
      });

      return res.json(emotionBySource);
    } catch (error) {
      console.error("Error fetching emotion by source:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getPopularSources: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        category = "all",
        source = "All",
        country,
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
        return res.json([]);
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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
applyCountryLocationFilter(query,country)
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

      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Now create the aggregation query with the same base query
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_counts: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
          },
        },
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract the aggregation buckets
      const buckets = aggResponse.aggregations.source_counts.buckets;

      const sourceCounts = buckets.reduce((acc, bucket) => {
        if (bucket.doc_count > 0) {
          // Normalize key (e.g., treat Linkedin and LinkedIn as same)
          const normalizedKey = bucket.key.toLowerCase();

          // Add or update count
          acc[normalizedKey] = (acc[normalizedKey] || 0) + bucket.doc_count;
        }
        return acc;
      }, {});

      // Calculate total mentions
      const totalMentions = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);

      // Create array of sources with counts and percentages, ordered by popularity
      const popularSources = Object.entries(sourceCounts)
        .map(([key, count]) => {
          // Handle special cases like LinkedIn
          let formattedKey;
          if (key.toLowerCase() === "linkedin") {
            formattedKey = "LinkedIn";
          } else {
            // Capitalize the first letter dynamically
            formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
          }

          // Calculate percentage (rounded to 2 decimal places)
          const percentage = totalMentions > 0 ? Number(((count / totalMentions) * 100).toFixed(2)) : 0;

          return {
            source: formattedKey,
            mentions: count,
            percentage: percentage,
          };
        })
        .sort((a, b) => b.mentions - a.mentions); // Sort by mentions descending (most popular first)

      return res.json(popularSources);
    } catch (error) {
      console.error("Error fetching popular sources:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getActiveUsersDistribution: async (req, res) => {
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Create aggregation query to get user activity data grouped by source
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          source_users: {
            terms: {
              field: "source.keyword",
              size: 20,
            },
            aggs: {
              // Aggregate user metrics
              total_followers: {
                sum: {
                  field: "u_followers",
                  missing: 0
                }
              },
              total_posts: {
                sum: {
                  field: "u_posts",
                  missing: 0
                }
              },
              total_likes: {
                sum: {
                  field: "u_likes",
                  missing: 0
                }
              },
              // Count unique users (those with actual usernames)
              unique_users: {
                cardinality: {
                  field: "u_username.keyword"
                }
              },
              // Count distinct users by fullname
              active_users: {
                cardinality: {
                  field: "u_fullname.keyword",
                  precision_threshold: 10000
                }
              }
            }
          }
        }
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract the aggregation buckets
      const sourceBuckets = aggResponse.aggregations.source_users.buckets;

      // Process the aggregations to create active users distribution
      const userActivityBySource = {};

      // First pass: collect all active users counts
      let totalActiveUsers = 0;
      sourceBuckets.forEach((sourceBucket) => {
        if (sourceBucket.doc_count > 0) {
          const activeUsersCount = sourceBucket.active_users?.value || 0;
          totalActiveUsers += activeUsersCount;
        }
      });

      // Second pass: create distribution with percentages
      sourceBuckets.forEach((sourceBucket) => {
        if (sourceBucket.doc_count > 0) {
          // Normalize source key
          const normalizedSourceKey = sourceBucket.key.toLowerCase();
          let formattedSourceKey;
          if (normalizedSourceKey === "linkedin") {
            formattedSourceKey = "LinkedIn";
          } else {
            formattedSourceKey = normalizedSourceKey.charAt(0).toUpperCase() + normalizedSourceKey.slice(1);
          }

          const activeUsersCount = sourceBucket.active_users?.value || 0;
          const percentage = totalActiveUsers > 0 ? Math.round((activeUsersCount / totalActiveUsers) * 100) : 0;

          userActivityBySource[formattedSourceKey] = {
            activeUsers: activeUsersCount,
            percentage: percentage
          };
        }
      });

      return res.json(userActivityBySource);
    } catch (error) {
      console.error("Error fetching active users distribution:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getDashboardMetrics: async (req, res) => {
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
        return res.json({
          totalMentions: 0,
          avgSentiment: 0,
          activeUsers: 0,
        });
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

      // Build time range: if no dates are provided, DO NOT apply default last90days
      // For topicId 2641, only check fromDate and toDate (not timeSlot)
      const noDateProvided =
        parseInt(topicId) === 2641
          ? (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "")
          : (timeSlot === null || timeSlot === undefined || timeSlot === "") &&
            (fromDate === null || fromDate === undefined || fromDate === "") &&
            (toDate === null || toDate === undefined || toDate === "");

      let queryTimeRange = null;
      if (!noDateProvided) {
        queryTimeRange = {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        };
      }

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

      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);

      const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Special filter for topicId 2651 - only fetch Healthcare results
      if (topic === 2651) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Healthcare" }
        });
      }

      // Special filter for topicId 2652 - only fetch Food and Beverages results
      if (topic === 2652 || topic === 2663) {
        query.bool.must.push({
          term: { "p_tag_cat.keyword": "Food and Beverages" }
        });
      }

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

      // Create aggregation query to get dashboard metrics
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          avg_sentiment: {
            avg: {
              field: "llm_polarity",
              missing: 0
            }
          },
          active_users: {
            cardinality: {
              field: "u_fullname.keyword",
              precision_threshold: 10000
            }
          }
        }
      };

      // Execute the aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Extract metrics
      // Get total mentions from hits.total.value (more efficient than value_count aggregation)
      const totalMentions = aggResponse.hits?.total?.value || aggResponse.hits?.total || 0;
      const avgPolarity = aggResponse.aggregations?.avg_sentiment?.value || 0;
      
      // Convert polarity (-1 to 1 or 0 to 1) to 0-100 scale for display
      // Assuming polarity is 0-1, multiply by 100. If it's -1 to 1, adjust accordingly
      let avgSentiment = 0;
      if (avgPolarity !== null && avgPolarity !== undefined) {
        // If polarity is in range -1 to 1, convert to 0-100
        if (avgPolarity >= -1 && avgPolarity <= 1) {
          avgSentiment = Math.round(((avgPolarity + 1) / 2) * 100);
        } else if (avgPolarity >= 0 && avgPolarity <= 1) {
          // If already 0-1, just multiply by 100
          avgSentiment = Math.round(avgPolarity * 100);
        } else {
          avgSentiment = Math.round(avgPolarity);
        }
      }
      
      const activeUsers = aggResponse.aggregations?.active_users?.value || 0;

      return res.json({
        totalMentions: totalMentions,
        avgSentiment: avgSentiment,
        activeUsers: activeUsers,
      });
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
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
  if (
    topicId === 2619 ||
    topicId === 2639 ||
    topicId === 2640 ||
    topicId === 2647 ||
    topicId === 2648 ||
    topicId === 2649
  ) {
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
    parseInt(topicId) === 2653 ||
    parseInt(topicId) === 2654 ||
    parseInt(topicId) === 2655 ||
    parseInt(topicId) === 2658 ||
    parseInt(topicId) === 2659 ||
    parseInt(topicId) === 2660 ||
    parseInt(topicId) === 2661 ||
    parseInt(topicId) === 2662 ||
    parseInt(topicId) === 2663 ||
    parseInt(topicId) === 2664
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
  
  else if (topicId === 2646 || topicId === 2650) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Web" } },
             { match_phrase: { source: 'Facebook' } },
                 { match_phrase: { source: 'Instagram' } },
                 { match_phrase: { source: 'Youtube' } },
        ],
        minimum_should_match: 1,
      },
    });
  } else {
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

module.exports = socialsDistributionsController;
