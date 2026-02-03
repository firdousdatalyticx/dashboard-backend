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
      if (topic === 2652) {
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
      if (topic === 2652) {
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
      if (topic === 2652) {
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
      if (topic === 2652) {
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
      if (topic === 2652) {
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
      if (topic === 2652) {
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
    parseInt(topicId) === 2655
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
