const { elasticClient } = require('../../config/elasticsearch');

/**
 * Controller for Google word cloud data
 */
const wordCloudController = {
    /**
     * Get Google word cloud data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with word cloud data
     */
    getWordCloud: async (req, res) => {
        try {
            const { type, isAll, locations, u_source, location, phrase } = req.body;

            // Validate type parameter
            if (!type || (type !== 'positivegooglewordphrase' && type !== 'negativegooglewordphrase')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid type parameter. Must be either positivegooglewordphrase or negativegooglewordphrase'
                });
            }

            let sourceQuery;

            // Handle source query based on isAll parameter
            if (isAll === 'true') {
                if (!locations) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing locations parameter'
                    });
                }

                const locationsData = JSON.parse(decodeURIComponent(locations));
                const locationQueries = locationsData.map(loc => 
                    `(u_source:"${loc.u_source}" OR name:"${loc.location}" OR p_url:"${loc.u_source}")`
                );
                sourceQuery = `(${locationQueries.join(' OR ')})`;
            } else {
                if (!u_source) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing u_source parameter'
                    });
                }

                sourceQuery = `(u_source:"${u_source}" OR name:"${location}" OR p_url:"${u_source}")`;
            }

            // Set sentiment and LLM field based on type
            const sentiment = type === 'positivegooglewordphrase' ? 'Positive' : 'Negative';
            const llmField = type === 'positivegooglewordphrase' ? 'llm_positive_points' : 'llm_negative_points';

            // Build Elasticsearch query
            // NOTE: No date filter - fetch all available data for word cloud
            const params = {
                size: 5000,
                query: {
                    bool: {
                        must: [
                            {
                                query_string: {
                                    query: `${sourceQuery} AND predicted_sentiment_value:"${sentiment}" AND source:"GoogleMyBusiness" AND NOT manual_entry_type:("review")`
                                }
                            }
                        ]
                    }
                }
            };

            // Add phrase match if provided
            if (phrase) {
                params.query.bool.must.push({
                    match_phrase: {
                        [llmField]: phrase
                    }
                });
            }

            // Execute Elasticsearch query
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            const posts = response.hits?.hits || [];

            // Return different response based on whether phrase is provided
            if (phrase) {
                return res.status(200).json({
                    success: true,
                    posts: posts.map(hit => ({
                        id: hit._id,
                        p_message: hit._source?.p_message || '',
                        p_created_time: hit._source?.p_created_time || '',
                        predicted_sentiment_value: hit._source?.predicted_sentiment_value || '',
                        url: hit._source?.p_url || '',
                        p_likes: hit._source?.p_likes || 0,
                        p_comments: hit._source?.p_comments || 0,
                        p_shares: hit._source?.p_shares || 0,
                        llmField: hit._source?.[llmField] || []
                    }))
                });
            } else {
                // Return all phrases for word cloud
                const phrasesArray = posts.map(hit => hit._source[llmField] || []);
                const allPhrases = phrasesArray.flat();

                return res.status(200).json({
                    success: true,
                    phrases: allPhrases,
                    total: posts.length
                });
            }

        } catch (error) {
            console.error('Error fetching word cloud data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = wordCloudController; 