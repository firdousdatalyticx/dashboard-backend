const { elasticClient } = require('../../config/elasticsearch');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');

/**
 * Controller for Google channel source data
 */
const channelSourceController = {
    /**
     * Get channel source data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with channel source data
     */
    getChannelSource: async (req, res) => {
        try {
            const { topicId, greaterThanTime, lessThanTime, isScadUser, selectedTab, sentimentType } = req.body;
            const googleUrls = req.googleUrls || [];
            let topicQueryString = '';
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    channelSourceCount: '',
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }
            
            // Process filters for sentiment
            const filters = processFilters({
                sentimentType,
                queryString: topicQueryString
            });

            // Define sources
            let sources = [
                { name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }
            ];

            // Fetch counts for each source
            await Promise.all(
                sources.map(async source => {
                    // Build the full query template with structured bool query
                    const queryTemplate = {
                        query: {
                            bool: {
                                must: [
                                    // Source filter
                                    {
                                        term: {
                                            "source.keyword": "GoogleMyBusiness"
                                        }
                                    },
                                    // Date range filter with broad defaults to match data range
                                    {
                                        range: {
                                            p_created_time: {
                                                gte: greaterThanTime || '2020-01-01',
                                                lte: lessThanTime || '2026-12-31',
                                                format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                            }
                                        }
                                    }
                                ],
                                should: [],
                                minimum_should_match: 0
                            }
                        }
                    };
                    
                    // Add URL filter for GoogleMyBusiness if applicable
                    if (googleUrls.length > 0) {
                        const urlShouldClauses = [];
                        
                        // Add u_source clauses
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({
                                term: { "u_source.keyword": url }
                            });
                        });
                        
                        // Add place_url clauses
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({
                                term: { "place_url.keyword": url }
                            });
                        });
                        
                        // Add should clause with minimum_should_match=1
                        queryTemplate.query.bool.must.push({
                            bool: {
                                should: urlShouldClauses,
                                minimum_should_match: 1
                            }
                        });
                    }
                    
                    // Add sentiment filter 
                    // queryTemplate.query.bool.must.push({
                    //     bool: {
                    //         should: [
                    //             { term: { "predicted_sentiment_value.keyword": "Positive" } },
                    //             { term: { "predicted_sentiment_value.keyword": "Negative" } },
                    //             { term: { "predicted_sentiment_value.keyword": "Neutral" } }
                    //         ],
                    //         minimum_should_match: 1
                    //     }
                    // });
                    
                    // Apply any additional filters from the filter processor
                    if (filters.sentimentFilter) {
                        queryTemplate.query.bool.must.push(filters.sentimentFilter);
                    }
                    
                    console.log("Query template:", JSON.stringify(queryTemplate, null, 2));
                    
                    // Execute the count query against Elasticsearch
                    const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: queryTemplate
                    });
                    source.count = result.count;
                })
            );

            const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0);

            // Construct response for sources
            let responseOutput = sources
                .filter(source => source.count > 0)
                .map(source => `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}`)
                .join('|');

            const channelSourceCount = responseOutput || '';

            return res.status(200).json({
                success: true,
                channelSourceCount,
                googleUrls: googleUrls.length
            });

        } catch (error) {
            console.error('Error fetching channel source data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

module.exports = channelSourceController;