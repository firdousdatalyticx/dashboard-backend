// const { elasticClient } = require('../../config/elasticsearch');
// const { buildTopicQueryString } = require('../../utils/queryBuilder');
// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

// const emotionPolarityController = {
//     getEmotionPolarity: async (req, res) => {
//         try {
//             const categoryData = req.processedCategories || {};
            
//             // Get request parameters
//             const params = req.method === 'POST' ? req.body : req.query;
//             const { 
//                 maxPostsPerEmotion = 30,
//                 topEmotionsCount = 10, // Default to top 10 emotions
//                 skipEmptyEmotions = true, // Whether to skip emotions with zero posts
//                 topicId,
//                 fromDate,
//                 sentiment,
//                 source,
//                 timeSlot,
//                 toDate
//             } = params;
            
//             // Check if this is the special topicId
//             const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
//             const topicQueryString = buildTopicQueryString(categoryData);

//             // Update source filter based on special topic
//             const sourceFilter = source=="All" || source=="" ?  isSpecialTopic ? {
//                 bool: {
//                     should: [
//                         { match_phrase: { source: 'Facebook' } },
//                         { match_phrase: { source: 'Twitter' } }
//                     ],
//                     minimum_should_match: 1
//                 }
//             } : {
//                 bool: {
//                     should: [
//                         { match_phrase: { source: 'Facebook' } },
//                         { match_phrase: { source: 'Twitter' } },
//                         { match_phrase: { source: 'Instagram' } },
//                         { match_phrase: { source: 'Youtube' } },
//                         { match_phrase: { source: 'Pinterest' } },
//                         { match_phrase: { source: 'Reddit' } },
//                         { match_phrase: { source: 'LinkedIn' } },
//                          { match_phrase: { source: 'Linkedin' } },
//                         { match_phrase: { source: 'Web' } },
//                         { match_phrase: { source: 'TikTok' } }
//                     ],
//                     minimum_should_match: 1
//                 }
//             } : {
//                 bool: {
//                     should: [
//                         { match_phrase: { source: source } },
//                     ],
//                     minimum_should_match: 1
//                 }
//             };

//             const elasticParams = {
//                 index: process.env.ELASTICSEARCH_DEFAULTINDEX,
//                 body: {
//                     size: 0,
//                     query: {
//                         bool: {
//                             must: [
//                                 {
//                                     query_string: {
//                                         query: topicQueryString,
//                                         analyze_wildcard: true
//                                     }
//                                 },
//                                 {
//                                     exists: {
//                                         field: 'llm_polarity'
//                                     }
//                                 }
//                             ],
//                             filter: sourceFilter
//                         }
//                     },
//                     aggs: {
//                         sentiment_distribution: {
//                             histogram: {
//                                 field: 'llm_polarity',
//                                 interval: 0.2,
//                                 min_doc_count: 0,
//                                 extended_bounds: {
//                                     min: -1,
//                                     max: 1
//                                 }
//                             }
//                         },
//                         stats: {
//                             stats: {
//                                 field: 'llm_polarity'
//                             }
//                         },
//                         emotions: {
//                             terms: {
//                                 field: 'llm_emotion.keyword',
//                                 size: 10000,
//                                 order: { "_count": "desc" }
//                             },
//                             aggs: {
//                                 avg_polarity: {
//                                     avg: {
//                                         field: 'llm_polarity'
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             };

//             const results = await elasticClient.search(elasticParams);

//             // Get the distribution data
//             const distribution = results.aggregations?.sentiment_distribution?.buckets || [];
//             const stats = results.aggregations?.stats || [];
            
//             // Filter emotions to include only those with counts > 0 if skipEmptyEmotions is true
//             let emotions = results.aggregations?.emotions?.buckets || [];
//             if (skipEmptyEmotions) {
//                 emotions = emotions.filter(emotion => emotion.doc_count > 0);
//             }

//             // Get only the top N emotions
//             const topEmotions = emotions.slice(0, parseInt(topEmotionsCount, 10));

//             // Transform the distribution data and ensure all bins are present
//             const allBins = Array.from({ length: 11 }, (_, i) => {
//                 const polarity = parseFloat((-1 + i * 0.2).toFixed(1));
//                 const existingBin = distribution.find(b => parseFloat(b.key.toFixed(1)) === polarity);
//                 return {
//                     polarity,
//                     count: existingBin?.doc_count || 0
//                 };
//             });

//             // Now fetch posts for each top emotion
//             const emotionsWithPostsPromises = topEmotions.map(async emotionBucket => {
//                 const emotionName = emotionBucket.key;
//                 const originalCount = emotionBucket.doc_count;
//                 const averagePolarity = emotionBucket.avg_polarity?.value || 0;
                
//                 // Query to find posts with this emotion
//                 const emotionQuery = {
//                     bool: {
//                         must: [
//                             // Use the same base query from above
//                             {
//                                 query_string: {
//                                     query: topicQueryString,
//                                     analyze_wildcard: true
//                                 }
//                             },
//                             // Add emotion filter
//                             {
//                                 match_phrase: {
//                                     llm_emotion: emotionName
//                                 }
//                             }
//                         ],
//                         filter: {
//                             bool: {
//                                 should: [
//                                     { match_phrase: { source: 'Facebook' } },
//                                     { match_phrase: { source: 'Twitter' } },
//                                     { match_phrase: { source: 'Instagram' } },
//                                     { match_phrase: { source: 'Youtube' } },
//                                     { match_phrase: { source: 'Pinterest' } },
//                                     { match_phrase: { source: 'Reddit' } },
//                                     { match_phrase: { source: 'LinkedIn' } },
//                                     { match_phrase: { source: 'Linkedin' } },
//                                     { match_phrase: { source: 'Web' } },
//                                     { match_phrase: { source: 'TikTok' } }
//                                 ],
//                                 minimum_should_match: 1
//                             }
//                         }
//                     }
//                 };
                
//                 // Get all posts for this emotion
//                 const allPosts = await fetchAllPostsForEmotion(emotionQuery, parseInt(maxPostsPerEmotion, 10));
                
//                 // Skip emotions with no posts if skipEmptyEmotions is true
//                 if (skipEmptyEmotions && allPosts.length === 0) {
//                     return null;
//                 }
                
//                 return {
//                     emotion: emotionName,
//                     count: allPosts.length, // Set count to exactly match the number of posts
//                     averagePolarity: averagePolarity.toFixed(2), // rounded to 2 decimal places
//                     posts: allPosts,
                    
//                 };
//             });
            
//             // Wait for all promises and filter out null values (skipped emotions with no posts)
//             const allEmotionsWithPosts = await Promise.all(emotionsWithPostsPromises);
//             const emotionsWithPosts = allEmotionsWithPosts.filter(emotion => emotion !== null);

//             // Calculate total count for just the included emotions
//             const totalCount = emotionsWithPosts.reduce((sum, emotion) => sum + emotion.count, 0);

//             return res.json({
//                 stats: {
//                     mean: stats.avg || 0,
//                     min: stats.min || -1,
//                     max: stats.max || 1,
//                     count: stats.count || 0
//                 },
//                 emotions: emotionsWithPosts,
//                 totalCount,
//                 distribution: allBins,
//                 elasticParams
//             });
//         } catch (error) {
//             console.error('Error fetching sentiment intensity:', error);
//             return res.status(500).json({ 
//                 success: false,
//                 error: 'Internal server error' 
//             });
//         }
//     }
// };

// /**
//  * Fetch all posts for an emotion using pagination if needed
//  * @param {Object} query - Elasticsearch query object
//  * @param {number} maxPosts - Maximum number of posts to fetch
//  * @returns {Array} Formatted post objects
//  */
// async function fetchAllPostsForEmotion(query, maxPosts) {
//     try {
//         // First check total count
//         const countResult = await elasticClient.search({
//             index: process.env.ELASTICSEARCH_DEFAULTINDEX,
//             body: {
//                 query: query,
//                 size: 0 // Just get count
//             }
//         });
        
//         const totalCount = countResult.hits.total.value;
//         const postsToFetch = Math.min(totalCount, maxPosts);
        
//         if (postsToFetch === 0) {
//             return [];
//         }
        
//         // Fetch posts in a single request if possible
//         if (postsToFetch <= 100) {
//             const postsResult = await elasticClient.search({
//                 index: process.env.ELASTICSEARCH_DEFAULTINDEX,
//                 body: {
//                     query: query,
//                     size: postsToFetch,
//                     sort: [{ p_created_time: { order: 'desc' } }]
//                 }
//             });
            
//             // Format posts
//             return await Promise.all(postsResult.hits.hits.map(formatPostData));
//         }
        
//         // For larger result sets, use scroll API
//         let allHits = [];
//         const scrollResult = await elasticClient.search({
//             index: process.env.ELASTICSEARCH_DEFAULTINDEX,
//             body: {
//                 query: query,
//                 sort: [{ p_created_time: { order: 'desc' } }]
//             },
//             scroll: '1m',
//             size: 100 // Fetch in batches of 100
//         });
        
//         allHits = [...scrollResult.hits.hits];
//         let scrollId = scrollResult._scroll_id;
        
//         // Continue scrolling until we've fetched all needed posts
//         while (allHits.length < postsToFetch) {
//             const scrollResponse = await elasticClient.scroll({
//                 scroll_id: scrollId,
//                 scroll: '1m'
//             });
            
//             // If no more results, break
//             if (scrollResponse.hits.hits.length === 0) {
//                 break;
//             }
            
//             // Add hits and update scroll ID
//             allHits = [...allHits, ...scrollResponse.hits.hits];
//             scrollId = scrollResponse._scroll_id;
            
//             // Stop when we have enough
//             if (allHits.length >= postsToFetch) {
//                 allHits = allHits.slice(0, postsToFetch);
//                 break;
//             }
//         }
        
//         // Clean up scroll context
//         if (scrollId) {
//             await elasticClient.clearScroll({ scroll_id: scrollId });
//         }
        
//         // Format posts
//         return await Promise.all(allHits.map(formatPostData));
//     } catch (error) {
//         console.error('Error fetching posts for emotion:', error);
//         return []; // Return empty array on error
//     }
// }

// /**
//  * Format an Elasticsearch hit into a post object for the frontend
//  */
// const formatPostData = async (hit) => {
//     const source = hit._source;

//     // Use a default image if a profile picture is not provided
//     const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

//     // Social metrics
//     const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
//     const following = source.u_following > 0 ? `${source.u_following}` : '';
//     const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
//     const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

//     // Emotion
//     const llm_emotion = source.llm_emotion || '';

//     // Clean up comments URL if available
//     const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
//         ? source.p_url.trim().replace('https: // ', 'https://')
//         : '';

//     const comments = `${source.p_comments}`;
//     const shares = source.p_shares > 0 ? `${source.p_shares}` : '';
//     const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : '';

//     const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
//     const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== ''
//         ? source.p_picture_url
//         : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

//     // Determine sentiment
//     let predicted_sentiment = '';
//     let predicted_category = '';
//     const labelData = await prisma.customers_label_data.findMany({
//         where: { p_id: hit._id },
//         orderBy: { label_id: 'desc' },
//         take: 1
//     });

//     if (labelData.length > 0 && labelData[0]?.predicted_sentiment_value_requested)
//         predicted_sentiment = `${labelData[0].predicted_sentiment_value_requested}`;
//     else if (source.predicted_sentiment_value)
//         predicted_sentiment = `${source.predicted_sentiment_value}`;

//     if (source.predicted_category) predicted_category = source.predicted_category;

//     // Handle YouTube-specific fields
//     let youtubeVideoUrl = '';
//     let profilePicture2 = '';
//     if (source.source === 'Youtube') {
//         if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
//         else if (source.p_id) youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
//     } else {
//         profilePicture2 = source.p_picture ? source.p_picture : '';
//     }

//     // Determine source icon based on source name
//     let sourceIcon = '';
//     const userSource = source.source;
//     if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource))
//         sourceIcon = 'Blog';
//     else if (userSource === 'Reddit')
//         sourceIcon = 'Reddit';
//     else if (['FakeNews', 'News'].includes(userSource))
//         sourceIcon = 'News';
//     else if (userSource === 'Tumblr')
//         sourceIcon = 'Tumblr';
//     else if (userSource === 'Vimeo')
//         sourceIcon = 'Vimeo';
//     else if (['Web', 'DeepWeb'].includes(userSource))
//         sourceIcon = 'Web';
//     else
//         sourceIcon = userSource;

//     // Format message text
//     let message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';

//     return {
//         profilePicture: profilePic,
//         profilePicture2,
//         userFullname: source.u_fullname,
//         user_data_string: '',
//         followers,
//         following,
//         posts,
//         likes,
//         llm_emotion,
//         commentsUrl,
//         comments,
//         shares,
//         engagements,
//         content,
//         image_url: imageUrl,
//         predicted_sentiment,
//         predicted_category,
//         youtube_video_url: youtubeVideoUrl,
//         source_icon: `${source.p_url},${sourceIcon}`,
//         message_text,
//         source: source.source,
//         uSource: source.u_source,
//         created_at: new Date(source.p_created_time).toLocaleString()
//     };
// };

// module.exports = emotionPolarityController; 



const { elasticClient } = require('../../config/elasticsearch');
const { buildTopicQueryString } = require('../../utils/queryBuilder');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const processCategoryItems = require('../../helpers/processedCategoryItems');

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

const emotionPolarityController = {
    getEmotionPolarity: async (req, res) => {
        try {
            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }            
            // Get request parameters
            const params = req.method === 'POST' ? req.body : req.query;
            const { 
                maxPostsPerEmotion = 30,
                topEmotionsCount = 10, // Default to top 10 emotions
                skipEmptyEmotions = true, // Whether to skip emotions with zero posts
                topicId,
                fromDate,
                sentiment,
                source,
                timeSlot,
                toDate
            } = params;
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            const topicQueryString = buildTopicQueryString(categoryData);

            // Build date range filter
            let dateRangeFilter = null;
            if (!fromDate && !toDate) {
                // If no dates provided, get last 90 days
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 90);
                
                dateRangeFilter = {
                    range: {
                        p_created_time: {
                            gte: startDate.toISOString(),
                            lte: endDate.toISOString()
                        }
                    }
                };
            } else if (fromDate || toDate) {
                // Use provided date range
                const rangeFilter = {};
                if (fromDate) {
                    rangeFilter.gte = new Date(fromDate).toISOString();
                }
                if (toDate) {
                    rangeFilter.lte = new Date(toDate).toISOString();
                }
                
                dateRangeFilter = {
                    range: {
                        p_created_time: rangeFilter
                    }
                };
            }

            // Build sentiment filter
            let sentimentFilter = null;
            if (sentiment && sentiment !== "" && sentiment !== "All") {
                sentimentFilter = {
                    match_phrase: {
                        predicted_sentiment_value: sentiment
                    }
                };
            }

            const normalizedSources = normalizeSourceInput(source);
            // Update source filter based on special topic
            const sourceFilter = normalizedSources.length > 0
                ? {
                    bool: {
                        should: normalizedSources.map(src => ({
                            match_phrase: { source: src }
                        })),
                        minimum_should_match: 1
                    }
                }
                : parseInt(topicId)==2619 ||  parseInt(topicId) === 2639 || parseInt(topicId) === 2640 ? {
                    bool: {
                        should: [
                            { match_phrase: { source: 'LinkedIn' } },
                             { match_phrase: { source: 'Linkedin' } },
                        ],
                        minimum_should_match: 1
                    }
                }:isSpecialTopic ? {
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
                             { match_phrase: { source: 'Linkedin' } },
                            { match_phrase: { source: 'Web' } },
                            { match_phrase: { source: 'TikTok' } }
                        ],
                        minimum_should_match: 1
                    }
                };

            // Build the main query filters array
            const queryFilters = [sourceFilter];
            
            // Add date range filter if exists
            if (dateRangeFilter) {
                queryFilters.push(dateRangeFilter);
            }
            
            // Add sentiment filter if exists
            if (sentimentFilter) {
                queryFilters.push(sentimentFilter);
            }

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
                            filter: queryFilters
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

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // Now fetch posts for each top emotion
            const emotionsWithPostsPromises = topEmotions.map(async emotionBucket => {
                const emotionName = emotionBucket.key;
                const originalCount = emotionBucket.doc_count;
                const averagePolarity = emotionBucket.avg_polarity?.value || 0;
                
                // Build the same filters for individual emotion queries
                const emotionQueryFilters = [...queryFilters]; // Copy the main filters
                
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
                        filter: emotionQueryFilters
                    }
                };
                
                // Get all posts for this emotion
                const allPostsRaw = await fetchAllPostsForEmotion(emotionQuery, parseInt(maxPostsPerEmotion, 10));
                // Add matched_terms to each post
                const allPosts = allPostsRaw.map(post => {
                    const textFields = [
                        post.message_text,
                        post.content,
                        post.keywords,
                        post.title,
                        post.hashtags,
                        post.uSource,
                        post.source,
                        post.p_url,
                        post.userFullname
                    ];
                    return {
                        ...post,
                        matched_terms: allFilterTerms.filter(term =>
                            textFields.some(field => {
                                if (!field) return false;
                                if (Array.isArray(field)) {
                                    return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                                }
                                return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                            })
                        )
                    };
                });
                
                // Skip emotions with no posts if skipEmptyEmotions is true
                if (skipEmptyEmotions && allPosts.length === 0) {
                    return null;
                }
                
                return {
                    emotion: emotionName,
                    count: allPosts.length, // Set count to exactly match the number of posts
                    averagePolarity: averagePolarity.toFixed(2), // rounded to 2 decimal places
                    posts: allPosts,
                    
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
                distribution: allBins,
                elasticParams,
                // Add debug info for applied filters
                appliedFilters: {
                    dateRange: dateRangeFilter,
                    sentiment: sentimentFilter,
                    source: sourceFilter
                }
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
        created_at: new Date(source.p_created_time).toLocaleString(),
        p_comments_data:source.p_comments_data,

    };
};

module.exports = emotionPolarityController;