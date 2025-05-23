const prisma = require("../../config/database");
const { elasticClient } = require("../../config/elasticsearch");
const { format, parseISO, subDays } = require("date-fns");

const sentimentsMultipleCategoriesController = {
  // ... existing getSentimentsAnalysis method ...

  /**
   * Get sentiment counts for multiple categories
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with sentiment counts for each category
   */
  getMultipleCategoriesSentimentCounts: async (req, res) => {
    try {
      const {
        categories = [], // Array of category names
        source = "All",
        interval = "monthly",
      } = req.body;

      // Validate input
      if (!Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Categories array is required and cannot be empty",
        });
      }

      // Get category data from middleware
      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          categoryCounts: [],
        });
      }

      // Set default date range - last 90 days
      const now = new Date();
      const ninetyDaysAgo = subDays(now, 90);

      const greaterThanTime = format(ninetyDaysAgo, "yyyy-MM-dd");
      const lessThanTime = format(now, "yyyy-MM-dd");

      // Process each category
      const categoryCounts = [];

      for (const categoryName of categories) {
        try {
          // Build base query for this category
          const query = buildBaseQuery(
            {
              greaterThanTime,
              lessThanTime,
            },
            source
          );

          // Add category filters for current category
          addCategoryFilters(query, categoryName, categoryData);

          // Create aggregation query for sentiment counts
          const params = {
            size: 0,
            query: query,
            aggs: {
              sentiments_count: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 100,
                  exclude: "",
                  order: {
                    _count: "desc",
                  },
                },
              },
            },
          };

          // Execute the query
          const countResponse = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
          });

          // Get sentiment counts
          const sentimentBuckets =
            countResponse.aggregations?.sentiments_count?.buckets || [];

          // Format the sentiments data
          const sentiments = sentimentBuckets.map((bucket) => ({
            name: bucket.key,
            count: bucket.doc_count,
          }));

          // Calculate total count for this category
          const totalCount = sentiments.reduce(
            (sum, sentiment) => sum + sentiment.count,
            0
          );

          // Add to results
          categoryCounts.push({
            category: categoryName,
            totalCount: totalCount,
            sentiments: sentiments,
            // Optional: include breakdown by sentiment
            sentimentBreakdown: {
              positive:
                sentiments.find((s) => s.name?.toLowerCase() === "positive")
                  ?.count || 0,
              negative:
                sentiments.find((s) => s.name?.toLowerCase() === "negative")
                  ?.count || 0,
              neutral:
                sentiments.find((s) => s.name?.toLowerCase() === "neutral")
                  ?.count || 0,
            },
          });
        } catch (categoryError) {
          console.error(
            `Error processing category ${categoryName}:`,
            categoryError
          );

          // Add category with zero counts if there's an error
          categoryCounts.push({
            category: categoryName,
            totalCount: 0,
            sentiments: [],
            sentimentBreakdown: {
              positive: 0,
              negative: 0,
              neutral: 0,
            },
            error: "Failed to fetch data for this category",
          });
        }
      }

      return res.json({
        success: true,
        categoryCounts: categoryCounts,
        summary: {
          totalCategories: categories.length,
          dateRange: {
            from: greaterThanTime,
            to: lessThanTime,
          },
          source: source,
        },
      });
    } catch (error) {
      console.error(
        "Error fetching multiple categories sentiment counts:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  /**
   * Alternative method: Get sentiment counts for multiple categories using single query with sub-aggregations
   * This is more efficient for large numbers of categories
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with sentiment counts for each category
   */
  getMultipleCategoriesSentimentCountsOptimized: async (req, res) => {
    try {
      let {
        categories = [], // Array of category names
        source = "All",
        fromDate,
        toDate,
        sentimentType,
        topicId,
      } = req.body;
      
      // Validate input
      if (!Array.isArray(categories) || categories.length === 0) {
        const userId = req.user.id;

            // Verify that the topic belongs to the user
            const topic = await prisma.customer_topics.findFirst({
                where: {
                    topic_id: parseInt(topicId),
                    topic_user_id: userId,
                    topic_is_deleted: {
                        not: 'Y'
                    }
                }
            });

            if (!topic) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to this topic'
                });
            }
      
            // Use the transformed data from middleware if available
            if (req.processedCategories) {
            categories = Object.keys(req.processedCategories);
            categories = categories.map(title => title.trim())
            }else{

            // Fallback to original implementation if middleware wasn't used
             categories = await prisma.topic_categories.findMany({
                where: {
                    customer_topic_id: parseInt(topicId)
                }
            });
             categories = categories.map(cat=>cat.category_title?.trim());
          }
      }

      // Get category data from middleware
      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          categoryCounts: [],
        });
      }

      // Set default date range - last 90 days
      const now = new Date();
      const ninetyDaysAgo = subDays(now, 90);

      const greaterThanTime =
        fromDate && fromDate != null ? fromDate : "now-90d";
      const lessThanTime = toDate && toDate != null ? toDate : "now";

      // Build base query (without category filters)
      const baseQuery = buildBaseQuery(
        {
          greaterThanTime,
          lessThanTime,
        },
        source
      );

      // Create aggregations for each category
      const categoryAggregations = {};

      for (const categoryName of categories) {
        if (categoryData[categoryName]) {
          const data = categoryData[categoryName];

          // Check if the category has any filtering criteria
          const hasKeywords =
            Array.isArray(data.keywords) && data.keywords.length > 0;
          const hasHashtags =
            Array.isArray(data.hashtags) && data.hashtags.length > 0;
          const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

          if (hasKeywords || hasHashtags || hasUrls) {
            // Create filter for this category, adding sentimentType filter if provided
            const categoryFilter = {
              bool: {
                must: sentimentType
                  ? [
                      {
                        term: {
                          "predicted_sentiment_value.keyword": sentimentType,
                        },
                      },
                    ]
                  : [],
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
            };

            // Add aggregation for this category
            categoryAggregations[categoryName.replace(/[^a-zA-Z0-9]/g, "_")] = {
              filter: categoryFilter,
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 100,
                    exclude: "",
                  },
                },
              },
            };
          }
        }
      }

      // Execute single query with all category aggregations
      const params = {
        size: 0,
        query: baseQuery,
        aggs: categoryAggregations,
      };

      const response = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });

      // Process results
      const categoryCounts = [];

      for (const categoryName of categories) {
        const aggregationKey = categoryName.replace(/[^a-zA-Z0-9]/g, "_");
        const categoryAgg = response.aggregations?.[aggregationKey];

        if (categoryAgg) {
          const sentimentBuckets = categoryAgg.sentiments?.buckets || [];

          const sentiments = sentimentBuckets.map((bucket) => ({
            name: bucket.key,
            count: bucket.doc_count,
          }));

          const totalCount = sentiments.reduce(
            (sum, sentiment) => sum + sentiment.count,
            0
          );

          if (totalCount > 0) {
            categoryCounts.push({
              category: categoryName,
              totalCount: totalCount,
              sentiments: sentiments,
              sentimentBreakdown: {
                ...(sentiments.find((s) => s.name?.toLowerCase() === "positive")
                  ?.count > 0 && {
                  positive: sentiments.find(
                    (s) => s.name?.toLowerCase() === "positive"
                  )?.count,
                }),
                ...(sentiments.find((s) => s.name?.toLowerCase() === "negative")
                  ?.count > 0 && {
                  negative: sentiments.find(
                    (s) => s.name?.toLowerCase() === "negative"
                  )?.count,
                }),
                ...(sentiments.find((s) => s.name?.toLowerCase() === "neutral")
                  ?.count > 0 && {
                  neutral: sentiments.find(
                    (s) => s.name?.toLowerCase() === "neutral"
                  )?.count,
                }),
              },
            });
          }
        }
      }

      return res.json({
        success: true,
        categoryCounts: categoryCounts,
        summary: {
          totalCategories: categories.length,
          dateRange: {
            from: greaterThanTime,
            to: lessThanTime,
          },
          source: source,
          appliedSentimentType: sentimentType || "all",
        },
      });
    } catch (error) {
      console.error(
        "Error fetching multiple categories sentiment counts (optimized):",
        error
      );
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getMultipleCategoriesSentimentCountsOptimizedPost: async (req, res) => {
    try {
      const {
        categories = [], // Array of category names
        source = "All",
        fromDate,
        toDate,
        type,
        sentiment
      } = req.query;

      categories.push(type);
      // Validate input
      if (!Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Categories array is required and cannot be empty",
        });
      }

      // Get category data from middleware
      const categoryData = req.processedCategories || {};

      if (Object.keys(categoryData).length === 0) {
        return res.json({
          success: true,
          categoryCounts: [],
        });
      }

      // Set default date range - last 90 days
      const now = new Date();
      const ninetyDaysAgo = subDays(now, 90);

      const greaterThanTime =
        fromDate && fromDate != null ? fromDate : "now-90d";
      const lessThanTime = toDate && toDate != null ? toDate : "now";

      // Build base query (without category filters)
      const baseQuery = buildBaseQuery(
        {
          greaterThanTime,
          lessThanTime,
        },
        source
      );

      // Create aggregations for each category
      const categoryAggregations = {};

      for (const categoryName of categories) {
        if (categoryData[categoryName]) {
          const data = categoryData[categoryName];

          // Check if the category has any filtering criteria
          const hasKeywords =
            Array.isArray(data.keywords) && data.keywords.length > 0;
          const hasHashtags =
            Array.isArray(data.hashtags) && data.hashtags.length > 0;
          const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

          if (hasKeywords || hasHashtags || hasUrls) {
            // Create filter for this category
            const categoryFilter = {
              bool: {
                must: sentiment
                  ? [
                      {
                        term: {
                          "predicted_sentiment_value.keyword": sentiment,
                        },
                      },
                    ]
                  : [],
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
            };

            baseQuery.bool.must.push(categoryFilter);

            // Add aggregation for this category
            categoryAggregations[categoryName.replace(/[^a-zA-Z0-9]/g, "_")] = {
              filter: categoryFilter,
              aggs: {
                sentiments: {
                  terms: {
                    field: "predicted_sentiment_value.keyword",
                    size: 100,
                    exclude: "",
                  },
                },
              },
            };
          }
        }
      }

      // Execute single query with all category aggregations
      const params = {
        size: 30,
        aggs: categoryAggregations,
        query: baseQuery,
        sort: [{ p_created_time: { order: "desc" } }],
      };

      const results = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });
      const responseArray = [];
      for (let l = 0; l < results?.hits?.hits?.length; l++) {
        let esData = results?.hits?.hits[l];
        let user_data_string = "";
        let profilePic = esData._source.u_profile_photo
          ? esData._source.u_profile_photo
          : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
        let followers =
          esData._source.u_followers > 0 ? `${esData._source.u_followers}` : "";
        let following =
          esData._source.u_following > 0 ? `${esData._source.u_following}` : "";
        let posts =
          esData._source.u_posts > 0 ? `${esData._source.u_posts}` : "";
        let likes =
          esData._source.p_likes > 0 ? `${esData._source.p_likes}` : "";
        let llm_emotion = esData._source.llm_emotion || "";
        let commentsUrl =
          esData._source.p_comments_text &&
          esData._source.p_comments_text.trim() !== ""
            ? `${esData._source.p_url.trim().replace("https: // ", "https://")}`
            : "";
        let comments = `${esData._source.p_comments}`;
        let shares =
          esData._source.p_shares > 0 ? `${esData._source.p_shares}` : "";
        let engagements =
          esData._source.p_engagement > 0
            ? `${esData._source.p_engagement}`
            : "";
        let content =
          esData._source.p_content && esData._source.p_content.trim() !== ""
            ? `${esData._source.p_content}`
            : "";
        let imageUrl =
          esData._source.p_picture_url &&
          esData._source.p_picture_url.trim() !== ""
            ? `${esData._source.p_picture_url}`
            : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
        let predicted_sentiment = "";
        let predicted_category = "";

        // Check if the record was manually updated, if yes, use it
        const chk_senti = await prisma.customers_label_data.findMany({
          where: {
            p_id: esData._id,
          },
          orderBy: {
            label_id: "desc",
          },
          take: 1,
        });

        if (chk_senti.length > 0) {
          if (chk_senti[0]?.predicted_sentiment_value_requested)
            predicted_sentiment = `${chk_senti[0]?.predicted_sentiment_value_requested}`;
        } else if (
          esData._source.predicted_sentiment_value &&
          esData._source.predicted_sentiment_value !== ""
        ) {
          predicted_sentiment = `${esData._source.predicted_sentiment_value}`;
        }

        // Category prediction
        if (esData._source.predicted_category) {
          predicted_category = esData._source.predicted_category;
        }
        let youtubeVideoUrl = "";
        let profilePicture2 = "";
        //const token = await getCsrfToken()
        if (esData._source.source === "Youtube") {
          if (
            esData._source.video_embed_url &&
            esData._source.video_embed_url !== ""
          )
            youtubeVideoUrl = `${esData._source.video_embed_url}`;
          else if (esData._source.p_id && esData._source.p_id !== "")
            youtubeVideoUrl = `https://www.youtube.com/embed/${esData._source.p_id}`;
        } else {
          if (esData._source.p_picture) {
            profilePicture2 = `${esData._source.p_picture}`;
          } else {
            profilePicture2 = "";
          }
        }
        // Handle other sources if needed

        let sourceIcon = "";

        const userSource = esData._source.source;
        if (
          userSource == "khaleej_times" ||
          userSource == "Omanobserver" ||
          userSource == "Time of oman" ||
          userSource == "Blogs"
        ) {
          sourceIcon = "Blog";
        } else if (userSource == "Reddit") {
          sourceIcon = "Reddit";
        } else if (userSource == "FakeNews" || userSource == "News") {
          sourceIcon = "News";
        } else if (userSource == "Tumblr") {
          sourceIcon = "Tumblr";
        } else if (userSource == "Vimeo") {
          sourceIcon = "Vimeo";
        } else if (userSource == "Web" || userSource == "DeepWeb") {
          sourceIcon = "Web";
        } else {
          sourceIcon = userSource;
        }

        let message_text = "";

        if (
          esData._source.source === "GoogleMaps" ||
          esData._source.source === "Tripadvisor"
        ) {
          let m_text = esData._source.p_message_text.split("***|||###");
          message_text = m_text[0].replace(/\n/g, "<br>");
        } else {
          message_text = esData._source.p_message_text
            ? esData._source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
            : "";
        }

        let cardData = {
          profilePicture: profilePic,
          profilePicture2: profilePicture2,
          userFullname: esData._source.u_fullname,
          user_data_string: user_data_string,
          followers: followers,
          following: following,
          posts: posts,
          likes: likes,
          llm_emotion: llm_emotion,
          commentsUrl: commentsUrl,
          comments: comments,
          shares: shares,
          engagements: engagements,
          content: content,
          image_url: imageUrl,
          predicted_sentiment: predicted_sentiment,
          predicted_category: predicted_category,
          youtube_video_url: youtubeVideoUrl,
          source_icon: `${esData._source.p_url},${sourceIcon}`,
          message_text: message_text,
          source: esData._source.source,
          rating: esData._source.rating,
          comment: esData._source.comment,
          businessResponse: esData._source.business_response,
          uSource: esData._source.u_source,
          googleName: esData._source.name,
          created_at: new Date(esData._source.p_created_time).toLocaleString(),
        };

        responseArray.push(cardData);
      }

      return res.status(200).json({
        success: true,
        responseArray,
        total: responseArray.length || 0,
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
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source) {
  const query = {
    bool: {
      must: [
        {
          range: {
            created_at: {
              gte: dateRange.greaterThanTime,
              lte: dateRange.lessThanTime,
            },
          },
        },
      ],
    },
  };

  // Add source filter if a specific source is selected
  if (source !== "All") {
    query.bool.must.push({
      match_phrase: { source: source },
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
          { match_phrase: { source: "Pinterest" } },
          { match_phrase: { source: "Web" } },
          { match_phrase: { source: "Reddit" } },
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

module.exports = sentimentsMultipleCategoriesController;
