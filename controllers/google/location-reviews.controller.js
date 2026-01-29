const { elasticClient } = require('../../config/elasticsearch');

/**
 * Controller for handling Google location reviews
 * @module controllers/google/location-reviews
 */
const googleLocationReviewsController = {
    /**
     * Get reviews for a specific Google location by placeId
     * @async
     * @function getLocationReviews
     * @param {Object} req - Express request object
     * @param {Object} req.query - Query parameters
     * @param {string} req.query.placeId - Google Place ID
     * @param {string} [req.query.startDate] - Start date for filtering reviews (ISO format)
     * @param {string} [req.query.endDate] - End date for filtering reviews (ISO format)
     * @param {string} [req.query.rating] - Filter by specific rating (1-5)
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with reviews or error
     */
    getLocationReviews: async (req, res) => {
        try {
            const { placeId, startDate, endDate, rating } = req.query;
            
            // Validate required placeId
            if (!placeId) {
                return res.status(400).json({
                    success: false,
                    error: 'Place ID is required'
                });
            }

            // Build Elasticsearch query - fetch ALL reviews for the location
            // NOTE: Date filters are intentionally ignored to always show all available reviews
            const must = [
                {
                    term: {
                        'place_id.keyword': placeId
                    }
                },
                {
                    term: {
                        'source.keyword': 'GoogleMyBusiness'
                    }
                }
            ];
            
            // Add rating filter if specified
            if (rating) {
                const ratingValue = parseInt(rating, 10);
                must.push({
                    term: {
                        rating: ratingValue
                    }
                });
            }
            
            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 1000, // Get up to 1000 reviews
                    query: {
                        bool: {
                            must
                        }
                    },
                    sort: [
                        {
                            p_created_time: {
                                order: 'desc'
                            }
                        }
                    ],
                    _source: [
                        'p_message',
                        'rating',
                        'business_response',
                        'p_created_time',
                        'user_name',
                        'u_fullname',
                        'u_source',
                        'place_id',
                        'name'
                    ]
                }
            };
            
            console.log('Reviews query params:', JSON.stringify(params, null, 2));
            
            // Execute Elasticsearch query
            const results = await elasticClient.search(params);
            
            console.log('Total hits:', results.hits.total);
            
            // Format review data
            const reviews = results.hits.hits.map(hit => ({
                message_text: hit._source.p_message,
                rating: hit._source.rating,
                businessResponse: hit._source.business_response,
                createdAt: new Date(hit._source.p_created_time).toLocaleString(),
                userFullname: hit._source.user_name || hit._source.u_fullname || 'Anonymous',
                source: 'GoogleMyBusiness',
                uSource: hit._source.u_source,
                placeId: hit._source.place_id,
                locationName: hit._source.name
            }));
            
            // Add debug logging if no reviews found
            if (reviews.length === 0) {
                console.log('No reviews found for place ID:', placeId);
                console.log('Note: Fetching ALL reviews regardless of date');
            }
            
            return res.status(200).json({
                success: true,
                reviews,
                total: reviews.length,
                debug: {
                    totalHits: results.hits.total.value,
                    placeId,
                    note: 'Fetching all reviews regardless of date filters'
                }
            });
            
        } catch (error) {
            console.error('Error fetching Google location reviews:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message || 'Unknown error'
            });
        }
    }
};

module.exports = googleLocationReviewsController; 
