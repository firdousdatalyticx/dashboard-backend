const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');
const touchpointsAnalysisController = {
    /**
     * Get touchpoints analysis data grouped by sentiment for stacked bar chart
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with touchpoints analysis by sentiment
     */
    getTouchpointsAnalysisBySentiment: async (req, res) => {
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
                    touchpointsAnalysis: [],
                    totalCount: 0
                });
            }
    
            // Set date range
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
            
                // For regular topics, use 90 days default if not provided
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
            }, source, isSpecialTopic);
    
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
            addCategoryFilters(query, category, categoryData);
    
            // Add filter to only include posts with touchpoints field
            query.bool.must.push({
                exists: {
                    field: 'touchpoints'
                }
            });
            // Exclude empty placeholders
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '' } });
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '{}' } });
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '[]' } });
    
            // Simplified aggregation without post samples
            const AGG_SIZE = 300;
            const params = {
                size: 0,
                query: query,
                aggs: {
                    touchpoints_raw: {
                        terms: { field: 'touchpoints.keyword', size: AGG_SIZE, order: { _count: 'desc' } },
                        aggs: {
                            sentiments: { terms: { field: 'predicted_sentiment_value.keyword', size: 3 } }
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
    
            // Process aggregated results: parse touchpoints JSON/CSV per bucket and distribute counts
            const touchpointsMap = new Map();
            let totalCount = 0;
            const buckets = response.aggregations?.touchpoints_raw?.buckets || [];
            for (const b of buckets) {
                const keyStr = b.key;
                if (!keyStr || keyStr === '{}' || keyStr === '[]') continue;
                const sentimentsBuckets = b.sentiments?.buckets || [];
    
                // Derive list of touchpoint names from the raw string
                let tpList = [];
                const trimmed = String(keyStr).trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                        const obj = JSON.parse(trimmed);
                        tpList = Object.keys(obj || {}).map(k => String(k).trim()).filter(Boolean);
                    } catch (_) { /* ignore */ }
                }
                if (tpList.length === 0) {
                    tpList = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== '{}' && s !== '[]');
                }
                if (tpList.length === 0) continue;
    
                const bucketDocCount = b.doc_count || 0;
                totalCount += bucketDocCount;
    
                for (const tp of tpList) {
                    const key = tp;
                    if (!touchpointsMap.has(key)) {
                        touchpointsMap.set(key, {
                            touchpoint: key,
                            sentiments: {
                                'Positive': { count: 0 },
                                'Negative': { count: 0 },
                                'Neutral': { count: 0 },
                            },
                            totalCount: 0,
                        });
                    }
                    const tpData = touchpointsMap.get(key);
                    tpData.totalCount += bucketDocCount;
                    sentimentsBuckets.forEach(sb => {
                        const sName = sb.key || '';
                        const sCount = sb.doc_count || 0;
                        if (!tpData.sentiments[sName]) tpData.sentiments[sName] = { count: 0 };
                        tpData.sentiments[sName].count += sCount;
                    });
                }
            }
    
            const touchpointsArray = Array.from(touchpointsMap.values()).map(touchpoint => {
                // Convert sentiments object to array, filtering out zero counts
                const sentiments = Object.entries(touchpoint.sentiments)
                    .filter(([_, data]) => {
                        if (sentiment === 'All' || sentiment === "") return data.count > 0;
                        return _.toLowerCase() === sentiment.toLowerCase() && data.count > 0;
                    })
                    .map(([sentimentName, data]) => ({
                        name: sentimentName,
                        count: data.count,
                        percentage: touchpoint.totalCount > 0 ? Math.round((data.count / touchpoint.totalCount) * 100) : 0
                    }))
                    .sort((a, b) => b.count - a.count); // Sort by count descending
    
                // Normalize sentiment access based on sentiment
                const getCount = (sentiment) =>
                    sentiment === 'All' || sentiment === "" || sentiment === sentiment.toLowerCase()
                        ? touchpoint.sentiments[sentiment]?.count || 0
                        : 0;
    
                return {
                    touchpoint: touchpoint.touchpoint,
                    sentiments,
                    totalCount: touchpoint.totalCount,
                    positive: getCount('Positive'),
                    negative: getCount('Negative'),
                    neutral: getCount('Neutral'),
                    distrustful: getCount('Distrustful'),
                    supportive: getCount('Supportive')
                };
            });
    
            // Sort touchpoints by total count descending (highest bars first)
            touchpointsArray.sort((a, b) => b.totalCount - a.totalCount);
    
            // Limit to top 15 touchpoints
            const top15Touchpoints = touchpointsArray.slice(0, 15);
    
            return res.json({
                success: true,
                touchpointsAnalysis: top15Touchpoints,
                totalCount: totalCount,
                dateRange: {
                    from: effectiveGreaterThanTime,
                    to: effectiveLessThanTime
                }
            });
    
        } catch (error) {
            console.error('Error fetching touchpoints analysis by sentiment data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },
    getTouchpointPosts: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                touchpoint,
                page = 1,
                size = 20
            } = req.body;

            if (!touchpoint) {
                return res.status(400).json({ success: false, error: 'touchpoint is required' });
            }

            // Special topic handling (kept for parity with analysis API)
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Category data
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
                    totalCount: 0,
                    page: Number(page) || 1,
                    size: Number(size) || 20
                });
            }

            // Date range with 90 days default
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
            }, source, isSpecialTopic);

            // Optional sentiment filter (specific segment clicked)
            if (sentiment && sentiment !== '' && sentiment !== 'All') {
                query.bool.must.push({
                    bool: {
                        should: [
                            { match: { 'predicted_sentiment_value': sentiment } },
                            { match: { 'predicted_sentiment_value': String(sentiment).toLowerCase() } },
                            { match: { 'predicted_sentiment_value': String(sentiment).charAt(0).toUpperCase() + String(sentiment).slice(1).toLowerCase() } }
                        ],
                        minimum_should_match: 1
                    }
                });
            } else if (sentiment && sentiment.toLowerCase() === 'all') {
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
            }

            // Category filters
            addCategoryFilters(query, category, categoryData);

            // Ensure touchpoints field exists and is not empty
            query.bool.must.push({ exists: { field: 'touchpoints' } });
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '' } });
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '{}' } });
            query.bool.must_not.push({ term: { 'touchpoints.keyword': '[]' } });

            // Filter for specific touchpoint value (supports JSON and CSV representations)
            const safeTP = String(touchpoint).replace(/"/g, '\\"');
            query.bool.must.push({
                bool: {
                    should: [
                        { wildcard: { 'touchpoints.keyword': `*\"${safeTP}\"*` } },
                        { wildcard: { 'touchpoints.keyword': `*${safeTP}*` } }
                    ],
                    minimum_should_match: 1
                }
            });

            const pageNum = Math.max(parseInt(page) || 1, 1);
            const pageSize = Math.min(Math.max(parseInt(size) || 20, 1), 100);
            const from = (pageNum - 1) * pageSize;

            const params = {
                from,
                size: pageSize,
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                track_total_hits: true
            };

            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            const total = typeof response.hits?.total?.value === 'number' ? response.hits.total.value : 0;
            const posts = (response.hits?.hits || []).map(hit => formatPostData(hit));

            return res.json({
                success: true,
                posts,
                totalCount: total,
                page: pageNum,
                size: pageSize
            });
        } catch (error) {
            console.error('Error fetching touchpoint posts:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
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
        country: source.u_country,
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
    };
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false) {
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

module.exports = touchpointsAnalysisController; 