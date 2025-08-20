const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');
const themesSentimentAnalysisController = {
    /**
     * Get themes grouped by sentiment analysis for stacked bar chart
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with themes grouped by sentiment values
     */
    getThemesSentimentAnalysis: async (req, res) => {
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
                    themesSentimentData: [],
                    totalCount: 0
                });
            }

            // Set date range
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
       
                // For regular topics, default to last 90 days if not provided
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

            // Add sentiment filter if provided (this filters the overall post sentiment)
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
            }else{
                const aggs = {
                    sentiment_counts: {
                    terms: {
                        field: 'predicted_sentiment_value.keyword',
                        size: 10
                    }
                    }
                };
            }

            // Add category filters
            addCategoryFilters(query, category, categoryData);

            // Add filter to only include posts with themes_sentiments field
            query.bool.must.push({
                exists: {
                    field: 'themes_sentiments'
                }
            });
            // Exclude empty placeholders to avoid parsing overhead
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '' } });
            query.bool.must_not.push({ term: { 'themes_sentiments.keyword': '{}' } });


            // Aggregation-based approach using runtime field to extract theme names; aggregate by predicted_sentiment_value
            const params = {
                size: 0,
                query: query,
                runtime_mappings: {
                    theme_name: {
                        type: 'keyword',
                        script: {
                            source: 'def ts = params._source["themes_sentiments"]; if (ts == null) return; String s = ts instanceof String ? ts : ts.toString(); if (s.length() == 0) return; def m = /\\"([^\\"]+)\\"\\s*:\\s*\\"[^\\"]*\\"/.matcher(s); while (m.find()) { emit(m.group(1)); }'
                        }
                    }
                },
                aggs: {
                    themes: {
                        terms: { field: 'theme_name', size: 50, order: { _count: 'desc' } },
                        aggs: {
                            sentiments: { terms: { field: 'predicted_sentiment_value.keyword', size: 10 } }
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

            // Build chartData from aggregation results
            const themesBuckets = response.aggregations?.themes?.buckets || [];
            const sentimentTypes = new Set();
            // Collect all sentiment keys
            themesBuckets.forEach(tb => (tb.sentiments?.buckets || []).forEach(sb => sentimentTypes.add(sb.key)));
            const sortedSentiments = Array.from(sentimentTypes).sort();

            // Merge duplicate themes by normalizing the theme name (trim, collapse spaces, lowercase)
            const normalizeTheme = (name) => (name || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
            const merged = new Map();

            for (const tb of themesBuckets) {
                const rawName = tb.key || '';
                const norm = normalizeTheme(rawName);

                if (!merged.has(norm)) {
                    const initSentiments = {};
                    sortedSentiments.forEach(s => { initSentiments[s] = 0; });
                    merged.set(norm, {
                        theme: (rawName || '').toString().trim(),
                        sentiments: initSentiments,
                        totalCount: 0
                    });
                }

                const entry = merged.get(norm);
                (tb.sentiments?.buckets || []).forEach(sb => {
                    const name = sb.key || 'Neutral';
                    const count = sb.doc_count || 0;
                    entry.sentiments[name] = (entry.sentiments[name] || 0) + count;
                    entry.totalCount += count;
                });
            }

            const chartData = Array.from(merged.values())
                .map(entry => {
                    const sentimentsObj = {};
                    sortedSentiments.forEach(s => { sentimentsObj[s] = { count: entry.sentiments[s] || 0 }; });
                    return { theme: entry.theme, sentiments: sentimentsObj, totalCount: entry.totalCount };
                })
                .sort((a, b) => b.totalCount - a.totalCount);

            console.log('Sentiment types found:', Array.from(sentimentTypes));

            // Convert to chart-friendly format for stacked bar chart
    const selectedSentiment = sentiment;
const chartDataRef = chartData.sort((a, b) => b.totalCount - a.totalCount);

// Prepare data for stacked bar chart
const stackedBarData = chartDataRef.map(themeData => {
    const result = {
        category: themeData.theme,
        total: themeData.totalCount
    };

    sortedSentiments.forEach(sentiment => {
        result[sentiment] = themeData.sentiments[sentiment].count;
    });

    return result;
});

return res.json({
    success: true,
    detailedData: chartData,
    params
});

        } catch (error) {
            console.error('Error fetching themes sentiment analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },
    // Posts endpoint for specific theme and optional sentiment
getThemePosts: async (req, res) => {
    try {
        const {
            source = 'All',
            category = 'all',
            topicId,
            greaterThanTime,
            lessThanTime,
            sentiment,
            theme,
            page = 1,
            size = 20
        } = req.body;

        if (!theme) {
            return res.status(400).json({ success: false, error: 'theme is required' });
        }

        const isSpecialTopic = topicId && parseInt(topicId) === 2600;

        let categoryData = {};
        if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
            categoryData = processCategoryItems(req.body.categoryItems);
        } else {
            categoryData = req.processedCategories || {};
        }
        if (Object.keys(categoryData).length === 0) {
            return res.json({ success: true, posts: [], totalCount: 0, page: Number(page) || 1, size: Number(size) || 20 });
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

        const baseQuery = buildBaseQuery({
            greaterThanTime: effectiveGreaterThanTime,
            lessThanTime: effectiveLessThanTime
        }, source, isSpecialTopic);

        // Optional overall sentiment filter
        if (sentiment && sentiment !== '' && sentiment !== 'All') {
            baseQuery.bool.must.push({
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
            baseQuery.bool.must.push({
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

        addCategoryFilters(baseQuery, category, categoryData);
        baseQuery.bool.must.push({ exists: { field: 'themes_sentiments' } });
        baseQuery.bool.must_not = baseQuery.bool.must_not || [];
        baseQuery.bool.must_not.push({ term: { 'themes_sentiments.keyword': '' } });
        baseQuery.bool.must_not.push({ term: { 'themes_sentiments.keyword': '{}' } });

        // Aggregate to find exact raw keys that contain the requested theme
        const aggParams = {
            size: 0,
            query: baseQuery,
            aggs: {
                themes_raw: {
                    terms: { field: 'themes_sentiments.keyword', size: 300, order: { _count: 'desc' } }
                }
            },
            track_total_hits: false,
            timeout: '10s'
        };

        const aggResp = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: aggParams
        });

        const requestedTheme = String(theme).trim();
        const rawBuckets = aggResp.aggregations?.themes_raw?.buckets || [];
        const matchingKeys = [];
        let totalFromAgg = 0;
        for (const b of rawBuckets) {
            const keyStr = b.key;
            if (!keyStr || keyStr === '{}' || keyStr === '[]' || keyStr === '""') continue;
            const s = String(keyStr);
            if (s.includes(`\"${requestedTheme}\"`)) {
                matchingKeys.push(keyStr);
                totalFromAgg += (b.doc_count || 0);
            } else {
                try {
                    const re = new RegExp(`\\\"${requestedTheme}\\\"\\s*:\\s*\\\"[^\\\"]*\\\"`);
                    if (re.test(s)) {
                        matchingKeys.push(keyStr);
                        totalFromAgg += (b.doc_count || 0);
                    }
                } catch (_) { }
            }
        }

        if (matchingKeys.length === 0) {
            return res.json({ success: true, posts: [], totalCount: 0, page: Number(page) || 1, size: Number(size) || 20 });
        }

        // Fetch posts restricted to those exact raw JSON strings
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(size) || 20, 1), 100);
        const from = (pageNum - 1) * pageSize;

        const postsQuery = JSON.parse(JSON.stringify(baseQuery));
        postsQuery.bool.must.push({ terms: { 'themes_sentiments.keyword': matchingKeys } });

        const postsParams = {
            from,
            size: pageSize,
            query: postsQuery,
            sort: [{ p_created_time: { order: 'desc' } }],
            track_total_hits: false
        };

        const postsResp = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: postsParams
        });

        const posts = (postsResp.hits?.hits || []).map(hit => formatPostData(hit));

        return res.json({
            success: true,
            posts,
            totalCount: totalFromAgg,
            page: pageNum,
            size: pageSize
        });
    } catch (error) {
        console.error('Error fetching theme posts:', error);
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

    // Handle special topic source filtering
    if (isSpecialTopic) {
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
        // Add source filter if a specific source is selected
        if (source !== 'All') {
            query.bool.must.push({
                match_phrase: { source: source }
            });
        } else {
            query.bool.must.push({
                bool: {
                    should: [
                        { match_phrase: { source: "Facebook" } },
                        { match_phrase: { source: "Twitter" } },
                        { match_phrase: { source: "Instagram" } },
                        { match_phrase: { source: "Youtube" } },
                        { match_phrase: { source: "LinkedIn" } },
                        { match_phrase: { source: "Pinterest" } },
                        { match_phrase: { source: "Web" } },
                        { match_phrase: { source: "Reddit" } },
                        { match_phrase: { source: "TikTok" } }
                    ],
                    minimum_should_match: 1
                }
            });
        }
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

module.exports = themesSentimentAnalysisController; 
 
