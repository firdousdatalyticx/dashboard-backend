const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');
const { format } = require('date-fns');

const socialsDistributionsController = {
    getDistributions: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                category = 'all',
                source = 'All',
                unTopic='false',
                topicId,
                llm_mention_type
            } = req.body;

            console.log(fromDate, toDate);
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            // If there's nothing to search for, return zero counts
            if (Object.keys(categoryData).length === 0) {
                return res.json({});
            }

              // Build base query for filters processing
                        const baseQueryString = buildBaseQueryString(category, categoryData);
                        
                        // Process filters (time slot, date range, sentiment)
                        const filters = processFilters({
                            sentimentType,
                            timeSlot,
                            fromDate,
                            toDate,
                            queryString: baseQueryString,
                            isSpecialTopic // Pass special topic flag
                        });
            
                        // Handle special case for unTopic
                        let queryTimeRange = {
                            gte: filters.greaterThanTime,
                            lte: filters.lessThanTime
                        };

                        if (Number(topicId) == 2473) {
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
                        }

                        // Apply LLM Mention Type filter if provided (sync with mentions-trend)
                        if (llm_mention_type && llm_mention_type !== "" && Array.isArray(llm_mention_type) && llm_mention_type.length > 0) {
                            const mentionTypeFilter = {
                                bool: {
                                    should: llm_mention_type.map(type => ({
                                        match: { llm_mention_type: type }
                                    })),
                                    minimum_should_match: 1
                                }
                            };
                            query.bool.must.push(mentionTypeFilter);
                        }

                        // Normalize the input for string-based llm_mention_type
                        const mentionTypesArray = typeof llm_mention_type === 'string' 
                            ? llm_mention_type.split(',').map(s => s.trim()) 
                            : llm_mention_type;

                        // Apply LLM Mention Type filter if provided (handle string input)
                        if (llm_mention_type && llm_mention_type !== "" && mentionTypesArray && Array.isArray(mentionTypesArray) && mentionTypesArray.length > 0) {
                            const mentionTypeFilter = {
                                bool: {
                                    should: mentionTypesArray.map(type => ({
                                        match: { llm_mention_type: type }
                                    })),
                                    minimum_should_match: 1
                                }
                            };
                            query.bool.must.push(mentionTypeFilter);
                        }
          
            // Now create the aggregation query with the same base query
            const aggQuery = {
                query: query,
                size: 0,
                aggs: {
                    source_counts: {
                        terms: {
                            field: 'source.keyword',
                            size: 20
                        }
                    }
                }
            };
       

            // Execute the aggregation query
            const aggResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: aggQuery
            });

            // Get total count using the same query (for comparison with mentions-trend)
            const totalCountQuery = {
                query: query,
                size: 0
            };
            const totalCountResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: totalCountQuery
            });
            const totalCount = totalCountResponse.hits.total.value || totalCountResponse.hits.total || 0;

            // Extract the aggregation buckets
            const buckets = aggResponse.aggregations.source_counts.buckets;
            const sourceCounts = buckets.reduce((acc, bucket) => {
                // Only include sources with count > 0
                if (bucket.doc_count > 0) {
                    acc[bucket.key] = bucket.doc_count;
                }
                return acc;
            }, {});

            // Merge LinkedIn variants into a single count
            const finalSourceCounts = {};
            let linkedinCount = 0;

            for (const [source, count] of Object.entries(sourceCounts)) {
                if (source === 'LinkedIn' || source === 'Linkedin') {
                    linkedinCount += count;
                } else {
                    finalSourceCounts[source] = count;
                }
            }

            // Add combined LinkedIn count if there are any
            if (linkedinCount > 0) {
                finalSourceCounts['LinkedIn'] = linkedinCount;
            }

            // Return counts with total for comparison
            return res.json({
                ...finalSourceCounts,
                // totalCount: totalCount
            });
        } catch (error) {
            console.error('Error fetching social media distributions:', error);
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
                        { match_phrase: { source: "Linkedin" } },
                        { match_phrase: { source: "LinkedIn" } },
                        { match_phrase: { source: "Pinterest" } },
                        { match_phrase: { source: "Web" } },
                        { match_phrase: { source: "Reddit" } },
                        { match_phrase: { source: "TikTok" } }
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

module.exports = socialsDistributionsController;