const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');
// Removed date-fns import as counts endpoint no longer needs date formatting
const processCategoryItems = require('../../helpers/processedCategoryItems');
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
                topicId,
                llm_mention_type
            } = req.body;

            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600 || parseInt(topicId) === 2627;
            
            // Get category data from middleware
            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }
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
                        });
            
                        // Build time range: if no dates are provided, DO NOT apply default last90days
                        const noDateProvided = (
                            (timeSlot === null || timeSlot === undefined || timeSlot === '') &&
                            (fromDate === null || fromDate === undefined || fromDate === '') &&
                            (toDate === null || toDate === undefined || toDate === '')
                        );

                        let queryTimeRange = null;
                        if (!noDateProvided) {
                            queryTimeRange = {
                                gte: filters.greaterThanTime,
                                lte: filters.lessThanTime
                            };
                        }

                        if (Number(topicId) == 2473) {
                            queryTimeRange = {
                                gte: '2023-01-01',
                                lte: '2023-04-30'
                            };
                        }
            
        
                        // Build base query
                        const query = buildBaseQuery(
                            queryTimeRange ? {
                                greaterThanTime: queryTimeRange.gte,
                                lessThanTime: queryTimeRange.lte
                            } : null,
                            source,
                            isSpecialTopic,
                            parseInt(topicId)
                        );
            
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
       

            // return res.send(aggQuery)
            // Execute the aggregation query
            const aggResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: aggQuery
            });


            // Get total count using the same query (for comparison with mentions-trend)
            // Note: total count is not returned in this endpoint for performance
            // If needed, it can be added back with a lightweight count aggregation

            // Extract the aggregation buckets
            const buckets = aggResponse.aggregations.source_counts.buckets;

                const sourceCounts = buckets.reduce((acc, bucket) => {
                if (bucket.doc_count > 0) {
                    // Normalize key (e.g., treat Linkedin and LinkedIn as same)
                    const normalizedKey = bucket.key.toLowerCase();

                    // Add or update count
                    acc[normalizedKey] = (acc[normalizedKey] || 0) + bucket.doc_count;
                }
                return acc;
                }, {});

                // Reformat keys properly (capitalize "LinkedIn" etc. if you want)
              const formattedCounts = {};
                for (const key in sourceCounts) {
                // Handle special cases like LinkedIn
                let formattedKey;
                if (key.toLowerCase() === "linkedin") {
                    formattedKey = "LinkedIn";
                } else {
                    // Capitalize the first letter dynamically
                    formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                }

                formattedCounts[formattedKey] = sourceCounts[key];
                }


                return res.json(formattedCounts);

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
function buildBaseQuery(dateRange, source, isSpecialTopic = false,topicId) {
    const query = {
        bool: {
            must: [],
            must_not: [
                {
                    term: {
                        source: 'DM'
                    }
                }
            ]
        }
    };
    // Only apply time range if provided
    if (dateRange && dateRange.greaterThanTime && dateRange.lessThanTime) {
        query.bool.must.push({
            range: {
                p_created_time: {
                    gte: dateRange.greaterThanTime,
                    lte: dateRange.lessThanTime
                }
            }
        });
    }
    if(topicId===2619 || topicId===2639 || topicId===2640){
            query.bool.must.push({
                        bool: {
                            should: [
                                { match_phrase: { source: "LinkedIn" } },
                                { match_phrase: { source: "Linkedin" } }
                            ],
                            minimum_should_match: 1
                        }
                    });
    }
    
    // Handle special topic source filtering
    else if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    } 
    else if (topicId===2634) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    }
    
    else {
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
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
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
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'hashtags', 'u_source', 'p_url'],
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

// Removed post formatting and helpers to keep this controller lean for counts-only

module.exports = socialsDistributionsController;