const { elasticClient } = require('../../config/elasticsearch');
const { buildTopicQueryString } = require('../../utils/queryBuilder');
const { getCountryCode } = require('../../utils/countryHelper');
const { getSourceIcon } = require('../../utils/sourceHelper');
const { processFilters } = require('./filter.utils');

const audienceController = {
    getAudience: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                records = 20 
            } = req.body;
            
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    data_array: [] 
                });
            }

            const topicQueryString = buildTopicQueryString(categoryData);
            const sourcesQuery = ` AND source:("Twitter" OR "Instagram" OR "Facebook")`;
            
            // Process filters for time range
            const filters = processFilters({
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                queryString: topicQueryString
            });

            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    from: 0,
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                {
                                    query_string: {
                                        query: `${topicQueryString} ${sourcesQuery}`,
                                        analyze_wildcard: true,
                                        default_operator: 'AND'
                                    }
                                },
                                { exists: { field: 'u_profile_photo' } },
                                { exists: { field: 'u_followers' } },
                                {
                                    range: {
                                        p_created_time: {
                                            gte: filters.greaterThanTime,
                                            lte: filters.lessThanTime
                                        }
                                    }
                                }
                            ],
                            must_not: [{ term: { 'u_profile_photo.keyword': '' } }]
                        }
                    },
                    aggs: {
                        group_by_user: {
                            terms: {
                                field: 'u_source.keyword',
                                size: parseInt(records)
                            },
                            aggs: {
                                grouped_results: {
                                    top_hits: {
                                        size: 1,
                                        _source: {
                                            includes: [
                                                'u_fullname',
                                                'u_profile_photo',
                                                'u_date_joined',
                                                'u_country',
                                                'u_followers',
                                                'source',
                                                'u_source'
                                            ]
                                        },
                                        sort: [{ p_created_time: { order: 'desc' } }]
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const results = await elasticClient.search(params);

            if (!results?.aggregations?.group_by_user?.buckets) {
                console.log('no record found');
                return res.json({ data_array: [] });
            }

            const data_array = [];

            for (const bucket of results.aggregations.group_by_user.buckets) {
                if (!bucket.key) continue;

                const sourceData = bucket.grouped_results.hits.hits[0]._source;
                const flag_image = sourceData.u_country 
                    ? await getCountryCode(sourceData.u_country)
                    : '&nbsp;';

                const sourceIcon = getSourceIcon(sourceData.source);

                data_array.push({
                    profile_image: sourceData.u_profile_photo,
                    fullname: sourceData.u_fullname,
                    source: `${sourceData.u_source},${sourceIcon}`,
                    country: flag_image,
                    followers: sourceData.u_followers.toString(),
                    posts: bucket.doc_count.toString()
                });
            }

            return res.json({ data_array });
        } catch (error) {
            console.error('Error fetching audience data:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    },

    getAudienceDistributionByCountry: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate ,
                sentimentType,
                category="all",
                source="All"
            } = req.body;
            
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ 
                    responseArray: [] 
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
            
                        // if (unTopic === 'true') {
                        //     queryTimeRange = {
                        //         gte: '2023-01-01',
                        //         lte: '2023-04-30'
                        //     };
                        // }
            
                        // Build base query
                        const query = buildBaseQuery({
                            greaterThanTime: queryTimeRange.gte,
                            lessThanTime: queryTimeRange.lte
                        }, source);
            
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
            

            query.bool.must.push({ exists: { field: 'u_country' } });
            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    query: query,
                    aggs: {
                        group_by_country: {
                          terms: { field: 'u_country.keyword', size: 15 }
                        }
                      },
                }
            };


            const results = await elasticClient.search(params);

            let newCountryArray = {};

            results?.aggregations?.group_by_country?.buckets?.forEach(bucket => {
                if (bucket.key) {
                    newCountryArray[bucket.key] = bucket.doc_count;
                }
            });

            // Sort countries by count in descending order
            newCountryArray = Object.entries(newCountryArray)
                .sort(([, a], [, b]) => b - a)
                .reduce((obj, [key, value]) => {
                    obj[key] = value;
                    return obj;
                }, {});

            const responseArray = Object.keys(newCountryArray).map(countryName => ({
                key_count: newCountryArray[countryName],
                country_name: countryName
            }));


            return res.json({ results,responseArray });
        } catch (error) {
            console.error('Error fetching audience distribution data:', error);
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
function buildBaseQuery(dateRange, source) {
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


module.exports = audienceController; 