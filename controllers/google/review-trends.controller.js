const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('../social-media/filter.utils');

/**
 * Controller for Google review trends data
 */
const googleReviewTrendsController = {
    /**
     * Get review trends data over time
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with review trends data
     */
    getReviewTrends: async (req, res) => {
        try {
            const { startDate, endDate, placeId, sentimentType, topicId } = req.body;

            // Get Google URLs from middleware
            const googleUrls = req.googleUrls || [];
            
            
            // Log available Google URLs
            console.log(`Google URLs from middleware: ${googleUrls.length > 0 ? googleUrls.join(', ') : 'None'}`);
            
            // Build base query string for filters processing
            let topicQueryString = '';
            
            // Process filters for sentiment
            const filters = processFilters({
                // sentimentType,
                // fromDate: startDate,
                // toDate: endDate,
                queryString: topicQueryString || ""
            });
            
            // Default date range if not provided
            let greaterThanTime = startDate || 'now-90d/d';
            let lessThanTime = endDate || 'now/d';

            // Format date ranges 
            if (greaterThanTime && greaterThanTime.includes('-') && !greaterThanTime.includes('T') && !greaterThanTime.includes('now')) {
                greaterThanTime = `${greaterThanTime}T00:00:00`;
            }
            if (lessThanTime && lessThanTime.includes('-') && !lessThanTime.includes('T') && !lessThanTime.includes('now')) {
                lessThanTime = `${lessThanTime}T23:59:59`;
            }

            console.log(`Review trends using date range: ${greaterThanTime} to ${lessThanTime}`);
            console.log(`Filtering by placeId: ${placeId || 'No placeId provided'}`);
            console.log(`Sentiment filter: ${sentimentType || 'None'}`);

            // Build must conditions for the query
            const mustConditions = [
                {
                    term: {
                        "source.keyword": "GoogleMyBusiness"
                    }
                },
                {
                    range: {
                        p_created_time: {
                            gte: greaterThanTime,
                            lte: lessThanTime,
                            format: "strict_date_optional_time||epoch_millis||yyyy-MM-dd'T'HH:mm:ss"

                        }
                    }
                }
            ];

                // Add sentiment filter conditionally
                if (sentimentType &&sentimentType!="") {
                    mustConditions.push({
                        term: {
                            "predicted_sentiment_value.keyword": sentimentType
                        }
                    });
                }

            // If Google URLs are available from middleware, use them
            if (googleUrls && googleUrls.length > 0) {
                // Create should clauses for URL matching
                const urlShouldClauses = [];
                
                // For each URL, add term queries for both potential fields
                googleUrls.forEach(url => {
                    urlShouldClauses.push(
                        { term: { "u_source.keyword": url } },
                        { term: { "place_url.keyword": url } }
                    );
                });
                
                // Add the URL conditions to the must array
                mustConditions.push({
                    bool: {
                        should: urlShouldClauses,
                        minimum_should_match: 1
                    }
                });
                
            }
            // If placeId is provided directly, add a filter for it
            else if (placeId) {
                mustConditions.push({
                    term: {
                        "place_id.keyword": placeId
                    }
                });
            }
            
            // Add sentiment filter if provided
            if (sentimentType) {
                // Handle sentiment filtering
                if (sentimentType === 'Positive') {
                    mustConditions.push({ range: { rating: { gte: 4, lte: 5 } } });
                } else if (sentimentType === 'Negative') {
                    mustConditions.push({ range: { rating: { gte: 1, lte: 2 } } });
                } else if (sentimentType === 'Neutral') {
                    mustConditions.push({ term: { rating: 3 } });
                } else if (sentimentType.includes(',')) {
                    // Handle multiple sentiment values
                    const sentimentValues = sentimentType.split(',').map(s => s.trim());
                    const sentimentFilter = {
                        bool: {
                            should: []
                        }
                    };
                    
                    sentimentValues.forEach(sentiment => {
                        if (sentiment === 'Positive') {
                            sentimentFilter.bool.should.push({ range: { rating: { gte: 4, lte: 5 } } });
                        } else if (sentiment === 'Negative') {
                            sentimentFilter.bool.should.push({ range: { rating: { gte: 1, lte: 2 } } });
                        } else if (sentiment === 'Neutral') {
                            sentimentFilter.bool.should.push({ term: { rating: 3 } });
                        } else {
                            // For other custom sentiment values
                            sentimentFilter.bool.should.push({
                                term: { "predicted_sentiment_value.keyword": sentiment }
                            });
                        }
                    });
                    
                    sentimentFilter.bool.minimum_should_match = 1;
                    mustConditions.push(sentimentFilter);
                }
            }
            
            // Add topic query string if it exists and is not empty
            if (filters.queryString && filters.queryString.trim() !== "") {
                mustConditions.push({
                    query_string: {
                        query: filters.queryString
                    }
                });
            }

          

            // Build Elasticsearch query
            const params = {
                size: 0,
                track_total_hits: true,
                query: {
                    bool: {
                        must: mustConditions
                    }
                },
                aggs: {
                    ratings_over_time: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: 'month',
                            format: 'yyyy-MM',
                            min_doc_count: 0,
                            extended_bounds: {
                                min: greaterThanTime &&  !greaterThanTime.includes('now')?greaterThanTime.slice(0, 7):greaterThanTime,
                                max: lessThanTime  && !lessThanTime.includes('now')?lessThanTime.slice(0, 7):lessThanTime
                            }
                        },
                        aggs: {
                            rating_stats: {
                                terms: {
                                    field: 'rating',
                                    size: 10,
                                    missing: 0
                                }
                            }
                        }
                    },
                    // Also add day-level aggregation
                    reviews_by_day: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: 'day',
                            format: 'yyyy-MM-dd',
                            min_doc_count: 0,
                            extended_bounds: {
                                min: greaterThanTime &&  !greaterThanTime.includes('now')?greaterThanTime.slice(0, 10):greaterThanTime,
                                max: lessThanTime  && !lessThanTime.includes('now')?lessThanTime.slice(0, 10):lessThanTime
                            }
                        },
                        aggs: {
                            rating_stats: {
                                terms: {
                                    field: 'rating',
                                    size: 10,
                                    missing: 0
                                }
                            }
                        }
                    }
                }
            };
            
            console.log('Query params:', JSON.stringify(params.query, null, 2));
            
            // Execute Elasticsearch query
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Process the response data
            const processedData = response.aggregations.ratings_over_time.buckets.map((bucket) => {
                const ratingBuckets = bucket.rating_stats.buckets;
                const result = {
                    date: bucket.key_as_string,
                    rating_1: 0,
                    rating_2: 0,
                    rating_3: 0,
                    rating_4: 0,
                    rating_5: 0,
                    total: 0
                };

                ratingBuckets.forEach((b) => {
                    const rating = Math.round(b.key); // Round to nearest integer
                    if (rating >= 1 && rating <= 5) {
                        result[`rating_${rating}`] = b.doc_count;
                        result.total += b.doc_count;
                    }
                });

                return result;
            });

            // Process the daily data for more precise day-by-day counts
            const dailyData = response.aggregations.reviews_by_day.buckets.map((bucket) => {
                const ratingBuckets = bucket.rating_stats.buckets;
                const result = {
                    date: bucket.key_as_string,
                    rating_1: 0,
                    rating_2: 0,
                    rating_3: 0,
                    rating_4: 0,
                    rating_5: 0,
                    total: 0
                };

                ratingBuckets.forEach((b) => {
                    const rating = Math.round(b.key); // Round to nearest integer
                    if (rating >= 1 && rating <= 5) {
                        result[`rating_${rating}`] = b.doc_count;
                        result.total += b.doc_count;
                    }
                });

                return result;
            });

            // Generate daily graph data string
            const daysWithData = dailyData.filter(day => day.total > 0);
            const dailyGraphData = daysWithData.map(item => `${item.date},${item.total}`).join('|');

            // Monthly trend data
            const mentionsGraphData = processedData.map(item => `${item.date},${item.total}`).join('|');
            
            // Find the maximum point
            let maxDate = '';
            let maxCount = 0;
            processedData.forEach(item => {
                if (item.total > maxCount) {
                    maxCount = item.total;
                    maxDate = item.date;
                }
            });

            return res.status(200).json({
                success: true,
                data: processedData,
                total: processedData.length,
                mentionsGraphData,
                maxMentionData: `${maxDate},${maxCount}`,
                dailyGraphData,
                daysWithData: daysWithData.map(day => ({
                    date: day.date,
                    count: day.total
                })),
                debug: {
                    dateRange: {
                        startDate: greaterThanTime,
                        endDate: lessThanTime
                    },
                    placeId: placeId || null,
                    sentimentFilter: sentimentType || 'none',
                    googleUrlsCount: googleUrls.length,
                    topicId: topicId || null
                }
            });

        } catch (error) {
            console.error('Error fetching review trends data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

module.exports = googleReviewTrendsController; 