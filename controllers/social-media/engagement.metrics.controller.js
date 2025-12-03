const { elasticClient } = require('../../config/elasticsearch');
const { buildTopicQueryString } = require('../../utils/queryBuilder');
const { processFilters } = require('./filter.utils');
const processCategoryItems = require('../../helpers/processedCategoryItems');

/**
 * Normalize source input to array of sources
 * @param {string|Array} source - Source input (can be "All", comma-separated string, array, or single value)
 * @returns {Array} Array of normalized sources
 */
function normalizeSourceInput(source) {
  if (!source || source === 'All') {
    return []; // No specific source filter
  }
  if (Array.isArray(source)) {
    return source.filter(s => s && s.trim() !== '');
  }
  if (typeof source === 'string') {
    return source.split(',').map(s => s.trim()).filter(s => s !== '');
  }
  return [];
}

/**
 * Find matching category key with flexible matching
 * @param {string} selectedCategory - Category to find
 * @param {Object} categoryData - Category data object
 * @returns {string|null} Matched category key or null
 */
function findMatchingCategoryKey(selectedCategory, categoryData = {}) {
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
}

/**
 * Helper function to build Elasticsearch query template with performance optimizations
 * @param {string} queryString Topic query string
 * @param {string} gte Start date
 * @param {string} lte End date
 * @param {Object} aggs Aggregations to perform
 * @returns {Object} Elasticsearch query object
 */
const elasticQueryTemplate = (queryString, gte, lte, aggs, category) => {
    
    const baseQuery = {
        size: 0,
        query: {
            bool: {
                must: [
                    {
                        query_string: {
                            query: queryString,
                            default_operator: "OR"
                        }
                    },
                    {
                        range: {
                            p_created_time: {
                                gte: gte,
                                lte: lte,
                                format: "yyyy-MM-dd"
                            }
                        }
                    },
                    {
                        range: {
                            created_at: {
                                gte: gte,
                                lte: lte,
                                format: "yyyy-MM-dd"
                            }
                        }
                    }
                ]
            }
        },
        aggs: aggs
    };

    // ✅ Add Category Filter
    if (category && category !== "all") {
        const categoryFilter = {
            bool: {
                should: [
                    { match_phrase: { p_message_text: category } },
                    { match_phrase: { keywords: category } },
                    { match_phrase: { hashtags: category } },
                    { match_phrase: { u_source: category } },
                    { match_phrase: { p_url: category } }
                ],
                minimum_should_match: 1
            }
        };

        baseQuery.query.bool.must.push(categoryFilter);
    }

    return baseQuery;
};

/**
 * Execute Elasticsearch query with timeout for better performance
 * @param {Object} params Query parameters
 * @returns {Promise<Object>} Elasticsearch response
 */
const executeQuery = async (params) => {
    try {
        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
            timeout: '10s' // Add a timeout to prevent long-running queries
        });
        return response;
    } catch (error) {
        console.error('Elasticsearch search error:', error);
        // Return empty results instead of throwing on timeout
        if (error.message && error.message.includes('timeout')) {
            return { 
                aggregations: { 
                    total_shares: { value: 0 },
                    total_comments: { value: 0 },
                    total_likes: { value: 0 },
                    total_views: { value: 0 },
                    total_engagement: { value: 0 }
                } 
            };
        }
        throw error;
    }
};

/**
 * Calculate percentage difference and trend
 * @param {number} currentValue Current value
 * @param {number} previousValue Previous value
 * @returns {Object} Difference data
 */
const calculateDifference = (currentValue, previousValue) => {
    let resultDiff, perDiff, trend;

    if (currentValue > previousValue) {
        resultDiff = currentValue - previousValue;
        trend = 'increase';
    } else {
        resultDiff = previousValue - currentValue;
        trend = 'decrease';
    }

    if (currentValue > 0) {
        perDiff = (resultDiff / currentValue) * 100;
    } else {
        perDiff = 0;
    }

    return {
        trend,
        percentage: perDiff.toFixed(2),
        formatted: `${trend}|${perDiff.toFixed(2)}`
    };
};

/**
 * Get daily data for specified metric over a shorter period (5 days instead of 7)
 * for better performance
 * @param {string} queryString Topic query string
 * @param {string} metric Metric to aggregate
 * @param {boolean} isEngagement Whether this is an engagement metric requiring multiple aggregations
 * @param {boolean} isUnTopic Whether this is for UN topic
 * @returns {Promise<Array>} Daily data
 */
  const getDailyData = async (queryString, metric, isEngagement = false, isUnTopic = false, topicId = null) => {
    const datesArray = [];
    const startDate = isUnTopic 
        ? new Date('2023-02-21T00:00:00.000Z')
        : new Date();

    // Reduced from 7 to 5 days for better performance
    for (let i = 1; i <= 7; i++) {
        let dDate, formattedDate;
        
        if (isUnTopic) {
            dDate = new Date(startDate.getTime() - i);
            dDate.setDate(dDate.getDate() - i);
        } else {
            dDate = new Date();
            dDate.setDate(dDate.getDate() - i);
        }
        
        formattedDate = dDate.toISOString().split('T')[0];
        
        let aggs;
        if (isEngagement) {
            aggs = {
                total_shares: { sum: { field: 'p_shares' } },
                total_comments: { sum: { field: 'p_comments' } },
                total_likes: { sum: { field: 'p_likes' } },
                total_views: { sum: { field: 'p_engagement' } }
            };
        } else {
            aggs = {
                [`total_${metric}`]: { sum: { field: `p_${metric}` } }
            };
        }

        // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
        const mustFilters = [
            {
                query_string: {
                    query: `${queryString} AND p_created_time:("${formattedDate}")`
                }
            }
        ];

        if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
            mustFilters.push({
                term: { is_public_opinion: true }
            });
        }

        const params = {
            size: 0, // Explicitly set size to 0 for better performance
            query: {
                bool: {
                    must: mustFilters
                }
            },
            aggs: aggs
        };

        const esData = await executeQuery(params);
        
        let dailyValue;
        if (isEngagement) {
            dailyValue = 
                esData.aggregations.total_shares.value +
                esData.aggregations.total_comments.value +
                esData.aggregations.total_likes.value +
                esData.aggregations.total_views.value;
        } else {
            dailyValue = esData.aggregations[`total_${metric}`].value;
        }

        const dayName = dDate.toLocaleDateString('en-US', { weekday: 'short' });
        datesArray.push(`${dayName},${dailyValue}`);
    }

    // Sort by date and reverse to show most recent last
    datesArray.sort((a, b) => new Date(a.split(',')[0]).getTime() - new Date(b.split(',')[0]).getTime());
    return datesArray.reverse();
};

const engagementController = {
    /**
     * Get engagement metrics (shares, likes, comments, or total engagement)
     * @param {Object} req Express request object
     * @param {Object} res Express response object
     * @returns {Object} JSON response
     */
    getEngagementMetrics: async (req, res) => {
        try {
            const { 
                type = 'engagements',
                unTopic = 'false',
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                comparisonStartDate, 
                comparisonEndDate,
                source = 'All',
                category = 'all',
                topicId,
                categoryItems
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }

            // Get available data sources from middleware
            const availableDataSources = req.processedDataSources || [];            
            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: true,
                    totalCount: 0,
                    percentageDifference: "increase|0.00",
                    graphData: []
                });
            }

            let selectedCategory = category;
            if (category !== 'all' && category !== '' && category !== 'custom') {
                const matchedKey = findMatchingCategoryKey(category, categoryData);
                if (matchedKey) {
                  selectedCategory = matchedKey;
                }else{
                    selectedCategory="all";
                }
            }

            let query = buildTopicQueryString(categoryData);

             // Process filters for time range and sentiment
                const filters = processFilters({
                    timeSlot,
                    fromDate,
                    toDate,
                    sentimentType,
                    queryString: query,
                });
                   // // Handle special case for unTopic
            let queryTimeRange = {
                gte: filters.greaterThanTime,
                lte: filters.lessThanTime
            };

              // Build base query
              const queryRange = buildBaseQuery({
                greaterThanTime: queryTimeRange.gte,
                lessThanTime: queryTimeRange.lte
            }, source, isSpecialTopic, parseInt(topicId), availableDataSources);

            
            // Add caching headers to the response
            res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
            
           
          
            // Handle UN topic specific conditions
            let greaterThanTime = filters.greaterThanTime;
            let lessThanTime = filters.lessThanTime;
            let incDecFromDate = comparisonStartDate || 'now-180d/d';
            let incDecToDate = comparisonEndDate || 'now-90d/d';
            
            if (Number(req.body.topicId)==2473) {
                greaterThanTime = '2023-01-01';
                lessThanTime = '2023-04-30';
            }
            let response, graphData, totalCount;
            if (type === 'shares') {
                const aggsShares = {
                    total_shares: { sum: { field: 'p_shares' } }
                };
           
                // Get current period data
                const shares = await executeQuery(
                    elasticQueryTemplate(query, greaterThanTime, lessThanTime, aggsShares,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalShares = shares.aggregations.total_shares.value;


          
                // Get comparison period data
                const sharesCompare = await executeQuery(
                    elasticQueryTemplate(query, incDecFromDate, incDecToDate, aggsShares,category!=="all" && selectedCategory=="all"?category:"all")
                );

                const totalSharesCompare = sharesCompare.aggregations.total_shares.value;

                // Calculate percentage difference
                const difference = calculateDifference(totalShares, totalSharesCompare);
                
                // Get daily data for graph
                graphData = await getDailyData(query, 'shares', false, unTopic === 'true', topicId);
                
                totalCount = totalShares;
                response = difference.formatted;
                
            } else if (type === 'comments') {
                const aggsComments = {
                    total_comments: { sum: { field: 'p_comments' } }
                };

                // Get current period data
                const comments = await executeQuery(
                    elasticQueryTemplate(filters.queryString, greaterThanTime, lessThanTime, aggsComments,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalComments = comments.aggregations.total_comments.value;

                // Get comparison period data
                const commentsCompare = await executeQuery(
                    elasticQueryTemplate(filters.queryString, incDecFromDate, incDecToDate, aggsComments,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalCommentsCompare = commentsCompare.aggregations.total_comments.value;

                // Calculate percentage difference
                const difference = calculateDifference(totalComments, totalCommentsCompare);
                
                // Get daily data for graph
                graphData = await getDailyData(filters.queryString, 'comments', false, unTopic === 'true', topicId);
                
                totalCount = totalComments;
                response = difference.formatted;
                
            } else if (type === 'likes') {
                const aggsLikes = {
                    total_likes: { sum: { field: 'p_likes' } }
                };

                // Get current period data
                const likes = await executeQuery(
                    elasticQueryTemplate(query, greaterThanTime, lessThanTime, aggsLikes,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalLikes = likes.aggregations.total_likes.value;

                // Get comparison period data
                const likesCompare = await executeQuery(
                    elasticQueryTemplate(query, incDecFromDate, incDecToDate, aggsLikes,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalLikesCompare = likesCompare.aggregations.total_likes.value;

                // Calculate percentage difference
                const difference = calculateDifference(totalLikes, totalLikesCompare);
                
                // Get daily data for graph
                graphData = await getDailyData(query, 'likes', false, unTopic === 'true', topicId);
                
                totalCount = totalLikes;
                response = difference.formatted;
                
            } else if (type === 'engagements') {
                const aggsEngagements = {
                    total_shares: { sum: { field: 'p_shares' } },
                    total_comments: { sum: { field: 'p_comments' } },
                    total_likes: { sum: { field: 'p_likes' } },
                    total_views: { sum: { field: 'p_engagement' } }
                };

             
                // Get current period data
                const engagement = await executeQuery(
                    elasticQueryTemplate(query, greaterThanTime, lessThanTime, aggsEngagements,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalEngagement = 
                    engagement.aggregations.total_shares.value +
                    engagement.aggregations.total_comments.value +
                    engagement.aggregations.total_likes.value +
                    engagement.aggregations.total_views.value;

                // Get comparison period data
                const engagementCompare = await executeQuery(
                    elasticQueryTemplate(query, incDecFromDate, incDecToDate, aggsEngagements,category!=="all" && selectedCategory=="all"?category:"all")
                );
                const totalEngagementCompare = 
                    engagementCompare.aggregations.total_shares.value +
                    engagementCompare.aggregations.total_comments.value +
                    engagementCompare.aggregations.total_likes.value +
                    engagementCompare.aggregations.total_views.value;

                // Calculate percentage difference
                const difference = calculateDifference(totalEngagement, totalEngagementCompare);
                
                // Get daily data for graph
                graphData = await getDailyData(query, 'engagement', true, unTopic === 'true', topicId);
                
                totalCount = totalEngagement;
                response = difference.formatted;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid engagement type specified'
                });
            }

            return res.json({
                success: true,
                totalCount,
                percentageDifference: response,
                graphData
            });
            
        } catch (error) {
            console.error('Error fetching engagement metrics:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
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
* @param {boolean} isSpecialTopic - Whether this is a special topic
* @param {number} topicId - Topic ID
* @param {Array} availableDataSources - Available data sources to filter by
* @returns {Object} Elasticsearch query object
*/
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId, availableDataSources = []) {
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
    } else if (availableDataSources && availableDataSources.length > 0) {
        // Use available data sources if present
        query.bool.must.push({
            bool: {
                should: availableDataSources.map(source => ({
                    match_phrase: { source: source }
                })),
                minimum_should_match: 1
            }
        });
    } else {
        // Fallback to default sources if no available sources
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
                    { match_phrase: { source: "TikTok" } }
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
                        (data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
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
                        ...(data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ]),
                        ...(data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ]),
                        ...(data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
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
module.exports = engagementController; 