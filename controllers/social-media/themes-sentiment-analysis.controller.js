const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');
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
                sources,
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
            }, source, req);

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

            // Add filter to only include posts with themes_sentiments field (array of strings)
            query.bool.must.push({ exists: { field: 'themes_sentiments' } });


            // Aggregate on themes_sentiments array while normalizing values (trim + lowercase) to prevent duplicates
            const params = {
                size: 0,
                query: query,
                runtime_mappings: {
                    themes_sentiments_norm: {
                        type: 'keyword',
                        script: {
                            source: "if (!doc.containsKey('themes_sentiments.keyword') || doc['themes_sentiments.keyword'].size() == 0) return; for (def v : doc['themes_sentiments.keyword']) { if (v != null) { String s = v.toString(); if (s != null) emit(s.trim().toLowerCase()); } }"
                        }
                    }
                },
                aggs: {
                    themes: {
                        terms: { field: 'themes_sentiments_norm', size: 100, order: { _count: 'desc' } },
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
            let totalCount = 0;
            // Collect all sentiment keys
            themesBuckets.forEach(tb => (tb.sentiments?.buckets || []).forEach(sb => sentimentTypes.add(sb.key)));
            const sortedSentiments = Array.from(sentimentTypes).sort();

            const chartData = themesBuckets.map(tb => {
                const themeName = tb.key; // already normalized
                const sentimentsObj = {};
                sortedSentiments.forEach(s => { sentimentsObj[s] = { count: 0 }; });
                (tb.sentiments?.buckets || []).forEach(sb => {
                    const name = sb.key || 'Neutral';
                    const count = sb.doc_count || 0;
                    totalCount += count;
                    sentimentsObj[name] = { count };
                });
                const themeTotal = Object.values(sentimentsObj).reduce((sum, v) => sum + (v.count || 0), 0);
                return { theme: themeName, sentiments: sentimentsObj, totalCount: themeTotal };
            }).sort((a, b) => b.totalCount - a.totalCount);

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

// No filter terms needed for counts-only endpoint

// No posts processing needed for counts-only endpoint

return res.json({
    success: true,
    detailedData: chartData,
    stackedBarData: stackedBarData,
    totalCount: totalCount,
    dateRange: {
        from: effectiveGreaterThanTime,
        to: effectiveLessThanTime
    }
});

        } catch (error) {
            console.error('Error fetching themes sentiment analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Get posts for a specific theme and sentiment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with posts for the selected theme
     */
    getThemePosts: async (req, res) => {
        try {
            const {
                sources,
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                theme, // required
                page = 1,
                limit = 20
            } = req.body;

            if (!theme) {
                return res.status(400).json({ success: false, error: 'theme is required' });
            }

            // Get category data from middleware
            let categoryData = {};
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
                categoryData = processCategoryItems(req.body.categoryItems);
            } else {
                categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ success: true, posts: [], total: 0, page: Number(page), limit: Number(limit) });
            }

            // Set date range
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

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, validatedSources, req);

            // Add theme filter synchronized with normalized aggregation (trim + lowercase)
            const normalizedTheme = String(theme || '').trim().toLowerCase();
            query.bool.must.push({
                script: {
                    script: {
                        source: "if (!doc.containsKey('themes_sentiments.keyword') || doc['themes_sentiments.keyword'].size() == 0) return false; for (def v : doc['themes_sentiments.keyword']) { if (v != null) { String s = v.toString(); if (s != null && s.trim().toLowerCase() == params.t) return true; } } return false;",
                        lang: 'painless',
                        params: { t: normalizedTheme }
                    }
                }
            });

            // Add sentiment filter if provided
            if (sentiment && sentiment !== '' && sentiment !== 'All') {
                query.bool.must.push({ term: { 'predicted_sentiment_value.keyword': sentiment } });
            }

            // Add category filters
            addCategoryFilters(query, category, categoryData);

            // Add filter to only include posts with themes_sentiments field
            query.bool.must.push({ exists: { field: 'themes_sentiments' } });

            const from = (Number(page) - 1) * Number(limit);
            const searchBody = {
                from,
                size: Number(limit),
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                _source: [
                    'themes_sentiments',
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
                    'llm_emotion',
                    'u_followers',
                    'u_following',
                    'u_posts',
                    'p_likes',
                    'p_comments_text',
                    'p_comments',
                    'p_shares',
                    'p_engagement',
                    'p_content',
                    'u_source',
                    'name',
                    'rating',
                    'comment',
                    'business_response',
                    'u_country'
                ]
            };

            const resp = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: searchBody,
                timeout: '10s',
                track_total_hits: true
            });

            const posts = (resp.hits?.hits || []).map(hit => formatPostData(hit));

            return res.json({
                success: true,
                posts,
                total: resp.hits?.total?.value || 0,
                page: Number(page),
                limit: Number(limit)
            });

        } catch (error) {
            console.error('Error fetching theme posts:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
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
            "LinkedIn",
            "Pinterest",
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

module.exports = themesSentimentAnalysisController; 
