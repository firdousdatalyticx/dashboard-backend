const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { format } = require('date-fns');
const { processFilters } = require('../social-media/filter.utils');

/**
 * Helper function to format date safely
 */
const formatSafeDate = (date) => {
    if (!date) return format(new Date(), 'yyyy-MM-dd');
    const dateObj = new Date(date);
    return isNaN(dateObj.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(dateObj, 'yyyy-MM-dd');
};


/**
 * Controller for Google review ratings data
 */
const reviewRatingsController = {
    /**
     * Get Google review ratings data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with review ratings data
     */
    getReviewRatings: async (req, res) => {
        try {
            const { id, subtopicId, touchId, fromDate,toDate,filterData, filters, sentimentType } = req.body;

            
            // Get Google URLs from middleware
            const googleUrls = req.googleUrls || [];
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    esData: {
                        aggregations: {
                            rating_counts: {
                                buckets: []
                            }
                        },
                        hits: {
                            total: {
                                value: 0
                            },
                            hits: []
                        }
                    },
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }

            if (!id) {
                return res.status(400).json({ success: false, error: 'ID is required' });
            }

            const topicId = Number(id);
            if (isNaN(topicId)) {
                return res.status(400).json({ success: false, error: 'Invalid ID' });
            }

            let topicQueryString = '';
            let greaterThanTime = fromDate||process.env.DATA_FETCH_FROM_TIME;
            let lessThanTime = toDate||process.env.DATA_FETCH_TO_TIME;

            // Start with source filter for GoogleMyBusiness
            topicQueryString = 'source:(GoogleMyBusiness)';
            
            // Parse filter data if provided
            let filtersDat = null;
            if (filterData && filters === 'true') {
                try {
                    const decodedFilterData = decodeURIComponent(filterData);
                    filtersDat = JSON.parse(decodedFilterData);

                    // Handle time filters
                    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
                        if (filtersDat?.startDate && filtersDat?.startDate !== '') {
                            greaterThanTime = formatSafeDate(new Date(filtersDat?.startDate));
                        } else {
                            greaterThanTime = formatSafeDate(new Date(new Date().setDate(new Date().getDate() - 90)));
                        }

                        if (filtersDat?.endDate && filtersDat?.endDate !== '') {
                            lessThanTime = formatSafeDate(new Date(filtersDat?.endDate));
                        } else {
                            lessThanTime = formatSafeDate(new Date());
                        }
                    } else if (filtersDat?.timeSlot) {
                        switch (filtersDat?.timeSlot) {
                            case 'today':
                                greaterThanTime = formatSafeDate(new Date());
                                lessThanTime = formatSafeDate(new Date());
                                break;
                            case '24h':
                                greaterThanTime = formatSafeDate(new Date(new Date().setHours(new Date().getHours() - 24)));
                                lessThanTime = formatSafeDate(new Date());
                                break;
                            default:
                                greaterThanTime = formatSafeDate(
                                    new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot)))
                                );
                                lessThanTime = formatSafeDate(new Date());
                        }
                    }

                    // Handle tags filter
                    if (filtersDat?.tags && filtersDat?.tags !== '') {
                        let tagsStr = filtersDat?.tags;
                        let tagsArray = tagsStr.split(',');
                        let topicUrls = '', topicKeyHash = '';

                        tagsArray.forEach(tag => {
                            if (tag) {
                                if (tag.startsWith('http')) {
                                    topicUrls += `"${tag}" ${filtersDat?.operator || 'OR'} `;
                                } else {
                                    topicKeyHash += `"${tag}" ${filtersDat?.operator || 'OR'} `;
                                }
                            }
                        });

                        if (filtersDat?.operator === 'OR') {
                            topicKeyHash = topicKeyHash.slice(0, -4);
                            topicUrls = topicUrls.slice(0, -4);
                        } else {
                            topicKeyHash = topicKeyHash.slice(0, -5);
                            topicUrls = topicUrls.slice(0, -5);
                        }

                        // Override the base query with tags filter
                        if (topicKeyHash && topicUrls) {
                            topicQueryString += ` AND (p_message_text:(${topicKeyHash} OR ${topicUrls}) OR u_username:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}) OR u_source:(${topicUrls}))`;
                        } else if (topicKeyHash && !topicUrls) {
                            topicQueryString += ` AND (p_message_text:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}))`;
                        } else if (!topicKeyHash && topicUrls) {
                            topicQueryString += ` AND u_source:(${topicUrls})`;
                        }
                    }

                    // Add sentiment filter
                    if (filtersDat?.sentimentType && filtersDat?.sentimentType !== 'null') {
                        let sentiArray = filtersDat?.sentimentType.split(',');
                        let sentiStr = sentiArray.map(s => `"${s}"`).join(' OR ');
                        topicQueryString += ` AND predicted_sentiment_value:(${sentiStr})`;
                    }

                    // Add data source filter
                    if (filtersDat?.dataSource && filtersDat?.dataSource !== 'null' && filtersDat?.dataSource !== '') {
                        let dsourceArray = filtersDat?.dataSource.split(',');
                        let dsourceStr = dsourceArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND source:(${dsourceStr})`;
                    }

                    // Add location filter
                    if (filtersDat?.location && filtersDat?.location !== 'null' && filtersDat?.location !== '') {
                        let dlocArray = filtersDat?.location.split(',');
                        let dlocStr = dlocArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND u_country:(${dlocStr})`;
                    }

                    // Add language filter
                    if (filtersDat?.language && filtersDat?.language !== 'null' && filtersDat?.language !== '') {
                        let dlangArray = filtersDat?.language.split(',');
                        let dlangStr = dlangArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND lange_detect:(${dlangStr})`;
                    }
                } catch (error) {
                    console.error('Error parsing filter data:', error);
                }
            }

            // Process sentimentType
            if (sentimentType) {
                const filters = processFilters({
                    sentimentType,
                    queryString: topicQueryString
                });
                topicQueryString = filters.queryString;
            }

            // Format dates for query
            if (greaterThanTime && !greaterThanTime.includes('T') && !greaterThanTime.includes('now')) {
                greaterThanTime = `${greaterThanTime}T00:00:00`;
            }
            if (lessThanTime && !lessThanTime.includes('T') && !lessThanTime.includes('now')) {
                lessThanTime = `${lessThanTime}T23:59:59`;
            }

            const query = {
                size: 1000,
                _source: [
                    'rating',
                    'p_created_time',
                    'p_message_text',
                    'u_username',
                    'u_fullname',
                    'u_source',
                    'predicted_sentiment_value',
                    'place_url'
                ],
                query: {
                    bool: {
                        must: [
                            { query_string: { query: topicQueryString, default_operator: "AND" } },
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
                },
                aggs: {
                    rating_counts: {
                        terms: {
                            field: "rating",
                            size: 6
                        },
                        aggs: {
                            missing_rating: {
                                missing: {
                                    field: "rating"
                                }
                            }
                        }
                    }
                }
            };
            
            // Add Google URLs filter
            if (googleUrls.length > 0) {
                const urlTerms = googleUrls.map(url => `"${url}"`).join(' OR ');
                query.query.bool.must.push({
                    bool: {
                        should: [
                            { query_string: { query: `u_source:(${urlTerms})` } },
                            { query_string: { query: `place_url:(${urlTerms})` } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }

            

            const esData = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: query,
                timeout: '30s'
            });

            return res.status(200).json({
                success: true,
                esData,
                googleUrls: googleUrls.length,
            });

        } catch (error) {
            console.error('Error fetching review ratings data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = reviewRatingsController;
