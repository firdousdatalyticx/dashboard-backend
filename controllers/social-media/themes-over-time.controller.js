const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, eachDayOfInterval } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');
const themesOverTimeController = {
    /**
     * Get themes over time analysis data for social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with themes data over time intervals
     */
    getThemesOverTimeAnalysis: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment
            } = req.body;

            // Fixed interval for last 4 months
            const interval = 'monthly';

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
                    themes: [],
                    timeIntervals: [],
                    totalCount: 0
                });
            }

            // Set date range (respect provided dates; otherwise default to ~last 3 months)
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
            if (greaterThanTime && lessThanTime) {
                effectiveGreaterThanTime = greaterThanTime;
                effectiveLessThanTime = lessThanTime;
            } else {
                const fourMonthsAgo = subDays(now, 90);
                effectiveGreaterThanTime = format(fourMonthsAgo, 'yyyy-MM-dd');
                effectiveLessThanTime = format(now, 'yyyy-MM-dd');
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

            // Add filter to only include posts with themes_sentiments field
            query.bool.must.push({
                exists: {
                    field: 'themes_sentiments'
                }
            });
            // Exclude empty placeholders to avoid parse errors and noise
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '' } });
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '{}' } });

            // Set calendar interval based on requested interval
            let calendarInterval = 'month';
            let formatPattern = 'yyyy-MM';

            switch (interval) {
                case 'daily':
                    calendarInterval = 'day';
                    formatPattern = 'yyyy-MM-dd';
                    break;
                case 'weekly':
                    calendarInterval = 'week';
                    formatPattern = 'yyyy-w';
                    break;
                default:
                    calendarInterval = 'month';
                    formatPattern = 'yyyy-MM';
            }

            // Aggregation approach: date_histogram over time with runtime theme extraction
            const POSTS_PER_INTERVAL_THEME = 20;
            const params = {
                size: 0,
                query: query,
                runtime_mappings: {
                    theme_name: {
                        type: 'keyword',
                        script: {
                            source: 'def ts = params._source["themes_sentiments"]; if (ts == null) return; String s = ts instanceof String ? ts : ts.toString(); if (s.length() == 0) return; def m = /\\"([^\\\"]+)\\"\\s*:\\s*\\"[^\\\"]*\\"/.matcher(s); while (m.find()) { emit(m.group(1)); }'
                        }
                    }
                },
                aggs: {
                    timeline: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: calendarInterval,
                            min_doc_count: 0,
                            extended_bounds: { min: effectiveGreaterThanTime, max: effectiveLessThanTime }
                        },
                        aggs: {
                            themes: { 
                                terms: { field: 'theme_name', size: 100 },
                                aggs: {
                                    top_posts: {
                                        top_hits: {
                                            size: POSTS_PER_INTERVAL_THEME,
                                            sort: [{ p_created_time: { order: 'desc' } }],
                                            _source: [
                                                'themes_sentiments', 'created_at', 'p_created_time', 'source', 'p_message', 'p_message_text',
                                                'u_profile_photo', 'u_followers', 'u_following', 'u_posts', 'p_likes', 'p_comments_text', 'p_url',
                                                'p_comments', 'p_shares', 'p_engagement', 'p_content', 'p_picture_url', 'predicted_sentiment_value',
                                                'predicted_category', 'u_fullname', 'video_embed_url', 'p_picture', 'p_id', 'rating', 'comment',
                                                'business_response', 'u_source', 'name', 'llm_emotion'
                                            ]
                                        }
                                    }
                                }
                            }
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

            const timeIntervals = generateTimeIntervals(effectiveGreaterThanTime, effectiveLessThanTime, interval);
            const timelineBuckets = response.aggregations?.timeline?.buckets || [];

            const normalizeTheme = (name) => (name || '').toString().trim().replace(/\s+/g, ' ');
            const themesMap = new Map(); // normName -> { theme, counts: Map(interval->count), posts: Map(interval->posts[]) }
            let totalCount = 0;

            for (const b of timelineBuckets) {
                const label = format(new Date(b.key), formatPattern);
                const themeBuckets = b.themes?.buckets || [];
                for (const tb of themeBuckets) {
                    const raw = tb.key || '';
                    const norm = normalizeTheme(raw).toLowerCase();
                    if (!themesMap.has(norm)) {
                        themesMap.set(norm, { theme: normalizeTheme(raw), counts: new Map(), posts: new Map() });
                    }
                    const entry = themesMap.get(norm);
                    const count = tb.doc_count || 0;
                    entry.counts.set(label, (entry.counts.get(label) || 0) + count);
                    totalCount += count;

                    // collect sample posts
                    const postsHits = tb.top_posts?.hits?.hits || [];
                    const samplePosts = postsHits.map(h => formatPostData(h));
                    const existing = entry.posts.get(label) || [];
                    for (const p of samplePosts) {
                        if (existing.length >= POSTS_PER_INTERVAL_THEME) break;
                        existing.push(p);
                    }
                    entry.posts.set(label, existing);
                }
            }

            const themesData = Array.from(themesMap.values()).map(entry => {
                const series = timeIntervals.map(ti => ({
                    date: ti,
                    count: entry.counts.get(ti) || 0,
                    posts: entry.posts.get(ti) || []
                }));
                return {
                    theme: entry.theme,
                    data: series,
                    totalCount: series.reduce((s, p) => s + p.count, 0)
                };
            }).sort((a, b) => b.totalCount - a.totalCount);

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // For each post in themesData[].data[].posts, add matched_terms
            if (themesData && Array.isArray(themesData)) {
                themesData.forEach(themeObj => {
                    if (themeObj.data && Array.isArray(themeObj.data)) {
                        themeObj.data.forEach(dataObj => {
                            if (dataObj.posts && Array.isArray(dataObj.posts)) {
                                dataObj.posts = dataObj.posts.map(post => {
                                    const textFields = [
                                        post.message_text,
                                        post.content,
                                        post.keywords,
                                        post.title,
                                        post.hashtags,
                                        post.uSource,
                                        post.source,
                                        post.p_url,
                                        post.userFullname
                                    ];
                                    return {
                                        ...post,
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
                                });
                            }
                        });
                    }
                });
            }

            return res.json({
                success: true,
                themes: themesData,
                timeIntervals: timeIntervals,
                totalCount: totalCount,
                dateRange: {
                    from: effectiveGreaterThanTime,
                    to: effectiveLessThanTime
                },
                params
            });

        } catch (error) {
            console.error('Error fetching themes over time analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

/**
 * Generate time intervals based on date range and interval type
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} interval - Interval type (daily, weekly, monthly)
 * @returns {Array} Array of time interval strings
 */
function generateTimeIntervals(startDate, endDate, interval) {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const intervals = [];

    switch (interval) {
        case 'daily':
            const dailyIntervals = eachDayOfInterval({ start, end });
            return dailyIntervals.map(date => format(date, 'yyyy-MM-dd'));
        
        case 'weekly':
            const weeklyIntervals = eachWeekOfInterval({ start, end });
            return weeklyIntervals.map(date => format(date, 'yyyy-w'));
        
        default: // monthly
            const monthlyIntervals = eachMonthOfInterval({ start, end });
            return monthlyIntervals.map(date => format(date, 'yyyy-MM'));
    }
}

/**
 * Get time interval string for a given date
 * @param {string} dateString - Date string
 * @param {string} interval - Interval type
 * @returns {string} Time interval string
 */
function getTimeInterval(dateString, interval) {
    const date = parseISO(dateString);
    
    switch (interval) {
        case 'daily':
            return format(date, 'yyyy-MM-dd');
        case 'weekly':
            return format(date, 'yyyy-w');
        default: // monthly
            return format(date, 'yyyy-MM');
    }
}

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
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
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

module.exports = themesOverTimeController; 