const prisma = require('../../config/database');
const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');
// Cap the number of posts we attach per theme in the word cloud to keep
// processing and payload light without changing the response structure
const WORDCLOUD_POSTS_CAP = 20;

/**
 * Find matching category key with flexible matching
 * @param {string} selectedCategory - Category to find
 * @param {Object} categoryData - Category data object
 * @returns {string|null} Matched category key or null
 */
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

const trustDimensionsController = {
    /**
     * Get trust dimensions analysis data for social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with trust dimensions counts by category and tone
     */
    getTrustDimensionsAnalysis: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data from middleware
            let categoryData = {};

            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: true,
                    trustDimensions: [],
                    totalCount: 0
                });
            }

            let workingCategory = category;
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
                if (!matchedKey) {
                    return res.json({ success: false, error: 'Category not found', trustDimensions: [], totalCount: 0 });
                }
                categoryData = { [matchedKey]: categoryData[matchedKey] };
                workingCategory = matchedKey;
            }

            // Set date range - for special topic, don't use default 90 days restriction
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
       
                // Original logic with 90 days default if not provided
                if (!greaterThanTime || !lessThanTime) {
                    const ninetyDaysAgo = subDays(now, 90);
                    effectiveGreaterThanTime = greaterThanTime || format(ninetyDaysAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
                } else {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
                }
            

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, source, isSpecialTopic, parseInt(topicId));

            // Add sentiment filter if provided
            if (sentiment) {
                if (sentiment.toLowerCase() === "all") {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: "Positive" } },
                                { match: { predicted_sentiment_value: "positive" } },
                                { match: { predicted_sentiment_value: "Negative" } },
                                { match: { predicted_sentiment_value: "negative" } },
                                { match: { predicted_sentiment_value: "Neutral" } },
                                { match: { predicted_sentiment_value: "neutral" } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                } else if (sentiment !== "All") {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: sentiment } },
                                { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                                { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                }
            }

            // Add category filters
            addCategoryFilters(query, workingCategory, categoryData);

            // Add filter to only include posts with trust_dimensions field
            query.bool.must.push({
                exists: {
                    field: 'trust_dimensions'
                }
            });

            // Aggregation approach on array field trust_dimensions.keyword; counts only
            const AGG_SIZE = 300; // number of distinct dimensions to consider
            const params = {
                size: 0,
                query: query,
                aggs: {
                    dimensions: {
                        terms: { field: 'trust_dimensions.keyword', size: AGG_SIZE, order: { _count: 'desc' } },
                        aggs: {
                            emotions: { terms: { field: 'llm_emotion.keyword', size: 50 } }
                        }
                    }
                },
                track_total_hits: false,
                timeout: '10s'
            };

            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Build result from aggregations (counts only)
            const buckets = response.aggregations?.dimensions?.buckets || [];
            const trustDimensionsArray = buckets.map(b => {
                const category = typeof b.key === 'string' ? b.key.trim() : '';
                if (!category) { return null; }
                const tones = (b.emotions?.buckets || []).map(tb => ({
                    name: tb.key,
                    count: tb.doc_count || 0,
                    percentage: b.doc_count > 0 ? Math.round((tb.doc_count / b.doc_count) * 100) : 0
                }));
                return {
                    category,
                    totalCount: b.doc_count || 0,
                    tones
                };
            }).filter(Boolean).sort((a, b) => b.totalCount - a.totalCount);

            const totalCount = trustDimensionsArray.reduce((sum, d) => sum + d.totalCount, 0);

            return res.json({
                success: true,
                trustDimensions: trustDimensionsArray,
                totalCount,
                query: params
            });

        } catch (error) {
            console.error('Error fetching trust dimensions analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },
    getTrustDimensionsAnalysisWordClouds: async (req, res) => {
    try {
        const {
            interval = 'monthly',
            source = 'All',
            category = 'all',
            timeSlot,
            fromDate,
            toDate,
            sentiment
        } = req.body;
        // Get category data from middleware
        let categoryData = {};

        if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
          categoryData = processCategoryItems(req.body.categoryItems);
        } else {
          // Fall back to middleware data
          categoryData = req.processedCategories || {};
        }

        if (Object.keys(categoryData).length === 0) {
            return res.json({
                success: true,
                trustDimensions: [],
                totalTrustPosts: 0
            });
        }

        let workingCategory = category;
        if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
            const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
            if (!matchedKey) {
                return res.json({ success: false, error: 'Category not found', trustDimensions: [], totalTrustPosts: 0 });
            }
            categoryData = { [matchedKey]: categoryData[matchedKey] };
            workingCategory = matchedKey;
        }

        // Handle date range based on timeSlot
        const now = new Date();
        let startDate;
        let endDate = now;
        let useTimeFilter = true;

        // Only apply date filter if timeSlot is provided
        if (!timeSlot && !fromDate && !toDate) {
            useTimeFilter = false;
        } else if (timeSlot === 'Custom date' && fromDate && toDate) {
            startDate = parseISO(fromDate);
            endDate = parseISO(toDate);
        } else if (timeSlot) {
            // Handle predefined time slots
            switch (timeSlot) {
                case 'last24hours':
                    startDate = subDays(now, 1);
                    break;
                case 'last7days':
                    startDate = subDays(now, 7);
                    break;
                case 'last30days':
                    startDate = subDays(now, 30);
                    break;
                case 'last60days':
                    startDate = subDays(now, 60);
                    break;
                case 'last120days':
                    startDate = subDays(now, 120);
                    break;
                case 'last90days':
                    startDate = subDays(now, 90);
                    break;
                default:
                    useTimeFilter = false;
                    break;
            }
        } else {
            useTimeFilter = false;
        }
        
        const greaterThanTime = useTimeFilter ? format(startDate, 'yyyy-MM-dd') : null;
        const lessThanTime = useTimeFilter ? format(endDate, 'yyyy-MM-dd') : null;

        // Build base query
        const query = {
            bool: {
                must: [
                    {
                        exists: {
                            field: 'trust_dimensions'
                        }
                    }
                ],
                 must_not: [
               { term: { "theme_evidences.keyword": "" } },
               { term: { "theme_evidences.keyword": "{}" } },
                 ]
            }
        };
        // Add sentiment filter if provided
        if (sentiment) {
            if (sentiment.toLowerCase() === "all") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: "Positive" } },
                            { match: { predicted_sentiment_value: "positive" } },
                            { match: { predicted_sentiment_value: "Negative" } },
                            { match: { predicted_sentiment_value: "negative" } },
                            { match: { predicted_sentiment_value: "Neutral" } },
                            { match: { predicted_sentiment_value: "neutral" } }
                        ],
                        minimum_should_match: 1
                    }
                });
            } else if (sentiment !== "All") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: sentiment } },
                            { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                            { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }
        }

        // Only add date range filter if timeSlot is provided
        if (useTimeFilter) {
            query.bool.must.push({
                range: {
                    p_created_time: {
                        gte: `${greaterThanTime}T00:00:00.000Z`,
                        lte: `${lessThanTime}T23:59:59.999Z`
                    }
                }
            });
        }

        // Add category filters
        if (category === 'all') {
            query.bool.must.push({
                bool: {
                    should: [
                        ...Object.values(categoryData).flatMap(data =>
                            (data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        )
                    ],
                    minimum_should_match: 1
                }
            });
        } else if (categoryData[workingCategory]) {
            const data = categoryData[workingCategory];

            // Check if the category has any filtering criteria
            const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
            const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
            const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

            // Only add the filter if there's at least one criteria
            if (hasKeywords || hasHashtags || hasUrls) {
                query.bool.must.push({
                    bool: {
                        should: [
                            ...(data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ]),
                            ...(data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ]),
                            ...(data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        ],
                        minimum_should_match: 1
                    }
                });
            } else {
                // If the category has no filtering criteria, add a condition that will match nothing
                query.bool.must.push({
                    bool: {
                        must_not: {
                            match_all: {}
                        }
                    }
                });
            }
        }

        // Aggregation-based word cloud
        const params = {
            size: 0,
            query,
            aggs: {
                themes: {
                    terms: { field: 'theme_evidences.keyword', size: 300, order: { _count: 'desc' } },
                    aggs: {
                        tone: { terms: { field: 'trust_dimensions.keyword', size: 1 } },
                        posts: {
                            top_hits: {
                                size: WORDCLOUD_POSTS_CAP,
                                sort: [{ p_created_time: { order: 'desc' } }],
                                // _source: [
                                //     'trust_dimensions', 'theme_evidences', 'created_at', 'p_created_time',
                                //     'source', 'p_message', 'p_message_text', 'u_profile_photo', 'u_fullname', 'p_url',
                                //     'p_id', 'p_picture', 'p_picture_url', 'predicted_sentiment_value', 'predicted_category',
                                // ]
                            }
                        }
                    }
                }
            }
        };

        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
            track_total_hits: false,
            timeout: '10s'
        });

        const toneColors = {
            Supportive: '#52C41A',
            Distrustful: '#FF4D4F',
            Neutral: '#1890FF',
            Mixed: '#FAAD14',
            'Not Applicable': '#8C8C8C',
        };

        const extractTone = (raw) => {
            if (!raw || typeof raw !== 'string') return 'Not Applicable';
            const trimmed = raw.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const obj = JSON.parse(trimmed);
                    const vals = Object.values(obj);
                    return vals.length > 0 ? String(vals[0]).trim() : 'Not Applicable';
                } catch (_) {
                    return 'Not Applicable';
                }
            }
            return 'Not Applicable';
        };

        const themeBuckets = response.aggregations?.themes?.buckets || [];
        const trustDimensions = [];
        const dimensionsByTone = {};
        const toneTotals = {};

        for (const b of themeBuckets) {
            const text = b.key;
            const value = b.doc_count;
            const toneBucket = b.tone?.buckets?.[0];
            const tone = extractTone(toneBucket?.key);
            const color = toneColors[tone] || '#8C8C8C';
            // const postsHits = b.posts?.hits?.hits || [];
            const posts =[]
            //  postsHits.map((h) => formatPostData(h));

            trustDimensions.push({ text, value, tone, color, posts });
            if (!dimensionsByTone[tone]) dimensionsByTone[tone] = [];
            dimensionsByTone[tone].push({ text, value, posts });
            toneTotals[tone] = (toneTotals[tone] || 0) + value;
        }

        return res.json({
            success: true,
            // trustDimensions,
            toneTotals,
            dimensionsByTone,
            dateRange: useTimeFilter ? { from: greaterThanTime, to: lessThanTime } : null,
        });

} catch (error) {
        console.error('Error fetching trust dimensions analysis data:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
},
// Separate controller for fetching posts when user clicks on word cloud items
getTrustDimensionsWordCloudPosts: async (req, res) => {
    try {
        const {
            text, // The word cloud text that was clicked
            tone, // The tone of the clicked item
            interval = 'monthly',
            source = 'All',
            category = 'all',
            timeSlot,
            fromDate,
            toDate,
            sentiment,
            page = 1,
            limit = 20 // Pagination support
        } = req.body;

        // Validate required parameters
        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text parameter is required'
            });
        }

        // Get category data from middleware
        let categoryData = {};

        if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
            categoryData = processCategoryItems(req.body.categoryItems);
        } else {
            categoryData = req.processedCategories || {};
        }

        if (Object.keys(categoryData).length === 0) {
            return res.json({
                success: true,
                posts: [],
                totalPosts: 0,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: 0
                }
            });
        }

        let workingCategory = category;
        if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
            const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
            if (!matchedKey) {
                return res.json({ success: false, error: 'Category not found', posts: [], totalPosts: 0, pagination: { page: parseInt(page), limit: parseInt(limit), totalPages: 0 } });
            }
            categoryData = { [matchedKey]: categoryData[matchedKey] };
            workingCategory = matchedKey;
        }

        // Handle date range based on timeSlot (same logic as main controller)
        const now = new Date();
        let startDate;
        let endDate = now;
        let useTimeFilter = true;

        if (!timeSlot && !fromDate && !toDate) {
            useTimeFilter = false;
        } else if (timeSlot === 'Custom date' && fromDate && toDate) {
            startDate = parseISO(fromDate);
            endDate = parseISO(toDate);
        } else if (timeSlot) {
            switch (timeSlot) {
                case 'last24hours':
                    startDate = subDays(now, 1);
                    break;
                case 'last7days':
                    startDate = subDays(now, 7);
                    break;
                case 'last30days':
                    startDate = subDays(now, 30);
                    break;
                case 'last60days':
                    startDate = subDays(now, 60);
                    break;
                case 'last120days':
                    startDate = subDays(now, 120);
                    break;
                case 'last90days':
                    startDate = subDays(now, 90);
                    break;
                default:
                    useTimeFilter = false;
                    break;
            }
        } else {
            useTimeFilter = false;
        }
        
        const greaterThanTime = useTimeFilter ? format(startDate, 'yyyy-MM-dd') : null;
        const lessThanTime = useTimeFilter ? format(endDate, 'yyyy-MM-dd') : null;

        // Build query - trust_dimensions is an array of strings like ["government"]
        const query = {
            bool: {
                must: [
                    { exists: { field: 'trust_dimensions' } },
                    { term: { 'trust_dimensions.keyword': text } }
                ]
            }
        };

        // Add tone filter if provided (map categories to llm_emotion values)
        if (tone) {
            const supportive = ['Supportive','Happy','Pleased','Hopeful','Content','Satisfied','Excited','Delighted','Grateful'];
            const distrustful = ['Distrustful','Frustrated','Angry','Upset','Concerned','Disappointed','Sad','Fearful','Anxious'];
            let termsList = [];
            if (tone.toLowerCase() === 'supportive') termsList = supportive;
            else if (tone.toLowerCase() === 'distrustful') termsList = distrustful;
            else if (tone.toLowerCase() === 'neutral') termsList = ['Neutral'];
            if (termsList.length > 0) {
                query.bool.must.push({ terms: { 'llm_emotion.keyword': termsList } });
            }
        }

        // Add sentiment filter if provided (same logic as main controller)
        if (sentiment) {
            if (sentiment.toLowerCase() === "all") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: "Positive" } },
                            { match: { predicted_sentiment_value: "positive" } },
                            { match: { predicted_sentiment_value: "Negative" } },
                            { match: { predicted_sentiment_value: "negative" } },
                            { match: { predicted_sentiment_value: "Neutral" } },
                            { match: { predicted_sentiment_value: "neutral" } }
                        ],
                        minimum_should_match: 1
                    }
                });
            } else if (sentiment !== "All") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: sentiment } },
                            { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                            { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }
        }

        // Add date range filter if timeSlot is provided
        if (useTimeFilter) {
            query.bool.must.push({
                range: {
                    p_created_time: {
                        gte: `${greaterThanTime}T00:00:00.000Z`,
                        lte: `${lessThanTime}T23:59:59.999Z`
                    }
                }
            });
        }

        // Add category filters (same logic as main controller)
        if (category === 'all') {
            query.bool.must.push({
                bool: {
                    should: [
                        ...Object.values(categoryData).flatMap(data =>
                            (data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        )
                    ],
                    minimum_should_match: 1
                }
            });
        } else if (categoryData[workingCategory]) {
            const data = categoryData[workingCategory];
            const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
            const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
            const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

            if (hasKeywords || hasHashtags || hasUrls) {
                query.bool.must.push({
                    bool: {
                        should: [
                            ...(data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ]),
                            ...(data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ]),
                            ...(data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        ],
                        minimum_should_match: 1
                    }
                });
            } else {
                query.bool.must.push({
                    bool: {
                        must_not: {
                            match_all: {}
                        }
                    }
                });
            }
        }

        // Calculate pagination
        const from = (parseInt(page) - 1) * parseInt(limit);

        // Search parameters for posts only
        const params = {
            from,
            size: parseInt(limit),
            query,
            sort: [
                { p_created_time: { order: 'desc' } }
            ],
            _source: [
                'trust_dimensions', 
                'theme_evidences', 
                'created_at', 
                'p_created_time',
                'source', 
                'p_message', 
                'p_message_text', 
                'u_profile_photo', 
                'u_fullname', 
                'p_url',
                'p_id', 
                'p_picture', 
                'p_picture_url', 
                'predicted_sentiment_value', 
                'predicted_category',
                'u_source'
            ],
            track_total_hits: true
        };

        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
            timeout: '10s'
        });

        // Format posts
        const posts = (response.hits?.hits || []).map(hit => formatPostData(hit));
        const totalPosts = response.hits?.total?.value || 0;
        const totalPages = Math.ceil(totalPosts / parseInt(limit));

        return res.json({
            success: true,
            posts,
            totalPosts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            },
            filters: {
                text,
                tone,
                dateRange: useTimeFilter ? { from: greaterThanTime, to: lessThanTime } : null,
                category,
                sentiment
            }
        });

    } catch (error) {
        console.error('Error fetching word cloud posts:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
},

// Optimized main word cloud controller (without posts in response)
getTrustDimensionsAnalysisWordCloud: async (req, res) => {
    try {
        const {
            interval = 'monthly',
            source = 'All',
            category = 'all',
            timeSlot,
            fromDate,
            toDate,
            sentiment
        } = req.body;

        // Get category data from middleware
        let categoryData = {};

        if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
            categoryData = processCategoryItems(req.body.categoryItems);
        } else {
            categoryData = req.processedCategories || {};
        }

        if (Object.keys(categoryData).length === 0) {
            return res.json({
                success: true,
                trustDimensions: [],
                toneTotals: {},
                dimensionsByTone: {}
            });
        }

        let workingCategory = category;
        if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
            const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
            if (!matchedKey) {
                return res.json({ success: false, error: 'Category not found', trustDimensions: [], toneTotals: {}, dimensionsByTone: {} });
            }
            categoryData = { [matchedKey]: categoryData[matchedKey] };
            workingCategory = matchedKey;
        }

        // [Same date handling logic as original...]
        const now = new Date();
        let startDate;
        let endDate = now;
        let useTimeFilter = true;

        if (!timeSlot && !fromDate && !toDate) {
            useTimeFilter = false;
        } else if (timeSlot === 'Custom date' && fromDate && toDate) {
            startDate = parseISO(fromDate);
            endDate = parseISO(toDate);
        } else if (timeSlot) {
            switch (timeSlot) {
                case 'last24hours':
                    startDate = subDays(now, 1);
                    break;
                case 'last7days':
                    startDate = subDays(now, 7);
                    break;
                case 'last30days':
                    startDate = subDays(now, 30);
                    break;
                case 'last60days':
                    startDate = subDays(now, 60);
                    break;
                case 'last120days':
                    startDate = subDays(now, 120);
                    break;
                case 'last90days':
                    startDate = subDays(now, 90);
                    break;
                default:
                    useTimeFilter = false;
                    break;
            }
        } else {
            useTimeFilter = false;
        }
        
        const greaterThanTime = useTimeFilter ? format(startDate, 'yyyy-MM-dd') : null;
        const lessThanTime = useTimeFilter ? format(endDate, 'yyyy-MM-dd') : null;

        // Query: trust_dimensions is an array of strings like ["government"]
        const query = {
            bool: {
                must: [ { exists: { field: 'trust_dimensions' } } ]
            }
        };

            // Add sentiment filter if provided
        if (sentiment) {
            if (sentiment.toLowerCase() === "all") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: "Positive" } },
                            { match: { predicted_sentiment_value: "positive" } },
                            { match: { predicted_sentiment_value: "Negative" } },
                            { match: { predicted_sentiment_value: "negative" } },
                            { match: { predicted_sentiment_value: "Neutral" } },
                            { match: { predicted_sentiment_value: "neutral" } }
                        ],
                        minimum_should_match: 1
                    }
                });
            } else if (sentiment !== "All") {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { predicted_sentiment_value: sentiment } },
                            { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                            { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }
        }

        // Only add date range filter if timeSlot is provided
        if (useTimeFilter) {
            query.bool.must.push({
                range: {
                    p_created_time: {
                        gte: `${greaterThanTime}T00:00:00.000Z`,
                        lte: `${lessThanTime}T23:59:59.999Z`
                    }
                }
            });
        }

        // Add category filters
        if (category === 'all') {
            query.bool.must.push({
                bool: {
                    should: [
                        ...Object.values(categoryData).flatMap(data =>
                            (data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ])
                        ),
                        ...Object.values(categoryData).flatMap(data =>
                            (data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        )
                    ],
                    minimum_should_match: 1
                }
            });
        } else if (categoryData[workingCategory]) {
            const data = categoryData[workingCategory];

            // Check if the category has any filtering criteria
            const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
            const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
            const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

            // Only add the filter if there's at least one criteria
            if (hasKeywords || hasHashtags || hasUrls) {
                query.bool.must.push({
                    bool: {
                        should: [
                            ...(data.keywords || []).flatMap(keyword => [
                                { match_phrase: { p_message_text: keyword } },
                                { match_phrase: { keywords: keyword } }
                            ]),
                            ...(data.hashtags || []).flatMap(hashtag => [
                                { match_phrase: { p_message_text: hashtag } },
                                { match_phrase: { hashtags: hashtag } }
                            ]),
                            ...(data.urls || []).flatMap(url => [
                                { match_phrase: { u_source: url } },
                                { match_phrase: { p_url: url } }
                            ])
                        ],
                        minimum_should_match: 1
                    }
                });
            } else {
                // If the category has no filtering criteria, add a condition that will match nothing
                query.bool.must.push({
                    bool: {
                        must_not: {
                            match_all: {}
                        }
                    }
                });
            }
        }

        // Optimized aggregation - no posts included. Group by trust_dimensions array values.
        const params = {
            size: 0,
            query,
            aggs: {
                dimensions: {
                    terms: { field: 'trust_dimensions.keyword', size: 1000, order: { _count: 'desc' } },
                    aggs: {
                        emotions: { terms: { field: 'llm_emotion.keyword', size: 20 } }
                    }
                }
            }
        };

        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params,
            track_total_hits: false,
            timeout: '10s'
        });

        const toneColors = {
            Supportive: '#52C41A',
            Distrustful: '#FF4D4F',
            Neutral: '#1890FF',
            Mixed: '#FAAD14'
        };

        const extractTone = (raw) => {
            if (!raw || typeof raw !== 'string') return null;
            const trimmed = raw.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const obj = JSON.parse(trimmed);
                    const vals = Object.values(obj);
                    return vals.length > 0 ? String(vals[0]).trim() : null;
                } catch (_) {
                    return null;
                }
            }
            return null;
        };

        const dimBuckets = response.aggregations?.dimensions?.buckets || [];
        const trustDimensions = [];
        const dimensionsByTone = {};
        const toneTotals = {};

        const normalizeTone = (emotion) => {
            const e = (emotion || '').toString().toLowerCase();
            if (!e) return 'Not Applicable';
            if (['supportive','happy','pleased','hopeful','content','satisfied','excited','delighted','grateful'].includes(e)) return 'Supportive';
            if (['distrustful','frustrated','angry','upset','concerned','disappointed','sad','fearful','anxious'].includes(e)) return 'Distrustful';
            return 'Neutral';
        };

        for (const b of dimBuckets) {
            const text = typeof b.key === 'string' ? b.key.trim() : '';
            if (!text) { continue; }
            const emotions = b.emotions?.buckets || [];
            // accumulate by normalized tone
            const perTone = new Map();
            let value = 0;
            emotions.forEach(tb => {
                const tone = normalizeTone(tb.key);
                const count = tb.doc_count || 0;
                value += count;
                perTone.set(tone, (perTone.get(tone) || 0) + count);
            });
            // push entries per tone
            for (const [tone, count] of perTone.entries()) {
                const color = toneColors[tone] || '#8C8C8C';
                trustDimensions.push({ text, value: count, tone, color });
                if (!dimensionsByTone[tone]) dimensionsByTone[tone] = [];
                dimensionsByTone[tone].push({ text, value: count });
                toneTotals[tone] = (toneTotals[tone] || 0) + count;
            }
        }

        return res.json({
            success: true,
            trustDimensions,
            toneTotals,
            dimensionsByTone,
            dateRange: useTimeFilter ? { from: greaterThanTime, to: lessThanTime } : null,
        });

    } catch (error) {
        console.error('Error fetching trust dimensions analysis data:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
},

    // Fetch posts for a specific trust dimension (and optional emotion)
    getTrustDimensionsPosts: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                dimension, // required
                emotion,   // optional
                page = 1,
                limit = 50
            } = req.body;

            if (!dimension || String(dimension).trim() === '') {
                return res.status(400).json({ success: false, error: 'dimension is required' });
            }

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data
            let categoryData = {};
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                categoryData = processCategoryItems(req.body.categoryItems);
            } else {
                categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit) });
            }

            let workingCategory = category;
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);
                if (!matchedKey) {
                    return res.json({ success: false, error: 'Category not found', posts: [], total: 0, page: Number(page), limit: Number(limit) });
                }
                categoryData = { [matchedKey]: categoryData[matchedKey] };
                workingCategory = matchedKey;
            }

            // Date range with 90 days default if not provided
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            if (!greaterThanTime || !lessThanTime) {
                const ninetyDaysAgo = subDays(now, 90);
                effectiveGreaterThanTime = greaterThanTime || format(ninetyDaysAgo, 'yyyy-MM-dd');
                effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
            } else {
                effectiveGreaterThanTime = greaterThanTime;
                effectiveLessThanTime = lessThanTime;
            }

            // Base query
            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, source, isSpecialTopic, parseInt(topicId));

            // Sentiment filter (same as analysis)
            if (sentiment) {
                if (sentiment.toLowerCase() === 'all') {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: 'Positive' } },
                                { match: { predicted_sentiment_value: 'positive' } },
                                { match: { predicted_sentiment_value: 'Negative' } },
                                { match: { predicted_sentiment_value: 'negative' } },
                                { match: { predicted_sentiment_value: 'Neutral' } },
                                { match: { predicted_sentiment_value: 'neutral' } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                } else if (sentiment !== 'All') {
                    query.bool.must.push({
                        bool: {
                            should: [
                                { match: { predicted_sentiment_value: sentiment } },
                                { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                                { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                            ],
                            minimum_should_match: 1
                        }
                    });
                }
            }

            // Category filters
            addCategoryFilters(query, workingCategory, categoryData);

            // trust_dimensions exists
            query.bool.must.push({ exists: { field: 'trust_dimensions' } });

            // Apply selected dimension
            query.bool.must.push({ term: { 'trust_dimensions.keyword': String(dimension) } });

            // Optional emotion filter
            if (emotion && String(emotion).trim() !== '') {
                query.bool.must.push({ term: { 'llm_emotion.keyword': String(emotion) } });
            }

            // Pagination
            const from = (Number(page) - 1) * Number(limit);

            const searchBody = {
                from,
                size: Number(limit),
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                _source: [
                    'trust_dimensions','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_fullname','p_url','p_id','p_picture','p_picture_url','predicted_sentiment_value','predicted_category','llm_emotion','u_followers','u_following','u_posts','p_likes','p_comments_text','p_comments','p_shares','p_engagement','p_content','u_source','name','rating','comment','business_response'
                ],
                track_total_hits: true,
                timeout: '10s'
            };

            const result = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: searchBody
            });

            const hits = result.hits?.hits || [];
            const posts = hits.map(h => formatPostData(h));
            const total = result.hits?.total?.value || 0;

            return res.json({ success: true, posts, total, page: Number(page), limit: Number(limit) });
        } catch (error) {
            console.error('Error fetching trust dimension posts:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },

};

/**
 * Format post data for the frontend
 * @param {Object} hit - Elasticsearch document hit
 * @returns {Object} Formatted post data
 */
const formatPostData = (hit) => {
    const source = hit._source;

    // Use a default image if a profile picture is not provided
    const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Social metrics
    const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
    const following = source.u_following > 0 ? `${source.u_following}` : '';
    const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
    const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

    // Emotion
    const llm_emotion = source.llm_emotion ||
        (source.source === 'GoogleMyBusiness' && source.rating
            ? (source.rating >= 4 ? 'Supportive'
                : source.rating <= 2 ? 'Frustrated'
                    : 'Neutral')
            : '');

    // Clean up comments URL if available
    const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
        ? source.p_url.trim().replace('https: // ', 'https://')
        : '';

    const comments = `${source.p_comments}`;
    const shares = source.p_shares > 0 ? `${source.p_shares}` : '';
    const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : '';

    const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
    const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== ''
        ? source.p_picture_url
        : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Determine sentiment
    let predicted_sentiment = '';
    let predicted_category = '';
    
    if (source.predicted_sentiment_value)
        predicted_sentiment = `${source.predicted_sentiment_value}`;
    else if (source.source === 'GoogleMyBusiness' && source.rating) {
        predicted_sentiment = source.rating >= 4 ? 'Positive'
            : source.rating <= 2 ? 'Negative'
                : 'Neutral';
    }

    if (source.predicted_category) predicted_category = source.predicted_category;

    // Handle YouTube-specific fields
    let youtubeVideoUrl = '';
    let profilePicture2 = '';
    if (source.source === 'Youtube') {
        if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
        else if (source.p_id) youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
    } else {
        profilePicture2 = source.p_picture ? source.p_picture : '';
    }

    // Determine source icon based on source name
    let sourceIcon = '';
    const userSource = source.source;
    if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource))
        sourceIcon = 'Blog';
    else if (userSource === 'Reddit')
        sourceIcon = 'Reddit';
    else if (['FakeNews', 'News'].includes(userSource))
        sourceIcon = 'News';
    else if (userSource === 'Tumblr')
        sourceIcon = 'Tumblr';
    else if (userSource === 'Vimeo')
        sourceIcon = 'Vimeo';
    else if (['Web', 'DeepWeb'].includes(userSource))
        sourceIcon = 'Web';
    else
        sourceIcon = userSource;

    // Format message text – with special handling for GoogleMaps/Tripadvisor
    let message_text = '';
    if (['GoogleMaps', 'Tripadvisor'].includes(source.source)) {
        const parts = source.p_message_text.split('***|||###');
        message_text = parts[0].replace(/\n/g, '<br>');
    } else {
        message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';
    }

    return {
        profilePicture: profilePic,
        profilePicture2,
        userFullname: source.u_fullname,
        user_data_string: '',
        followers,
        following,
        posts,
        likes,
        llm_emotion,
        commentsUrl,
        comments,
        shares,
        engagements,
        content,
        image_url: imageUrl,
        predicted_sentiment,
        predicted_category,
        youtube_video_url: youtubeVideoUrl,
        source_icon: `${source.p_url},${sourceIcon}`,
        message_text,
        source: source.source,
        rating: source.rating,
        comment: source.comment,
        businessResponse: source.business_response,
        uSource: source.u_source,
        googleName: source.name,
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
    };
};

/**
 * Normalize source input to handle comma-separated strings, arrays, or single values
 * @param {string|Array} source - Source input
 * @returns {Array} Array of normalized sources
 */
function normalizeSourceInput(source) {
  if (!source || source === 'All') {
    return []; // No specific source filter
  }
  if (Array.isArray(source)) {
    return source.filter(s => s && s.trim() !== '');
  }
  if (typeof source === 'string') {
    return source.split(',').map(s => s.trim()).filter(s => s !== '');
  }
  return [];
}

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @param {number} topicId - Topic ID for special handling
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
    const query = {
        bool: {
            must: [
                {
                    range: {
                        p_created_time: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                }
            ]
        }
    };

    const normalizedSources = normalizeSourceInput(source);
    
    if (normalizedSources.length > 0) {
        // Multiple sources provided - create should clause
        query.bool.must.push({
            bool: {
                should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
                minimum_should_match: 1
            }
        });
    } else if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "LinkedIn" } },
                    { match_phrase: { source: "Linkedin" } }
                ],
                minimum_should_match: 1
            }
        });
    } else if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    } else {
        // Default: all social media sources
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
                    { match_phrase: { source: "Youtube" } },
                    { match_phrase: { source: "LinkedIn" } },
                    { match_phrase: { source: "Linkedin" } },
                    { match_phrase: { source: "Pinterest" } },
                    { match_phrase: { source: "Web" } },
                    { match_phrase: { source: "Reddit" } },
                    { match_phrase: { source: "TikTok" } }
                ],
                minimum_should_match: 1
            }
        });
    }

    return query;
}

/**
 * Add category filters to the query
 * @param {Object} query - Elasticsearch query object
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data with filters
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
    if (selectedCategory === 'all') {
        query.bool.must.push({
            bool: {
                should: [
                    ...Object.values(categoryData).flatMap(data =>
                        (data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
                    )
                ],
                minimum_should_match: 1
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];

        // Check if the category has any filtering criteria
        const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
        const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
        const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

        // Only add the filter if there's at least one criteria
        if (hasKeywords || hasHashtags || hasUrls) {
            query.bool.must.push({
                bool: {
                    should: [
                        ...(data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ]),
                        ...(data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ]),
                        ...(data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
                    ],
                    minimum_should_match: 1
                }
            });
        } else {
            // If the category has no filtering criteria, add a condition that will match nothing
            query.bool.must.push({
                bool: {
                    must_not: {
                        match_all: {}
                    }
                }
            });
        }
    }
}

module.exports = trustDimensionsController; 