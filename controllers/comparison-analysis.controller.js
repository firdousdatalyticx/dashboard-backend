const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { elasticClient } = require("../config/elasticsearch");
const { format } = require("date-fns");
const { processFilters } = require("./social-media/filter.utils");

/**
 * Controller for handling comparison analysis operations
 * @module controllers/comparison-analysis
 */
const comparisonAnalysisController = {
  /**
   * Create a new comparison analysis report
   * @async
   * @function createReport
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.topicId1 - ID of the first topic to compare
   * @param {string} req.body.topicId2 - ID of the second topic to compare
   * @param {string} req.body.poiTitle1 - Title of the first point of interest
   * @param {string} req.body.poiCity1 - City of the first point of interest
   * @param {string} req.body.poiTitle2 - Title of the second point of interest
   * @param {string} req.body.poiCity2 - City of the second point of interest
   * @param {Object} req.body.report_data - JSON data containing the comparison analysis results
   * @param {string} req.body.userId - ID of the user creating the report
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with created report or error
   */
  createReport: async (req, res) => {
    try {
      const {
        topicId1,
        topicId2,
        poiTitle1,
        report_data,
        poiTitle2,
        userId,
        startDate,
        endDate,
        startDate2,
        endDate2,
      } = req.body;

      // Validate required fields
      if (!topicId1 || !topicId2 || !userId) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: topicId1, topicId2, or userId",
        });
      }

      const response = await prisma.comparisonsanalysisreports.create({
        data: {
          poiTitle1,
          poiTitle2,
          report_data,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          startDate2: new Date(startDate2),
          endDate2: new Date(endDate2),
          date_created: new Date(),
          user_id: parseInt(userId, 10),
          topicId1: topicId1,
          topicId2: topicId2,
        },
      });

      return res.status(200).json({
        success: true,
        response,
      });
    } catch (error) {
      console.error("Error creating comparison analysis report:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Get all comparison analysis reports for a user
   * @async
   * @function getReports
   * @param {Object} req - Express request object
   * @param {Object} req.query - Query parameters
   * @param {string} req.query.userId - ID of the user whose reports to retrieve
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with reports or error
   */
  getReports: async (req, res) => {
    try {
      const { userId } = req.query;

      // Validate userId
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing required query parameter: userId",
        });
      }

      const reports = await prisma.comparisonsanalysisreports.findMany({
        where: {
          user_id: parseInt(userId, 10),
        },
        orderBy: {
          id: "desc",
        },
        take: Number.MAX_SAFE_INTEGER,
      });

      return res.status(200).json({
        success: true,
        reports,
      });
    } catch (error) {
      console.error("Error fetching comparison analysis reports:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Get a specific comparison analysis report by ID
   * @async
   * @function getReportById
   * @param {Object} req - Express request object
   * @param {Object} req.params - Route parameters
   * @param {string} req.params.id - ID of the report to retrieve
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with the report or error
   */
  getReportById: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate report ID
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: id",
        });
      }

      const report = await prisma.comparisonsanalysisreports.findUnique({
        where: {
          id: parseInt(id, 10),
        },
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          error: "Report not found",
        });
      }

      return res.status(200).json({
        success: true,
        report,
      });
    } catch (error) {
      console.error("Error fetching comparison analysis report:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Delete a comparison analysis report
   * @async
   * @function deleteReport
   * @param {Object} req - Express request object
   * @param {Object} req.params - Route parameters
   * @param {string} req.params.id - ID of the report to delete
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with success message or error
   */
  deleteReport: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate report ID
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameter: id",
        });
      }

      await prisma.comparisonsanalysisreports.delete({
        where: {
          id: parseInt(id, 10),
        },
      });

      return res.status(200).json({
        success: true,
        message: "Report deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comparison analysis report:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Get sentiment analysis data for comparison
   * @async
   * @function getSentiments
   * @param {Object} req - Express request object
   * @param {Object} req.query - Query parameters
   * @param {string} req.query.topicId - ID of the topic to analyze
   * @param {string} req.query.startDate - Start date for the query
   * @param {string} req.query.endDate - End date for the query
   * @param {string} [req.query.interval=monthly] - Time interval (daily, weekly, monthly)
   * @param {string} [req.query.selectedCategory=all] - Category to filter by
   * @param {string} [req.query.selectedSource=All] - Source to filter by
   * @param {boolean} [req.query.isGoogleSentimentChart=true] - Whether to fetch Google sentiment chart data
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with sentiment data or error
   */
  getSentiments: async (req, res) => {
    try {
      const {
        topicId,
        startDate: startDateParam,
        endDate: endDateParam,
        interval: timeInterval = "monthly",
        selectedCategory = "all",
        selectedSource = "All",
        isGoogleSentimentChart = "true",
      } = req.query;

      // Validate required fields
      if (!topicId || !startDateParam || !endDateParam) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameters: topicId, startDate, or endDate",
        });
      }

      // Fetch categories for the topic
      const categories = await prisma.topic_categories.findMany({
        where: {
          customer_topic_id: Number(topicId),
        },
        select: {
          category_title: true,
          topic_hash_tags: true,
          topic_urls: true,
          topic_keywords: true,
        },
      });

      // Transform categories data into the desired structure
      const categoryData = categories.reduce((acc, category) => {
        acc[category.category_title] = {
          hashtags: category.topic_hash_tags
            ? category.topic_hash_tags.split(",").map((item) => item.trim())
            : [],
          keywords: category.topic_keywords
            ? category.topic_keywords.split(",").map((item) => item.trim())
            : [],
          urls: category.topic_urls
            ? category.topic_urls.split(",").map((item) => item.trim())
            : [],
        };
        return acc;
      }, {});

      // Check if there are any categories
      if (Object.keys(categoryData).length === 0) {
        return res.status(200).json({
          success: true,
          monthlyData: [],
        });
      }

      // Parse date parameters
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);

      // Set up interval format
      let calendarInterval = "month";
      let formatPattern = "yyyy-MM";

      // Configure based on time interval
      switch (timeInterval) {
        case "daily":
          calendarInterval = "day";
          formatPattern = "yyyy-MM-dd";
          break;
        case "weekly":
          calendarInterval = "week";
          formatPattern = "yyyy-w";
          break;
        default:
          calendarInterval = "month";
          formatPattern = "yyyy-MM";
      }

      // Format date function
      const formatDate = (date, pattern) => {
        const year = date.getFullYear();
        if (pattern === "yyyy-w") {
          const week = Math.ceil((date.getDate() + date.getDay()) / 7);
          return `${year}-${String(week).padStart(2, "0")}`;
        }
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return pattern === "yyyy-MM-dd"
          ? `${year}-${month}-${String(date.getDate()).padStart(2, "0")}`
          : `${year}-${month}`;
      };

      const minBound = formatDate(startDate, formatPattern);
      const maxBound = formatDate(endDate, formatPattern);

      // Build base query with date range
      const query = {
        bool: {
          must: [
            {
              range: {
                p_created_time: {
                  gte: startDate.toISOString(),
                  lte: endDate.toISOString(),
                },
              },
            },
          ],
        },
      };

      // Add source filter
      if (selectedSource !== "All") {
        query.bool.must.push({
          match_phrase: { source: selectedSource },
        });
      } else {
        if (parseInt(topicId) === 2600) {
          query.bool.must.push({
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
              ],
              minimum_should_match: 1,
            },
          });
        }
        else if (parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640 || parseInt(topicId) === 2647 || parseInt(topicId) === 2648 || parseInt(topicId) === 2649) {
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

        else if (parseInt(topicId) === 2646 || parseInt(topicId) === 2650) {
          sourceFilter = [
            { match_phrase: { source: "Twitter" } },
            { match_phrase: { source: "LinkedIn" } },
            { match_phrase: { source: "Linkedin" } },
            { match_phrase: { source: "Web" } },
            { match_phrase: { source: "Facebook" } },
            { match_phrase: { source: "Instagram" } },
            { match_phrase: { source: "Youtube" } },

            

          ];
        }





        else if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652) {
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
                { match_phrase: { source: "Linkedin" } },
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Pinterest" } },
                { match_phrase: { source: "Web" } },
                { match_phrase: { source: "Reddit" } },
                // { match_phrase: { source: "TikTok" } }
              ],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Add category filters
      if (selectedCategory === "all") {
        // Prepare flattened array of all filter conditions
        const shouldClauses = [];

        // Add all keywords, hashtags, and URLs from all categories
        Object.values(categoryData).forEach((data) => {
          // Add keyword filters
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach((keyword) => {
              if (keyword && keyword.trim()) {
                shouldClauses.push({
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
            });
          }

          // Add hashtag filters
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach((hashtag) => {
              if (hashtag && hashtag.trim()) {
                shouldClauses.push({
                  multi_match: {
                    query: hashtag.trim(),
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
          }

          // Add URL filters
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach((url) => {
              if (url && url.trim()) {
                shouldClauses.push({
                  multi_match: {
                    query: url.trim(),
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
          }
        });

        if (shouldClauses.length > 0) {
          query.bool.must.push({
            bool: {
              should: shouldClauses,
              minimum_should_match: 1,
            },
          });
        }
      } else if (categoryData[selectedCategory]) {
        // Add filters for the selected category
        const data = categoryData[selectedCategory];
        const shouldClauses = [];

        // Check if the category has any filtering criteria
        const hasKeywords =
          Array.isArray(data.keywords) && data.keywords.length > 0;
        const hasHashtags =
          Array.isArray(data.hashtags) && data.hashtags.length > 0;
        const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

        // Only add the filter if there's at least one criteria
        if (hasKeywords || hasHashtags || hasUrls) {
          // Add keyword filters
          if (data.keywords && data.keywords.length > 0) {
            data.keywords.forEach((keyword) => {
              if (keyword && keyword.trim()) {
                shouldClauses.push({
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
            });
          }

          // Add hashtag filters
          if (data.hashtags && data.hashtags.length > 0) {
            data.hashtags.forEach((hashtag) => {
              if (hashtag && hashtag.trim()) {
                shouldClauses.push({
                  multi_match: {
                    query: hashtag.trim(),
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
          }

          // Add URL filters
          if (data.urls && data.urls.length > 0) {
            data.urls.forEach((url) => {
              if (url && url.trim()) {
                shouldClauses.push({
                  multi_match: {
                    query: url.trim(),
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
          }

          if (shouldClauses.length > 0) {
            query.bool.must.push({
              bool: {
                should: shouldClauses,
                minimum_should_match: 1,
              },
            });
          }
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

      // Set up aggregations for sentiment analysis
      const params = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: 1000,
          query: query,
          aggs: {
            time_intervals: {
              date_histogram: {
                field: "p_created_time",
                calendar_interval: calendarInterval,
                format: formatPattern,
                min_doc_count: 0,
                extended_bounds: {
                  min: minBound,
                  max: maxBound,
                },
              },
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 10,
                  },
                  aggs: {
                    emotions: {
                      terms: {
                        field: "llm_emotion.keyword",
                        size: 10000,
                        exclude: "",
                      },
                      aggs: {
                        docs: {
                          top_hits: {
                            _source:
                              isGoogleSentimentChart === "true"
                                ? ["predicted_sentiment_value"]
                                : [
                                  "p_message",
                                  "llm_emotion",
                                  "predicted_sentiment_value",
                                ],
                            size: 5,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Execute Elasticsearch query
      const response = await elasticClient.search(params);
      const intervalData = response.aggregations?.time_intervals?.buckets || [];

      // Transform the data to be sentiment-centric
      const transformedData = intervalData.map((bucket) => ({
        key: bucket.key_as_string,
        doc_count: bucket.doc_count,
        sentiments: {
          buckets: (bucket.sentiments?.buckets || []).map((sentiment) => ({
            key: sentiment.key,
            doc_count: sentiment.doc_count,
            emotions: (sentiment.emotions?.buckets || []).map((emotion) => ({
              key: emotion.key,
              doc_count: emotion.doc_count,
              messages: (emotion.docs?.hits?.hits || []).map((doc) => ({
                p_message: doc._source.p_message,
                llm_emotion: doc._source.llm_emotion,
                predicted_sentiment_value:
                  doc._source.predicted_sentiment_value,
              })),
            })),
          })),
        },
      }));

      return res.status(200).json({
        success: true,
        monthlyData: transformedData,
        categories: categories.length,
        response,
      });
    } catch (error) {
      console.error("Error fetching sentiment data for comparison:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message || "Unknown error",
      });
    }
  },

  getDistributions: async (req, res) => {
    try {
      const { topicId, timeSlot, fromDate, toDate, sentimentType } = req.body;

      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          Facebook: 0,
          Twitter: 0,
          Instagram: 0,
          Youtube: 0,
          Linkedin: 0,
          Pinterest: 0,
          Reddit: 0,
          Tumblr: 0,
          Vimeo: 0,
          Web: 0,
        });
      }

      // Flatten all keywords, hashtags, and urls from the processed categories
      const socialMediaData = Object.values(categoryData).flatMap(
        (category) => [
          ...(category.keywords || []),
          ...(category.hashtags || []),
          ...(category.urls || []),
        ]
      );

      // Process filters for time range and sentiment
      const filters = processFilters({
        timeSlot,
        fromDate,
        toDate,
        sentimentType,
        queryString: "",
      });

      let sourceFilter = [];

      if (parseInt(topicId) === 2600) {
        sourceFilter = [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ];
      } else if (parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640 || parseInt(topicId) === 2647 || parseInt(topicId) === 2648 || parseInt(topicId) === 2649) {
        sourceFilter = [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
        ];
      } else if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652) {
        sourceFilter = [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
        ];
      }

      else if (parseInt(topicId) === 2646 || parseInt(topicId) === 2650) {
        sourceFilter = [
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
        ];
      }

      else {
        sourceFilter = [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } },
          { match_phrase: { source: "Youtube" } },
          { match_phrase: { source: "Linkedin" } },
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Pinterest" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Reddit" } },
          // { match_phrase: { source: "TikTok" } },
        ];
      }

      const buildQuery = () => ({
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: sourceFilter,
                  minimum_should_match: 1,
                },
              },
              {
                range: {
                  p_created_time: {
                    gte: filters.greaterThanTime,
                    lte: filters.lessThanTime,
                  },
                },
              },
            ],
            should: [
              // Match all text fields with keywords/hashtags
              {
                bool: {
                  should: socialMediaData.map((keyword) => ({
                    multi_match: {
                      query: keyword,
                      fields: [
                        "p_message_text",
                        "p_message",
                        "keywords",
                        "title",
                        "hashtags",
                        "u_source",
                      ],
                      type: "phrase",
                    },
                  })),
                },
              },
              // Match URLs in p_url
              {
                bool: {
                  should: socialMediaData.map((url) => ({
                    term: { p_url: url },
                  })),
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      });

      let aggQuery = buildQuery();
      aggQuery.size = 0;
      aggQuery.aggs = {
        source_counts: {
          terms: {
            field: "source.keyword",
            size: 10,
          },
        },
      };

      const count = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: aggQuery,
      });

      const buckets = count.aggregations.source_counts.buckets;
      const counts = buckets.reduce((acc, bucket) => {
        acc[bucket.key] = bucket.doc_count;
        return acc;
      }, {});

      // Merge LinkedIn variants into a single count
      const finalSourceCounts = {};
      let linkedinCount = 0;

      for (const [source, count] of Object.entries(counts)) {
        if (source === "LinkedIn" || source === "Linkedin") {
          linkedinCount += count;
        } else {
          finalSourceCounts[source] = count;
        }
      }

      // Add combined LinkedIn count if there are any
      if (linkedinCount > 0) {
        finalSourceCounts["LinkedIn"] = linkedinCount;
      }

      // Return counts
      return res.json(finalSourceCounts);
      // return res.json(counts);
    } catch (error) {
      console.error("Error fetching results:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

module.exports = comparisonAnalysisController;
