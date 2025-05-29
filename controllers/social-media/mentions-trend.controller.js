const { elasticClient } = require('../../config/elasticsearch');
const { format } = require('date-fns');
const { processFilters } = require('./filter.utils');

const mentionsTrendController = {
    /**
     * Get social media mentions trend data
     */
    getMentionsTrend: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                source = 'All',
                category = 'all',
                unTopic = 'false',
                topicId
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: false,
                    error: 'No category data available',
                    mentionsGraphData: '',
                    maxMentionData: ',0'
                });
            }

            // Build base query for filters processing
            const baseQueryString = buildBaseQueryString(category, categoryData);
            
            // Process filters (time slot, date range, sentiment)
            const filters = processFilters({
                sentimentType,
                timeSlot,
                fromDate,
                toDate,
                queryString: baseQueryString
            });

            // Handle special case for unTopic
            let queryTimeRange = {
                gte: filters.greaterThanTime,
                lte: filters.lessThanTime
            };

            if (unTopic === 'true') {
                queryTimeRange = {
                    gte: '2023-01-01',
                    lte: '2023-04-30'
                };
            }

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: queryTimeRange.gte,
                lessThanTime: queryTimeRange.lte
            }, source, isSpecialTopic);

            // Add category filters
            addCategoryFilters(query, category, categoryData);
            
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
                console.log("Applied sentiment filter for:", sentimentType);
            }

            // Define aggregation for mention graph with date range filter
            const aggsMentionGraph = {
                '2': {
                    date_histogram: { 
                        field: 'p_created_time', 
                        fixed_interval: '1d', 
                        min_doc_count: 0,
                        extended_bounds: {
                            min: queryTimeRange.gte,
                            max: queryTimeRange.lte
                        }
                    },
                    aggs: {
                        date_filter: {
                            filter: {
                                range: {
                                    p_created_time: queryTimeRange
                                }
                            }
                        }
                    }
                }
            };

            // Build complete query with aggregations
            const queryTemplate = {
                query: query,
                aggs: aggsMentionGraph
            };

            // Execute Elasticsearch query
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: queryTemplate
            });

            // Process results
            let maxDate = '';
            let maxMentions = 0;
            const datesArray = [];

            const buckets = response?.aggregations['2']?.buckets || [];

            for (const bucket of buckets) {
                const docCount = bucket.date_filter?.doc_count || 0;
                const keyAsString = new Date(bucket.key_as_string).toISOString().split('T')[0];
                
                // Only include dates within the specified range
                const bucketDate = new Date(keyAsString);
                const startDate = new Date(queryTimeRange.gte);
                const endDate = new Date(queryTimeRange.lte);
                
                if (bucketDate >= startDate && bucketDate <= endDate) {
                    if (docCount > maxMentions) {
                        maxMentions = docCount;
                        maxDate = keyAsString;
                    }
                    
                    datesArray.push(`${keyAsString},${docCount}`);
                }
            }

            // Sort dates in descending order
            datesArray.sort((a, b) => new Date(b.split(',')[0]) - new Date(a.split(',')[0]));

            return res.status(200).json({
                success: true,
                mentionsGraphData: datesArray.join('|'),
                maxMentionData: `${maxDate},${maxMentions}`,
                query
            });

        } catch (error) {
            console.error('Error fetching social media mentions trend data:', error);
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
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false) {
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

    // Handle special topic source filtering
    if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    } else {
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

module.exports = mentionsTrendController; 