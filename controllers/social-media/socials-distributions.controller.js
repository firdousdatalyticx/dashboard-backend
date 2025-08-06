const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');
const { format } = require('date-fns');

const socialsDistributionsController = {
    getDistributions: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                category = 'all',
                sources = 'All',
                unTopic='false',
                llm_mention_type,
                countries, // Add countries parameter
                keywords, // Accept keywords in payload
                organizations, // Accept organizations in payload
                cities // Accept cities in payload
            } = req.body;
            const source = sources;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            const availableDataSources = req.processedDataSources || [];
            // If there's nothing to search for, return zero counts
            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    Facebook: 0,
                    Twitter: 0,
                    Instagram: 0,
                    Youtube: 0,
                    Pinterest: 0,
                    Reddit: 0,
                    LinkedIn: 0,
                    Web: 0,
                    totalCount: 0
                });
            }

              // Build base query for filters processing
                        const baseQueryString = buildBaseQueryString(category, categoryData);
                        
                        // Process filters (time slot, date range, sentiment)
                        const filters = processFilters({
                            sentimentType,
                            timeSlot,
                            fromDate,
                            toDate,
                            queryString: baseQueryString
                        });
            
                        // Handle special case for unTopic
                        let queryTimeRange = {
                            gte: filters.greaterThanTime,
                            lte: filters.lessThanTime
                        };
            
                        if (unTopic === 'true') {
                            queryTimeRange = {
                                gte: '2023-01-01',
                                lte: '2023-04-30'
                            };
                        }
            
                        // Build base query
                        const query = buildBaseQuery({
                            greaterThanTime: queryTimeRange.gte,
                            lessThanTime: queryTimeRange.lte
                        }, source);
            
                        // Add category filters
                        addCategoryFilters(query, category, categoryData);
                        
                        // Apply sentiment filter if provided
                        if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
                            let sentimentArray = [];
                            if (typeof sentimentType === 'string' && sentimentType.includes(',')) {
                                sentimentArray = sentimentType.split(',').map(s => s.trim()).filter(s => s);
                            } else if (typeof sentimentType === 'string') {
                                sentimentArray = [sentimentType.trim()];
                            } else if (Array.isArray(sentimentType)) {
                                sentimentArray = sentimentType;
                            }

                            if (sentimentArray.length > 0) {
                                if (sentimentArray.length === 1) {
                                    query.bool.must.push({
                                        match: { predicted_sentiment_value: sentimentArray[0] }
                                    });
                                } else {
                                    const sentimentFilter = {
                                        bool: {
                                            should: sentimentArray.map(sentiment => ({
                                                match: { predicted_sentiment_value: sentiment }
                                            })),
                                            minimum_should_match: 1
                                        }
                                    };
                                    query.bool.must.push(sentimentFilter);
                                }
                            }
                        }

                          // Apply LLM Mention Type filter if provided (skip if 'All')
                if (llm_mention_type && llm_mention_type !== '' && llm_mention_type !== 'All') {
                    let mentionTypes = [];
                    if (typeof llm_mention_type === 'string' && llm_mention_type.includes(',')) {
                        mentionTypes = llm_mention_type.split(',').map(type => type.trim()).filter(type => type && type !== 'All');
                    } else if (typeof llm_mention_type === 'string') {
                        mentionTypes = [llm_mention_type.trim()];
                    } else if (Array.isArray(llm_mention_type)) {
                        mentionTypes = llm_mention_type.filter(type => type && type !== 'All');
                    }
                    
                    if (mentionTypes.length > 0) {
                        if (mentionTypes.length === 1) {
                            query.bool.must.push({
                                match: { llm_mention_type: mentionTypes[0] }
                            });
                        } else {
                            const mentionTypeFilter = {
                                bool: {
                                    should: mentionTypes.map(type => ({
                                        match: { llm_mention_type: type }
                                    })),
                                    minimum_should_match: 1
                                }
                            };
                            query.bool.must.push(mentionTypeFilter);
                        }
                    }
                }
          
            // Apply country filter if provided
            if (countries && Array.isArray(countries) && countries.length > 0) {
                query.bool.must.push({
                    terms: {
                        "u_city.keyword": countries
                    }
                });
            }

            // Add keywords filter if provided
            if (keywords && Array.isArray(keywords) && keywords.length > 0) {
                const keywordsFilter = {
                    bool: {
                        should: keywords.map(keyword => ({
                            multi_match: {
                                query: keyword,
                                fields: ['p_message_text', 'p_message', 'keywords', 'title', 'hashtags', 'u_source', 'p_url'],
                                type: 'phrase'
                            }
                        })),
                        minimum_should_match: 1
                    }
                };
                query.bool.must.push(keywordsFilter);
            }

            // Apply cities filter if provided
            if (cities && Array.isArray(cities) && cities.length > 0) {
                query.bool.must.push({
                    bool: {
                        should: cities.flatMap(city => ([
                            { match_phrase: { 'llm_specific_locations': city } }
                        ])),
                        minimum_should_match: 1
                    }
                });
            }
            // Apply organizations filter if provided
            if (organizations && Array.isArray(organizations) && organizations.length > 0) {
                query.bool.must.push({
                    bool: {
                        should: organizations.flatMap(org => ([
                            { term: { 'llm_business_name.keyword': org } }
                        ])),
                        minimum_should_match: 1
                    }
                });
            }

            // Now create the aggregation query with the same base query
            const aggQuery = {
                query: query,
                size: 0,
                aggs: {
                    source_counts: {
                        terms: {
                            field: 'source.keyword',
                            size: 20
                        }
                    }
                }
            };
       

            // Execute the aggregation query
            const aggResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: aggQuery
            });

            // Extract the aggregation buckets
            const buckets = aggResponse.aggregations.source_counts.buckets;
            const sourceCounts = {};
            
            for (const bucket of buckets) {
                // Only include sources with count > 0
                if (bucket.doc_count > 0) {
                    const sourceName = bucket.key;
                    const sourceCount = bucket.doc_count;
                    
                    // Fetch posts for this source
                    const postsQuery = {
                        ...query,
                        bool: {
                            ...query.bool,
                            must: [
                                ...query.bool.must,
                                { match_phrase: { 'source.keyword': sourceName } }
                            ]
                        }
                    };
                    // Add cities filter if provided
                    if (cities && Array.isArray(cities) && cities.length > 0) {
                        postsQuery.bool.must.push({
                            bool: {
                                should: cities.flatMap(city => ([
                                    { match_phrase: { 'llm_specific_locations': city } }
                                ])),
                                minimum_should_match: 1
                            }
                        });
                    }
                    // Add organizations filter if provided
                    if (organizations && Array.isArray(organizations) && organizations.length > 0) {
                        postsQuery.bool.must.push({
                            bool: {
                                should: organizations.flatMap(org => ([
                                    { term: { 'llm_business_name.keyword': org } }
                                ])),
                                minimum_should_match: 1
                            }
                        });
                    }

                    const postsResponse = await elasticClient.search({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: {
                            size: Math.min(sourceCount, 30),
                            query: postsQuery,
                            sort: [{ created_at: { order: 'desc' } }]
                        }
                    });

                    sourceCounts[sourceName] = {
                        count: sourceCount,
                        posts: postsResponse.hits.hits.map(formatPostData)
                    };
                }
            }

            // No need to include platforms with zero counts anymore
            // or add totalCount to the response

            // Return counts
            return res.json(sourceCounts);
        } catch (error) {
            console.error('Error fetching social media distributions:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error' 
            });
        }
    }
};

/**
 * Extract terms from category data
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {Array} Array of terms
 */
function extractTermsFromCategoryData(selectedCategory, categoryData) {
    const allTerms = [];
    
    if (selectedCategory === 'all') {
        // Combine all keywords, hashtags, and urls from all categories
        Object.values(categoryData).forEach(data => {
            if (data.keywords && data.keywords.length > 0) {
                allTerms.push(...data.keywords);
            }
            if (data.hashtags && data.hashtags.length > 0) {
                allTerms.push(...data.hashtags);
            }
            if (data.urls && data.urls.length > 0) {
                allTerms.push(...data.urls);
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];
        if (data.keywords && data.keywords.length > 0) {
            allTerms.push(...data.keywords);
        }
        if (data.hashtags && data.hashtags.length > 0) {
            allTerms.push(...data.hashtags);
        }
        if (data.urls && data.urls.length > 0) {
            allTerms.push(...data.urls);
        }
    }
    
    // Remove duplicates and falsy values
    return [...new Set(allTerms)].filter(Boolean);
}


/**
 * Build a base query string from category data for filters processing
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data
 * @returns {string} Query string
 */
function buildBaseQueryString(selectedCategory, categoryData) {
    let queryString = '';
    const allTerms = [];
    
    if (selectedCategory === 'all') {
        // Combine all keywords, hashtags, and urls from all categories
        Object.values(categoryData).forEach(data => {
            if (data.keywords && data.keywords.length > 0) {
                allTerms.push(...data.keywords);
            }
            if (data.hashtags && data.hashtags.length > 0) {
                allTerms.push(...data.hashtags);
            }
            if (data.urls && data.urls.length > 0) {
                allTerms.push(...data.urls);
            }
        });
    } else if (categoryData[selectedCategory]) {
        const data = categoryData[selectedCategory];
        if (data.keywords && data.keywords.length > 0) {
            allTerms.push(...data.keywords);
        }
        if (data.hashtags && data.hashtags.length > 0) {
            allTerms.push(...data.hashtags);
        }
        if (data.urls && data.urls.length > 0) {
            allTerms.push(...data.urls);
        }
    }
    
    // Create a query string with all terms as ORs
    if (allTerms.length > 0) {
        const terms = allTerms.map(term => `"${term}"`).join(' OR ');
        queryString = `(p_message_text:(${terms}) OR u_fullname:(${terms}))`;
    }
    
    return queryString;
}

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source) {
    const query = {
        bool: {
            must: [
                {
                    range: {
                        created_at: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                },
                {
                    range: {
                        p_created_time: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                }
            ],
            must_not: [
                {
                    term: {
                        source: 'DM'
                    }
                }
            ]
        }
    };

    // Add source filter if a specific source is selected
    if (source !== 'All') {
        let sourceArray = [];
        if (typeof source === 'string' && source.includes(',')) {
            sourceArray = source.split(',').map(s => s.trim()).filter(s => s);
        } else if (typeof source === 'string') {
            sourceArray = [source.trim()];
        } else if (Array.isArray(source)) {
            sourceArray = source;
        }

        if (sourceArray.length === 1) {
            query.bool.must.push({
                match_phrase: { source: sourceArray[0] }
            });
        } else if (sourceArray.length > 1) {
            query.bool.must.push({
                bool: {
                    should: sourceArray.map(s => ({ match_phrase: { source: s } })),
                    minimum_should_match: 1
                }
            });
        }
    } else {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
          
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

/**
 * Format post data for response
 */
function formatPostData(hit) {
    const s = hit._source;
    const profilePic = s.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    const followers = s.u_followers > 0 ? `${s.u_followers}` : "";
    const following = s.u_following > 0 ? `${s.u_following}` : "";
    const posts = s.u_posts > 0 ? `${s.u_posts}` : "";
    const likes = s.p_likes > 0 ? `${s.p_likes}` : "";

    const llm_emotion = s.llm_emotion || 
        (s.source === "GoogleMyBusiness" && s.rating
            ? s.rating >= 4 ? "Supportive" : s.rating <= 2 ? "Frustrated" : "Neutral"
            : "");

    const commentsUrl = s.p_comments_text && s.p_comments_text.trim()
        ? s.p_url.trim().replace("https: // ", "https://") : "";

    const comments = `${s.p_comments}`;
    const shares = s.p_shares > 0 ? `${s.p_shares}` : "";
    const engagements = s.p_engagement > 0 ? `${s.p_engagement}` : "";

    const content = s.p_content?.trim() || "";
    const imageUrl = s.p_picture_url?.trim() || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    let predicted_sentiment = s.predicted_sentiment_value || "";
    if (!predicted_sentiment && s.source === "GoogleMyBusiness" && s.rating) {
        predicted_sentiment = s.rating >= 4 ? "Positive" : s.rating <= 2 ? "Negative" : "Neutral";
    }

    const predicted_category = s.predicted_category || "";

    let youtubeVideoUrl = "";
    let profilePicture2 = "";
    if (s.source === "Youtube") {
        youtubeVideoUrl = s.video_embed_url ? s.video_embed_url : 
            s.p_id ? `https://www.youtube.com/embed/${s.p_id}` : "";
    } else {
        profilePicture2 = s.p_picture || "";
    }

    const sourceIcon = ["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(s.source) ? "Blog" :
        ["Reddit"].includes(s.source) ? "Reddit" :
        ["FakeNews", "News"].includes(s.source) ? "News" :
        ["Tumblr"].includes(s.source) ? "Tumblr" :
        ["Vimeo"].includes(s.source) ? "Vimeo" :
        ["Web", "DeepWeb"].includes(s.source) ? "Web" : s.source;

    const message_text = ["GoogleMaps", "Tripadvisor"].includes(s.source)
        ? s.p_message_text.split("***|||###")[0].replace(/\n/g, "<br>")
        : (s.p_message_text || "").replace(/<\/?[^>]+(>|$)/g, "");

    return {
        profilePicture: profilePic,
        profilePicture2,
        userFullname: s.u_fullname,
        user_data_string: "",
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
        source_icon: `${s.p_url},${sourceIcon}`,
        message_text,
        source: s.source,
        rating: s.rating,
        comment: s.comment,
        businessResponse: s.business_response,
        uSource: s.u_source,
        googleName: s.name,
        created_at: new Date(s.created_at).toLocaleString(),
    };
}

module.exports = socialsDistributionsController;