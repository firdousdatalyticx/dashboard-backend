const { elasticClient } = require("../../config/elasticsearch");
const { format } = require("date-fns");
const { processFilters } = require("./filter.utils");
const prisma = require("../../config/database");
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

const mentionsTrendController = {
  /**
   * Get social media mentions trend data
   */
  getMentionsTrend: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        source = "All",
        unTopic = "false",
        topicId,
        llm_mention_type,
        categoryItems = [],
      } = req.body;

      // If both toDate and fromDate are null, set to last 365 days
      let effectiveFromDate = fromDate;
      let effectiveToDate = toDate;

      // if (!fromDate && !toDate && (topicId && (parseInt(topicId) === 2641) ||  parseInt(topicId) === 2643 || parseInt(topicId) === 2644)) {
      //   const today = new Date();
      //   const lastYear = new Date();
      //   lastYear.setFullYear(today.getFullYear() - 1);
      //   effectiveFromDate = lastYear.toISOString().split('T')[0];
      //   effectiveToDate = today.toISOString().split('T')[0];
      // }

      if (!fromDate && !toDate) {
  
  const topic = parseInt(topicId);

  // Topics requiring last 1 year
  const lastYearTopics = [2641, 2643, 2644];

  // Topics requiring last 90 days
  const last90DayTopics = [2619, 2639, 2640];

  const today = new Date();

  // If topic requires 1-year range
  if (lastYearTopics.includes(topic)) {
    const lastYear = new Date();
    lastYear.setFullYear(today.getFullYear() - 1);

    effectiveFromDate = lastYear.toISOString().split('T')[0];
    effectiveToDate = today.toISOString().split('T')[0];
  }

  // If topic requires 90-day range
  else  {
    const last90 = new Date();
    last90.setDate(today.getDate() - 90);

    effectiveFromDate = last90.toISOString().split('T')[0];
    effectiveToDate = today.toISOString().split('T')[0];
  }
}


      let category = req.body.category || "all";

      // Check if this is the special topicId
      const isSpecialTopic =
        (topicId && parseInt(topicId) === 2627) || parseInt(topicId) === 2600;

      // Determine which category data to use
      let categoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        categoryData = processCategoryItems(categoryItems);
        category = "custom";
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          error: "No category data available",
          mentionsGraphData: "",
          maxMentionData: "0",
        });
      }
      let workingCategory = category;
      if (category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
          workingCategory = matchedKey;
        } else {
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
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        queryString: baseQueryString,
      });

      // Handle special case for unTopic
      let queryTimeRange = {
        gte: filters.greaterThanTime,
        lte: filters.lessThanTime,
      };

      if (Number(req.body.topicId) == 2473) {
        queryTimeRange = {
          gte: "2023-01-01",
          lte: "2023-04-30",
        };
      }

      // Build base query
      const query = buildBaseQuery(
        {
          greaterThanTime: queryTimeRange.gte,
          lessThanTime: queryTimeRange.lte,
        },
        source,
        isSpecialTopic,
        Number(req.body.topicId)
      );
      // Add category filters
      addCategoryFilters(query, workingCategory, categoryData);
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

      // Apply LLM Mention Type filter if provided
      if (
        llm_mention_type != "" &&
        llm_mention_type &&
        Array.isArray(llm_mention_type) &&
        llm_mention_type.length > 0
      ) {
        const mentionTypeFilter = {
          bool: {
            should: llm_mention_type.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        };
        query.bool.must.push(mentionTypeFilter);
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
        query.bool.must.push({
          term: { is_public_opinion: true }
        });
      }

      // Execute combined aggregation query with posts
      const combinedQuery = {
        query: query,
        size: 0,
        aggs: {
          daily_counts: {
            date_histogram: {
              field: "p_created_time",
              fixed_interval: "1d",
              min_doc_count: 0,
              extended_bounds: {
                min: queryTimeRange.gte,
                max: queryTimeRange.lte,
              },
            },
            aggs: {
              top_posts: {
                top_hits: {
                  size: 10,
                      _source: {
                        includes: [
                          "u_profile_photo",
                          "u_followers",
                          "u_following",
                          "u_posts",
                          "p_likes",
                          "llm_emotion",
                          "llm_language",
                          "u_city",
                          "p_comments_text",
                          "p_url",
                          "p_comments",
                          "p_shares",
                          "p_engagement",
                          "p_content",
                          "p_picture_url",
                          "predicted_sentiment_value",
                          "predicted_category",
                          "source",
                          "rating",
                          "u_fullname",
                          "p_message_text",
                          "comment",
                          "business_response",
                          "u_source",
                          "name",
                          "p_created_time",
                          "created_at",
                          "p_comments_data",
                          "video_embed_url",
                          "p_id",
                          "p_picture",
                        ],
                      },
                },
              },
            },
          },
        },
      };

      // Execute combined query
      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: combinedQuery,
      });

      // Process results
      let maxDate = "";
      let maxMentions = 0;
      const datesWithPosts = [];
      const buckets = response?.aggregations?.daily_counts?.buckets || [];

      for (const bucket of buckets) {
        const docCount = bucket.doc_count;
        const keyAsString = new Date(bucket.key_as_string)
          .toISOString()
          .split("T")[0];

        const bucketDate = new Date(keyAsString);
        const startDate = new Date(queryTimeRange.gte);
        const endDate = new Date(queryTimeRange.lte);

        if (bucketDate >= startDate && bucketDate <= endDate) {
          if (docCount > maxMentions) {
            maxMentions = docCount;
            maxDate = keyAsString;
          }

          // Format posts for this bucket
          const posts = bucket.top_posts.hits.hits.map((hit) =>
            formatPostData(hit)
          );

          datesWithPosts.push({
            date: keyAsString,
            count: docCount,
            posts: posts,
          });
        }
      }

      // Sort dates in descending order
      datesWithPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Gather all filter terms
      let allFilterTerms = [];
      if (categoryData) {
        Object.values(categoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0)
            allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0)
            allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0)
            allFilterTerms.push(...data.urls);
        });
      }
      // For each post in datesWithPosts, add matched_terms
      if (datesWithPosts && Array.isArray(datesWithPosts)) {
        datesWithPosts.forEach((dateObj) => {
          if (dateObj.posts && Array.isArray(dateObj.posts)) {
            dateObj.posts = dateObj.posts.map((post) => {
              const textFields = [
                post.message_text,
                post.content,
                post.keywords,
                post.title,
                post.hashtags,
                post.uSource,
                post.source,
                post.p_url,
                post.userFullname,
              ];
              return {
                ...post,
                matched_terms: allFilterTerms.filter((term) =>
                  textFields.some((field) => {
                    if (!field) return false;
                    if (Array.isArray(field)) {
                      return field.some(
                        (f) =>
                          typeof f === "string" &&
                          f.toLowerCase().includes(term.toLowerCase())
                      );
                    }
                    return (
                      typeof field === "string" &&
                      field.toLowerCase().includes(term.toLowerCase())
                    );
                  })
                ),
              };
            });
          }
        });
      }

      return res.status(200).json({
        success: true,
        datesWithPosts: datesWithPosts,
      });
    } catch (error) {
      console.error("Error fetching social media mentions trend data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getMentionsOverTime: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        source = "All",
        unTopic = "false",
        topicId,
        llm_mention_type,
        categoryItems,
      } = req.body;

      let category = req.body.category || "all";

      // Check if this is the special topicId
      const isSpecialTopic =
        (topicId && parseInt(topicId) === 2627) || parseInt(topicId) === 2600;

      // Determine which category data to use
      let categoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        // Use categoryItems if provided and not empty
        categoryData = processCategoryItems(categoryItems);
        // When using categoryItems, always use 'custom' category
        category = "custom";
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          error: "No category data available",
          mentionsGraphData: "",
          maxMentionData: "0",
        });
      }

      if (category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (!matchedKey) {
          return res.json({
            success: true,
            error: "Category not found",
            mentionsGraphData: "",
            maxMentionData: "0",
          });
        }
        category = matchedKey;
      }

      // Build base query for filters processing
      const baseQueryString = buildBaseQueryString(category, categoryData);

      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
        isSpecialTopic,
      });

      // Handle special case for unTopic
      let queryTimeRange = {
        gte: filters.greaterThanTime,
        lte: filters.lessThanTime,
      };

      if (Number(req.body.topicId) == 2473) {
        queryTimeRange = {
          gte: "2023-01-01",
          lte: "2023-04-30",
        };
      }

      // Build base query
      const query = buildBaseQuery(
        {
          greaterThanTime: queryTimeRange.gte,
          lessThanTime: queryTimeRange.lte,
        },
        source,
        isSpecialTopic,
        Number(req.body.topicId)
      );

      // Add category filters
      addCategoryFilters(query, category, categoryData);

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
        console.log("Applied sentiment filter for:", sentimentType);
      }

      // Apply LLM Mention Type filter if provided
      if (
        llm_mention_type != "" &&
        llm_mention_type &&
        Array.isArray(llm_mention_type) &&
        llm_mention_type.length > 0
      ) {
        const mentionTypeFilter = {
          bool: {
            should: llm_mention_type.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        };
        query.bool.must.push(mentionTypeFilter);
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
        query.bool.must.push({
          term: { is_public_opinion: true }
        });
      }

      // Execute aggregation query to get counts per date
      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          daily_counts: {
            date_histogram: {
              field: "p_created_time",
              fixed_interval: "1d",
              min_doc_count: 0,
              extended_bounds: {
                min: queryTimeRange.gte,
                max: queryTimeRange.lte,
              },
            },
          },
        },
      };

      // Execute aggregation query
      const aggResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Get total count using the same query
      const totalCountQuery = {
        query: query,
        size: 0,
      };
      const totalCountResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: totalCountQuery,
      });
      const totalCount =
        totalCountResponse.hits.total.value ||
        totalCountResponse.hits.total ||
        0;

      // Process aggregation results and find max mentions
      let maxDate = "";
      let maxMentions = 0;
      const datesArray = [];

      const buckets = aggResponse?.aggregations?.daily_counts?.buckets || [];

      for (const bucket of buckets) {
        const docCount = bucket.doc_count;
        const keyAsString = new Date(bucket.key_as_string)
          .toISOString()
          .split("T")[0];

        const bucketDate = new Date(keyAsString);
        const startDate = new Date(queryTimeRange.gte);
        const endDate = new Date(queryTimeRange.lte);

        if (bucketDate >= startDate && bucketDate <= endDate) {
          if (docCount > maxMentions) {
            maxMentions = docCount;
            maxDate = keyAsString;
          }

          datesArray.push({ date: keyAsString, count: docCount });
        }
      }

      // Sort dates in descending order
      datesArray.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Return response with mentions only
      return res.status(200).json({
        success: true,
        maxMentionData: `${maxDate},${maxMentions}`,
        totalCount: totalCount,
        datesWithPosts: datesArray, // this is your final mentions data
        query: query, // optional for debugging
      });
    } catch (error) {
      console.error("Error fetching social media mentions trend data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getMentionsTrendPost: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        source = "All",
        unTopic = "false",
        llm_mention_type,
        categoryItems,
      } = req.query;

      let category = req.query.category || "all";

      // Determine which category data to use
      let categoryData = {};

      if (
        categoryItems &&
        Array.isArray(categoryItems) &&
        categoryItems.length > 0
      ) {
        // Use categoryItems if provided and not empty
        categoryData = processCategoryItems(categoryItems);
        // When using categoryItems, always use 'custom' category
        category = "custom";
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: false,
          error: "No category data available",
          mentionsGraphData: "",
          maxMentionData: ",0",
        });
      }

      if (category !== "all" && category !== "" && category !== "custom") {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (!matchedKey) {
          return res.json({
            success: false,
            error: "Category not found",
            mentionsGraphData: "",
            maxMentionData: ",0",
          });
        }
        category = matchedKey;
      }

      // Check if this is the special topicId
      const isSpecialTopic =
        (req.body.topicId && parseInt(req.body.topicId) === 2627) ||
        parseInt(req.body.topicId) === 2600;

      // Build base query for filters processing
      const baseQueryString = buildBaseQueryString(category, categoryData);

      // Process filters (time slot, date range, sentiment)
      const filters = processFilters({
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString: baseQueryString,
      });

      // Handle special case for unTopic
      let queryTimeRange = {
        gte: filters.greaterThanTime,
        lte: filters.lessThanTime,
      };

      if (Number(req.body.topicId) == 2473) {
        queryTimeRange = {
          gte: fromDate,
          lte: toDate,
        };
      }

      // Build base query
      const query = buildBaseQuery(
        {
          greaterThanTime: queryTimeRange.gte,
          lessThanTime: queryTimeRange.lte,
        },
        source,
        isSpecialTopic,
        Number(req.body.topicId)
      );

      // Add category filters
      addCategoryFilters(query, category, categoryData);

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
        console.log("Applied sentiment filter for:", sentimentType);
      }

      // Apply LLM Mention Type filter if provided
      if (
        llm_mention_type != "" &&
        llm_mention_type &&
        Array.isArray(llm_mention_type) &&
        llm_mention_type.length > 0
      ) {
        const mentionTypeFilter = {
          bool: {
            should: llm_mention_type.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        };
        query.bool.must.push(mentionTypeFilter);
      }

      // Normalize the input
      const mentionTypesArray =
        typeof llm_mention_type === "string"
          ? llm_mention_type.split(",").map((s) => s.trim())
          : llm_mention_type;

      // Apply LLM Mention Type filter if provided
      if (
        llm_mention_type != "" &&
        mentionTypesArray &&
        Array.isArray(mentionTypesArray) &&
        mentionTypesArray.length > 0
      ) {
        const mentionTypeFilter = {
          bool: {
            should: mentionTypesArray.map((type) => ({
              match: { llm_mention_type: type },
            })),
            minimum_should_match: 1,
          },
        };
        query.bool.must.push(mentionTypeFilter);
      }

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
        query.bool.must.push({
          term: { is_public_opinion: true }
        });
      }

      // Build complete query
      const queryTemplate = {
        query: query,
        size: 30,
      };

      // Execute Elasticsearch query
      const results = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: queryTemplate,
      });

      // Format response using the optimized formatPostData function
      const responseArray =
        results?.hits?.hits?.map((hit) => formatPostData(hit)) || [];

      // Gather all filter terms
      let allFilterTerms = [];
      if (categoryData) {
        Object.values(categoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0)
            allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0)
            allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0)
            allFilterTerms.push(...data.urls);
        });
      }
      // For each post in responseArray, add matched_terms
      if (responseArray && Array.isArray(responseArray)) {
        responseArray.forEach((post, idx) => {
          const textFields = [
            post.message_text,
            post.content,
            post.keywords,
            post.title,
            post.hashtags,
            post.uSource,
            post.source,
            post.p_url,
            post.userFullname,
          ];
          responseArray[idx] = {
            ...post,
            matched_terms: allFilterTerms.filter((term) =>
              textFields.some((field) => {
                if (!field) return false;
                if (Array.isArray(field)) {
                  return field.some(
                    (f) =>
                      typeof f === "string" &&
                      f.toLowerCase().includes(term.toLowerCase())
                  );
                }
                return (
                  typeof field === "string" &&
                  field.toLowerCase().includes(term.toLowerCase())
                );
              })
            ),
          };
        });
      }

      return res.status(200).json({
        success: true,
        responseArray,
        total: responseArray.length || 0,
      });
    } catch (error) {
      console.error("Error fetching social media mentions trend data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

/**
 * Format post data for the frontend
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
const formatPostData = (hit) => {
  const source = hit._source;

  // Use a default image if a profile picture is not provided
  const profilePic =
    source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
  const following = source.u_following > 0 ? `${source.u_following}` : "";
  const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
  const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

  // Emotion
  const llm_emotion =
    source.llm_emotion ||
    (source.source === "GoogleMyBusiness" && source.rating
      ? source.rating >= 4
        ? "Supportive"
        : source.rating <= 2
        ? "Frustrated"
        : "Neutral"
      : "");

  // Clean up comments URL if available
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

  // Determine sentiment
  let predicted_sentiment = "";
  let predicted_category = "";

  if (source.predicted_sentiment_value)
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

  // Handle YouTube-specific fields
  let youtubeVideoUrl = "";
  let profilePicture2 = "";
  if (source.source === "Youtube") {
    if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
    else if (source.p_id)
      youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
  } else {
    profilePicture2 = source.p_picture ? source.p_picture : "";
  }

  // Determine source icon based on source name
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

  // Format message text – with special handling for GoogleMaps/Tripadvisor
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
    u_city: source.u_city,
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
    created_at: new Date(
      source.p_created_time || source.created_at
    ).toLocaleString(),
    p_comments_data: source.p_comments_data,
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
      must: [
        {
          range: {
            p_created_time: {
              gte: dateRange.greaterThanTime,
              lte: dateRange.lessThanTime,
            },
          },
        },
      ],
      must_not: [
        {
          term: {
            source: "DM",
          },
        },
      ],
    },
  };
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
  }
  // Apply explicit source filters if provided
  else if (normalizedSources.length > 0) {
    query.bool.must.push({
      bool: {
        should: normalizedSources.map((src) => ({
          match_phrase: { source: src },
        })),
        minimum_should_match: 1,
      },
    });
  }
  // Handle special topic source filtering when no explicit filter provided
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
  } else if (topicId === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
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
  } else {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
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
              { match_phrase: { keywords: keyword } }
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } }
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } }
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
              { match_phrase: { keywords: keyword } }
            ]),
            ...(data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } }
            ]),
            ...(data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } }
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

module.exports = mentionsTrendController;
