const { elasticClient } = require('../../config/elasticsearch');
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

const poiSentimentDistributionController = {
    getDistribution: async (req, res) => {
        try {
            const { topicId, 
                 source = "All",
        category = "all",
          fromDate,
        toDate,
        sentiment,
        llm_mention_type } = req.body || {};
            
            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;
            
            let categoryData = {};
      
            if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
              categoryData = processCategoryItems(req.body.categoryItems);
            } else {
              // Fall back to middleware data
              categoryData = req.processedCategories || {};
            }
            if (Object.keys(categoryData).length === 0) {
                return res.json({ distribution: [] });
            }

            let workingCategory = category;
            // Only filter categoryData if category is not 'all', not empty, not 'custom' AND exists
            if (workingCategory !== 'all' && workingCategory !== '' && workingCategory !== 'custom') {
                const matchedKey = findMatchingCategoryKey(workingCategory, categoryData);

                if (matchedKey) {
                    // Category found - filter to only this category
                    categoryData = { [matchedKey]: categoryData[matchedKey] };
                    workingCategory = matchedKey;
                } else {
                    // Category not found - keep all categoryData and set workingCategory to 'all'
                    // This maintains existing functionality
                    workingCategory = 'all';
                }
            }

            // Filter out categories with empty criteria
            const validCategories = Object.entries(categoryData).filter(([_, data]) => {
                const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
                const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
                const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
                return hasKeywords || hasHashtags || hasUrls;
            });

            // Calculate date range - default to 90 days if no dates provided (except for topic 2641)
            let dateRange;
            if (fromDate == null && toDate == null) {
                // Special case: topic 2641 gets ALL data, others get 90 days
                if (parseInt(topicId) === 2641) {
                    dateRange = null; // No date filter - fetch all data for topic 2641
                } else {
                    // Default to last 90 days for other topics
                    const now = new Date();
                    const ninetyDaysAgo = new Date(now);
                    ninetyDaysAgo.setDate(now.getDate() - 90);

                    dateRange = {
                        gte: ninetyDaysAgo.toISOString().split('T')[0], // YYYY-MM-DD format
                        lte: now.toISOString().split('T')[0]
                    };
                }
            } else {
                dateRange = {
                    gte: fromDate,
                    lte: toDate,
                };
            }

            // If no valid categories with search criteria, return empty results
            if (validCategories.length === 0) {
                return res.json({ distribution: [] });
            }

            // Add fallback category filter if needed (when category not found in database)
            let hasFallbackFilter = false;
            if(workingCategory=="all" && category!=="all"){
                hasFallbackFilter = true;
            }
 let sourceFilter =[];
            const normalizedSources = normalizeSourceInput(source);
            if (normalizedSources.length > 0) {
                sourceFilter = normalizedSources.map(src => ({
                    match_phrase: { source: src }
                }));
            } else if(parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640 || parseInt(topicId) === 2647 ||parseInt(topicId) === 2648 || parseInt(topicId) === 2649){
             sourceFilter = [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            ];

         } else if(parseInt(topicId) === 2646 || parseInt(topicId) === 2650 ){
             sourceFilter = [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            { match_phrase: { source: 'Twitter' } },
            { match_phrase: { source: 'Web' } },
               { match_phrase: { source: 'Facebook' } },
                 { match_phrase: { source: 'Instagram' } },
                 { match_phrase: { source: 'Youtube' } },
            ];
        } else if (isSpecialTopic){
             sourceFilter = [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } }
            ];
        } 
         else if (parseInt(topicId) === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 || parseInt(topicId) === 2651 || parseInt(topicId) === 2652 || parseInt(topicId) === 2653 || parseInt(topicId) === 2654 || parseInt(topicId) === 2655 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662 || parseInt(topicId) === 2663){
             sourceFilter = [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                 { match_phrase: { source: 'Instagram' } },
            ];
        }
        
        else if (parseInt(topicId) === 2656 || parseInt(topicId) === 2657) {
            sourceFilter = [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                { match_phrase: { source: 'Instagram' } },
                { match_phrase: { source: 'Youtube' } },
            ];
        }
        else {
             sourceFilter = [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } },
                { match_phrase: { source: 'Instagram' } },
                { match_phrase: { source: 'Youtube' } },
                { match_phrase: { source: 'Pinterest' } },
                { match_phrase: { source: 'Reddit' } },
                { match_phrase: { source: 'LinkedIn' } },
                  { match_phrase: { source: "Linkedin" } },
                { match_phrase: { source: 'Web' } },
                { match_phrase: { source: 'TikTok' } }
            ];
        }
            // Build ElasticSearch query with only valid categories
            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                // Main category filter using valid categories
                                {
                                    bool: {
                                        should: validCategories.map(([categoryName, data]) => ({
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).flatMap(keyword => [
                                                        { match_phrase: { p_message_text: keyword } },
                                                        { match_phrase: { keywords: keyword } }
                                                    ]),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).flatMap(hashtag => [
                                                        { match_phrase: { p_message_text: hashtag } },
                                                        { match_phrase: { hashtags: hashtag } }
                                                    ]),
                                                    // URLs matching
                                                    ...(data.urls || []).flatMap(url => [
                                                        { match_phrase: { u_source: url } },
                                                        { match_phrase: { p_url: url } }
                                                    ])
                                                ],
                                                minimum_should_match: 1
                                            }
                                        })),
                                        minimum_should_match: 1
                                    }
                                },
                                // Fallback category filter when category not found in database
                                ...(hasFallbackFilter ? [{
                                    bool: {
                                        should: [{
                                            multi_match: {
                                                query: category,
                                                fields: [
                                                    'p_message_text',
                                                    'p_message',
                                                    'hashtags',
                                                    'u_source',
                                                    'p_url'
                                                ],
                                                type: 'phrase'
                                            }
                                        }],
                                        minimum_should_match: 1
                                    }
                                }] : [])
                            ],
                            filter: {
                                bool: {
                                    must: [
                                        // Only add date range filter if dateRange is not null
                                        ...(dateRange ? [{
                                            range: {
                                                p_created_time: dateRange
                                            }
                                        }] : []),
                                        {
                                            bool: {
                                                should: sourceFilter,
                                                minimum_should_match: 1
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    aggs: {
                        categories: {
                            filters: {
                                filters: Object.fromEntries(
                                hasFallbackFilter ?
                                    // When using fallback filter, only include the fallback category
                                    [[
                                        category, // Use the original category name as key
                                        {
                                            bool: {
                                                should: [{
                                                    multi_match: {
                                                        query: category,
                                                        fields: [
                                                            'p_message_text',
                                                            'p_message',
                                                            'hashtags',
                                                            'u_source',
                                                            'p_url'
                                                        ],
                                                        type: 'phrase'
                                                    }
                                                }],
                                                minimum_should_match: 1
                                            }
                                        }
                                    ]] :
                                    // Include valid categories when not using fallback
                                    validCategories.map(([categoryName, data]) => [
                                        categoryName,
                                        {
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).flatMap(keyword => [
                                                        { match_phrase: { p_message_text: keyword } },
                                                        { match_phrase: { keywords: keyword } }
                                                    ]),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).flatMap(hashtag => [
                                                        { match_phrase: { p_message_text: hashtag } },
                                                        { match_phrase: { hashtags: hashtag } }
                                                    ]),
                                                    // URLs matching
                                                    ...(data.urls || []).flatMap(url => [
                                                        { match_phrase: { u_source: url } },
                                                        { match_phrase: { p_url: url } }
                                                    ])
                                                ],
                                                minimum_should_match: 1
                                            }
                                        }
                                    ])
                            )
                            },
                            aggs: {
                                sentiments: {
                                    terms: {
                                        field: 'predicted_sentiment_value.keyword',
                                        size: 10
                                    },
                                    aggs: {
                                        docs: {
                                            top_hits: {
                                                _source: [
                                                    'id',
                                                    'title',
                                                    'content',
                                                    'created_at',
                                                    'p_created_time',
                                                    'predicted_sentiment_value',
                                                    'predicted_category',
                                                    'p_message',
                                                    'p_message_text',
                                                    'u_profile_photo',
                                                    'u_fullname',
                                                    'u_followers',
                                                    'u_following',
                                                    'u_posts',
                                                    'p_likes',
                                                    'p_comments',
                                                    'p_comments_text',
                                                    'p_url',
                                                    'p_shares',
                                                    'p_engagement',
                                                    'p_content',
                                                    'p_picture',
                                                    'p_picture_url',
                                                    'source',
                                                    'llm_emotion',
                                                    'llm_language',
                                                    'u_country',
                                                    'video_embed_url',
                                                    'p_id',
                                                    'rating',
                                                    'comment',
                                                    'business_response',
                                                    'u_source',
                                                    'name',
                                                    'p_comments_data'
                                                ],
                                                size: 100
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };


             if (sentiment && sentiment!=="" && sentiment !== 'undefined' && sentiment !== 'null') {
                if (sentiment.includes(',')) {
                    // Handle multiple sentiment types
                    const sentimentArray = sentiment.split(',');
                    const sentimentFilter = {
                        bool: {
                            should: sentimentArray.map(sentiment => ({
                                match: { predicted_sentiment_value: sentiment.trim() }
                            })),
                            minimum_should_match: 1
                        }
                    };
                    params.body.query.bool.must.push(sentimentFilter);
                } else {
                    // Handle single sentiment type
                    params.body.query.bool.must.push({
                        match: { predicted_sentiment_value: sentiment.trim() }
                    });
                }
            }
                        // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
                        if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
                            params.body.query.bool.must.push({
                                term: { is_public_opinion: true }
                            });
                        }

        // Special filter for topicId 2651 - only fetch Healthcare results
        if (parseInt(topicId) === 2651) {
            params.body.query.bool.must.push({
                term: { "p_tag_cat.keyword": "Healthcare" }
            });
        }

        // Special filter for topicId 2652 - only fetch Food and Beverages results
        if (parseInt(topicId) === 2652 || parseInt(topicId) === 2663) {
            params.body.query.bool.must.push({
                term: { "p_tag_cat.keyword": "Food and Beverages" }
            });
        }

                        // LLM Mention Type filtering logic
                        let mentionTypesArray = [];

                        if (llm_mention_type) {
                            if (Array.isArray(llm_mention_type)) {
                                mentionTypesArray = llm_mention_type;
                            } else if (typeof llm_mention_type === "string") {
                                mentionTypesArray = llm_mention_type.split(",").map(s => s.trim());
                            }
                        }

                        // CASE 1: If mentionTypesArray has valid values → apply should-match filter
                        if (mentionTypesArray.length > 0) {
                            params.body.query.bool.must.push({
                                bool: {
                                    should: mentionTypesArray.map(type => ({
                                        match: { llm_mention_type: type }
                                    })),
                                    minimum_should_match: 1
                                }
                            });
                        }
                     
            const result = await elasticClient.search(params);
            const distribution = Object.entries(result.aggregations?.categories?.buckets || {}).map(
                ([category, data]) => ({
                    poi: category,
                    sentiments: data.sentiments.buckets.map((b) => ({
                        sentiment: b.key,
                        count: b.doc_count,
                        posts: b.docs.hits.hits.map((hit) => formatPostData(hit))
                    }))
                })
            );

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // For each post in sentiments[].posts, add matched_terms
            if (distribution && Array.isArray(distribution)) {
                distribution.forEach(categoryObj => {
                    if (categoryObj.sentiments && Array.isArray(categoryObj.sentiments)) {
                        categoryObj.sentiments.forEach(sentimentObj => {
                            if (sentimentObj.posts && Array.isArray(sentimentObj.posts)) {
                                sentimentObj.posts = sentimentObj.posts.map(post => {
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

            return res.json({ distribution,params });
        } catch (error) {
            console.error('Error fetching POI sentiment distribution:', error);
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
        llm_language: source.llm_language,
        u_country: source.u_country,
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

module.exports = poiSentimentDistributionController; 