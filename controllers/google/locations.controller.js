const { elasticClient } = require('../../config/elasticsearch');
const prisma = require('../../config/database');
const { processFilters } = require('../social-media/filter.utils');

/**
 * Controller for Google locations data
 */
const googleLocationsController = {
    /**
     * Get Google locations data for a specific topic
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with locations data
     */
    getGoogleLocations: async (req, res) => {
        try {
            const { topicId, greaterThanTime, lessThanTime, fromDate, toDate, sentimentType } = req.body;

            if (!topicId) {
                return res.status(400).json({
                    success: false,
                    error: 'Topic ID is required',
                    locations: []
                });
            }

            // Use greaterThanTime/lessThanTime for consistency with other Google controllers
            // Fall back to fromDate/toDate if greaterThanTime/lessThanTime not provided
            const startDate = greaterThanTime || fromDate;
            const endDate = lessThanTime || toDate;

            // Fetch topics and categories
            const customerTopics = await prisma.customer_topics.findMany({
                where: {
                    topic_id: Number(topicId),
                    topic_is_deleted: 'N',
                },
                select: {
                    topic_id: true,
                    topic_hash_tags: true,
                    topic_urls: true,
                    topic_keywords: true,
                }
            });

            // Extract Google URLs
            const googleUrls = [
                ...new Set(
                    customerTopics
                        .flatMap(t => t.topic_urls?.split('|') || [])
                        .filter(url => url !== null && url !== undefined && url.includes('google.com'))
                )
            ];

            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    locations: []
                });
            }

            // Process filters for sentiment and date range (if provided)
            const filters = processFilters({
                sentimentType,
                fromDate: startDate,
                toDate: endDate,
                queryString: ""
            });

            // Build Elasticsearch query
            const mustFilters = [
                {
                    terms: {
                        'u_source.keyword': googleUrls
                    }
                }
            ];

            // Add date range filter only if dates are provided
            if (startDate || endDate) {
                const dateFilter = {
                    range: {
                        p_created_time: {
                            ...(startDate && { gte: startDate }),
                            ...(endDate && { lte: endDate }),
                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                        }
                    }
                };
                mustFilters.push(dateFilter);
            }

            // Special filters for topicIds 2641, 2651, 2652
            if (parseInt(topicId) === 2641) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            } else if (parseInt(topicId) === 2651) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            } else if (parseInt(topicId) === 2652) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            }
            else if (parseInt(topicId) === 2653) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            }
            else if (parseInt(topicId) === 2654) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            }
            else if (parseInt(topicId) === 2655) {
                mustFilters.push({
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                lat: {
                                                    gte: 24.2,
                                                    lte: 24.8,
                                                },
                                            },
                                        },
                                        {
                                            range: {
                                                long: {
                                                    gte: 54.1,
                                                    lte: 54.8,
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        minimum_should_match: 1,
                    },
                });
            }

            const params = {
                size: 0,
                query: {
                    bool: {
                        must: mustFilters
                    }
                },
                aggs: {
                    unique_urls: {
                        terms: {
                            field: 'u_source.keyword',
                            size: 10000,
                            min_doc_count: 1
                        },
                        aggs: {
                            place_data: {
                                top_hits: {
                                    size: 1,
                                    _source: ['name', 'lat', 'long', 'place_id', 'u_source', 'rating', 'google_maps_category', 'google_maps_full_address']
                                }
                            },
                            rating_stats: {
                                stats: {
                                    field: 'rating'
                                }
                            },
                            recent_reviews: {
                                filter: startDate ? {
                                    range: {
                                        p_created_time: {
                                            gte: startDate,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                } : { match_all: {} },
                                aggs: {
                                    recent_count: {
                                        value_count: {
                                            field: 'rating'
                                        }
                                    },
                                    recent_avg: {
                                        avg: {
                                            field: 'rating'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // Add sentiment filter if provided
            if (sentimentType) {
                // The processFilters utility adds sentiment to queryString, we need to extract just the sentiment part
                const sentimentMatch = filters.queryString.match(/AND\s+predicted_sentiment_value:\((.*?)\)/);
                if (sentimentMatch && sentimentMatch[1]) {
                    params.query.bool.must.push({
                        query_string: {
                            query: `predicted_sentiment_value:(${sentimentMatch[1]})`
                        }
                    });
                }
            }

            // Execute Elasticsearch query
            const results = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Create a map of all Google URLs
            const locationMap = new Map(googleUrls.map(url => [url, {
                location: 'Unknown Location',
                latitude: null,
                longitude: null,
                placeId: url,
                u_source: url,
                avgRating: null,
                count: 0,
                stats: {
                    min: null,
                    max: null,
                    avg: null,
                    count: 0
                },
                recentStats: {
                    count: 0,
                    avgRating: null
                },
                google_maps_category: null,
                google_maps_full_address: null
            }]));

            // Update the map with any found place data
            const buckets = results.aggregations?.unique_urls?.buckets || [];
            buckets.forEach((bucket) => {
                const url = bucket.key;
                const placeData = bucket.place_data?.hits?.hits[0]?._source;
                const stats = bucket.rating_stats;
                const recentStats = bucket.recent_reviews;
                const recentCount = recentStats?.recent_count?.value || 0;

                if (locationMap.has(url)) {
                    const location = locationMap.get(url);

                    if (placeData) {
                        location.location = placeData.name || location.location;
                        location.latitude = placeData.lat || location.latitude;
                        location.longitude = placeData.long || location.longitude;
                        location.placeId = placeData.place_id || location.placeId;
                        location.u_source = placeData.u_source || location.u_source;
                        location.google_maps_category = placeData.google_maps_category || null;
                        location.google_maps_full_address = placeData.google_maps_full_address || null;
                    }

                    // Update statistics for this location
                    if (stats) {
                        location.avgRating = stats.count > 0 ? stats.avg : null;
                        location.count = stats.count;
                        location.stats = {
                            min: stats.count > 0 ? stats.min : null,
                            max: stats.count > 0 ? stats.max : null,
                            avg: stats.count > 0 ? stats.avg : null,
                            count: stats.count
                        };
                    }

                    if (recentStats) {
                        location.recentStats = {
                            count: recentCount,
                            avgRating: recentCount > 0 ? recentStats.recent_avg?.value : null
                        };
                    }
                }
            });

            // Convert map to array of locations, filtering out invalid data
            const locations = Array.from(locationMap.values()).filter(location => 
                // Only include locations that have valid data
                location.count > 0 && location.latitude !== null && location.longitude !== null
            );

            return res.status(200).json({
                success: true,
                locations
            });

        } catch (error) {
            console.error('Error fetching Google location data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                locations: []
            });
        }
    }
};

module.exports = googleLocationsController; 