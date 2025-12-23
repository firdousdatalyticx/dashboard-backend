const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays, eachMonthOfInterval } = require('date-fns');
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
const trustDimensionsOverTimeController = {
    /**
     * Get trust dimensions analysis over time for line chart
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with trust dimensions trends over time
     */
    getTrustDimensionsOverTime: async (req, res) => {
        try {
            const {
                sources,
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                tone // kept for compatibility but not used in aggregation
            } = req.body;
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, trustDimensionsOverTime: [], timeIntervals: [], totalCount: 0 });
            }

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

            // Validate and filter sources against available data sources
            const availableDataSources = req.processedDataSources || [];
            const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
                availableDataSources.includes(src) || availableDataSources.length === 0
            ) : [];

            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, validatedSources, req);

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

            addCategoryFilters(query, category, categoryData);

            query.bool.must.push({ exists: { field: 'trust_dimensions' } });

            const AGG_SIZE = 200;
            const params = {
                size: 0,
                query,
                aggs: {
                    time_buckets: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: 'month',
                            min_doc_count: 0,
                            extended_bounds: {
                                min: `${effectiveGreaterThanTime}T00:00:00.000Z`,
                                max: `${effectiveLessThanTime}T23:59:59.999Z`
                            }
                        },
                        aggs: {
                            dimensions: {
                                terms: { field: 'trust_dimensions.keyword', size: AGG_SIZE, order: { _count: 'desc' } }
                            }
                        }
                    }
                },
                track_total_hits: false,
                timeout: '10s'
            };

            const response = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: params });

            const monthIntervals = eachMonthOfInterval({ start: new Date(effectiveGreaterThanTime), end: new Date(effectiveLessThanTime) });
            const timeIntervals = monthIntervals.map(date => format(date, 'yyyy-MM'));

            const timeBuckets = response.aggregations?.time_buckets?.buckets || [];
            const dimensionMap = new Map();
            let totalCount = 0;
            for (const bucket of timeBuckets) {
                const label = format(new Date(bucket.key), 'yyyy-MM');
                const dBuckets = bucket.dimensions?.buckets || [];
                for (const db of dBuckets) {
                    const name = typeof db.key === 'string' ? db.key.trim() : '';
                    if (!name) { continue; }
                    if (!dimensionMap.has(name)) dimensionMap.set(name, new Map());
                    const entry = dimensionMap.get(name);
                    const count = db.doc_count || 0; totalCount += count;
                    entry.set(label, (entry.get(label) || 0) + count);
                }
            }

            const chartData = Array.from(dimensionMap.entries()).map(([dimension, counts]) => {
                const series = timeIntervals.map(ti => ({ date: ti, count: counts.get(ti) || 0 }));
                return { dimension, data: series, totalCount: series.reduce((s, p) => s + p.count, 0) };
            }).sort((a, b) => b.totalCount - a.totalCount);

            return res.json({ success: true, trustDimensionsOverTime: chartData, timeIntervals, totalCount, dateRange: { from: effectiveGreaterThanTime, to: effectiveLessThanTime } });
        } catch (error) {
            console.error('Error fetching trust dimensions over time data:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    },

    getTrustDimensionsOverTimePosts: async (req, res) => {
        try {
            const {
                sources,
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                tone,
                dimension,
                page = 1,
                limit = 50
            } = req.body;

            if (!dimension || String(dimension).trim() === '') {
                return res.status(400).json({ success: false, error: 'dimension is required' });
            }

            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            let categoryData = {};
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                categoryData = processCategoryItems(req.body.categoryItems);
            } else {
                categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit) });
            }

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

            // Validate and filter sources against available data sources
            const availableDataSources = req.processedDataSources || [];
            const validatedSources = sources ? normalizeSourceInput(sources).filter(src =>
                availableDataSources.includes(src) || availableDataSources.length === 0
            ) : [];

            const query = buildBaseQuery({ greaterThanTime: effectiveGreaterThanTime, lessThanTime: effectiveLessThanTime }, validatedSources, req);

            if (sentiment) {
                if (sentiment.toLowerCase() === 'all') {
                    query.bool.must.push({
                        bool: { should: [
                            { match: { predicted_sentiment_value: 'Positive' } },
                            { match: { predicted_sentiment_value: 'positive' } },
                            { match: { predicted_sentiment_value: 'Negative' } },
                            { match: { predicted_sentiment_value: 'negative' } },
                            { match: { predicted_sentiment_value: 'Neutral' } },
                            { match: { predicted_sentiment_value: 'neutral' } }
                        ], minimum_should_match: 1 }
                    });
                } else if (sentiment !== 'All') {
                    query.bool.must.push({
                        bool: { should: [
                            { match: { predicted_sentiment_value: sentiment } },
                            { match: { predicted_sentiment_value: sentiment.toLowerCase() } },
                            { match: { predicted_sentiment_value: sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase() } }
                        ], minimum_should_match: 1 }
                    });
                }
            }

            addCategoryFilters(query, category, categoryData);

            query.bool.must.push({ exists: { field: 'trust_dimensions' } });
            query.bool.must.push({ exists: { field: 'trust_dimensions' } });
            query.bool.must.push({ term: { 'trust_dimensions.keyword': String(dimension) } });

            if (tone && tone.toLowerCase() !== 'all') {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { llm_emotion: tone } },
                            { match: { llm_emotion: String(tone).toLowerCase() } },
                            { match: { llm_emotion: String(tone).charAt(0).toUpperCase() + String(tone).slice(1).toLowerCase() } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }

            const from = (Number(page) - 1) * Number(limit);
            const params = {
                from,
                size: Number(limit),
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                _source: [
                    'trust_dimensions','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_fullname','p_url','p_id','p_picture','p_picture_url','predicted_sentiment_value','predicted_category','llm_emotion','u_followers','u_following','u_posts','p_likes','p_comments_text','p_comments','p_shares','p_engagement','p_content','u_source','name','rating','comment','business_response','u_country'
                ],
                track_total_hits: true,
                timeout: '10s'
            };

            const result = await elasticClient.search({ index: process.env.ELASTICSEARCH_DEFAULTINDEX, body: params });
            const hits = result.hits?.hits || [];
            const posts = hits.map(h => {
                const source = h._source;
                const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
                const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
                const following = source.u_following > 0 ? `${source.u_following}` : '';
                const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
                const likes = source.p_likes > 0 ? `${source.p_likes}` : '';
                const llm_emotion = source.llm_emotion || '';
                const commentsUrl = source.p_comments_text && source.p_comments_text.trim() !== ''
                    ? source.p_url.trim().replace('https: // ', 'https://')
                    : '';
                const content = source.p_content && source.p_content.trim() !== '' ? source.p_content : '';
                const imageUrl = source.p_picture_url && source.p_picture_url.trim() !== '' ? source.p_picture_url : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;
                let predicted_sentiment = '';
                if (source.predicted_sentiment_value) predicted_sentiment = `${source.predicted_sentiment_value}`;
                else if (source.source === 'GoogleMyBusiness' && source.rating) {
                    predicted_sentiment = source.rating >= 4 ? 'Positive' : source.rating <= 2 ? 'Negative' : 'Neutral';
                }
                return {
                    profilePicture: profilePic,
                    userFullname: source.u_fullname,
                    followers, following, posts, likes,
                    llm_emotion,
                    commentsUrl,
                    content,
                    image_url: imageUrl,
                    predicted_sentiment,
                    predicted_category: source.predicted_category || '',
                    source_icon: `${source.p_url},${source.source}`,
                    message_text: source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '',
                    source: source.source,
                    created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
                };
            });
            const total = result.hits?.total?.value || 0;

            return res.json({ success: true, posts, total, page: Number(page), limit: Number(limit) });
        } catch (error) {
            console.error('Error fetching trust dimensions over time posts:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, sources, req) {
    const query = {
        bool: {
            must: [
                {
                    range: {
                        p_created_time: {
                            gte: `${dateRange.greaterThanTime}T00:00:00.000Z`,
                            lte: `${dateRange.lessThanTime}T23:59:59.999Z`
                        }
                    }
                }
            ]
        }
    };

    // Get available data sources from middleware
    const availableDataSources = req.processedDataSources || [];

    // Handle source filtering
    if (sources && sources.length > 0) {
        // If validated sources provided, use those
        query.bool.must.push({
            bool: {
                should: sources.map(src => ({
                    match_phrase: { source: src }
                })),
                minimum_should_match: 1
            }
        });
    } else {
        // Use middleware sources if available, otherwise use default sources
        const sourcesToUse = availableDataSources.length > 0 ? availableDataSources : [
            "Facebook",
            "Twitter",
            "Instagram",
            "Youtube",
            "Pinterest",
            "LinkedIn",
            "Web",
            "Reddit",
            "TikTok"
        ];

        query.bool.must.push({
            bool: {
                should: sourcesToUse.map(source => ({
                    match_phrase: { source: source }
                })),
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
                        (data.keywords || []).map(keyword => ({
                            multi_match: {
                                query: keyword,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
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
                        ...(data.keywords || []).map(keyword => ({
                            multi_match: {
                                query: keyword,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.hashtags || []).map(hashtag => ({
                            multi_match: {
                                query: hashtag,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        ...(data.urls || []).map(url => ({
                            multi_match: {
                                query: url,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        }))
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

module.exports = trustDimensionsOverTimeController; 