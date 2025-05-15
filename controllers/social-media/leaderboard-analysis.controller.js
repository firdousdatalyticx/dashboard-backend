const { elasticClient } = require('../../config/elasticsearch');

// Helper function to merge trend arrays by date
function mergeArraysByDate(arr1, arr2) {
    const mergedMap = new Map();

    [...arr1, ...arr2].forEach(item => {
        const date = item.date;
        if (mergedMap.has(date)) {
            mergedMap.set(date, {
                date,
                count: mergedMap.get(date).count + item.count
            });
        } else {
            mergedMap.set(date, item);
        }
    });

    return Array.from(mergedMap.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

const leaderboardAnalysisController = {
    getLeaderboardAnalysis: async (req, res) => {
        try {
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({ leaderboard: [] });
            }

            // Calculate date 90 days ago
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const dateFilter = ninetyDaysAgo.toISOString();

            // Split categories into valid and empty ones
            const allCategories = Object.entries(categoryData);
            const validCategories = allCategories.filter(([_, data]) => {
                const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
                const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
                const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
                return hasKeywords || hasHashtags || hasUrls;
            });

            // Store empty categories to add to results later
            const emptyCategories = allCategories.filter(
                ([categoryName]) => !validCategories.some(([validName]) => validName === categoryName)
            );

            // If no valid categories with search criteria, return all categories with zero values
            if (validCategories.length === 0) {
                const emptyLeaderboard = Object.keys(categoryData).map(category => ({
                    poi: category,
                    averageScore: 0,
                    relevanceScore: 0,
                    totalMentions: 0,
                    topThemes: [],
                    trends: [],
                    sampleReviews: []
                }));
                return res.json({ leaderboard: emptyLeaderboard });
            }

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
                                average_polarity: {
                                    avg: {
                                        field: 'llm_polarity'
                                    }
                                },
                                average_relevance: {
                                    avg: {
                                        script: {
                                            source: '_score'
                                        }
                                    }
                                },
                                sentiments: {
                                    terms: {
                                        field: 'predicted_sentiment_value.keyword',
                                        size: 10
                                    },
                                    aggs: {
                                        themes: {
                                            terms: {
                                                field: 'keywords.keyword',
                                                size: 5
                                            }
                                        },
                                        trends: {
                                            date_histogram: {
                                                field: 'created_at',
                                                calendar_interval: 'day',
                                                min_doc_count: 1
                                            }
                                        },
                                        sample_reviews: {
                                            top_hits: {
                                                size: 5,
                                                _source: ['p_message', 'created_at', 'predicted_sentiment_value', 'keywords'],
                                                sort: [{ _score: 'desc' }]
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

            let leaderboard = Object.entries(result.aggregations?.categories?.buckets || {}).map(
                ([category, data]) => {
                    const sentiments = data.sentiments.buckets;
                    const totalCount = sentiments.reduce((sum, sentiment) => sum + sentiment.doc_count, 0);

                    // Calculate average sentiment score
                    const sentimentScores = {
                        Positive: 1,
                        Neutral: 0,
                        Negative: -1
                    };
                    const averageScore =
                        totalCount > 0
                            ? sentiments.reduce((acc, sentiment) => {
                                return acc + (sentimentScores[sentiment.key] || 0) * sentiment.doc_count;
                            }, 0) / totalCount
                            : 0;

                    return {
                        poi: category,
                        averageScore,
                        relevanceScore: data.average_relevance.value || 0,
                        totalMentions: totalCount,
                        topThemes: data.sentiments.buckets
                            .reduce((acc, sentiment) => {
                                return [
                                    ...acc,
                                    ...sentiment.themes.buckets.map((theme) => ({
                                        theme: theme.key,
                                        count: theme.doc_count
                                    }))
                                ];
                            }, [])
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 5),
                        trends: data.sentiments.buckets.reduce((acc, sentiment) => {
                            const trends = sentiment.trends.buckets.map((trend) => ({
                                date: trend.key_as_string,
                                count: trend.doc_count
                            }));
                            return mergeArraysByDate(acc, trends);
                        }, []),
                        sampleReviews: data.sentiments.buckets.reduce((acc, sentiment) => {
                            return [
                                ...acc,
                                ...sentiment.sample_reviews.hits.hits.map((review) => ({
                                    message: review._source.p_message,
                                    date: review._source.created_at,
                                    sentiment: review._source.predicted_sentiment_value,
                                    keywords: review._source.keywords,
                                    relevanceScore: review._score
                                }))
                            ];
                        }, [])
                    };
                }
            );

            // Add empty categories to the leaderboard
            const emptyEntries = emptyCategories.map(([categoryName]) => ({
                poi: categoryName,
                averageScore: 0,
                relevanceScore: 0,
                totalMentions: 0,
                topThemes: [],
                trends: [],
                sampleReviews: []
            }));

            leaderboard = [...leaderboard, ...emptyEntries];

            // Sort the final leaderboard
            leaderboard.sort((a, b) => b.totalMentions - a.totalMentions);

            return res.json({ leaderboard });
        } catch (error) {
            console.error('Error fetching POI sentiment leaderboard:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
};

module.exports = leaderboardAnalysisController; 