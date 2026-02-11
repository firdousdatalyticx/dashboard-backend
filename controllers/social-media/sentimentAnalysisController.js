// sentimentAnalysisController.js
const { elasticClient } = require("../../config/elasticsearch");

const { processFilters } = require("./filter.utils");

const normalizeSourceInput = (sourceParam) => {
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
};

const findMatchingCategoryKey = (selectedCategory, categoryData = {}) => {
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
};

const sentimentAnalysisController = {
  getPosts: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        // New filter parameters
        sentimentType,
        subtopic,
        emotion,
        keyword,
        specificDate,
        limit = 50,
        topicId,
        type
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        // Import processCategoryItems if needed
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        // Fall back to middleware data
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
        selectedCategory = matchedKey;
        }else{
        selectedCategory = "all"
        }
      }

      // Build base query
      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });

      // Add specific filters based on click context
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      if (subtopic) {
        query.bool.must.push(
          
             {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": subtopic,
                                                    "fields": [
                                                        "llm_subtopic"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                }


        //   {
        //   match_phrase: { "llm_subtopic.keyword": subtopic },
        // }
      );
      }

      if (emotion) {
        query.bool.must.push(
          {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": emotion,
                                                    "fields": [
                                                        "llm_emotion"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                }
        //                         {
        //   match_phrase: { "llm_emotion.keyword": emotion },
        // }
      );
      }

      if (keyword) {
        query.bool.must.push({
          multi_match: {
            query: keyword,
            fields: [
              "p_message_text",
              "p_message",
              "keywords",
              "title",
              "llm_keywords",
            ],
            type: "phrase",
          },
        });
      }

       if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }
      const sourceFields =
      type === "summary"
        ? ["p_message_text","source","p_url"]
        : [
            "p_message_text",
            "p_message",
            "p_created_time",
            "u_fullname",
            "u_username",
            "u_profile_pic_url",
            "source",
            "predicted_sentiment_value",
            "llm_subtopic",
            "llm_emotion",
            "llm_language",
            "u_country",
            "llm_keywords",
            "p_url",
            "p_image_url",
            "p_video_url",
            "engagement_score",
            "like_count",
            "comment_count",
            "share_count",
          ];

      // Fetch posts
      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query: query,
          size: limit,
          sort: [{ p_created_time: { order: "desc" } }],
          _source: sourceFields,
        },
      });

      let posts = response?.hits?.hits || [];
      if (type === "summary") {
      return res.json(
        posts.map((hit) => {
          const s = hit._source || {};

          return {
            p_message: s.p_message_text || "",
            u_source: s.source || "",
            source_url: s.p_url || ""
          };
        })
      );
    }

       posts =
        posts?.map((hit) => formatPostData(hit)) || [];

      return res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  // 1. Get Sentiment Distribution
  getSentimentDistribution: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        topicId
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
        });
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
            selectedCategory = matchedKey;
        }else{
        selectedCategory="all";
        }
      }

      // Build base query (reuse your existing logic)
      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });

       if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          sentiment_distribution: {
            terms: {
              field: "predicted_sentiment_value.keyword",
              size: 10,
            },
            aggs: {
              sources_by_sentiment: {
                terms: {
                  field: "source.keyword",
                  size: 20,
                },
              },
            },
          },
        },
      };

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = response.aggregations.sentiment_distribution.buckets;
      const result = {
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
        sourcesBySentiment: {},
      };

      buckets.forEach((bucket) => {
        const sentiment = bucket.key.toLowerCase();
        result[sentiment] = bucket.doc_count;
        result.total += bucket.doc_count;

        // Add source breakdown for each sentiment
        result.sourcesBySentiment[sentiment] = bucket.sources_by_sentiment.buckets.map(
          (sourceBucket) => ({
            source: sourceBucket.key,
            count: sourceBucket.doc_count,
          })
        );
      });

      return res.json({ ...result, aggQuery });
    } catch (error) {
      console.error("Error fetching sentiment distribution:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  // 2. Get Subtopic Frequency
  getSubtopicFrequency: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        topicId
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

      // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
           selectedCategory = matchedKey;
        }else{
          selectedCategory="all"
        }
       
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });
       if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          subtopic_frequency: {
            terms: {
              field: "llm_subtopic.keyword",
              size: 10,
              exclude: "null",
            },
          },
        },
      };

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = response.aggregations.subtopic_frequency.buckets;
      const result = buckets
        .map((bucket) => ({
          subtopic: bucket.key,
          count: bucket.doc_count,
        }))
        .sort((a, b) => b.count - a.count);

      return res.json(result);
    } catch (error) {
      console.error("Error fetching subtopic frequency:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  // 3. Get Sentiment by Subtopic
  getSentimentBySubtopic: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        topicId
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

     // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
           selectedCategory = matchedKey;
        }else{
          selectedCategory="all"
        }
       
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });

        if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          subtopics: {
            terms: {
              field: "llm_subtopic.keyword",
              size: 10,
              exclude: "null",
            },
            aggs: {
              sentiments: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 10,
                },
              },
            },
          },
        },
      };


      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = response.aggregations.subtopics.buckets;
      const result = buckets
        .map((bucket) => {
          const sentiments = {
            positive: 0,
            negative: 0,
            neutral: 0,
          };

          bucket.sentiments.buckets.forEach((sentBucket) => {
            const sentiment = sentBucket.key.toLowerCase();
            sentiments[sentiment] = sentBucket.doc_count;
          });

          return {
            subtopic: bucket.key,
            ...sentiments,
            total: bucket.doc_count,
          };
        })
        .sort((a, b) => b.total - a.total);

      return res.json(result);
    } catch (error) {
      console.error("Error fetching sentiment by subtopic:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  getTrendOverTime: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        interval = "month", // day, week, month, year
        includePosts = true, // Flag to include posts or not
        postsPerBucket = 10, // Number of posts per time bucket
        topicId
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

 // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
           selectedCategory = matchedKey;
        }else{
          selectedCategory="all"
        }
       
      }

      // For getTrendOverTime, default to 90 days if no dates provided
      let effectiveTimeSlot = timeSlot;
      let effectiveFromDate = fromDate;
      let effectiveToDate = toDate;

      if (!timeSlot && !fromDate && !toDate) {
        // Default to exactly 90 days ago from today
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        effectiveFromDate = ninetyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
        effectiveToDate = new Date().toISOString().split('T')[0]; // Today in YYYY-MM-DD format
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot: effectiveTimeSlot,
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId,
        excludeTopic2641Logic: true // Exclude topicId 2641 special logic for getTrendOverTime
      });

       if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          time_series: {
            date_histogram: {
              field: "p_created_time",
              calendar_interval: interval,
              format: "yyyy-MM-dd",
              min_doc_count: 0,
              extended_bounds: {
                min: effectiveFromDate || "now-90d",
                max: effectiveToDate || "now",
              },
            },
            aggs: {
              sentiments: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 10,
                },
                // Move top_posts inside sentiments aggregation
                ...(includePosts && {
                  aggs: {
                    top_posts: {
                      top_hits: {
                        size: postsPerBucket,
                        sort: [{ p_created_time: { order: "desc" } }],
                        _source: [
                          "p_message_text",
                          "p_message",
                          "p_created_time",
                          "u_fullname",
                          "u_username",
                          "u_profile_pic_url",
                          "source",
                          "predicted_sentiment_value",
                          "llm_subtopic",
                          "llm_emotion",
                          "llm_language",
                          "u_country",
                          "llm_keywords",
                          "p_url",
                          "p_image_url",
                          "p_video_url",
                          "like_count",
                          "comment_count",
                          "share_count",
                          "view_count",
                          "retweet_count",
                        ],
                      },
                    },
                  },
                }),
              },
            },
          },
        },
      };

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      // Helper function to calculate engagement score
      const calculateEngagementScore = (post) => {
        const likes = post.like_count || 0;
        const comments = post.comment_count || 0;
        const shares = post.share_count || 0;
        const views = post.view_count || 0;
        const retweets = post.retweet_count || 0;

        // Weighted engagement score
        return (
          likes * 1 + comments * 2 + shares * 3 + retweets * 3 + views * 0.1
        );
      };

      const buckets = response.aggregations.time_series.buckets;
      const result = buckets.map((bucket) => {
        const sentiments = {
          positive: 0,
          negative: 0,
          neutral: 0,
        };

        const dataPoint = {
          date: bucket.key_as_string,
          timestamp: bucket.key,
          total: bucket.doc_count,
        };

        // Add posts if requested
        if (includePosts) {
          dataPoint.postsBySentiment = {};
        }

        // Process sentiment buckets
        bucket.sentiments.buckets.forEach((sentBucket) => {
          const sentiment = sentBucket.key.toLowerCase();
          sentiments[sentiment] = sentBucket.doc_count;

          // Add posts for this specific sentiment
          if (includePosts && sentBucket.top_posts) {
            let sentimentPosts = sentBucket.top_posts.hits.hits.map((hit) => {
              const postData = formatPostData(hit);
              // Add calculated engagement score
              postData.engagement_score = calculateEngagementScore(postData);
              return postData;
            });

            // Sort by engagement score (highest first)
            sentimentPosts.sort(
              (a, b) => b.engagement_score - a.engagement_score
            );

            // Store posts for this sentiment
            dataPoint.postsBySentiment[sentiment] = sentimentPosts;
          }
        });

        // Add sentiment counts to dataPoint
        dataPoint.positive = sentiments.positive;
        dataPoint.negative = sentiments.negative;
        dataPoint.neutral = sentiments.neutral;

        return dataPoint;
      });

      return res.json(result);
    } catch (error) {
      console.error("Error fetching trend over time:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  // 5. Get Emotion Breakdown by Subtopic
  getEmotionBreakdown: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        topicId
      } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

       // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
           selectedCategory = matchedKey;
        }else{
          selectedCategory="all"
        }
       
      }

      const query = buildAnalysisQuery({
        categoryData,
        category,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });

          if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      const aggQuery = {
        query: query,
        size: 0,
        aggs: {
          subtopics: {
            terms: {
              field: "llm_subtopic.keyword",
              size: 10,
              exclude: "null",
            },
            aggs: {
              emotions: {
                terms: {
                  field: "llm_emotion.keyword",
                  size: 20,
                },
              },
            },
          },
        },
      };

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = response.aggregations.subtopics.buckets;
      const result = buckets
        .map((bucket) => {
          const emotions = bucket.emotions.buckets.map((emotionBucket) => ({
            emotion: emotionBucket.key,
            count: emotionBucket.doc_count,
          }));

          return {
            subtopic: bucket.key,
            emotions: emotions,
            total: bucket.doc_count,
          };
        })
        .sort((a, b) => b.total - a.total);

      return res.json(result);
    } catch (error) {
      console.error("Error fetching emotion breakdown by subtopic:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  // 6. Get Keywords Cloud Data
  getKeywordsCloud: async (req, res) => {
    try {
      const {
        timeSlot,
        fromDate,
        toDate,
        category = "all",
        sources = "All",
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        sentimentType,
        topicId
      } = req.body;

      // Determine which category data to use
      let categoryData = {};
      if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
        const processCategoryItems = require('../../helpers/processedCategoryItems');
        categoryData = processCategoryItems(req.body.categoryItems);
      } else {
        categoryData = req.processedCategories || {};
      }

      if (Object.keys(categoryData).length === 0) {
        return res.json([]);
      }

         // Handle category parameter - validate if provided
      let selectedCategory = category;
      if (category && category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);
        if (matchedKey) {
           selectedCategory = matchedKey;
        }else{
          selectedCategory="all"
        }
       
      }

      const query = buildAnalysisQuery({
        categoryData,
        category: selectedCategory,
        timeSlot,
        fromDate,
        toDate,
        sources,
        llm_mention_type,
        countries,
        keywords,
        organizations,
        cities,
        dataSource,
        topicId
      });

          if(selectedCategory=="all" && category!=="all"){
                         const categoryFilter = {
                                    bool: {
                                        should:  [
                                            {
                                                "multi_match": {
                                                    "query": category,
                                                    "fields": [
                                                        "p_message_text",
                                                        "p_message",
                                                        "hashtags",
                                                        "u_source",
                                                        "p_url"
                                                    ],
                                                    "type": "phrase"
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                };
                                query.bool.must.push(categoryFilter);
                        }

      // Apply sentiment filter if provided
      if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
        if (sentimentType.includes(',')) {
          // Handle multiple sentiment types
          const sentimentArray = sentimentType.split(',');
          const sentimentFilter = {
            bool: {
              should: sentimentArray.map(sentiment => ({
                match: { predicted_sentiment_value: sentiment.trim() }
              })),
              minimum_should_match: 1
            }
          };
          query.bool.must.push(sentimentFilter);
        } else {
          // Handle single sentiment type
          query.bool.must.push({
            match: { predicted_sentiment_value: sentimentType.trim() }
          });
        }
      }

      // Fetch posts to extract keywords
      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          query: query,
          size: 1000,
          _source: ["llm_keywords"],
        },
      });

      const keywordFrequency = {};

      response.hits.hits.forEach((hit) => {
        const keywords = hit._source.llm_keywords || [];
        keywords.forEach((keyword) => {
          if (keyword && keyword.trim()) {
            const normalizedKeyword = keyword.trim().toLowerCase();
            keywordFrequency[normalizedKeyword] =
              (keywordFrequency[normalizedKeyword] || 0) + 1;
          }
        });
      });

      const result = Object.entries(keywordFrequency)
         .map(([text, value]) => ({ text, value }))
        .filter(item => item.value >= 2) // only keep keywords with value >= 2
        .sort((a, b) => b.value - a.value)
        .slice(0, 20); // return only top 15 keywords with highest frequency

      return res.json(result);
    } catch (error) {
      console.error("Error fetching keywords cloud:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
};

// Helper function to build query (similar to your existing logic)
function buildAnalysisQuery(params) {
  const {
    categoryData,
    category,
    timeSlot,
    fromDate,
    toDate,
    sources,
    llm_mention_type,
    countries,
    keywords,
    organizations,
    cities,
    dataSource,
    topicId,
    excludeTopic2641Logic = false // New parameter to exclude topicId 2641 logic for getTrendOverTime
  } = params;

  const topicIdNum = parseInt(topicId, 10);

  // Build base query with time range (conditionally for topicId 2641, but not for getTrendOverTime)
  const noDateProvided = !excludeTopic2641Logic && topicIdNum === 2641 ?
    ((fromDate === null || fromDate === undefined || fromDate === '') &&
     (toDate === null || toDate === undefined || toDate === '')) :
    ((timeSlot === null || timeSlot === undefined || timeSlot === '') &&
     (fromDate === null || fromDate === undefined || fromDate === '') &&
     (toDate === null || toDate === undefined || toDate === ''));

  const query = {
    bool: {
      must: [],
      must_not: [],
      should: [],
    },
  };

  // Only add date range filter if dates are provided (or not topicId 2641 with null dates)
  if (!noDateProvided) {
    const filters = processFilters({
      timeSlot,
      fromDate,
      toDate,
      queryString: "",
    });

    query.bool.must.push({
      range: {
        p_created_time: {
          gte: filters.greaterThanTime,
          lte: filters.lessThanTime,
        },
      },
    });
  }

  // Add category filters
  addCategoryFilters(query, category, categoryData);

  // Add source filter using the same logic as other controllers
  const normalizedSources = normalizeSourceInput(sources);

  if (normalizedSources.length > 0) {
    // Specific sources provided via sources parameter
    query.bool.must.push({
      bool: {
        should: normalizedSources.map(src => ({
          match_phrase: { source: src }
        })),
        minimum_should_match: 1
      }
    });
  } else if (topicIdNum === 2646 || topicIdNum === 2650) {
    // Topic 2646: limit to LinkedIn and Twitter sources
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
        minimum_should_match: 1
      }
    });
  } else if (topicIdNum === 2641 || topicIdNum === 2643 || topicIdNum === 2644 || topicIdNum === 2651 || topicIdNum === 2652 || topicIdNum === 2653 || topicIdNum === 2654 || topicIdNum === 2655 || topicIdNum === 2658 || topicIdNum === 2659 || topicIdNum === 2660 || topicIdNum === 2661 || topicIdNum === 2662 || topicIdNum === 2663) {        
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
                ],
                minimum_should_match: 1
            }
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
                minimum_should_match: 1
            }
        });
    }
    else  {
    // When sources='All' or not specified, use default sources
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Reddit" } },
          { match_phrase: { source: "TikTok" } }
        ],
        minimum_should_match: 1
      }
    });
  }

  // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
  if (topicIdNum === 2643 || topicIdNum === 2644 ) {
    query.bool.must.push({
      term: { is_public_opinion: true }
    });
  }

  // Special filter for topicId 2651 - only fetch Healthcare results
  if (topicIdNum === 2651) {
    query.bool.must.push({
      term: { "p_tag_cat.keyword": "Healthcare" }
    });
  }

  // Special filter for topicId 2652 - only fetch Food and Beverages results
  if (topicIdNum === 2652 || topicIdNum === 2663) {
    query.bool.must.push({
      term: { "p_tag_cat.keyword": "Food and Beverages" }
    });
  }

  // LLM Mention Type filtering logic
  let mentionTypesArray = [];

  if (llm_mention_type) {
    if (Array.isArray(llm_mention_type)) {
      mentionTypesArray = llm_mention_type;
    } else if (typeof llm_mention_type === "string") {
      mentionTypesArray = llm_mention_type.split(",").map(s => s.trim());
    }
  }

  // CASE 1: If mentionTypesArray has valid values → apply should-match filter
  if (mentionTypesArray.length > 0) {
    query.bool.must.push({
      bool: {
        should: mentionTypesArray.map(type => ({
          match: { llm_mention_type: type }
        })),
        minimum_should_match: 1
      }
    });
  }


  // Add countries filter
  if (countries && Array.isArray(countries) && countries.length > 0) {
    query.bool.must.push({
      terms: { "u_country.keyword": countries },
    });
  }

  // Add keywords filter
  if (keywords && Array.isArray(keywords) && keywords.length > 0) {
    query.bool.must.push({
      bool: {
        should: keywords.map((keyword) => ({
          multi_match: {
            query: keyword,
            fields: ["p_message_text", "p_message", "keywords", "title"],
            type: "phrase",
          },
        })),
        minimum_should_match: 1,
      },
    });
  }

  // Add cities filter
  if (cities && Array.isArray(cities) && cities.length > 0) {
    query.bool.must.push({
      bool: {
        should: cities.map((city) => ({
          match_phrase: { llm_specific_locations: city },
        })),
        minimum_should_match: 1,
      },
    });
  }

  // Add organizations filter
  if (
    organizations &&
    Array.isArray(organizations) &&
    organizations.length > 0
  ) {
    query.bool.must.push({
      bool: {
        should: organizations.map((org) => ({
          term: { "llm_business_name.keyword": org },
        })),
        minimum_should_match: 1,
      },
    });
  }

  // Add dataSource filter
  if (dataSource !== "All") {
    const entityNames = [];
    Object.values(categoryData).forEach((cat) => {
      entityNames.push(
        ...(cat.hashtags || []),
        ...(cat.keywords || []),
        ...(cat.urls || [])
      );
    });

    const shouldClauses = entityNames.map((name) => {
      if (
        typeof name === "string" &&
        (name.includes("http://") || name.includes("https://"))
      ) {
        const escapedUrl = name.replace(
          /([+\-=&|><!(){}[\]^"~*?:\\/.])/g,
          "\\$1"
        );
        return {
          query_string: {
            query: `"${escapedUrl}"`,
            fields: ["u_source"],
            analyze_wildcard: false,
          },
        };
      } else {
        return {
          query_string: {
            query: `${name}`,
            fields: ["u_fullname", "u_username", "u_source"],
            analyze_wildcard: false,
          },
        };
      }
    });

    if (dataSource === "Entity") {
      query.bool.must.push({
        bool: {
          should: shouldClauses,
          minimum_should_match: 1,
        },
      });
    } else if (dataSource === "Public") {
      query.bool.must_not.push({
        bool: {
          should: shouldClauses,
          minimum_should_match: 1,
        },
      });
    }
  }

  return query;
}

// You'll need to import/include these helper functions from your existing code
// - processFilters
// - addCategoryFilters
// - buildBaseQueryString

/**
 * Add category filters to the query
 * @param {Object} query - Elasticsearch query object
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data with filters
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
  console.log({ selectedCategory });
  if (selectedCategory === "all" || selectedCategory === "") {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap((data) =>
            (data.keywords || []).map((keyword) => ({
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
            }))
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).map((hashtag) => ({
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
            }))
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).map((url) => ({
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
            }))
          ),
        ],
        minimum_should_match: 1,
      },
    });
  } else {
    // Find matching category with case-insensitive and flexible matching
    const normalizedSelected = selectedCategory
      .toLowerCase()
      .replace(/\s+/g, "");

    let matchedKey = Object.keys(categoryData).find(
      (key) => key.toLowerCase() === selectedCategory.toLowerCase()
    );

    if (!matchedKey) {
      matchedKey = Object.keys(categoryData).find(
        (key) => key.toLowerCase().replace(/\s+/g, "") === normalizedSelected
      );
    }

    if (!matchedKey) {
      matchedKey = Object.keys(categoryData).find(
        (key) =>
          key.toLowerCase().includes(selectedCategory.toLowerCase()) ||
          selectedCategory.toLowerCase().includes(key.toLowerCase())
      );
    }

    if (matchedKey && categoryData[matchedKey]) {
      const data = categoryData[matchedKey];

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
    u_country: source.u_country,
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
    llm_subtopic:source.llm_subtopic,
    llm_emotion:source.llm_emotion,
    llm_keywords:source.llm_keywords

  };
};

module.exports = sentimentAnalysisController;
