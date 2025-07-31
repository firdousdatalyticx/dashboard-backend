const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const { format, toDate } = require('date-fns');
const { processFilters } = require('../social-media/filter.utils');
const prisma = new PrismaClient();
const processCategoryItems = require('../../helpers/processedCategoryItems');

/**
 * Helper function to execute Elasticsearch count query
 * @param {Object} params Query parameters for Elasticsearch
 * @returns {Promise<Object>} Elasticsearch response
 */
const executeElasticSearchCount = async (params) => {
    try {
        const response = await elasticClient.count({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params.body,
            preference: '_local'  // Prefer local shard execution
        });
        return response;
    } catch (error) {
        console.error('Elasticsearch count error:', error);
        throw error;
    }
};

/**
 * Helper function to execute Elasticsearch search query
 * @param {Object} params Query parameters for Elasticswearch
 * @returns {Promise<Object>} Elasticsearch response
 */
const executeElasticSearchQuery = async (params) => {
    try {
        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
            preference: '_local',  // Prefer local shard execution
            timeout: '30s'  // Set reasonable timeout
        });
        return response;
    } catch (error) {
        console.error('Elasticsearch search error:', error);
        throw error;
    }
};

/**
 * Build touchpoint query string for Elasticsearch
 * @param {Number} touchpointId The ID of the touchpoint
 * @returns {Promise<String>} Elasticsearch query string
 */
const buildTouchpointQueryString = async (touchpointId) => {
    // Cache the touchpoint data in memory
    if (!buildTouchpointQueryString.cache) {
        buildTouchpointQueryString.cache = new Map();
    }

    // Check cache first
    const cached = buildTouchpointQueryString.cache.get(touchpointId);
    if (cached) {
        return cached;
    }

    const touchpoint = await prisma.touch_points.findMany({
        where: { tp_id: touchpointId },
        select: { tp_keywords: true }
    });

    if (!touchpoint || touchpoint.length === 0 || !touchpoint[0].tp_keywords) {
        buildTouchpointQueryString.cache.set(touchpointId, '');
        return '';
    }

    const keywordsArray = touchpoint[0].tp_keywords.split(',');
    const keywordsQueryString = keywordsArray
        .map(keyword => keyword.trim())
        .filter(keyword => keyword !== '')
        .map(keyword => `"${keyword}"`)
        .join(' OR ');

    const result = keywordsQueryString ? `p_message_text:(${keywordsQueryString})` : '';
    buildTouchpointQueryString.cache.set(touchpointId, result);
    return result;
};

/**
 * Get all touchpoints for a subtopic
 * @param {Number} subtopicId The ID of the subtopic
 * @returns {Promise<Array>} Array of touchpoints
 */
const getAllTouchpoints = async (subtopicId) => {
    // Cache the touchpoints data in memory
    if (!getAllTouchpoints.cache) {
        getAllTouchpoints.cache = new Map();
    }

    // Check cache first
    const cached = getAllTouchpoints.cache.get(subtopicId);
    if (cached) {
        return cached;
    }

    const touchpoints = await prisma.cx_touch_points.findMany({
        where: { cx_tp_cx_id: subtopicId },
        select: { cx_tp_tp_id: true }
    });

    const result = touchpoints.length > 0 ? touchpoints : [];
    getAllTouchpoints.cache.set(subtopicId, result);
    return result;
};

/**
 * Get touchpoint data by ID
 * @param {Number} touchpointId The ID of the touchpoint
 * @returns {Promise<Array>} Touchpoint data
 */
const getTouchpointData = async (touchpointId) => {
    // Cache the touchpoint data in memory
    if (!getTouchpointData.cache) {
        getTouchpointData.cache = new Map();
    }

    // Check cache first
    const cached = getTouchpointData.cache.get(touchpointId);
    if (cached) {
        return cached;
    }

    const result = await prisma.touch_points.findMany({
        where: { tp_id: touchpointId }
    });

    getTouchpointData.cache.set(touchpointId, result);
    return result;
};

const keywordsController = {
    /**
     * Get keywords chart data
     * @param {Object} req Express request object
     * @param {Object} res Express response object
     * @returns {Object} JSON response
     */
    getNewKeywordsChart: async (req, res) => {
        try {
            const {
                fromDate,
                toDate,
                subtopicId,
                timeSlot,
                topicId,
                category = 'all',
                source = 'All',
                unTopic = 'false',
                sentimentType,
                categoryItems
            } = req.body;



                const isScadUser="true";
                const selectedTab ="";
                let topicQueryString = ''
                let responseArray= []
            
                if (subtopicId) {
                  const all_touchpoints = await getAllTouchpoints(Number(subtopicId))
            
                  for (let i = 0; i < all_touchpoints.length; i++) {
                    const tp_id = all_touchpoints[i].cx_tp_tp_id
            
                    const tp_data = await getTouchpointData(tp_id)
                    const tp_es_query_string = await buildTouchPointQueryString(tp_id)
            
                    let tempQueryString = topicQueryString
            
                   
                    ? `${tempQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "All")`
                    : `source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "All")`


            
                    const params = {
                      body: {
                        query: {
                          bool: {
                            must: [
                              {
                                query_string: {
                                  query: `${tempQueryString} AND ${tp_es_query_string}`
                                }
                              },
                              {
                                range: {
                                  p_created_time: {
                                    gte: fromDate||'now-90d',
                                    lte: toDate||'now'
                                  }
                                }
                              }
                            ]
                          }
                        }
                      }
                    }
            
                    if (sentimentType) {
                        params.body.query.bool.must.push({
                        match: { predicted_sentiment_value: sentimentType.trim() }
                        })
                    }

                    // Add category filters to the query
                    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                        const categoryData = processCategoryItems(req.body.categoryItems);
                        if (Object.keys(categoryData).length > 0) {
                            const categoryFilters = [];
                            
                            Object.values(categoryData).forEach(data => {
                                if (data.keywords && data.keywords.length > 0) {
                                    data.keywords.forEach(keyword => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: keyword,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                                if (data.hashtags && data.hashtags.length > 0) {
                                    data.hashtags.forEach(hashtag => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: hashtag,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                                if (data.urls && data.urls.length > 0) {
                                    data.urls.forEach(url => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: url,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                            });

                            if (categoryFilters.length > 0) {
                                params.body.query.bool.must.push({
                                    bool: {
                                        should: categoryFilters,
                                        minimum_should_match: 1
                                    }
                                });
                            }
                        }
                    } else if (req.processedCategories && Object.keys(req.processedCategories).length > 0) {
                        const categoryFilters = [];
                        
                        Object.values(req.processedCategories).forEach(data => {
                            if (data.keywords && data.keywords.length > 0) {
                                data.keywords.forEach(keyword => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: keyword,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                            if (data.hashtags && data.hashtags.length > 0) {
                                data.hashtags.forEach(hashtag => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: hashtag,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                            if (data.urls && data.urls.length > 0) {
                                data.urls.forEach(url => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: url,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                        });

                        if (categoryFilters.length > 0) {
                            params.body.query.bool.must.push({
                                bool: {
                                    should: categoryFilters,
                                    minimum_should_match: 1
                                }
                            });
                        }
                    }

                    const es_data = await executeElasticSearchCount(params)
            
                    // Fetch posts for this touchpoint
                    const MAX_POSTS_PER_KEYWORD = 10;
                    const limit = Math.min(es_data.count, MAX_POSTS_PER_KEYWORD);
                    
                    let posts = [];
                    if (es_data.count > 0) {
                        try {
                            const postsQuery = {
                                size: limit,
                                query: params.body.query,
                                sort: [{ p_created_time: { order: 'desc' } }],
                                _source: {
                                    includes: [
                                        'p_content',
                                        'p_url',
                                        'p_picture_url',
                                        'predicted_sentiment_value',
                                        'source',
                                        'u_fullname',
                                        'p_created_time',
                                        'created_at',
                                        'p_engagement',
                                        'p_likes',
                                        'p_comments',
                                        'p_shares',
                                        'rating',
                                        'comment',
                                        'business_response',
                                        'u_source',
                                        'name',
                                        'p_message_text',
                                        'p_comments_data'
                                    ]
                                }
                            };
                            
                            const postsResponse = await executeElasticSearchQuery(postsQuery);
                            posts = postsResponse.hits.hits.map(hit => formatPostData(hit));
                        } catch (error) {
                            console.error(`Error fetching posts for touchpoint ${tp_data[0].tp_name}:`, error);
                            posts = [];
                        }
                    }
            
                    responseArray.push({
                      key_count: es_data.count,
                      keyword: tp_data[0].tp_name,
                      posts: posts
                    })
                  }
                } 
                else {
                  let keyHashArray= []
            
                  const keyHash = await prisma.customer_topics.findUnique({
                    select: {
                      topic_hash_tags: true,
                      topic_keywords: true
                    },
                    where: { topic_id: Number(topicId) }
                  })
            
                  if (!keyHash) {
                    return res.status(400).json({ success: false, message: 'keywords not found' })
                  }
            
                  const keywords = keyHash?.topic_keywords?.split(',') || []
                  const hashtags = keyHash?.topic_hash_tags?.split('|') || []
            
                  keyHashArray = [
                    ...keywords.filter((k) => k.trim() !== '').map((k) => k.trim()),
                    ...hashtags.filter((h) => h.trim() !== '').map((h) => h.trim())
                  ]
            
                  keyHashArray = keyHashArray.slice(0, 10) // limit to top 10
            
                  for (let i = 0; i < keyHashArray.length; i++) {
                    let tempQueryString = topicQueryString
            
                    if(parseInt(topicId)==2619){
                    tempQueryString =tempQueryString ?`${tempQueryString} AND source:("Linkedin" OR "LinkedIn")` :`source:("Linkedin" OR "LinkedIn")`
                    }else{
                    tempQueryString = tempQueryString
                        ? `${tempQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web" OR "All")`
                        : `source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Linkedin" OR "Web" OR "All")`
                    }

                   
                        
                    if (unTopic === 'true') {
                      tempQueryString = `${tempQueryString} AND un_keywords:("Yes")`
                    }
            
                    const params = {
                        body: {
                          query: {
                            bool: {
                              must: [
                                {
                                  bool: {
                                    must: [
                                      {
                                        query_string: {
                                          query: tempQueryString || '*'
                                        }
                                      },
                                      {
                                        multi_match: {
                                          fields: [
                                            'p_message_text',
                                            'p_message',
                                            'keywords',
                                            'title',
                                            'hashtags',
                                            'u_source',
                                            'p_url'
                                          ],
                                          query: keyHashArray[i],
                                          type: 'phrase'
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  range: {
                                    p_created_time: {
                                      gte: fromDate || 'now-90d',
                                      lte: toDate || 'now'
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                      
                
                    if (sentimentType) {
                        params.body.query.bool.must.push({
                        match: { predicted_sentiment_value: sentimentType.trim() }
                        })
                    }

                    // Add category filters to the query
                    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                        const categoryData = processCategoryItems(req.body.categoryItems);
                        if (Object.keys(categoryData).length > 0) {
                            const categoryFilters = [];
                            
                            Object.values(categoryData).forEach(data => {
                                if (data.keywords && data.keywords.length > 0) {
                                    data.keywords.forEach(keyword => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: keyword,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                                if (data.hashtags && data.hashtags.length > 0) {
                                    data.hashtags.forEach(hashtag => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: hashtag,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                                if (data.urls && data.urls.length > 0) {
                                    data.urls.forEach(url => {
                                        categoryFilters.push({
                                            multi_match: {
                                                query: url,
                                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                                type: 'phrase'
                                            }
                                        });
                                    });
                                }
                            });

                            if (categoryFilters.length > 0) {
                                params.body.query.bool.must.push({
                                    bool: {
                                        should: categoryFilters,
                                        minimum_should_match: 1
                                    }
                                });
                            }
                        }
                    } else if (req.processedCategories && Object.keys(req.processedCategories).length > 0) {
                        const categoryFilters = [];
                        
                        Object.values(req.processedCategories).forEach(data => {
                            if (data.keywords && data.keywords.length > 0) {
                                data.keywords.forEach(keyword => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: keyword,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                            if (data.hashtags && data.hashtags.length > 0) {
                                data.hashtags.forEach(hashtag => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: hashtag,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                            if (data.urls && data.urls.length > 0) {
                                data.urls.forEach(url => {
                                    categoryFilters.push({
                                        multi_match: {
                                            query: url,
                                            fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                            type: 'phrase'
                                        }
                                    });
                                });
                            }
                        });

                        if (categoryFilters.length > 0) {
                            params.body.query.bool.must.push({
                                bool: {
                                    should: categoryFilters,
                                    minimum_should_match: 1
                                }
                            });
                        }
                    }

                    const results = await executeElasticSearchCount(params)
            
                    // Fetch posts for this keyword
                    const MAX_POSTS_PER_KEYWORD = 10;
                    const limit = Math.min(results.count, MAX_POSTS_PER_KEYWORD);
                    
                    let posts = [];
                    if (results.count > 0) {
                        try {
                            const postsQuery = {
                                size: limit,
                                query: params.body.query,
                                sort: [{ p_created_time: { order: 'desc' } }],
                                _source: {
                                    includes: [
                                        'p_content',
                                        'p_url',
                                        'p_picture_url',
                                        'predicted_sentiment_value',
                                        'source',
                                        'u_fullname',
                                        'p_created_time',
                                        'created_at',
                                        'p_engagement',
                                        'p_likes',
                                        'p_comments',
                                        'p_shares',
                                        'rating',
                                        'comment',
                                        'business_response',
                                        'u_source',
                                        'name',
                                        'p_message_text',
                                        'p_comments_data'
                                    ]
                                }
                            };
                            
                            const postsResponse = await executeElasticSearchQuery(postsQuery);
                            posts = postsResponse.hits.hits.map(hit => formatPostData(hit));
                        } catch (error) {
                            console.error(`Error fetching posts for keyword ${keyHashArray[i]}:`, error);
                            posts = [];
                        }
                    }
            
                    responseArray.push({
                      key_count: results.count,
                      keyword: keyHashArray[i],
                      posts: posts
                    })
                  }
                }
            
                // Sort array by key_count descending
                responseArray.sort((a, b) => b.key_count - a.key_count)
                // Determine which category data to use
                let categoryData = {};
                
                if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                  categoryData = processCategoryItems(req.body.categoryItems);
                } else {
                  // Fall back to middleware data
                  categoryData = req.processedCategories || {};
                }

                // Gather all filter terms from category data
                let allFilterTerms = [];
                if (categoryData && Object.keys(categoryData).length > 0) {
                  Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                  });
                }

                // After posts are fetched for each keyword/touchpoint, add matched_terms to each post
                responseArray.forEach(item => {
                  item.posts = item.posts.map(post => {
                    const textFields = [
                      post.p_message_text,
                      post.p_message,
                      post.keywords,
                      post.title,
                      post.hashtags,
                      post.u_source,
                      post.p_url,
                      post.u_fullname
                    ];
                    let matched = Array.isArray(allFilterTerms) && allFilterTerms.length > 0 ? allFilterTerms.filter(term =>
                      textFields.some(field => {
                        if (!field) return false;
                        if (Array.isArray(field)) {
                          return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                        }
                        return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                      })
                    ) : [];
                    // If for some reason no term is found, do a secondary check (should not happen if ES query is correct)
                    if (matched.length === 0 && allFilterTerms.length > 0) {
                      for (const term of allFilterTerms) {
                        for (const field of textFields) {
                          if (!field) continue;
                          if (Array.isArray(field)) {
                            if (field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()))) {
                              matched.push(term);
                              break;
                            }
                          } else if (typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase())) {
                            matched.push(term);
                            break;
                          }
                        }
                      }
                      // Remove duplicates
                      matched = [...new Set(matched)];
                    }
                    post.matched_terms = matched;
                    return post;
                  });
                });
            
                return res.status(200).json({ success: true, responseArray })

        } catch (error) {
            console.error('Error fetching keywords chart data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
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
    const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Social metrics
    const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
    const following = source.u_following > 0 ? `${source.u_following}` : '';
    const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
    const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

    // Emotion
    const llm_emotion = source.llm_emotion ||
        (source.source === 'GoogleMyBusiness' && source.rating
            ? (source.rating >= 4 ? 'Supportive'
                : source.rating <= 2 ? 'Frustrated'
                    : 'Neutral')
            : '');

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
    
    if (source.predicted_sentiment_value)
        predicted_sentiment = `${source.predicted_sentiment_value}`;
    else if (source.source === 'GoogleMyBusiness' && source.rating) {
        predicted_sentiment = source.rating >= 4 ? 'Positive'
            : source.rating <= 2 ? 'Negative'
                : 'Neutral';
    }

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

    // Format message text – with special handling for GoogleMaps/Tripadvisor
    let message_text = '';
    if (['GoogleMaps', 'Tripadvisor'].includes(source.source)) {
        const parts = source.p_message_text.split('***|||###');
        message_text = parts[0].replace(/\n/g, '<br>');
    } else {
        message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';
    }

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
        rating: source.rating,
        comment: source.comment,
        businessResponse: source.business_response,
        uSource: source.u_source,
        googleName: source.name,
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString(),
         p_comments_data:source.p_comments_data,
    };
};

/**
 * Build a base query string from category data for filters processing
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {string} Query string
 */
function buildBaseQueryString(selectedCategory, categoryData) {
    let queryString = '';
    const allTerms = [];
    
    if (selectedCategory === 'all') {
        // Combine all keywords, hashtags, and urls from all categories
        Object.values(categoryData).forEach(data => {
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
        const terms = allTerms.map(term => `"${term}"`).join(' OR ');
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
function buildBaseQuery(dateRange, source) {
    const query = {
        bool: {
            must: [
                {
                    range: {
                        created_at: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                },
                {
                    range: {
                        p_created_time: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                }
            ],
            must_not: [
                {
                    term: {
                        source: 'DM'
                    }
                }
            ]
        }
    };

    // Add source filter if a specific source is selected
    if (source !== 'All') {
        query.bool.must.push({
            match_phrase: { source: source }
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
                    { match_phrase: { source: "Reddit" } }
                ],
                minimum_should_match: 1
            }
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
    if (selectedCategory === 'all') {
        query.bool.must.push({
            bool: {
                should: [
                    ...Object.values(categoryData).flatMap(data =>
                        (data.keywords || []).map(keyword => ({
                            multi_match: {
                                query: keyword,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    )
                ],
                minimum_should_match: 1
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];

        // Check if the category has any filtering criteria
        const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
        const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
        const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

        // Only add the filter if there's at least one criteria
        if (hasKeywords || hasHashtags || hasUrls) {
            query.bool.must.push({
                bool: {
                    should: [
                        ...(data.keywords || []).map(keyword => ({
                            multi_match: {
                                query: keyword,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ],
                    minimum_should_match: 1
                }
            });
        } else {
            // If the category has no filtering criteria, add a condition that will match nothing
            query.bool.must.push({
                bool: {
                    must_not: {
                        match_all: {}
                    }
                }
            });
        }
    }
}
module.exports = keywordsController; 





