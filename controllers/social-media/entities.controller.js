const { elasticClient } = require('../../config/elasticsearch');
const { processFilters } = require('./filter.utils');
const { format } = require('date-fns');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Normalize source input to array of sources
 * @param {string|Array} source - Source input (can be "All", comma-separated string, array, or single value)
 * @returns {Array} Array of normalized sources
 */
function normalizeSourceInput(source) {
  if (!source || source === 'All') {
    return []; // No specific source filter
  }
  if (Array.isArray(source)) {
    return source.filter(s => s && s.trim() !== '');
  }
  if (typeof source === 'string') {
    return source.split(',').map(s => s.trim()).filter(s => s !== '');
  }
  return [];
}

/**
 * Find matching category key with flexible matching
 * @param {string} selectedCategory - Category to find
 * @param {Object} categoryData - Category data object
 * @returns {string|null} Matched category key or null
 */
function findMatchingCategoryKey(selectedCategory, categoryData = {}) {
    if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'custom' || selectedCategory === '') {
        return selectedCategory;
    }

    const normalizedSelectedRaw = String(selectedCategory || '');
    const normalizedSelected = normalizedSelectedRaw.toLowerCase().replace(/\s+/g, '');
    const categoryKeys = Object.keys(categoryData || {});

    if (categoryKeys.length === 0) {
        return null;
    }

    let matchedKey = categoryKeys.find(
        key => key.toLowerCase() === normalizedSelectedRaw.toLowerCase()
    );

    if (!matchedKey) {
        matchedKey = categoryKeys.find(
            key => key.toLowerCase().replace(/\s+/g, '') === normalizedSelected
        );
    }

    if (!matchedKey) {
        matchedKey = categoryKeys.find(key => {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
            return normalizedKey.includes(normalizedSelected) || normalizedSelected.includes(normalizedKey);
        });
    }

    return matchedKey || null;
}

const entitiesController = {
    getEntities: async (req, res) => {
        try {
            // Get parameters from either body (POST) or query (GET)
            const params = req.method === 'POST' ? req.body : req.query;
            
            const {
                timeSlot,
                fromDate,
                toDate,
                sentimentType,
                source = 'All',
                category: inputCategory = 'all',
                greaterThanTime: inputGreaterThanTime,
                lessThanTime: inputLessThanTime,
                unTopic = 'false',
                limit = 10,
                maxPostsPerEntity = 200, // Safety limit for max posts to fetch per entity
                topicId,
                categoryItems
            } = params;
            
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
                    entitiesData: [] 
                });
            }

            let category = inputCategory;
            if (category !== 'all' && category !== '' && category !== 'custom') {
                const matchedKey = findMatchingCategoryKey(category, categoryData);
                if (!matchedKey) {
                    return res.json({ 
                        entitiesData: [],
                        error: 'Category not found'
                    });
                }
                category = matchedKey;
            }

            // Build base query string
            const baseQueryString = buildBaseQueryString(category, categoryData);

            // Process filters (time slot, date range, sentiment)
            const filters = processFilters({
                sentimentType,
                timeSlot,
                fromDate,
                toDate,
                queryString: baseQueryString,
            });
            
            // Set date range based on filters or special case
            let effectiveGreaterThanTime = filters.greaterThanTime;
            let effectiveLessThanTime = filters.lessThanTime;
            
            // Handle special case for unTopic
            if (unTopic === 'true') {
                effectiveGreaterThanTime = '2023-01-01';
                effectiveLessThanTime = '2023-04-30';
            }
            
          
            
            // If input dates were provided, they take precedence
            if (inputGreaterThanTime) {
                effectiveGreaterThanTime = inputGreaterThanTime;
            }
            
            if (inputLessThanTime) {
                effectiveLessThanTime = inputLessThanTime;
            }
            
            // Ensure consistent date format for the posts controller compatibility
            // Add time component if needed
            if (effectiveGreaterThanTime && !effectiveGreaterThanTime.includes('T') && !effectiveGreaterThanTime.includes('now')) {
                if (effectiveGreaterThanTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    effectiveGreaterThanTime = `${effectiveGreaterThanTime}T00:00:00`;
                }
            }
            
            if (effectiveLessThanTime && !effectiveLessThanTime.includes('T') && !effectiveLessThanTime.includes('now')) {
                if (effectiveLessThanTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    effectiveLessThanTime = `${effectiveLessThanTime}T23:59:59`;
                }
            }
            
            // Build base query
            const query = buildBaseQuery({
                greaterThanTime: effectiveGreaterThanTime,
                lessThanTime: effectiveLessThanTime
            }, source, isSpecialTopic, parseInt(topicId));
            
            // Add p_created_time range filter
            query.bool.must.push({
                range: {
                    p_created_time: {
                        gte: effectiveGreaterThanTime,
                        lte: effectiveLessThanTime,
                        format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                    }
                }
            });

            // Add category filters
            addCategoryFilters(query, category, categoryData);
            
            // Add sentiment filter if provided
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
            }
            
            // For compatibility with posts controller
            // If query doesn't already contain a p_created_time filter, add it
            const hasCreatedTimeFilter = query.bool.must.some(clause => 
                clause.range && clause.range.p_created_time
            );
            
            if (!hasCreatedTimeFilter) {
                query.bool.must.push({
                    range: {
                        p_created_time: {
                            gte: effectiveGreaterThanTime,
                            lte: effectiveLessThanTime,
                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                        }
                    }
                });
            }
            
            // First get the top entities
            const esParams = {
                size: 0,
                query: query,
                aggs: {
                    // Extract entities from the posts
                    llm_entities_organization: {
                        terms: {
                            field: 'llm_entities.Organization.keyword',
                            size: parseInt(limit, 10) * 2, // Get more candidates to ensure we have enough valid ones
                            // Use document count as the ordering metric
                            order: { "_count": "desc" }
                        }
                    }
                }
            };

            // Log query for debugging

            const response = await elasticClient.search({   
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: esParams
            });

            const entityBuckets = response?.aggregations?.llm_entities_organization?.buckets || [];
            
            // Process entities with their posts
            const entitiesWithPosts = [];
            const intLimit = parseInt(limit, 10);
            const intMaxPostsPerEntity = parseInt(maxPostsPerEntity, 10);
            
            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }
            // Process entities one at a time to ensure consistency 
            for (const entity of entityBuckets) {
                // Skip processing more entities once we've reached our limit
                if (entitiesWithPosts.length >= intLimit) {
                    break;
                }
                
                // Create query to fetch posts for this entity with exact matching
                const entityPostsQuery = {
                    bool: {
                        must: [
                            // Keep base query filters
                            ...query.bool.must,
                            // Add entity match with exact phrase
                            {
                                match_phrase: { 
                                    'llm_entities.Organization': entity.key 
                                }
                            }
                        ],
                        must_not: query.bool.must_not || []
                    }
                };
                
                // Get all matching posts for this entity
                const allPostsRaw = await fetchAllPostsForEntity(entityPostsQuery, intMaxPostsPerEntity);
                // Add matched_terms to each post
                const allPosts = allPostsRaw.map(post => {
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
                
                // Skip entities with no posts
                if (allPosts.length === 0) {
                    continue;
                }
                
                // Add entity with posts
                entitiesWithPosts.push({
                    key: entity.key,
                    doc_count: allPosts.length, // Set doc_count to match the actual number of posts we're sending
                    posts: allPosts
                });
            }

            return res.json({ 
                entitiesData: entitiesWithPosts,
                dateRange: { 
                    greaterThanTime: effectiveGreaterThanTime, 
                    lessThanTime: effectiveLessThanTime 
                }
            });
        } catch (error) {
            console.error('Error fetching entities data:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error',
                entities: [] 
            });
        }
    }
};

/**
 * Fetch all posts for an entity using pagination if needed
 * @param {Object} query - Elasticsearch query object
 * @param {number} maxPosts - Maximum number of posts to fetch
 * @returns {Array} Formatted post objects
 */
async function fetchAllPostsForEntity(query, maxPosts) {
    try {
        // First try to get posts with regular search
        const postsResult = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: {
                query: query,
                size: Math.min(maxPosts, 100), // ES max size is typically 10000
                sort: [{ p_created_time: { order: 'desc' } }]
            }
        });
        
        let allHits = [...postsResult.hits.hits];
        const totalHits = postsResult.hits.total.value;
        
        // If we need more posts and there are more to fetch, use scroll API
        if (totalHits > allHits.length && allHits.length < maxPosts) {
            // Initialize scroll for pagination
            const scrollResult = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    query: query,
                    sort: [{ p_created_time: { order: 'desc' } }]
                },
                scroll: '1m', // Keep search context alive for 1 minute
                size: 100 // Fetch in batches of 100
            });
            
            let scrollId = scrollResult._scroll_id;
            allHits = [...scrollResult.hits.hits]; // Reset with initial batch
            
            // Continue scrolling until we get all posts or reach the limit
            while (allHits.length < Math.min(totalHits, maxPosts)) {
                const scrollResponse = await elasticClient.scroll({
                    scroll_id: scrollId,
                    scroll: '1m'
                });
                
                // If no more results, break
                if (scrollResponse.hits.hits.length === 0) {
                    break;
                }
                
                // Add new hits and update scroll ID
                allHits = [...allHits, ...scrollResponse.hits.hits].slice(0, maxPosts);
                scrollId = scrollResponse._scroll_id;
            }
            
            // Clean up scroll context
            await elasticClient.clearScroll({ scroll_id: scrollId });
        }
        
        // Format all the posts
        const formattedPosts = await Promise.all(
            allHits.map(formatPostData)
        );
        
        return formattedPosts;
    } catch (error) {
        console.error('Error fetching posts:', error);
        return []; // Return empty array on error
    }
}

/**
 * Format an Elasticsearch hit into a post object for the frontend
 */
const formatPostData = async (hit) => {
    const source = hit._source;

    // Use a default image if a profile picture is not provided
    const profilePic = source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Social metrics
    const followers = source.u_followers > 0 ? `${source.u_followers}` : '';
    const following = source.u_following > 0 ? `${source.u_following}` : '';
    const posts = source.u_posts > 0 ? `${source.u_posts}` : '';
    const likes = source.p_likes > 0 ? `${source.p_likes}` : '';

    // Emotion
    const llm_emotion = source.llm_emotion || '';

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
    const labelData = await prisma.customers_label_data.findMany({
        where: { p_id: hit._id },
        orderBy: { label_id: 'desc' },
        take: 1
    });

    if (labelData.length > 0 && labelData[0]?.predicted_sentiment_value_requested)
        predicted_sentiment = `${labelData[0].predicted_sentiment_value_requested}`;
    else if (source.predicted_sentiment_value)
        predicted_sentiment = `${source.predicted_sentiment_value}`;

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

    // Format message text
    let message_text = source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '';

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
        uSource: source.u_source,
        created_at: new Date(source.p_created_time).toLocaleString()
    };
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
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

    const normalizedSources = normalizeSourceInput(source);

    if (normalizedSources.length > 0) {
        query.bool.must.push({
            bool: {
                should: normalizedSources.map(s => ({ match_phrase: { source: s } })),
                minimum_should_match: 1
            }
        });
    } else if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "LinkedIn" } },
                    { match_phrase: { source: "Linkedin" } }
                ],
                minimum_should_match: 1
            }
        });
    } else if (isSpecialTopic) {
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

    return query;
}

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

module.exports = entitiesController; 