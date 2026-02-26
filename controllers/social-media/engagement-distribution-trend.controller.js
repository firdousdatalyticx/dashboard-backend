const { elasticClient } = require("../../config/elasticsearch");
const { format } = require("date-fns");
const { processFilters } = require("./filter.utils");
const prisma = require("../../config/database");
const processCategoryItems = require("../../helpers/processedCategoryItems");
const fs = require('fs');
const path = require('path');
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

const engagementDistributionTrendController = {
  /**
   * Get social media EngagementDistributionTrend data
   */
  getEngagementDistributionTrend: async (req, res) => {
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
        total_likes: { sum: { field: "p_likes" } },
        total_comments: { sum: { field: "p_comments" } },
        total_shares: { sum: { field: "p_shares" } },
        total_engagement:  { sum: { field: "p_engagement" } },
        top_posts: {
          top_hits: {
            size: 100,
            _source: {
              includes: [
                "u_profile_photo",
                "u_followers",
                "u_following",
                "u_posts",
                "p_likes",
                "llm_emotion",
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

    const posts = bucket.top_posts.hits.hits.map((hit) =>
      formatPostData(hit)
    );

    // Add cumulative engagement metrics
    const dailyEngagement = {
      totalEngagement:bucket.total_engagement.value||0,
      totalLikes: bucket.total_likes?.value || 0,
      totalComments: bucket.total_comments?.value || 0,
      totalShares: bucket.total_shares?.value || 0,
    };

    datesWithPosts.push({
      date: keyAsString,
      count: docCount,
      posts: posts,
      engagement: dailyEngagement,
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


  getEngagementDistributionTrendPost: async (req, res) => {
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
  getData:async (req,res)=>{
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

    let category = req.body.category || "all";

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
      categoryData = req.processedCategories || {};
    }

    req.processedCategories={
  "danatjebeldhannaresort": {
    "urls": [
      "https://www.facebook.com/InterContiAD",
      "https://www.instagram.com/ncth.uae",
      "https://www.instagram.com/danatjebeldhannaresort",
      "https://www.instagram.com/intercontinentalresidencesad",
      "https://www.instagram.com/dhafrabeachotel",
      "https://www.instagram.com/interconad",
      "https://x.com/ncth_uae",
      "https://x.com/InterContiAD",
      "https://x.com/DanatResort",
      "https://x.com/DhafraBeachH"
    ],
    "keywords": [
      "@ncth_uae",
      "@InterContiAD",
      "InterContinental Abu Dhabi Residence Hote",
      "@DanatResort",
      "NCTH UAE",
      "intercontinental abu dhabi",
      "Danat Al Ain Resort",
      "Danat Jebel Dhanna Resort",
      "Dhafra Beach Hotel",
      "ncth.uae",
      "interconad",
      "dhafrabeachotel",
      "danatjebeldhannaresort",
      "intercontinentalresidencesad"
    ],
    "hashtags": [
      "#danatjebeldhannaresort"
    ]
  }
}


    // return res.send(req.processedCategories)
    // if (Object.keys(categoryData).length === 0) {
    //   return res.status(400).json({
    //     success: false,
    //     error: "No category data available",
    //   });
    // }

    if (category !== "all" && category !== "" && category !== "custom") {
      const matchedKey = findMatchingCategoryKey(category, categoryData);
      if (!matchedKey) {
        return res.status(400).json({
          success: false,
          error: "Category not found",
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

    // Process filters
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
        query.bool.must.push({
          match: { predicted_sentiment_value: sentimentType.trim() },
        });
      }
      console.log("Applied sentiment filter for:", sentimentType);
    }

    // Normalize the mention type input
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

    // Define fields to export
    const exportFields = [
      "p_created_time",
      "p_message_text",
      "predicted_sentiment_value",
      "llm_emotion",
      "is_public_opinion",
      "llm_keywords",
      "llm_subtopic",
      "u_source",
      "query_hashtag",
      "u_followers",
      "u_likes",
      "p_comments",
      "p_shares",
      "source",
      "llm_language",
      "llm_mention_audience",
      "llm_mention_recurrence",
      "llm_mention_urgency",
      "p_phrase_text"
    ];

    console.log('Starting data export with filters...');
    // console.log('Query:', JSON.stringify(query, null, 2));

    // query.bool.must.push(
    //     {
    //       "exists": {
    //         "field": "p_phrase_text"
    //       }
    //     }
    //   );

//      query  =  {"query":{
//     "bool": {
//       "must": [
//         { "exists": { "field": "p_phrase_text" } },
//          { "exists": { "field": "is_public_opinion" } }
//       ]
//     }
// }}
//  return res.status(200).json(query);
const query2 ={
  "bool": {
    "must": [
  
        {
                "bool": {
                    "should": [
                        {
                            "match_phrase": {
                                "source": "Facebook"
                            }
                        },
                        {
                            "match_phrase": {
                                "source": "Twitter"
                            }
                        },
                        {
                            "match_phrase": {
                                "source": "Instagram"
                            }
                        }
                    ],
                    "minimum_should_match": 1
                }
            },
      {
        "bool": {
          "should": [
            { "match_phrase": { "p_message_text": "@ncth_uae" }},
            { "match_phrase": { "keywords": "@ncth_uae" }},
            
            { "match_phrase": { "p_message_text": "@InterContiAD" }},
            { "match_phrase": { "keywords": "@InterContiAD" }},

            { "match_phrase": { "p_message_text": "InterContinental Abu Dhabi Residence Hote" }},
            { "match_phrase": { "keywords": "InterContinental Abu Dhabi Residence Hote" }},

            { "match_phrase": { "p_message_text": "@DanatResort" }},
            { "match_phrase": { "keywords": "@DanatResort" }},

            { "match_phrase": { "p_message_text": "NCTH UAE" }},
            { "match_phrase": { "keywords": "NCTH UAE" }},

            { "match_phrase": { "p_message_text": "intercontinental abu dhabi" }},
            { "match_phrase": { "keywords": "intercontinental abu dhabi" }},

            { "match_phrase": { "p_message_text": "Danat Al Ain Resort" }},
            { "match_phrase": { "keywords": "Danat Al Ain Resort" }},

            { "match_phrase": { "p_message_text": "Danat Jebel Dhanna Resort" }},
            { "match_phrase": { "keywords": "Danat Jebel Dhanna Resort" }},

            { "match_phrase": { "p_message_text": "Dhafra Beach Hotel" }},
            { "match_phrase": { "keywords": "Dhafra Beach Hotel" }},

            { "match_phrase": { "p_message_text": "ncth.uae" }},
            { "match_phrase": { "keywords": "ncth.uae" }},

            { "match_phrase": { "p_message_text": "interconad" }},
            { "match_phrase": { "keywords": "interconad" }},

            { "match_phrase": { "p_message_text": "dhafrabeachotel" }},
            { "match_phrase": { "keywords": "dhafrabeachotel" }},

            { "match_phrase": { "p_message_text": "danatjebeldhannaresort" }},
            { "match_phrase": { "keywords": "danatjebeldhannaresort" }},
            
            { "match_phrase": { "p_message_text": "intercontinentalresidencesad" }},
            { "match_phrase": { "keywords": "intercontinentalresidencesad" }},

            { "match_phrase": { "p_message_text": "#danatjebeldhannaresort" }},
            { "match_phrase": { "hashtags": "#danatjebeldhannaresort" }},

            { "match_phrase": { "u_source": "https://www.facebook.com/InterContiAD" }},
            { "match_phrase": { "p_url": "https://www.facebook.com/InterContiAD" }},

            { "match_phrase": { "u_source": "https://www.instagram.com/ncth.uae" }},
            { "match_phrase": { "p_url": "https://www.instagram.com/ncth.uae" }},

            { "match_phrase": { "u_source": "https://www.instagram.com/danatjebeldhannaresort" }},
            { "match_phrase": { "p_url": "https://www.instagram.com/danatjebeldhannaresort" }},

            { "match_phrase": { "u_source": "https://www.instagram.com/intercontinentalresidencesad" }},
            { "match_phrase": { "p_url": "https://www.instagram.com/intercontinentalresidencesad" }},

            { "match_phrase": { "u_source": "https://www.instagram.com/dhafrabeachotel" }},
            { "match_phrase": { "p_url": "https://www.instagram.com/dhafrabeachotel" }},

            { "match_phrase": { "u_source": "https://www.instagram.com/interconad" }},
            { "match_phrase": { "p_url": "https://www.instagram.com/interconad" }},

            { "match_phrase": { "u_source": "https://x.com/ncth_uae" }},
            { "match_phrase": { "p_url": "https://x.com/ncth_uae" }},

            { "match_phrase": { "u_source": "https://x.com/InterContiAD" }},
            { "match_phrase": { "p_url": "https://x.com/InterContiAD" }},

            { "match_phrase": { "u_source": "https://x.com/DanatResort" }},
            { "match_phrase": { "p_url": "https://x.com/DanatResort" }},

            { "match_phrase": { "u_source": "https://x.com/DhafraBeachH" }},
            { "match_phrase": { "p_url": "https://x.com/DhafraBeachH" }}
          ],
          "minimum_should_match": 1
        }
      }
    ],
    "must_not": [
      {
        "term": {
          "source": "DM"
        }
      }
    ]
  }
}




   
// console.log("firdous")
  return res.status(200).json({query:query2});


    // Fetch all data using scroll API
    const allResults = await fetchAllDataWithScroll(elasticClient, query2, exportFields);

    if (allResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found to export',
      });
    }

    // Generate CSV file
    const timestamp = Date.now();
    const outputPath = path.join(__dirname, `../exports/export_${timestamp}.csv`);
    
    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    generateCSV(allResults, outputPath);

    // Send file as download
    res.download(outputPath, `elasticsearch_export_${timestamp}.csv`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to send file',
          });
        }
      }
      
      // Clean up file after download
      // try {
      //   fs.unlinkSync(outputPath);
      //   console.log('Temporary file cleaned up');
      // } catch (cleanupError) {
      //   console.error('Error cleaning up file:', cleanupError);
      // }
    });

  } catch (error) {
    console.error('Error in export:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to export data',
      message: error.message,
    });
  }
  }
};



// Method 1: Using Scroll API (recommended for large datasets)
async function fetchAllDataWithScroll(elasticClient, query, fields) {
  const allResults = [];
  const scrollTimeout = '2m';
  
  try {
    // Initial search with scroll
    let response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      scroll: scrollTimeout,
      body: {
        query: query,
        size: 1000,
        _source: fields,
      },
    });

    let scrollId = response._scroll_id;
    let hits = response.hits.hits;

    allResults.push(...hits);

    while (hits.length > 0) {
      response = await elasticClient.scroll({
        scroll_id: scrollId,
        scroll: scrollTimeout,
      });

      scrollId = response._scroll_id;
      hits = response.hits.hits;
      allResults.push(...hits);

      console.log(`Fetched ${allResults.length} documents so far...`);
    }

    await elasticClient.clearScroll({ scroll_id: scrollId });

    console.log(`Total documents fetched: ${allResults.length}`);
    return allResults;

  } catch (error) {
    console.error('Error fetching data with scroll:', error);
    throw error;
  }
}

// Helper function to escape CSV values
function escapeCSVValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

// Generate CSV from results
function generateCSV(results, outputPath) {
  const headers = [
    'ID',
    'Created Time',
    'Message Text',
    'Sentiment Value',
    'Emotion',
    'Is Public Opinion',
    'Keywords',
    'Subtopic',
    'Source',
    'Hashtag',
    'Followers',
    'Likes',
    'Comments',
    'Shares',
    'Platform',
    'Language',
    'Mention Audience',
    'Mention Recurrence',
    'Mention Urgency',
    "p phrase text"
  ];

  let csvContent = headers.join(',') + '\n';

  results.forEach(hit => {
    const row = [
      escapeCSVValue(hit._id),
      escapeCSVValue(hit._source.p_created_time),
      escapeCSVValue(hit._source.p_message_text),
      escapeCSVValue(hit._source.predicted_sentiment_value),
      escapeCSVValue(hit._source.llm_emotion),
      escapeCSVValue(hit._source.is_public_opinion),
      escapeCSVValue(
        Array.isArray(hit._source.llm_keywords) 
          ? hit._source.llm_keywords.join('; ') 
          : hit._source.llm_keywords
      ),
      escapeCSVValue(hit._source.llm_subtopic),
      escapeCSVValue(hit._source.u_source),
      escapeCSVValue(hit._source.query_hashtag),
      escapeCSVValue(hit._source.u_followers),
      escapeCSVValue(hit._source.u_likes),
      escapeCSVValue(hit._source.p_comments),
      escapeCSVValue(hit._source.p_shares),
      escapeCSVValue(hit._source.source),
      escapeCSVValue(hit._source.llm_language),
      escapeCSVValue(hit._source.llm_mention_audience),
      escapeCSVValue(hit._source.llm_mention_recurrence),
      escapeCSVValue(hit._source.llm_mention_urgency),
      escapeCSVValue(hit._source.p_phrase_text)
    ];

    csvContent += row.join(',') + '\n';
  });

  fs.writeFileSync(outputPath, csvContent, 'utf8');
  console.log(`CSV file generated: ${outputPath} (${results.length} records)`);
  
  return outputPath;
}

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
  const llm_emotion_arabic = source.llm_emotion_arabic || "";

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
    llm_emotion_arabic,
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
    p_id: source.p_id,
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
        topicId !== 2641 && topicId !== 2643 && topicId !== 2644 &&
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

  if (topicId === 2619 || topicId === 2639 || topicId === 2640 || topicId === 2647 || topicId === 2648 || topicId === 2649) {
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
  } else if (topicId === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2645 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652 || parseInt(topicId) === 2653 || parseInt(topicId) === 2654 || parseInt(topicId) === 2655 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662 || parseInt(topicId) === 2663) {
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

module.exports = engagementDistributionTrendController;
