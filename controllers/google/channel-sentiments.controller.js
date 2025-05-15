const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');

const prisma = new PrismaClient();

/**
 * Helper function to get customer review elastic ID
 */
const getCustomerReviewElasticId = async (parentAccid) => {
    if (!parentAccid || parentAccid === null) {
        console.log('parentAccountId is required');
        return null;
    }
    const parentAccountId = Number(parentAccid);
    if (isNaN(parentAccountId)) {
        console.log('Invalid ID');
        return null;
    }
    try {
        const customer = await prisma.customers.findUnique({
            where: {
                customer_id: Number(parentAccountId)
            },
            select: {
                customer_reviews_key: true
            }
        });

        if (!customer) {
            console.log('Customer not found');
            return null;
        }

        return customer.customer_reviews_key;
    } catch (error) {
        console.error('error fetching result', error);
        return null;
    }
};

/**
 * Controller for Google channel sentiments data
 */
const channelSentimentsController = {
    /**
     * Get channel sentiments data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with channel sentiments data
     */
    getChannelSentiments: async (req, res) => {
        try {
            const { greaterThanTime, lessThanTime, isScadUser, selectedTab, topicId, parentAccountId, sentimentType } = req.body;
            const googleUrls = req.googleUrls || [];
            let topicQueryString = '';
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    responseOutput: {},
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }

            // Process filters for sentiment
            const filters = processFilters({
                // sentimentType,  
                queryString: topicQueryString
            });

            let sourcesArray = [
                'Youtube',
                'Twitter',
                'Pinterest',
                'Instagram',
                'Reddit',
                'Tumblr',
                'Facebook',
                'Web',
                'Linkedin',
                'GooglePlayStore',
                'GoogleMyBusiness',
                'AppleAppStore',
                'HuaweiAppGallery',
                'Glassdoor'
            ];

            if (isScadUser === "true") {
                if (selectedTab === "GOOGLE") {
                    sourcesArray = ['GoogleMyBusiness'];
                } else {
                    sourcesArray = ['Twitter', 'Instagram', 'Facebook', 'Youtube', 'Pinterest', 'Reddit', 'LinkedIn', 'Web'];
                }
            }

            const responseOutput = {};

            // Helper function to fetch sentiment counts using structured queries
            const fetchSentiments = async (source, queryString,sentimentType) => {
                if(sentimentType==""){
                const results = await Promise.all(['Positive', 'Negative', 'Neutral'].map(async (sentiment) => {
                    // Build a structured query object
                    const queryObj = {
                        bool: {
                            must: [
                                // Date range filter
                                {
                                    range: {
                                        p_created_time: {
                                            gte: greaterThanTime,
                                            lte: lessThanTime,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                },
                                // Sentiment filter using term query
                                {
                                    term: {
                                        "predicted_sentiment_value.keyword": sentiment
                                    }
                                }
                            ]
                        }
                    };
                    
                    // Add source filter
                    if (source === '"Youtube" OR "Vimeo"') {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    { term: { "source.keyword": "Youtube" } },
                                    { term: { "source.keyword": "Vimeo" } }
                                ],
                                minimum_should_match: 1
                            }
                        });
                    } else if (source === '"FakeNews" OR "News" OR "Blogs" OR "Web"') {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    { term: { "source.keyword": "FakeNews" } },
                                    { term: { "source.keyword": "News" } },
                                    { term: { "source.keyword": "Blogs" } },
                                    { term: { "source.keyword": "Web" } }
                                ],
                                minimum_should_match: 1
                            }
                        });
                    } else {
                        queryObj.bool.must.push({
                            term: { "source.keyword": source }
                        });
                    }
                    
                    // Add Google URL filters for GoogleMyBusiness
                    if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                        const urlShouldClauses = [];
                        
                        // Add URL clauses for both fields
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({ term: { "u_source.keyword": url } });
                            urlShouldClauses.push({ term: { "place_url.keyword": url } });
                        });
                        
                        queryObj.bool.must.push({
                            bool: {
                                should: urlShouldClauses,
                                minimum_should_match: 1
                            }
                        });
                    }
                    
                    // Add any custom filters from sentimentType
                    if (filters.queryString && filters.queryString.trim() !== '') {
                        queryObj.bool.must.push({
                            query_string: {
                                query: filters.queryString
                            }
                        });
                    }

                 
                    // Execute the count query
                    const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: queryObj }
                    });
                    
                    return { sentiment, count: result.count };
                }));
                
                // Convert results to the expected format
                return {
                    positive: results.find(r => r.sentiment === 'Positive').count,
                    negative: results.find(r => r.sentiment === 'Negative').count,
                    neutral: results.find(r => r.sentiment === 'Neutral').count
                };
                 }else{
                                // Define all possible sentiments
                    const allSentiments = ['Positive', 'Negative', 'Neutral'];

                    // Normalize sentimentType (handle cases where it's string or array)
                    const selectedSentiments = sentimentType
                    ? Array.isArray(sentimentType)
                        ? sentimentType
                        : [sentimentType]
                    : allSentiments; // If no filter is applied, query all

                    const results = await Promise.all(
                    allSentiments.map(async (sentiment) => {
                        if (!selectedSentiments.includes(sentiment)) {
                        // Return 0 if not selected
                        return { sentiment, count: 0 };
                        }

                        const queryObj = {
                        bool: {
                            must: [
                            {
                                range: {
                                p_created_time: {
                                    gte: greaterThanTime,
                                    lte: lessThanTime,
                                    format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                }
                                }
                            },
                            {
                                term: {
                                "predicted_sentiment_value.keyword": sentiment
                                }
                            }
                            ]
                        }
                        };

                        // Add your other filters as before
                        if (source === '"Youtube" OR "Vimeo"') {
                        queryObj.bool.must.push({
                            bool: {
                            should: [
                                { term: { "source.keyword": "Youtube" } },
                                { term: { "source.keyword": "Vimeo" } }
                            ],
                            minimum_should_match: 1
                            }
                        });
                        } else if (source === '"FakeNews" OR "News" OR "Blogs" OR "Web"') {
                        queryObj.bool.must.push({
                            bool: {
                            should: [
                                { term: { "source.keyword": "FakeNews" } },
                                { term: { "source.keyword": "News" } },
                                { term: { "source.keyword": "Blogs" } },
                                { term: { "source.keyword": "Web" } }
                            ],
                            minimum_should_match: 1
                            }
                        });
                        } else {
                        queryObj.bool.must.push({
                            term: { "source.keyword": source }
                        });
                        }

                        if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                        const urlShouldClauses = [];

                        googleUrls.forEach(url => {
                            urlShouldClauses.push({ term: { "u_source.keyword": url } });
                            urlShouldClauses.push({ term: { "place_url.keyword": url } });
                        });

                        queryObj.bool.must.push({
                            bool: {
                            should: urlShouldClauses,
                            minimum_should_match: 1
                            }
                        });
                        }

                        if (filters.queryString && filters.queryString.trim() !== '') {
                        queryObj.bool.must.push({
                            query_string: {
                            query: filters.queryString
                            }
                        });
                        }

                     

                        const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: queryObj }
                        });

                        return { sentiment, count: result.count };
                    })
                    );

                    // Final structured output
                    return {
                    positive: results.find(r => r.sentiment === 'Positive')?.count || 0,
                    negative: results.find(r => r.sentiment === 'Negative')?.count || 0,
                    neutral: results.find(r => r.sentiment === 'Neutral')?.count || 0
                    };

            }
            };

            // Helper function for specific sources (like GoogleMyBusiness)
            const fetchCustomSourceSentiments = async (source) => {
                const cusRevElasticId = await getCustomerReviewElasticId(parentAccountId);
                if (!cusRevElasticId) return { positive: 0, negative: 0, neutral: 0 };

                // Prepare URL filters if needed
                const urlFilters = [];
                if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                    googleUrls.forEach(url => {
                        urlFilters.push({ term: { "u_source.keyword": url } });
                        urlFilters.push({ term: { "place_url.keyword": url } });
                    });
                }

                // Common query parts
                const createQuery = (range) => {
                    const queryObj = {
                        bool: {
                            must: [
                                // Source filter
                                { term: { "source.keyword": source } },
                                // Manual entry type filter
                                { term: { "manual_entry_type.keyword": "review" } },
                                // Customer filter
                                { term: { "review_customer.keyword": cusRevElasticId } },
                                // Rating range
                                { range },
                                // Date range
                                {
                                    range: {
                                        p_created_time: {
                                            gte: greaterThanTime,
                                            lte: lessThanTime,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                }
                            ]
                        }
                    };
                    
                    // Add URL filters if available
                    if (urlFilters.length > 0) {
                        queryObj.bool.must.push({
                            bool: {
                                should: urlFilters,
                                minimum_should_match: 1
                            }
                        });
                    }
                    
                    return queryObj;
                };

                // Run the queries for each sentiment range
                const [positive, negative, neutral] = await Promise.all([
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { gt: 3 } }) }
                    }),
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { lt: 2 } }) }
                    }),
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { gte: 2, lte: 3 } }) }
                    })
                ]);

                return {
                    positive: positive.count,
                    negative: negative.count,
                    neutral: neutral.count
                };
            };

            // Process all sources
            await Promise.all(
                sourcesArray.map(async source => {
                    if (topicId === '2388' && source === 'GooglePlayStore') return; // Skip specific source for topicId 2388

                    let sentiments;
                    if (
                        topicId === '2325' ||
                        (topicId === '2388' &&
                            ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
                                source
                            ))
                    ) {
                        sentiments = await fetchCustomSourceSentiments(source);
                    } else {
                        const sourceQuery =
                            source === 'Youtube'
                                ? '"Youtube" OR "Vimeo"'
                                : source === 'Web'
                                    ? '"FakeNews" OR "News" OR "Blogs" OR "Web"'
                                    : source;

                        sentiments = await fetchSentiments(sourceQuery, filters.queryString,sentimentType);
                    }

                    // If we have sentimentType filter, filter the results client-side
                    if (sentimentType) {
                        if (sentimentType.includes('Positive') && sentiments.positive === 0 &&
                            sentimentType.includes('Negative') && sentiments.negative === 0 &&
                            sentimentType.includes('Neutral') && sentiments.neutral === 0) {
                            // Skip if no matching sentiments
                            return;
                        }
                    }

                    // Add non-zero sentiments to response
                    if (sentiments.positive > 0 || sentiments.negative > 0 || sentiments.neutral > 0) {
                        responseOutput[source] = sentiments;
                    }
                })
            );

            return res.status(200).json({
                success: true,
                responseOutput,
                googleUrls: googleUrls.length
            });

        } catch (error) {
            console.error('Error fetching channel sentiments data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

module.exports = channelSentimentsController; 