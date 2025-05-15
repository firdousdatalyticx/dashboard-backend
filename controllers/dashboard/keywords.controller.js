const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const { format, toDate } = require('date-fns');
const { processFilters } = require('../social-media/filter.utils');
const prisma = new PrismaClient();

/**
 * Helper function to execute Elasticsearch count query
 * @param {Object} params Query parameters for Elasticsearch
 * @returns {Promise<Object>} Elasticsearch response
 */
const executeElasticSearchCount = async (params) => {
    try {
        const response = await elasticClient.count({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params.body
        });
        return response;
    } catch (error) {
        console.error('Elasticsearch count error:', error);
        throw error;
    }
};

/**
 * Build touchpoint query string for Elasticsearch
 * @param {Number} touchpointId The ID of the touchpoint
 * @returns {Promise<String>} Elasticsearch query string
 */
const buildTouchpointQueryString = async (touchpointId) => {
    const touchpoint = await prisma.touch_points.findMany({
        where: { tp_id: touchpointId },
        select: { tp_keywords: true }
    });

    if (!touchpoint || touchpoint.length === 0 || !touchpoint[0].tp_keywords) {
        return '';
    }

    const keywordsArray = touchpoint[0].tp_keywords.split(',');
    let keywordsQueryString = '';

    for (const keyword of keywordsArray) {
        if (keyword.trim() !== '') {
            keywordsQueryString += `"${keyword.trim()}" OR `;
        }
    }

    // Remove the last ' OR '
    keywordsQueryString = keywordsQueryString.slice(0, -4);

    return `p_message_text:(${keywordsQueryString})`;
};

/**
 * Get all touchpoints for a subtopic
 * @param {Number} subtopicId The ID of the subtopic
 * @returns {Promise<Array>} Array of touchpoints
 */
const getAllTouchpoints = async (subtopicId) => {
    const touchpoints = await prisma.cx_touch_points.findMany({
        where: { cx_tp_cx_id: subtopicId },
        select: { cx_tp_tp_id: true }
    });

    return touchpoints.length > 0 ? touchpoints : [];
};

/**
 * Get touchpoint data by ID
 * @param {Number} touchpointId The ID of the touchpoint
 * @returns {Promise<Array>} Touchpoint data
 */
const getTouchpointData = async (touchpointId) => {
    return prisma.touch_points.findMany({
        where: { tp_id: touchpointId }
    });
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
                sentimentType
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
                 

                    const es_data = await executeElasticSearchCount(params)
            
                    responseArray.push({
                      key_count: es_data.count,
                      keyword: tp_data[0].tp_name
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
            
                    tempQueryString = tempQueryString
                        ? `${tempQueryString} AND source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "All")`
                        : `source:("Twitter" OR "Facebook" OR "Instagram" OR "Youtube" OR "Pinterest" OR "Reddit" OR "LinkedIn" OR "Web" OR "All")`


                   
                        
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
            
                    const results = await executeElasticSearchCount(params)
            
                    responseArray.push({
                      key_count: results.count,
                      keyword: keyHashArray[i]
                    })
                  }
                }
            
                // Sort array by key_count descending
                responseArray.sort((a, b) => b.key_count - a.key_count)
            
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