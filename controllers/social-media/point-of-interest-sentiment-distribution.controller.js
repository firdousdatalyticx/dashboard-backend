const { elasticClient } = require('../../config/elasticsearch');
const processCategoryItems = require('../../helpers/processedCategoryItems');
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

            // Calculate date filter based on special topic
           
                // Calculate date 90 days ago
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
              let  dateFilter = ninetyDaysAgo.toISOString();
            

            // Filter out categories with empty criteria
            const validCategories = Object.entries(categoryData).filter(([_, data]) => {
                const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
                const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
                const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
                return hasKeywords || hasHashtags || hasUrls;
            });

               let dateRange;
      if (fromDate == null && toDate == null) {
        dateRange = {
          gte: dateFilter,
        };
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
 let sourceFilter =[];
            if(source=="All"){
            // Build source filter based on special topic
             sourceFilter = parseInt(topicId) === 2619 || parseInt(topicId) === 2639 || parseInt(topicId) === 2640 ?
             [
             { match_phrase: { source: 'LinkedIn' } },
            { match_phrase: { source: "Linkedin" } },
            ]
             :isSpecialTopic ? [
                { match_phrase: { source: 'Facebook' } },
                { match_phrase: { source: 'Twitter' } }
            ] : [
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

        }else{
             sourceFilter = [
                { match_phrase: { source: source } }
             ]
        }
            // Build ElasticSearch query with only valid categories
            const params = {
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                {
                                    bool: {
                                        should: validCategories.map(([categoryName, data]) => ({
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).map(keyword => ({
                                                        multi_match: {
                                                            query: keyword,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).map(hashtag => ({
                                                        multi_match: {
                                                            query: hashtag,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // URLs matching
                                                    ...(data.urls || []).map(url => ({
                                                        multi_match: {
                                                            query: url,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    }))
                                                ],
                                                minimum_should_match: 1
                                            }
                                        })),
                                        minimum_should_match: 1
                                    }
                                }
                            ],
                            filter: {
                                bool: {
                                    must: [
                                        {
                                            range: {
                                                p_created_time: dateRange
                                            }
                                        },
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
                                    validCategories.map(([categoryName, data]) => [
                                        categoryName,
                                        {
                                            bool: {
                                                should: [
                                                    // Keywords matching
                                                    ...(data.keywords || []).map(keyword => ({
                                                        multi_match: {
                                                            query: keyword,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // Hashtags matching
                                                    ...(data.hashtags || []).map(hashtag => ({
                                                        multi_match: {
                                                            query: hashtag,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    })),
                                                    // URLs matching
                                                    ...(data.urls || []).map(url => ({
                                                        multi_match: {
                                                            query: url,
                                                            fields: [
                                                                'p_message_text',
                                                                'p_message',
                                                                'keywords',
                                                                'title',
                                                                'hashtags',
                                                                'u_source',
                                                                'p_url'
                                                            ],
                                                            type: 'phrase'
                                                        }
                                                    }))
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
                    query.bool.must.push(sentimentFilter);
                } else {
                    // Handle single sentiment type
                    params.body.query.bool.must.push({
                        match: { predicted_sentiment_value: sentiment.trim() }
                    });
                }
            }
              // Apply LLM Mention Type filter if provided
            if (llm_mention_type && Array.isArray(llm_mention_type) && llm_mention_type.length > 0) {
                const mentionTypeFilter = {
                    bool: {
                        should: llm_mention_type.map(type => ({
                            match: { llm_mention_type: type }
                        })),
                        minimum_should_match: 1
                    }
                };
                params.body.query.bool.must.push(mentionTypeFilter);
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