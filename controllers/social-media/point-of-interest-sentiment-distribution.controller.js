const { elasticClient } = require('../../config/elasticsearch');

const poiSentimentDistributionController = {
    getDistribution: async (req, res) => {
        try {
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ distribution: [] });
            }

            // Calculate date 90 days ago
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const dateFilter = ninetyDaysAgo.toISOString();

            // Filter out categories with empty criteria
            const validCategories = Object.entries(categoryData).filter(([_, data]) => {
                const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
                const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
                const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
                return hasKeywords || hasHashtags || hasUrls;
            });

            // If no valid categories with search criteria, return empty results
            if (validCategories.length === 0) {
                return res.json({ distribution: [] });
            }

            // Build ElasticSearch query with only valid categories
            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                {
                                    bool: {
                                        should: validCategories.map(([categoryName, data]) => ({
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).map(keyword => ({
                                                        multi_match: {
                                                            query: keyword,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).map(hashtag => ({
                                                        multi_match: {
                                                            query: hashtag,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // URLs matching
                                                    ...(data.urls || []).map(url => ({
                                                        multi_match: {
                                                            query: url,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    }))
                                                ],
                                                minimum_should_match: 1
                                            }
                                        })),
                                        minimum_should_match: 1
                                    }
                                }
                            ],
                            filter: {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                created_at: {
                                                    gte: dateFilter
                                                }
                                            }
                                        },
                                        {
                                            bool: {
                                                should: [
                                                    { match_phrase: { source: 'Facebook' } },
                                                    { match_phrase: { source: 'Twitter' } },
                                                    { match_phrase: { source: 'Instagram' } },
                                                    { match_phrase: { source: 'Youtube' } },
                                                    { match_phrase: { source: 'Pinterest' } },
                                                    { match_phrase: { source: 'Reddit' } },
                                                    { match_phrase: { source: 'LinkedIn' } },
                                                    { match_phrase: { source: 'Web' } }
                                                ],
                                                minimum_should_match: 1
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    aggs: {
                        categories: {
                            filters: {
                                filters: Object.fromEntries(
                                    validCategories.map(([categoryName, data]) => [
                                        categoryName,
                                        {
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).map(keyword => ({
                                                        multi_match: {
                                                            query: keyword,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).map(hashtag => ({
                                                        multi_match: {
                                                            query: hashtag,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // URLs matching
                                                    ...(data.urls || []).map(url => ({
                                                        multi_match: {
                                                            query: url,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    }))
                                                ],
                                                minimum_should_match: 1
                                            }
                                        }
                                    ])
                                )
                            },
                            aggs: {
                                sentiments: {
                                    terms: {
                                        field: 'predicted_sentiment_value.keyword',
                                        size: 10
                                    },
                                    aggs: {
                                        docs: {
                                            top_hits: {
                                                _source: ['id', 'title', 'content', 'created_at', 'predicted_sentiment_value', 'p_message'],
                                                size: 100
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const result = await elasticClient.search(params);
            const distribution = Object.entries(result.aggregations?.categories?.buckets || {}).map(
                ([category, data]) => ({
                    poi: category,
                    sentiments: data.sentiments.buckets.map((b) => ({
                        sentiment: b.key,
                        count: b.doc_count,
                        docs: b.docs.hits.hits.map((doc) => doc._source)
                    }))
                })
            );

            return res.json({ distribution });
        } catch (error) {
            console.error('Error fetching POI sentiment distribution:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
};

module.exports = poiSentimentDistributionController; 