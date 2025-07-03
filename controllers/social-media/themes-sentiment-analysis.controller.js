const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');

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
            const categoryData = req.processedCategories || {};

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
            
            if (isSpecialTopic) {
                // For special topic, use provided dates or default to last 90 days
                if (greaterThanTime && lessThanTime) {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
                } else {
                    // No default date restriction for special topic
                    const ninetyDaysAgo = subDays(now, 90);
                    effectiveGreaterThanTime = format(ninetyDaysAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = format(now, 'yyyy-MM-dd');
                }
            } else {
                // For regular topics, default to last 90 days if not provided
                if (!greaterThanTime || !lessThanTime) {
                    const ninetyDaysAgo = subDays(now, 90);
                    effectiveGreaterThanTime = greaterThanTime || format(ninetyDaysAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
                } else {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
                }
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


            // Execute the query to get all documents with themes_sentiments
            const params = {
                size: 10000,
                query: query,
                _source: [
                    'themes_sentiments',
                    'created_at', 
                    'p_created_time',
                    'source',
                    'p_message', 
                    'p_message_text', 
                    'u_profile_photo',
                    'u_followers',
                    'u_following',
                    'u_posts',
                    'p_likes',
                    'p_comments_text',
                    'p_url',
                    'p_comments',
                    'p_shares',
                    'p_engagement',
                    'p_content',
                    'p_picture_url',
                    'predicted_sentiment_value',
                    'predicted_category',
                    'u_fullname',
                    'video_embed_url',
                    'p_picture',
                    'p_id',
                    'rating',
                    'comment',
                    'business_response',
                    'u_source',
                    'name',
                    'llm_emotion',
                    'u_country'
                ],
                sort: [
                    { p_created_time: { order: 'desc' } }
                ]
            };

            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });
            console.log('Themes Sentiment Analysis Query:', JSON.stringify(query, null, 2));

            console.log('Themes Sentiment Analysis Response hits:', response.hits.hits.length);

            // Process the themes sentiment data
            const themesSentimentMap = new Map();
            const sentimentTypes = new Set();
            let totalCount = 0;

            response.hits.hits.forEach(hit => {
                const themesStr = hit._source.themes_sentiments;
                
                if (themesStr && themesStr.trim() !== '') {
                    try {
                        const themes = JSON.parse(themesStr);
                        console.log("themes",themes)
                        
                        // Create post details object for this post
                        const postDetails = formatPostData(hit);
                        // if(themesStr==postDetails?.predicted_sentiment){
                        
                        // Process each theme and its sentiment in the document
                      Object.entries(themes).forEach(([themeName, themeSentiment]) => {
    const cleanThemeName = themeName.trim();
    const cleanSentiment = themeSentiment.trim();
    
    sentimentTypes.add(cleanSentiment);
    
    if (!themesSentimentMap.has(cleanThemeName)) {
        themesSentimentMap.set(cleanThemeName, new Map());
    }
    
    const themeData = themesSentimentMap.get(cleanThemeName);
    
    if (!themeData.has(cleanSentiment)) {
        themeData.set(cleanSentiment, { count: 0, posts: [] });
    }

    const predictedSentiment = postDetails.predicted_sentiment?.trim().toLowerCase();
    const themeSentimentLower = cleanSentiment.toLowerCase();

    // ✅ Match predicted sentiment with theme sentiment
    if (predictedSentiment === themeSentimentLower) {
        const sentimentData = themeData.get(cleanSentiment);
        sentimentData.count++;
        sentimentData.posts.push(postDetails);
        totalCount++;
    }
});

                    // }
                    } catch (error) {
                        console.error('Error parsing themes_sentiments JSON:', error, themesStr);
                    }
                }
            });

            console.log('Sentiment types found:', Array.from(sentimentTypes));
            console.log('Themes sentiment data:', themesSentimentMap);

            // Convert to chart-friendly format for stacked bar chart
    const selectedSentiment = sentiment;
const chartData = [];
const sortedThemes = Array.from(themesSentimentMap.keys()).sort();
const sortedSentiments = Array.from(sentimentTypes).sort();

sortedThemes.forEach(themeName => {
    const themeData = themesSentimentMap.get(themeName);
    const sentimentCounts = {};
    let themeTotal = 0;

    // Initialize all sentiments with 0
    sortedSentiments.forEach(sentiment => {
        sentimentCounts[sentiment] = {
            count: 0,
            posts: []
        };
    });

    // Fill only matching sentiment (if not 'all')
    themeData.forEach((sentimentData, sentiment) => {
        if (
            selectedSentiment === 'all' || selectedSentiment === '' ||
            sentiment.toLowerCase() === selectedSentiment
        ) {
            sentimentCounts[sentiment] = sentimentData;
            themeTotal += sentimentData.count;
        }
    });

    chartData.push({
        theme: themeName,
        sentiments: sentimentCounts,
        totalCount: themeTotal
    });
});

// Sort themes by total count descending
chartData.sort((a, b) => b.totalCount - a.totalCount);

// Prepare data for stacked bar chart
const stackedBarData = chartData.map(themeData => {
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