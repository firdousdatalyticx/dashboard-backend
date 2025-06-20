const { elasticClient } = require('../../config/elasticsearch');
const { buildTopicQueryString } = require('../../utils/queryBuilder');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const emotionPolarityController = {
    getEmotionPolarity: async (req, res) => {
        try {
            const categoryData = req.processedCategories || {};
            
            // Get request parameters
            const params = req.method === 'POST' ? req.body : req.query;
            const { 
                maxPostsPerEmotion = 30,
                topEmotionsCount = 10, // Default to top 10 emotions
                skipEmptyEmotions = true, // Whether to skip emotions with zero posts
                topicId
            } = params;
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            const topicQueryString = buildTopicQueryString(categoryData);

<<<<<<< Updated upstream
            // Update source filter based on special topic
            const sourceFilter = isSpecialTopic ? {
=======
      // Get request parameters
      const params = req.method === "POST" ? req.body : req.query;
      const {
        maxPostsPerEmotion = 30,
        topEmotionsCount = 10, // Default to top 10 emotions
        skipEmptyEmotions = true, // Whether to skip emotions with zero posts
        topicId,
        fromDate,
        timeSlot,
        toDate,
        sentiment,
        source = "All", // Add source parameter with default value 'All'
        llm_mention_type,
      } = params;

      const now = new Date();
      let startDate;
      let endDate = now;

      // Determine date range based on timeSlot
      if (timeSlot === "Custom date" && fromDate && toDate) {
        startDate = parseISO(fromDate);
        endDate = parseISO(toDate);
      } else {
        // Handle predefined time slots
        switch (timeSlot) {
          case "last24hours":
            startDate = subHours(now, 24);
            break;
          case "last7days":
            startDate = subDays(now, 7);
            break;
          case "last30days":
            startDate = subDays(now, 30);
            break;
          case "last60days":
            startDate = subDays(now, 60);
            break;
          case "last120days":
            startDate = subDays(now, 120);
            break;
          case "last90days":
          default:
            startDate = subDays(now, 90);
            break;
        }
      }

      const greaterThanTime = format(startDate, "yyyy-MM-dd");
      const lessThanTime = format(endDate, "yyyy-MM-dd");

      // Check if this is the special topicId
      const isSpecialTopic = topicId && parseInt(topicId) === 2600;

      const topicQueryString = buildTopicQueryString(categoryData);

      // Build the query with date range
      const must = [
        {
          query_string: {
            query: topicQueryString,
            analyze_wildcard: true,
          },
        },
        {
          exists: {
            field: "llm_polarity",
          },
        },
        {
          range: {
            created_at: {
              gte: greaterThanTime,
              lte: lessThanTime,
            },
          },
        },
        {
          range: {
            p_created_time: {
              gte: greaterThanTime,
              lte: lessThanTime,
            },
          },
        },
      ];

      // Update source filter based on special topic
      const sourceFilter = isSpecialTopic
        ? {
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
              ],
              minimum_should_match: 1,
            },
          }
        : {
            bool: {
              should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } },
                { match_phrase: { source: "Instagram" } },
                { match_phrase: { source: "Youtube" } },
                { match_phrase: { source: "Pinterest" } },
                { match_phrase: { source: "Reddit" } },
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Linkedin" } },
                { match_phrase: { source: "Web" } },
                { match_phrase: { source: "TikTok" } },
              ],
              minimum_should_match: 1,
            },
          };

      // Add source filter if a specific source is selected
      if (source !== "All") {
        must.push({
          match_phrase: { source: source },
        });
      } else {
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
                 { match_phrase: { source: "Linkedin" } },
                { match_phrase: { source: "LinkedIn" } },
                { match_phrase: { source: "Web" } },
                { match_phrase: { source: "TikTok" } },
              ],
              minimum_should_match: 1,
            },
          });
        }
      }

      // Add sentiment filter if provided
      if (sentiment && sentiment != "" && sentiment !== "All") {
        must.push({
          match_phrase: {
            predicted_sentiment_value: sentiment,
          },
        });
      }

      // Apply LLM Mention Type filter if provided
      if (
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
        must.push(mentionTypeFilter);
      }

      const elasticParams = {
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: {
          size: 0,
          query: {
            bool: {
              must: must,
            },
          },
          aggs: {
            sentiment_distribution: {
              histogram: {
                field: "llm_polarity",
                interval: 0.2,
                min_doc_count: 0,
                extended_bounds: {
                  min: -1,
                  max: 1,
                },
              },
            },
            stats: {
              stats: {
                field: "llm_polarity",
              },
            },
            emotions: {
              terms: {
                field: "llm_emotion.keyword",
                size: 10000,
                order: { _count: "desc" },
              },
              aggs: {
                avg_polarity: {
                  avg: {
                    field: "llm_polarity",
                  },
                },
              },
            },
          },
        },
      };

      const results = await elasticClient.search(elasticParams);

      // Get the distribution data
      const distribution =
        results.aggregations?.sentiment_distribution?.buckets || [];
      const stats = results.aggregations?.stats || [];

      // Filter emotions to include only those with counts > 0 if skipEmptyEmotions is true
      let emotions = results.aggregations?.emotions?.buckets || [];
      if (skipEmptyEmotions) {
        emotions = emotions.filter((emotion) => emotion.doc_count > 0);
      }

      // Get only the top N emotions
      const topEmotions = emotions.slice(0, parseInt(topEmotionsCount, 10));

      // Transform the distribution data and ensure all bins are present
      const allBins = Array.from({ length: 11 }, (_, i) => {
        const polarity = parseFloat((-1 + i * 0.2).toFixed(1));
        const existingBin = distribution.find(
          (b) => parseFloat(b.key.toFixed(1)) === polarity
        );
        return {
          polarity,
          count: existingBin?.doc_count || 0,
        };
      });

      // Now fetch posts for each top emotion
      const emotionsWithPostsPromises = topEmotions.map(
        async (emotionBucket) => {
          const emotionName = emotionBucket.key;
          const originalCount = emotionBucket.doc_count;
          const averagePolarity = emotionBucket.avg_polarity?.value || 0;

          // Query to find posts with this emotion
          const emotionQuery = {
            bool: {
              must: [
                // Use the same base query from above
                {
                  query_string: {
                    query: topicQueryString,
                    analyze_wildcard: true,
                  },
                },
                // Add emotion filter
                {
                  match_phrase: {
                    llm_emotion: emotionName,
                  },
                },
                {
                  range: {
                    created_at: {
                      gte: greaterThanTime,
                      lte: lessThanTime,
                    },
                  },
                },
                {
                  range: {
                    p_created_time: {
                      gte: greaterThanTime,
                      lte: lessThanTime,
                    },
                  },
                },
              ],
              filter: {
>>>>>>> Stashed changes
                bool: {
                    should: [
                        { match_phrase: { source: 'Facebook' } },
                        { match_phrase: { source: 'Twitter' } }
                    ],
                    minimum_should_match: 1
                }
            } : {
                bool: {
                    should: [
                        { match_phrase: { source: 'Facebook' } },
                        { match_phrase: { source: 'Twitter' } },
                        { match_phrase: { source: 'Instagram' } },
                        { match_phrase: { source: 'Youtube' } },
                        { match_phrase: { source: 'Pinterest' } },
                        { match_phrase: { source: 'Reddit' } },
                        { match_phrase: { source: 'LinkedIn' } },
                        { match_phrase: { source: 'Web' } },
                        { match_phrase: { source: 'TikTok' } }
                    ],
                    minimum_should_match: 1
                }
            };

            const elasticParams = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                {
                                    query_string: {
                                        query: topicQueryString,
                                        analyze_wildcard: true
                                    }
                                },
                                {
                                    exists: {
                                        field: 'llm_polarity'
                                    }
                                }
                            ],
                            filter: sourceFilter
                        }
                    },
                    aggs: {
                        sentiment_distribution: {
                            histogram: {
                                field: 'llm_polarity',
                                interval: 0.2,
                                min_doc_count: 0,
                                extended_bounds: {
                                    min: -1,
                                    max: 1
                                }
                            }
                        },
                        stats: {
                            stats: {
                                field: 'llm_polarity'
                            }
                        },
                        emotions: {
                            terms: {
                                field: 'llm_emotion.keyword',
                                size: 10000,
                                order: { "_count": "desc" }
                            },
                            aggs: {
                                avg_polarity: {
                                    avg: {
                                        field: 'llm_polarity'
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const results = await elasticClient.search(elasticParams);

            // Get the distribution data
            const distribution = results.aggregations?.sentiment_distribution?.buckets || [];
            const stats = results.aggregations?.stats || [];
            
            // Filter emotions to include only those with counts > 0 if skipEmptyEmotions is true
            let emotions = results.aggregations?.emotions?.buckets || [];
            if (skipEmptyEmotions) {
                emotions = emotions.filter(emotion => emotion.doc_count > 0);
            }

            // Get only the top N emotions
            const topEmotions = emotions.slice(0, parseInt(topEmotionsCount, 10));

            // Transform the distribution data and ensure all bins are present
            const allBins = Array.from({ length: 11 }, (_, i) => {
                const polarity = parseFloat((-1 + i * 0.2).toFixed(1));
                const existingBin = distribution.find(b => parseFloat(b.key.toFixed(1)) === polarity);
                return {
                    polarity,
                    count: existingBin?.doc_count || 0
                };
            });

            // Now fetch posts for each top emotion
            const emotionsWithPostsPromises = topEmotions.map(async emotionBucket => {
                const emotionName = emotionBucket.key;
                const originalCount = emotionBucket.doc_count;
                const averagePolarity = emotionBucket.avg_polarity?.value || 0;
                
                // Query to find posts with this emotion
                const emotionQuery = {
                    bool: {
                        must: [
                            // Use the same base query from above
                            {
                                query_string: {
                                    query: topicQueryString,
                                    analyze_wildcard: true
                                }
                            },
                            // Add emotion filter
                            {
                                match_phrase: {
                                    llm_emotion: emotionName
                                }
                            }
                        ],
                        filter: {
                            bool: {
                                should: [
                                    { match_phrase: { source: 'Facebook' } },
                                    { match_phrase: { source: 'Twitter' } },
                                    { match_phrase: { source: 'Instagram' } },
                                    { match_phrase: { source: 'Youtube' } },
                                    { match_phrase: { source: 'Pinterest' } },
                                    { match_phrase: { source: 'Reddit' } },
                                    { match_phrase: { source: 'LinkedIn' } },
                                    { match_phrase: { source: 'Web' } }
                                ],
                                minimum_should_match: 1
                            }
                        }
                    }
                };
                
                // Get all posts for this emotion
                const allPosts = await fetchAllPostsForEmotion(emotionQuery, parseInt(maxPostsPerEmotion, 10));
                
                // Skip emotions with no posts if skipEmptyEmotions is true
                if (skipEmptyEmotions && allPosts.length === 0) {
                    return null;
                }
                
                return {
                    emotion: emotionName,
                    count: allPosts.length, // Set count to exactly match the number of posts
                    averagePolarity: averagePolarity.toFixed(2), // rounded to 2 decimal places
                    posts: allPosts
                };
            });
            
            // Wait for all promises and filter out null values (skipped emotions with no posts)
            const allEmotionsWithPosts = await Promise.all(emotionsWithPostsPromises);
            const emotionsWithPosts = allEmotionsWithPosts.filter(emotion => emotion !== null);

            // Calculate total count for just the included emotions
            const totalCount = emotionsWithPosts.reduce((sum, emotion) => sum + emotion.count, 0);

            return res.json({
                stats: {
                    mean: stats.avg || 0,
                    min: stats.min || -1,
                    max: stats.max || 1,
                    count: stats.count || 0
                },
                emotions: emotionsWithPosts,
                totalCount,
                distribution: allBins
            });
        } catch (error) {
            console.error('Error fetching sentiment intensity:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
};

/**
 * Fetch all posts for an emotion using pagination if needed
 * @param {Object} query - Elasticsearch query object
 * @param {number} maxPosts - Maximum number of posts to fetch
 * @returns {Array} Formatted post objects
 */
async function fetchAllPostsForEmotion(query, maxPosts) {
    try {
        // First check total count
        const countResult = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: {
                query: query,
                size: 0 // Just get count
            }
        });
        
        const totalCount = countResult.hits.total.value;
        const postsToFetch = Math.min(totalCount, maxPosts);
        
        if (postsToFetch === 0) {
            return [];
        }
        
        // Fetch posts in a single request if possible
        if (postsToFetch <= 100) {
            const postsResult = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    query: query,
                    size: postsToFetch,
                    sort: [{ p_created_time: { order: 'desc' } }]
                }
            });
            
            // Format posts
            return await Promise.all(postsResult.hits.hits.map(formatPostData));
        }
        
        // For larger result sets, use scroll API
        let allHits = [];
        const scrollResult = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: {
                query: query,
                sort: [{ p_created_time: { order: 'desc' } }]
            },
            scroll: '1m',
            size: 100 // Fetch in batches of 100
        });
        
        allHits = [...scrollResult.hits.hits];
        let scrollId = scrollResult._scroll_id;
        
        // Continue scrolling until we've fetched all needed posts
        while (allHits.length < postsToFetch) {
            const scrollResponse = await elasticClient.scroll({
                scroll_id: scrollId,
                scroll: '1m'
            });
            
            // If no more results, break
            if (scrollResponse.hits.hits.length === 0) {
                break;
            }
            
            // Add hits and update scroll ID
            allHits = [...allHits, ...scrollResponse.hits.hits];
            scrollId = scrollResponse._scroll_id;
            
            // Stop when we have enough
            if (allHits.length >= postsToFetch) {
                allHits = allHits.slice(0, postsToFetch);
                break;
            }
        }
        
        // Clean up scroll context
        if (scrollId) {
            await elasticClient.clearScroll({ scroll_id: scrollId });
        }
        
        // Format posts
        return await Promise.all(allHits.map(formatPostData));
    } catch (error) {
        console.error('Error fetching posts for emotion:', error);
        return []; // Return empty array on error
    }
}

/**
 * Format an Elasticsearch hit into a post object for the frontend
 */
const formatPostData = async (hit) => {
    const source = hit._source;

    // Use a default image if a profile picture is not provided
    const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Social metrics
    const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
    const following = source.u_following > 0 ? `${source.u_following}` : '';
    const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
    const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

    // Emotion
    const llm_emotion = source.llm_emotion || '';

    // Clean up comments URL if available
    const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
        ? source.p_url.trim().replace('https: // ', 'https://')
        : '';

    const comments = `${source.p_comments}`;
    const shares = source.p_shares > 0 ? `${source.p_shares}` : '';
    const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : '';

    const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
    const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== ''
        ? source.p_picture_url
        : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Determine sentiment
    let predicted_sentiment = '';
    let predicted_category = '';
    const labelData = await prisma.customers_label_data.findMany({
        where: { p_id: hit._id },
        orderBy: { label_id: 'desc' },
        take: 1
    });

    if (labelData.length > 0 && labelData[0]?.predicted_sentiment_value_requested)
        predicted_sentiment = `${labelData[0].predicted_sentiment_value_requested}`;
    else if (source.predicted_sentiment_value)
        predicted_sentiment = `${source.predicted_sentiment_value}`;

    if (source.predicted_category) predicted_category = source.predicted_category;

    // Handle YouTube-specific fields
    let youtubeVideoUrl = '';
    let profilePicture2 = '';
    if (source.source === 'Youtube') {
        if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
        else if (source.p_id) youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
    } else {
        profilePicture2 = source.p_picture ? source.p_picture : '';
    }

    // Determine source icon based on source name
    let sourceIcon = '';
    const userSource = source.source;
    if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource))
        sourceIcon = 'Blog';
    else if (userSource === 'Reddit')
        sourceIcon = 'Reddit';
    else if (['FakeNews', 'News'].includes(userSource))
        sourceIcon = 'News';
    else if (userSource === 'Tumblr')
        sourceIcon = 'Tumblr';
    else if (userSource === 'Vimeo')
        sourceIcon = 'Vimeo';
    else if (['Web', 'DeepWeb'].includes(userSource))
        sourceIcon = 'Web';
    else
        sourceIcon = userSource;

    // Format message text
    let message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';

    return {
        profilePicture: profilePic,
        profilePicture2,
        userFullname: source.u_fullname,
        user_data_string: '',
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
        uSource: source.u_source,
        created_at: new Date(source.p_created_time).toLocaleString()
    };
};

module.exports = emotionPolarityController; 