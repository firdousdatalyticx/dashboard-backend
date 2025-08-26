const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');

const fieldCountsController = {
    /**
     * Get counts for all 4 fields (sector, trust_dimensions, themes_sentiments, touchpoints)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with field counts
     */
    getFieldCounts: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment
            } = req.body;
    
            // Check if this is the special topicId///
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
                    fieldCounts: {
                        sector: { total: 0, items: [] },
                        trust_dimensions: { total: 0, items: [] },
                        themes_sentiments: { total: 0, items: [] },
                        touchpoints: { total: 0, items: [] }
                    },
                    totalCount: 0
                });
            }
    
            // Set date range - Use date math like your working query
            let dateRangeForQuery;
    
            if (!greaterThanTime || !lessThanTime) {
                // Use date math expressions like your working direct query
                dateRangeForQuery = {
                    gte: "now-90d/d",
                    lte: "now/d"
                };
            } else {
                // Use provided dates with proper ISO format
                dateRangeForQuery = {
                    gte: `${greaterThanTime}T00:00:00.000Z`,
                    lte: `${lessThanTime}T23:59:59.999Z`
                };
            }
    
            // Build base query - pass the date range object directly
            const query = {
                bool: {
                    must: [
                        {
                            range: {
                                p_created_time: dateRangeForQuery
                            }
                        },
                        {
                            bool: {
                                should: [
                                    { match_phrase: { source: "Facebook" } },
                                    { match_phrase: { source: "Twitter" } }
                                ],
                                minimum_should_match: 1
                            }
                        }
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
    
            // Add category filters
            addCategoryFilters(query, category, categoryData);
    
            // Add filter to exclude DM source
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { source: "DM" } });
    
            // FIXED: Use aggregations without size limit on documents
            const params = {
                size: 0, // Keep this as 0 for aggregations only
                query: query,
                aggs: {
                    sector_counts: {
                        terms: {
                            field: 'sector.keyword',
                            size: 1000
                        }
                    },
                    total_with_sector: {
                        value_count: {
                            field: 'sector.keyword'
                        }
                    },
                    total_with_trust_dimensions: {
                        value_count: {
                            field: 'trust_dimensions.keyword'
                        }
                    },
                    trust_dimensions: {
                        terms: {
                            field: 'trust_dimensions.keyword',
                            size: 1000
                        }
                    },
                    total_with_themes_sentiments: {
                        value_count: {
                            field: 'themes_sentiments.keyword'
                        }
                    },
                    themes_sentiments: {
                        terms: {
                            field: 'themes_sentiments.keyword',
                            size: 1000
                        }
                    },
                    total_with_touchpoints: {
                        value_count: {
                            field: 'touchpoints.keyword'
                        }
                    },
                    touchpoints: {
                        terms: {
                            field: 'touchpoints.keyword',
                            size: 1000
                        }
                    }
                },
                track_total_hits: true, // FIXED: Enable total hits tracking
                timeout: '10s'
            };
    
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });
    
            // Process aggregation results
            const aggs = response.aggregations || {};
    
            // Process sector data
            const sectorBuckets = aggs.sector_counts?.buckets || [];
            let sectorItems = sectorBuckets.map(b => ({
                name: b.key,
                count: b.doc_count
            })).sort((a, b) => b.count - a.count);
    
            const totalWithSector = aggs.total_with_sector?.value || 0;
    
            // If top sector has empty string as name, remove it and use the next one
            if (sectorItems.length > 1 && sectorItems[0].name === "") {
                sectorItems.shift();
            }
    
            // Process trust dimensions data
            const trustDimensionsBuckets = aggs.trust_dimensions?.buckets || [];
            const trustDimensionsItems = trustDimensionsBuckets.map(b => ({
                name: b.key,
                count: b.doc_count
            })).sort((a, b) => b.count - a.count);
            const totalWithTrustDimensions = aggs.total_with_trust_dimensions?.value || 0;
    
            // Process themes sentiments data
            const themesSentimentsBuckets = aggs.themes_sentiments?.buckets || [];
            const themesSentimentsItems = themesSentimentsBuckets.map(b => ({
                name: b.key,
                count: b.doc_count
            })).sort((a, b) => b.count - a.count);
            const totalWithThemesSentiments = aggs.total_with_themes_sentiments?.value || 0;
    
            // Process touchpoints data
            const touchpointsBuckets = aggs.touchpoints?.buckets || [];
            const touchpointsItems = touchpointsBuckets.map(b => ({
                name: b.key,
                count: b.doc_count
            })).sort((a, b) => b.count - a.count);
            const totalWithTouchpoints = aggs.total_with_touchpoints?.value || 0;
    
            const fieldCounts = {
                sector: { total: totalWithSector, items: sectorItems },
                trust_dimensions: { total: totalWithTrustDimensions, items: trustDimensionsItems },
                themes_sentiments: { total: totalWithThemesSentiments, items: themesSentimentsItems },
                touchpoints: { total: totalWithTouchpoints, items: touchpointsItems }
            };
    
            // FIXED: Get total document count from response
            const totalCount = response.hits?.total?.value || response.hits?.total || 0;
    
            return res.json({
                success: true,
                fieldCounts,
                totalCount, // This should now match your direct query
                dateRange: {
                    from: dateRangeForQuery.gte,
                    to: dateRangeForQuery.lte
                }
            });
    
        } catch (error) {
            console.error('Error fetching field counts:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },


    /**
     * Get posts for a specific field (sector, trust_dimensions, themes_sentiments, or touchpoints)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with posts for the selected field
     */
    getFieldPosts: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                fieldName, // required - one of: sector, trust_dimensions, themes_sentiments, touchpoints
                fieldValue, // required - the specific value to filter by
                page = 1,
                limit = 50
            } = req.body;

            if (!fieldName || !fieldValue) {
                return res.status(400).json({
                    success: false,
                    error: 'fieldName and fieldValue are required'
                });
            }

            // Validate fieldName
            const validFields = ['sector', 'trust_dimensions', 'themes_sentiments', 'touchpoints'];
            if (!validFields.includes(fieldName)) {
                return res.status(400).json({
                    success: false,
                    error: 'fieldName must be one of: sector, trust_dimensions, themes_sentiments, touchpoints'
                });
            }

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

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
                    total: 0,
                    page: Number(page),
                    limit: Number(limit)
                });
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

            // Add filter to exclude DM source
            query.bool.must_not = query.bool.must_not || [];
            query.bool.must_not.push({ term: { source: "DM" } });

            // Add field-specific filter
            if (fieldName === 'themes_sentiments') {
                // For themes_sentiments, use script query to handle array field properly
                query.bool.must.push({
                    script: {
                        script: {
                            source: "if (!doc.containsKey('themes_sentiments.keyword') || doc['themes_sentiments.keyword'].size() == 0) return false; for (def v : doc['themes_sentiments.keyword']) { if (v != null) { String s = v.toString(); if (s != null && s.trim().toLowerCase() == params.t) return true; } } return false;",
                            lang: 'painless',
                            params: { t: String(fieldValue).trim().toLowerCase() }
                        }
                    }
                });
            } else {
                // For other fields, use term query
                query.bool.must.push({
                    term: { [`${fieldName}.keyword`]: fieldValue }
                });
            }

            // Add filter to ensure the field exists
            query.bool.must.push({ exists: { field: fieldName } });

            // Pagination
            const from = (Number(page) - 1) * Number(limit);

            const searchBody = {
                from,
                size: Number(limit),
                query,
                sort: [{ p_created_time: { order: 'desc' } }],
                _source: [
                    fieldName,
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

            return res.json({
                success: true,
                posts,
                total,
                page: Number(page),
                limit: Number(limit),
                fieldName,
                fieldValue
            });

        } catch (error) {
            console.error('Error fetching field posts:', error);
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
                            // FIXED: Check if dates are in date math format or regular date strings
                            gte: dateRange.greaterThanTime.includes('now') 
                                ? dateRange.greaterThanTime 
                                : `${dateRange.greaterThanTime}T00:00:00.000Z`,
                            lte: dateRange.lessThanTime.includes('now') 
                                ? dateRange.lessThanTime 
                                : `${dateRange.lessThanTime}T23:59:59.999Z`
                        }
                    }
                }
            ]
        }
    };

    // Handle special topic source filtering
    query.bool.must.push({
        bool: {
            should: [
                { match_phrase: { source: "Facebook" } },
                { match_phrase: { source: "Twitter" } }
            ],
            minimum_should_match: 1
        }
    });

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

module.exports = fieldCountsController; 