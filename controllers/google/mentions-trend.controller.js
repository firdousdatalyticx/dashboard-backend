const { elasticClient } = require('../../config/elasticsearch');
const { formatSafeDate } = require('../../utils/date.utils');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');

const mentionsTrendController = {
    /**
     * Get Google mentions trend data
     */
    getMentionsTrend: async (req, res) => {
        try {
            const { topicId, isScadUser, greaterThanTime, lessThanTime, unTopic, sentimentType } = req.body;
            
            // Get Google URLs from middleware - similar to review-trends.controller.js
            const googleUrls = req.googleUrls || [];
            
            // If no Google URLs are provided and they're required, return empty data immediately
            // This ensures we don't show trends for all GoogleMyBusiness entries when no URLs are specified
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    mentionsGraphData: "",
                    maxMentionData: ",0",
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on",
                        urlFilters: [],
                        sentimentFilter: sentimentType || 'none'
                    }
                });
            }

            // Build topic query string
            let topicQueryString = ""

            // Process filters (including sentiment)
            const filters = processFilters({
                // sentimentType,
                fromDate: greaterThanTime,
                toDate: lessThanTime,
                queryString: topicQueryString
            });

            // Define aggregation for mention graph
            const aggsMentionGraph = {
                '2': {
                    date_histogram: { 
                        field: 'p_created_time', 
                        fixed_interval: '1d', 
                        min_doc_count: 0 
                    }
                }
            };

            // Handle unTopic case
            let queryTimeRange = {
                gte: filters.greaterThanTime || greaterThanTime || '2020-01-01',
                lte: filters.lessThanTime || lessThanTime || '2026-12-31'
            };

            if (unTopic === 'true') {
                queryTimeRange = {
                    gte: '2020-01-01',
                    lte: '2026-12-31'
                };
            }

            // Build query with Google source filter - restructured to use must array like review-trends
            const queryTemplate = {
                query: {
                    bool: {
                        must: [
                            {
                                match: {
                                    source: 'GoogleMyBusiness'
                                }
                            },
                            {
                                range: {
                                    p_created_time: {
                                        gte: queryTimeRange.gte,
                                        lte: queryTimeRange.lte,
                                        format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                    }
                                }
                            }
                        ]
                    }
                },
                aggs: aggsMentionGraph
            };
            
            // Add query string filter if available
            if (filters.queryString && filters.queryString.trim() !== "") {
                queryTemplate.query.bool.must.push({
                    query_string: {
                        query: filters.queryString
                    }
                });
            }

            
            // Always add Google URLs filter - this is now required as we're checking above
            const urlTerms = googleUrls.map(url => `"${url}"`).join(' OR ');
            queryTemplate.query.bool.must.push({
                bool: {
                    should: [
                        { query_string: { query: `u_source:(${urlTerms})` } },
                        { query_string: { query: `place_url:(${urlTerms})` } }
                    ],
                    minimum_should_match: 1
                }
            });
            
            // Add sentiment filter if needed
            if (sentimentType) {
                if (sentimentType === 'Positive') {
                    queryTemplate.query.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                } else if (sentimentType === 'Negative') {
                    queryTemplate.query.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                } else if (sentimentType === 'Neutral') {
                    queryTemplate.query.bool.must.push({ term: { rating: 3 } });
                } else {
                    // Extract sentiment from query string for other types
                    const sentimentMatch = filters.queryString.match(/AND\s+predicted_sentiment_value:\((.*?)\)/);
                    if (sentimentMatch && sentimentMatch[1]) {
                        queryTemplate.query.bool.must.push({
                            query_string: {
                                query: `predicted_sentiment_value:(${sentimentMatch[1]})`
                            }
                        });
                    }
                }
            }
                  // Add sentiment filter conditionally
                  if (sentimentType &&sentimentType!="") {
                    queryTemplate.query.bool.must.push({
                        term: {
                            "predicted_sentiment_value.keyword": sentimentType
                        }
                    });
                }
            

         

            // Log the query for debugging
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
            
            // Log the number of buckets for debuggin
            for (const bucket of buckets) {
                const docCount = bucket.doc_count;
                const keyAsString = new Date(bucket.key_as_string).toISOString().split('T')[0];

                if (docCount > maxMentions) {
                    maxMentions = docCount;
                    maxDate = keyAsString;
                }

                datesArray.push(`${keyAsString},${docCount}`);
            }

            // Sort dates in descending order
            datesArray.sort((a, b) => new Date(b.split(',')[0]) - new Date(a.split(',')[0]));
            
            // Check if we actually have any data
            const hasTrendData = datesArray.some(item => parseInt(item.split(',')[1]) > 0);

            return res.status(200).json({
                success: true,
                queryTemplate:queryTemplate,
                mentionsGraphData: hasTrendData ? datesArray.join('|') : "",
                maxMentionData: `${maxDate},${maxMentions}`,
                googleUrls: googleUrls.length,
                debug: {
                    urlFilters: googleUrls,
                    sentimentFilter: sentimentType || 'none',
                    hasTrendData: hasTrendData
                },
               
            });

        } catch (error) {
            console.error('Error fetching Google mentions trend data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = mentionsTrendController; 