const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');

const trustDimensionsAnalysisController = {
    /**
     * Get trust dimensions analysis data grouped by country and tone
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with trust dimensions analysis by country and tone
     */
    getTrustDimensionsAnalysisByCountry: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                tone = "Distrustful"
            } = req.body;

                // Allowed countries list (22 countries)
            const allowedCountries = [
                'Algeria',
                'Arab Countries',
                'Bahrain',
                'Djibouti',
                'Egypt',
                'Iraq',
                'Jordan',
                'Kuwait',
                'Lebanon',
                'Libya',
                'Mauritania',
                'Morocco',
                'Oman',
                'Palestine',
                'Qatar',
                'Saudi Arabia',
                'Somalia',
                'Sudan',
                'Syria',
                'Tunisia',
                'UAE',
                'Yemen'
            ];



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
                    trustDimensionsAnalysis: [],
                    totalCount: 0
                });
            }

            // Set date range
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
            if (isSpecialTopic) {
                // For special topic, use provided dates or wider range
                if (greaterThanTime && lessThanTime) {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
                } else {
                    // Default to wider range for special topic
                    const twoYearsAgo = subDays(now, 730);
                    effectiveGreaterThanTime = format(twoYearsAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = format(now, 'yyyy-MM-dd');
                }
            } else {
                // For regular topics, use 90 days default if not provided
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

            // Add filters to only include posts with both trust_dimensions and u_country fields
            query.bool.must.push({
                exists: {
                    field: 'trust_dimensions'
                }
            });

            query.bool.must.push({
                exists: {
                    field: 'u_country'
                }
            });

            // Restrict to the 22 allowed countries
            query.bool.filter = query.bool.filter || [];
            query.bool.filter.push({
                terms: { 'u_country.keyword': allowedCountries }
            });

            // Aggregation on array field trust_dimensions.keyword and country; tone derived from llm_emotion
            const params = {
                size: 0,
                query: query,
                aggs: {
                    dimensions: {
                        terms: { field: 'trust_dimensions.keyword', size: 200 },
                        aggs: {
                            countries: { terms: { field: 'u_country.keyword', size: 50 } },
                            tones: { terms: { field: 'llm_emotion.keyword', size: 20 } },
                            top_posts_by_country_tone: {
                                terms: { field: 'u_country.keyword', size: 50 },
                                aggs: {
                                    tone: {
                                        terms: { field: 'llm_emotion.keyword', size: 20 },
                                        aggs: {
                                            top_posts: {
                                                top_hits: {
                                                    size: 5,
                                                    sort: [{ p_created_time: { order: 'desc' } }],
                                                    _source: [
                                                        'trust_dimensions','u_country','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_fullname','p_url','p_id','p_picture','p_picture_url','predicted_sentiment_value','predicted_category','llm_emotion','u_followers','u_following','u_posts','p_likes','p_comments_text','p_comments','p_shares','p_engagement','p_content','u_source','name','rating','comment','business_response'
                                                    ]
                                                }
                                            }
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

            // Normalize emotion to three tones
            const normalizeTone = (emotion) => {
                const e = (emotion || '').toString().toLowerCase();
                if (!e) return 'Not Applicable';
                if (['supportive','happy','pleased','hopeful','content','satisfied','excited','delighted','grateful'].includes(e)) return 'Supportive';
                if (['distrustful','frustrated','angry','upset','concerned','disappointed','sad','fearful','anxious'].includes(e)) return 'Distrustful';
                return 'Neutral';
            };

            // Process the aggregated data
            const dimensionsMap = new Map();
            let totalCount = 0;
            const dimBuckets = response.aggregations?.dimensions?.buckets || [];
            for (const db of dimBuckets) {
                const dimKey = db.key;
                if (!dimKey) continue;
                const docCount = db.doc_count || 0;
                totalCount += docCount;
                if (!dimensionsMap.has(dimKey)) {
                    dimensionsMap.set(dimKey, { dimension: dimKey, countries: new Map(), totalCount: 0 });
                }
                const dimData = dimensionsMap.get(dimKey);
                dimData.totalCount += docCount;

                const postsByCountryTone = new Map();
                const countryToneBuckets = db.top_posts_by_country_tone?.buckets || [];
                countryToneBuckets.forEach(cb => {
                    const countryKey = cb.key;
                    const toneBuckets = cb.tone?.buckets || [];
                    toneBuckets.forEach(tb => {
                        const hits = tb.top_posts?.hits?.hits || [];
                        const key = `${countryKey}|${tb.key}`;
                        postsByCountryTone.set(key, hits.map(h => formatPostData(h)));
                    });
                });

                const countries = db.countries?.buckets || [];
                countries.forEach(cb => {
                    const countryKey = cb.key;
                    if (!dimData.countries.has(countryKey)) dimData.countries.set(countryKey, { country: countryKey, tones: new Map(), totalCount: 0 });
                    const countryData = dimData.countries.get(countryKey);
                    countryData.totalCount += cb.doc_count || 0;

                    const toneBuckets = db.tones?.buckets || [];
                    toneBuckets.forEach(tb => {
                        const toneKey = normalizeTone(tb.key);
                        if (!countryData.tones.has(toneKey)) countryData.tones.set(toneKey, { name: toneKey, count: 0, posts: [] });
                        const toneData = countryData.tones.get(toneKey);
                        toneData.count += tb.doc_count || 0;
                        const posts = postsByCountryTone.get(`${countryKey}|${tb.key}`) || [];
                        toneData.posts.push(...posts);
                    });
                });
            }

            // Convert maps to arrays and calculate percentages
            const trustDimensionsArray = Array.from(dimensionsMap.values()).map(dimension => {
                const countries = Array.from(dimension.countries.values()).map(country => {
                    const tones = Array.from(country.tones.values()).map(toneData => ({
                        name: toneData.name,
                        count: toneData.count,
                        percentage: country.totalCount > 0 ? Math.round((toneData.count / country.totalCount) * 100) : 0,
                        posts: toneData.posts
                    }));

                    // Sort tones by count descending
                    tones.sort((a, b) => b.count - a.count);

                    return {
                        country: country.country,
                        tones: tones,
                        totalCount: country.totalCount
                    };
                });

                // Sort countries by total count descending
                countries.sort((a, b) => b.totalCount - a.totalCount);

                return {
                    dimension: dimension.dimension,
                    countries: countries,
                    totalCount: dimension.totalCount
                };
            });

            // Sort dimensions by total count descending
            trustDimensionsArray.sort((a, b) => b.totalCount - a.totalCount);

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // For each post in trustDimensionsArray[].countries[].tones[].posts, add matched_terms
            if (trustDimensionsArray && Array.isArray(trustDimensionsArray)) {
                trustDimensionsArray.forEach(dimObj => {
                    if (dimObj.countries && Array.isArray(dimObj.countries)) {
                        dimObj.countries.forEach(countryObj => {
                            if (countryObj.tones && Array.isArray(countryObj.tones)) {
                                countryObj.tones.forEach(toneObj => {
                                    if (toneObj.posts && Array.isArray(toneObj.posts)) {
                                        toneObj.posts = toneObj.posts.map(post => {
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
                });
            }

            return res.json({
                success: true,
                trustDimensionsAnalysis: trustDimensionsArray,
                totalCount: totalCount,
                filteredTone: tone || 'All',
                dateRange: {
                    from: effectiveGreaterThanTime,
                    to: effectiveLessThanTime
                }
            });

        } catch (error) {
            console.error('Error fetching trust dimensions analysis by country data:', error);
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

    // Get available data sources from middleware
    const availableDataSources = req.processedDataSources || [];

    // Handle source filtering
    if (source !== 'All') {
        query.bool.must.push({
            match_phrase: { source: source }
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

module.exports = trustDimensionsAnalysisController; 