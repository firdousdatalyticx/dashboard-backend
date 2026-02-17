const { elasticClient } = require('../../config/elasticsearch');
const processCategoryItems = require('../../helpers/processedCategoryItems');
const normalizeSourceInput = (sourceParam) => {
    if (!sourceParam || sourceParam === 'All') {
        return [];
    }

    if (Array.isArray(sourceParam)) {
        return sourceParam
            .filter(Boolean)
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    if (typeof sourceParam === 'string') {
        return sourceParam
            .split(',')
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.toLowerCase() !== 'all');
    }

    return [];
};
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

function findMatchingCategoryKey(selectedCategory, categoryData = {}) {
    if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'custom' || selectedCategory === '') {
        return selectedCategory;
    }

    const normalizedSelectedRaw = String(selectedCategory || '');
    const normalizedSelected = normalizedSelectedRaw.toLowerCase().replace(/\s+/g, '');
    const categoryKeys = Object.keys(categoryData || {});

    if (categoryKeys.length === 0) {
        return null;
    }

    let matchedKey = categoryKeys.find(
        key => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
    );

    if (!matchedKey) {
        matchedKey = categoryKeys.find(
            key => key.toLowerCase().replace(/\s+/g, '') === normalizedSelected
        );
    }

    if (!matchedKey) {
        matchedKey = categoryKeys.find(key => {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
            return normalizedKey.includes(normalizedSelected) || normalizedSelected.includes(normalizedKey);
        });
    }

    return matchedKey || null;
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

            let workingCategory = category;
            // Only filter categoryData if category is not 'all', not empty, not 'custom' AND exists
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);

                if (matchedKey) {
                    // Category found - filter to only this category
                    categoryData = { [matchedKey]: categoryData[matchedKey] };
                    workingCategory = matchedKey;
                } else {
                    // Category not found - keep all categoryData and set workingCategory to 'all'
                    // This maintains existing functionality
                    workingCategory = 'all';
                }
            }

            // Calculate date filter - for special topic, use wider range
            let dateFilter;
          
                // Calculate date 90 days ago
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                dateFilter = ninetyDaysAgo.toISOString();
            


            // Calculate date range - default to 90 days if no dates provided (except for topic 2641)
            let dateRange;
            if (fromDate == null && toDate == null) {
                // Special case: topic 2641 gets ALL data, others get 90 days
                if (parseInt(topicId) === 2641) {
                    dateRange = null; // No date filter - fetch all data for topic 2641
                } else {
                    // Default to last 90 days for other topics
                    const now = new Date();
                    const ninetyDaysAgo = new Date(now);
                    ninetyDaysAgo.setDate(now.getDate() - 90);

                    dateRange = {
                        gte: ninetyDaysAgo.toISOString().split('T')[0], // YYYY-MM-DD format
                        lte: now.toISOString().split('T')[0]
                    };
                }
            } else {
                dateRange = {
                    gte: fromDate,
                    lte: toDate,
                };
            }
            const normalizedSources = normalizeSourceInput(source);
            // Define source filter based on special topic
            let sourceFilter = normalizedSources.length > 0
            ? normalizedSources.map(src => ({ match_phrase: { source: src } }))
            : parseInt(2646) || parseInt(2650)?
            [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            { match_phrase: { source: 'Twitter' } },
            { match_phrase: { source: 'Web' } },
            { match_phrase: { source: "Facebook" } },
            { match_phrase: { source: "Instagram" } },
            { match_phrase: { source: 'Youtube' } },
            ]
            
            :parseInt(topicId)==2619  || parseInt(topicId) === 2639 || parseInt(topicId) === 2640 ||parseInt(topicId) === 2647 ||parseInt(topicId) === 2648 || parseInt(topicId) === 2649 ?
             [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            ]:parseInt(topicId)==2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652 || parseInt(topicId) === 2653 || parseInt(topicId) === 2654 || parseInt(topicId) === 2655 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662 || parseInt(topicId) === 2663 ?
            [   { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                { match_phrase: { source: 'Instagram' } }] :parseInt(topicId)==2656 || parseInt(topicId) === 2657 ?
            [   { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                { match_phrase: { source: 'Instagram' } },
                { match_phrase: { source: 'Youtube' } }] 
            
            :isSpecialTopic ? [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } }
            ] : [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                { match_phrase: { source: 'Instagram' } },
                { match_phrase: { source: 'Youtube' } },
                { match_phrase: { source: 'Pinterest' } },
                { match_phrase: { source: 'Reddit' } },
                { match_phrase: { source: 'LinkedIn' } },
                 { match_phrase: { source: 'Linkedin' } },
                { match_phrase: { source: 'Web' } },
                { match_phrase: { source: 'TikTok' } }
            ];

            if(parseInt(topicId) === 2647 ||parseInt(topicId) === 2648 || parseInt(topicId) === 2649){
                sourceFilter= [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            ];
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

            // Add fallback category filter if needed (when category not found in database)
            let hasFallbackFilter = false;
            if(workingCategory=="all" && category!=="all"){
                hasFallbackFilter = true;
            }

            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                // Main category filter using valid categories
                                {
                                    bool: {
                                        should: validCategories.map(([categoryName, data]) => ({
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).flatMap(keyword => [
                                                        { match_phrase: { p_message_text: keyword } },
                                                        { match_phrase: { keywords: keyword } }
                                                    ]),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).flatMap(hashtag => [
                                                        { match_phrase: { p_message_text: hashtag } },
                                                        { match_phrase: { hashtags: hashtag } }
                                                    ]),
                                                    // URLs matching
                                                    ...(data.urls || []).flatMap(url => [
                                                        { match_phrase: { u_source: url } },
                                                        { match_phrase: { p_url: url } }
                                                    ])
                                                ],
                                                minimum_should_match: 1
                                            }
                                        })),
                                        minimum_should_match: 1
                                    }
                                },
                                // Fallback category filter when category not found in database
                                ...(hasFallbackFilter ? [{
                                    bool: {
                                        should: [{
                                            multi_match: {
                                                query: category,
                                                fields: [
                                                    'p_message_text',
                                                    'p_message',
                                                    'hashtags',
                                                    'u_source',
                                                    'p_url'
                                                ],
                                                type: 'phrase'
                                            }
                                        }],
                                        minimum_should_match: 1
                                    }
                                }] : [])
                            ],
                            filter: {
                                bool: {
                                    must: [
                                        // Only add date range filter if dateRange is not null
                                        ...(dateRange ? [{
                                            range: {
                                                p_created_time: dateRange
                                            }
                                        }] : []),
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
                                    hasFallbackFilter ?
                                        // When using fallback filter, only include the fallback category
                                        [[
                                            category, // Use the original category name as key
                                            {
                                                bool: {
                                                    should: [{
                                                        multi_match: {
                                                            query: category,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    }],
                                                    minimum_should_match: 1
                                                }
                                            }
                                        ]] :
                                        // Include valid categories when not using fallback
                                        validCategories.map(([categoryName, data]) => [
                                            categoryName,
                                            {
                                                bool: {
                                                    should: [
                                                        // Keywords matching
                                                        ...(data.keywords || []).flatMap(keyword => [
                                                            { match_phrase: { p_message_text: keyword } },
                                                            { match_phrase: { keywords: keyword } }
                                                        ]),
                                                        // Hashtags matching
                                                        ...(data.hashtags || []).flatMap(hashtag => [
                                                            { match_phrase: { p_message_text: hashtag } },
                                                            { match_phrase: { hashtags: hashtag } }
                                                        ]),
                                                        // URLs matching
                                                        ...(data.urls || []).flatMap(url => [
                                                            { match_phrase: { u_source: url } },
                                                            { match_phrase: { p_url: url } }
                                                        ])
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

            // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
            if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
              params.body.query.bool.must.push({
                term: { is_public_opinion: true }
              });
            }

            // Special filter for topicId 2651 - only fetch Healthcare results
            if (parseInt(topicId) === 2651) {
              params.body.query.bool.must.push({
                term: { "p_tag_cat.keyword": "Healthcare" }
              });
            }

            // Special filter for topicId 2652 - only fetch Food and Beverages results
            if (parseInt(topicId) === 2652 || parseInt(topicId) === 2663) {
              params.body.query.bool.must.push({
                term: { "p_tag_cat.keyword": "Food and Beverages" }
              });
            }

            // LLM Mention Type filtering logic
            let mentionTypesArray = [];

            if (llm_mention_type) {
              if (Array.isArray(llm_mention_type)) {
                mentionTypesArray = llm_mention_type;
              } else if (typeof llm_mention_type === "string") {
                mentionTypesArray = llm_mention_type.split(",").map(s => s.trim());
              }
            }

            // CASE 1: If mentionTypesArray has valid values → apply should-match filter
            if (mentionTypesArray.length > 0) {
              params.body.query.bool.must.push({
                bool: {
                  should: mentionTypesArray.map(type => ({
                    match: { llm_mention_type: type }
                  })),
                  minimum_should_match: 1
                }
              });
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
                                            ),
                                            p_id: review._source.p_id
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

            return res.json({ leaderboard,params });
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