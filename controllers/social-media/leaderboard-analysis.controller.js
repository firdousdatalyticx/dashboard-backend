const { elasticClient } = require('../../config/elasticsearch');
const processCategoryItems = require('../../helpers/processedCategoryItems');
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
            const { topicId,   source = "All",
        category = "all",
        fromDate,
        toDate,
        sentiment,
        llm_mention_type, } = req.body || {};
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ leaderboard: [] });
            }

            // Calculate date filter - for special topic, use wider range
            let dateFilter;
          
                // Calculate date 90 days ago
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                dateFilter = ninetyDaysAgo.toISOString();
            


                        let dateRange;
      if (fromDate == null && toDate == null) {
        dateRange = {
          gte: dateFilter,
        };
      } else {
        dateRange = {
          gte: fromDate,
          lte: toDate,
        };
      }
            // Define source filter based on source parameter
            let sourceFilter;
            if (source !== 'All') {
                sourceFilter = [
                    { match_phrase: { source: source } }
                ];
            } else {
                // Get available data sources from middleware
                const availableDataSources = req.processedDataSources || [];
                
                // Use middleware sources if available, otherwise use default sources
                const sourcesToUse = availableDataSources.length > 0 ? availableDataSources : [
                    "Facebook",
                    "Twitter", 
                    "Instagram",
                    "Youtube",
                    "Pinterest",
                    "Reddit",
                    "LinkedIn",
                    "Web",
                    "TikTok"
                ];

                sourceFilter = sourcesToUse.map(source => ({
                    match_phrase: { source: source }
                }));
            }

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
                                                p_created_time: dateRange
                                            }
                                        },
                                        {
                                            bool: {
                                                should: sourceFilter,
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
                                                field: 'p_created_time',
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

                         if (sentiment && sentiment!="" && sentiment !== 'undefined' && sentiment !== 'null') {
                if (sentiment.includes(',')) {
                    // Handle multiple sentiment types
                    const sentimentArray = sentiment.split(',');
                    const sentimentFilter = {
                        bool: {
                            should: sentimentArray.map(sentiment => ({
                                match: { predicted_sentiment_value: sentiment.trim() }
                            })),
                            minimum_should_match: 1
                        }
                    };
                    params.body.query.bool.must.push(sentimentFilter);
                } else {
                    // Handle single sentiment type
                    params.body.query.bool.must.push({
                        match: { predicted_sentiment_value: sentiment.trim() }
                    });
                }
            }

            // Apply LLM Mention Type filter if provided
                if (llm_mention_type && Array.isArray(llm_mention_type) && llm_mention_type.length > 0) {
                    const mentionTypeFilter = {
                        bool: {
                            should: llm_mention_type.map(type => ({
                                match: { llm_mention_type: type }
                            })),
                            minimum_should_match: 1
                        }
                    };
                     params.body.query.bool.must.push(mentionTypeFilter);
                }
            const result = await elasticClient.search(params);

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }
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
                        sampleReviews: data.sentiments.buckets
                            .reduce((acc, sentiment) => {
                                return [
                                    ...acc,
                                    ...sentiment.sample_reviews.hits.hits.map((review) => {
                                        const textFields = [
                                            review._source.p_message,
                                            review._source.p_message_text,
                                            review._source.keywords,
                                            review._source.title,
                                            review._source.hashtags,
                                            review._source.u_source,
                                            review._source.p_url,
                                            review._source.u_fullname
                                        ];
                                        return {
                                            ...review._source,
                                            relevanceScore: review._score,
                                            matched_terms: allFilterTerms.filter(term =>
                                                textFields.some(field => {
                                                    if (!field) return false;
                                                    if (Array.isArray(field)) {
                                                        return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                                                    }
                                                    return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                                                })
                                            )
                                        };
                                    })
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