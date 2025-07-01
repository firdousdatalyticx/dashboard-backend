const { elasticClient } = require('../../config/elasticsearch');
const { format } = require('date-fns');
const { processFilters } = require('./filter.utils');
const prisma = require('../../config/database');

const mentionsTrendController = {
    /**
     * Get social media mentions trend data
     */
    getMentionsTrend: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                source = 'All',
                category = 'all',
                unTopic = 'false',
                topicId,
                llm_mention_type
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: true,
                    error: 'No category data available',
                    mentionsGraphData: '',
                    maxMentionData: '0'
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

            if (Number(req.body.topicId)==2473) {
                queryTimeRange = {
                    gte: '2023-01-01',
                    lte: '2023-04-30'
                };
            }

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: queryTimeRange.gte,
                lessThanTime: queryTimeRange.lte
            }, source, isSpecialTopic,Number(req.body.topicId));

            // Add category filters
            addCategoryFilters(query, category, categoryData);
            
            // Apply sentiment filter if provided
            if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
                if (sentimentType.includes(',')) {
                    // Handle multiple sentiment types
                    const sentimentArray = sentimentType.split(',');
                    const sentimentFilter = {
                        bool: {
                            should: sentimentArray.map(sentiment => ({
                                match: { predicted_sentiment_value: sentiment.trim() }
                            })),
                            minimum_should_match: 1
                        }
                    };
                    query.bool.must.push(sentimentFilter);
                } else {
                    // Handle single sentiment type
                    query.bool.must.push({
                        match: { predicted_sentiment_value: sentimentType.trim() }
                    });
                }
                console.log("Applied sentiment filter for:", sentimentType);
            }

            // Apply LLM Mention Type filter if provided
            if (llm_mention_type!="" && llm_mention_type && Array.isArray(llm_mention_type) && llm_mention_type.length > 0) {
                const mentionTypeFilter = {
                    bool: {
                        should: llm_mention_type.map(type => ({
                            match: { llm_mention_type: type }
                        })),
                        minimum_should_match: 1
                    }
                };
                query.bool.must.push(mentionTypeFilter);
            }

            // Execute aggregation query to get counts per date
            const aggQuery = {
                query: query,
                size: 0,
                aggs: {
                    daily_counts: {
                        date_histogram: { 
                            field: 'p_created_time', 
                            fixed_interval: '1d', 
                            min_doc_count: 0,
                            extended_bounds: {
                                min: queryTimeRange.gte,
                                max: queryTimeRange.lte
                            }
                        }
                    }
                }
            };

            // Execute aggregation query
            const aggResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: aggQuery
            });

            // Get total count using the same query
            const totalCountQuery = {
                query: query,
                size: 0
            };
            const totalCountResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: totalCountQuery
            });
            const totalCount = totalCountResponse.hits.total.value || totalCountResponse.hits.total || 0;

            // Process aggregation results and find max mentions
            let maxDate = '';
            let maxMentions = 0;
            const datesArray = [];
            const dateCountMap = {};

            const buckets = aggResponse?.aggregations?.daily_counts?.buckets || [];

            for (const bucket of buckets) {
                const docCount = bucket.doc_count;
                const keyAsString = new Date(bucket.key_as_string).toISOString().split('T')[0];
                
                // Only include dates within the specified range
                const bucketDate = new Date(keyAsString);
                const startDate = new Date(queryTimeRange.gte);
                const endDate = new Date(queryTimeRange.lte);
                
                if (bucketDate >= startDate && bucketDate <= endDate) {
                    if (docCount > maxMentions) {
                        maxMentions = docCount;
                        maxDate = keyAsString;
                    }
                    
                    datesArray.push(`${keyAsString},${docCount}`);
                    dateCountMap[keyAsString] = docCount;
                }
            }

            // Fetch posts efficiently in a single query with date aggregation
            const postsQuery = {
                query: query,
                size: 0,
                aggs: {
                    posts_by_date: {
                        date_histogram: {
                            field: 'p_created_time',
                            fixed_interval: '1d',
                            min_doc_count: 1,
                            extended_bounds: {
                                min: queryTimeRange.gte,
                                max: queryTimeRange.lte
                            }
                        },
                        aggs: {
                            top_posts: {
                                top_hits: {
                                    size: 15, // Limit to 15 posts per date
                                    sort: [{ p_created_time: { order: 'desc' } }]
                                }
                            }
                        }
                    }
                }
            };

            const postsResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: postsQuery
            });

            // Process posts and group by date
            const datesWithPosts = [];
            const postsAggBuckets = postsResponse?.aggregations?.posts_by_date?.buckets || [];

            // Create a map for quick lookup
            const postsByDateMap = {};
            for (const bucket of postsAggBuckets) {
                const keyAsString = new Date(bucket.key_as_string).toISOString().split('T')[0];
                const posts = bucket.top_posts.hits.hits.map(hit => formatPostData(hit));
                postsByDateMap[keyAsString] = posts;
            }

            // Build final dates with posts array
            for (const dateEntry of datesArray) {
                const [dateString, countString] = dateEntry.split(',');
                const count = parseInt(countString);
                
                datesWithPosts.push({
                    date: dateString,
                    count: count,
                    posts: postsByDateMap[dateString] || []
                });
            }

            // Sort dates in descending order
            datesArray.sort((a, b) => new Date(b.split(',')[0]) - new Date(a.split(',')[0]));
            datesWithPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

            return res.status(200).json({
                success: true,
                maxMentionData: `${maxDate},${maxMentions}`,
                totalCount: totalCount,
                datesWithPosts: datesWithPosts,
                query: query
            });

        } catch (error) {
            console.error('Error fetching social media mentions trend data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    getMentionsTrendPost: async (req, res) => {
        try {
            const { 
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                source = 'All',
                category = 'all',
                unTopic = 'false',
                llm_mention_type,
            } = req.query;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: false,
                    error: 'No category data available',
                    mentionsGraphData: '',
                    maxMentionData: ',0'
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

            if (Number(req.body.topicId)==2473) {
               queryTimeRange = {
                    gte: fromDate,
                    lte: toDate
                };
            }

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: queryTimeRange.gte,
                lessThanTime: queryTimeRange.lte
            }, source,Number(req.body.topicId));

            // Add category filters
            addCategoryFilters(query, category, categoryData);
            
            // Apply sentiment filter if provided
            if (sentimentType && sentimentType !== 'undefined' && sentimentType !== 'null') {
                if (sentimentType.includes(',')) {
                    // Handle multiple sentiment types
                    const sentimentArray = sentimentType.split(',');
                    const sentimentFilter = {
                        bool: {
                            should: sentimentArray.map(sentiment => ({
                                match: { predicted_sentiment_value: sentiment.trim() }
                            })),
                            minimum_should_match: 1
                        }
                    };
                    query.bool.must.push(sentimentFilter);
                } else {
                    // Handle single sentiment type
                    query.bool.must.push({
                        match: { predicted_sentiment_value: sentimentType.trim() }
                    });
                }
                console.log("Applied sentiment filter for:", sentimentType);
            }

            // Apply LLM Mention Type filter if provided
            if (llm_mention_type!="" && llm_mention_type && Array.isArray(llm_mention_type) && llm_mention_type.length > 0) {
                const mentionTypeFilter = {
                    bool: {
                        should: llm_mention_type.map(type => ({
                            match: { llm_mention_type: type }
                        })),
                        minimum_should_match: 1
                    }
                };
                query.bool.must.push(mentionTypeFilter);
            }

            // Normalize the input
            const mentionTypesArray = typeof llm_mention_type === 'string' 
                ? llm_mention_type.split(',').map(s => s.trim()) 
                : llm_mention_type;

            // Apply LLM Mention Type filter if provided
            if (llm_mention_type!="" && mentionTypesArray && Array.isArray(mentionTypesArray) && mentionTypesArray.length > 0) {
                const mentionTypeFilter = {
                    bool: {
                        should: mentionTypesArray.map(type => ({
                            match: { llm_mention_type: type }
                        })),
                        minimum_should_match: 1
                    }
                };
                query.bool.must.push(mentionTypeFilter);
            }

            // Build complete query
            const queryTemplate = {
                query: query,
                size: 30
            };
            
            // Execute Elasticsearch query
            const results = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: queryTemplate
            });

            // Format response using the optimized formatPostData function
            const responseArray = results?.hits?.hits?.map(hit => formatPostData(hit)) || [];

            return res.status(200).json({
                success: true,
                responseArray,
                total: responseArray.length || 0
            });

        } catch (error) {
            console.error('Error fetching social media mentions trend data:', error);
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
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString(),
        p_comments_data:source.p_comments_data,

    };
};

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
function buildBaseQuery(dateRange, source, isSpecialTopic = false,topicId) {
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
     if(topicId===2619){
        query.bool.must.push({
            bool: {
                should: [
                       { match_phrase: { source: "LinkedIn" } },
                        { match_phrase: { source: "Linkedin" } }
                ],
                minimum_should_match: 1
            }
        });
     }
    // Handle special topic source filtering
   else if (isSpecialTopic) {
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

module.exports = mentionsTrendController; 