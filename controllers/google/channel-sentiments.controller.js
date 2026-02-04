const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');

const prisma = new PrismaClient();

/**
 * Helper function to get customer review elastic ID
 */
const getCustomerReviewElasticId = async (parentAccid) => {
    if (!parentAccid || parentAccid === null) {
        console.log('parentAccountId is required');
        return null;
    }
    const parentAccountId = Number(parentAccid);
    if (isNaN(parentAccountId)) {
        console.log('Invalid ID');
        return null;
    }
    try {
        const customer = await prisma.customers.findUnique({
            where: {
                customer_id: Number(parentAccountId)
            },
            select: {
                customer_reviews_key: true
            }
        });

        if (!customer) {
            console.log('Customer not found');
            return null;
        }

        return customer.customer_reviews_key;
    } catch (error) {
        console.error('error fetching result', error);
        return null;
    }
};

/**
 * Format post data for GoogleMyBusiness posts
 * @param {Object} hit - Elasticsearch hit object
 * @param {Object} labelDataMap - Map of p_id -> labelData to avoid individual queries
 */
const formatPostData = async (hit, labelDataMap = {}) => {
    const source = hit._source;

    const profilePic =
        source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
    const following = source.u_following > 0 ? `${source.u_following}` : "";
    const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
    const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

    const llm_emotion =
        source.llm_emotion ||
        (source.source === "GoogleMyBusiness" && source.rating
            ? source.rating >= 4
                ? "Supportive"
                : source.rating <= 2
                ? "Frustrated"
                : "Neutral"
            : "");

    const commentsUrl =
        source.p_comments_text && source.p_comments_text.trim() !== ""
            ? source.p_url.trim().replace("https: // ", "https://")
            : "";

    const comments = `${source.p_comments}`;
    const shares = source.p_shares > 0 ? `${source.p_shares}` : "";
    const engagements = source.p_engagement > 0 ? `${source.p_engagement}` : "";

    const content =
        source.p_content && source.p_content.trim() !== "" ? source.p_content : "";
    const imageUrl =
        source.p_picture_url && source.p_picture_url.trim() !== ""
            ? source.p_picture_url
            : `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    let predicted_sentiment = "";
    let predicted_category = "";
    
    // Use labelData from map instead of making individual query
    const labelData = labelDataMap[hit._id] || [];

    if (labelData.length > 0 && labelData[0]?.predicted_sentiment_value_requested)
        predicted_sentiment = `${labelData[0].predicted_sentiment_value_requested}`;
    else if (source.predicted_sentiment_value)
        predicted_sentiment = `${source.predicted_sentiment_value}`;
    else if (source.source === "GoogleMyBusiness" && source.rating) {
        predicted_sentiment =
            source.rating >= 4
                ? "Positive"
                : source.rating <= 2
                ? "Negative"
                : "Neutral";
    }

    if (source.predicted_category) predicted_category = source.predicted_category;

    let youtubeVideoUrl = "";
    let profilePicture2 = "";
    if (source.source === "Youtube") {
        if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
        else if (source.p_id)
            youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
    } else {
        profilePicture2 = source.p_picture ? source.p_picture : "";
    }

    let sourceIcon = "";
    const userSource = source.source;
    if (
        ["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(
            userSource
        )
    )
        sourceIcon = "Blog";
    else if (userSource === "Reddit") sourceIcon = "Reddit";
    else if (["FakeNews", "News"].includes(userSource)) sourceIcon = "News";
    else if (userSource === "Tumblr") sourceIcon = "Tumblr";
    else if (userSource === "Vimeo") sourceIcon = "Vimeo";
    else if (["Web", "DeepWeb"].includes(userSource)) sourceIcon = "Web";
    else sourceIcon = userSource;

    let message_text = "";
    if (["GoogleMaps", "Tripadvisor"].includes(source.source)) {
        const parts = source.p_message_text.split("***|||###");
        message_text = parts[0].replace(/\n/g, "<br>");
    } else {
        message_text = source.p_message_text
            ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, "")
            : "";
    }

    return {
        profilePicture: profilePic,
        profilePicture2,
        userFullname: source.u_fullname,
        user_data_string: "",
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
        created_at: new Date(source.p_created_time).toLocaleString(),
        p_comments_data: source.p_comments_data,
    };
};

/**
 * Controller for Google channel sentiments data
 */
const channelSentimentsController = {
    /**
     * Get channel sentiments data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with channel sentiments data
     */
    getChannelSentiments: async (req, res) => {
        try {
            const { greaterThanTime, lessThanTime, isScadUser, selectedTab, topicId, parentAccountId, sentimentType } = req.body;
            const googleUrls = req.googleUrls || [];
            let topicQueryString = '';
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    responseOutput: {},
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }

            // Process filters for sentiment
            const filters = processFilters({
                // sentimentType,  
                queryString: topicQueryString
            });

            let sourcesArray = [
                'Youtube',
                'Twitter',
                'Pinterest',
                'Instagram',
                'Reddit',
                'Tumblr',
                'Facebook',
                'Web',
                'Linkedin',
                'GooglePlayStore',
                'GoogleMyBusiness',
                'AppleAppStore',
                'HuaweiAppGallery',
                'Glassdoor'
            ];

            if (isScadUser === "true") {
                if (selectedTab === "GOOGLE") {
                    sourcesArray = ['GoogleMyBusiness'];
                } else {
                    sourcesArray = ['Twitter', 'Instagram', 'Facebook', 'Youtube', 'Pinterest', 'Reddit', 'LinkedIn', 'Web'];
                }
            }

            const responseOutput = {};

            // Helper function to fetch sentiment counts using structured queries
            const fetchSentiments = async (source, queryString,sentimentType) => {
                if(sentimentType==""){
                const results = await Promise.all(['Positive', 'Negative', 'Neutral'].map(async (sentiment) => {
                    // Build a structured query object
                    const queryObj = {
                        bool: {
                            must: [
                                // Date range filter
                                {
                                    range: {
                                        p_created_time: {
                                            gte: greaterThanTime,
                                            lte: lessThanTime,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                },
                                // Sentiment filter using term query
                                {
                                    term: {
                                        "predicted_sentiment_value.keyword": sentiment
                                    }
                                }
                            ]
                        }
                    };
                    
                    // Add rating-based filter for GoogleMyBusiness (similar to mentions-trend)
                    if (source === 'GoogleMyBusiness') {
                        if (sentiment === 'Positive') {
                            queryObj.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                        } else if (sentiment === 'Negative') {
                            queryObj.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                        } else if (sentiment === 'Neutral') {
                            queryObj.bool.must.push({ term: { rating: 3 } });
                        }
                    }
                    
                    // Add source filter
                    if (source === '"Youtube" OR "Vimeo"') {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    { term: { "source.keyword": "Youtube" } },
                                    { term: { "source.keyword": "Vimeo" } }
                                ],
                                minimum_should_match: 1
                            }
                        });
                    } else if (source === '"FakeNews" OR "News" OR "Blogs" OR "Web"') {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    { term: { "source.keyword": "FakeNews" } },
                                    { term: { "source.keyword": "News" } },
                                    { term: { "source.keyword": "Blogs" } },
                                    { term: { "source.keyword": "Web" } }
                                ],
                                minimum_should_match: 1
                            }
                        });
                    } else {
                        queryObj.bool.must.push({
                            term: { "source.keyword": source }
                        });
                    }
                    
                    // Add Google URL filters for GoogleMyBusiness
                    if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                        const urlShouldClauses = [];
                        
                        // Add URL clauses for both fields
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({ term: { "u_source.keyword": url } });
                            urlShouldClauses.push({ term: { "place_url.keyword": url } });
                        });
                        
                        queryObj.bool.must.push({
                            bool: {
                                should: urlShouldClauses,
                                minimum_should_match: 1
                            }
                        });
                    }
                    
                    // Add any custom filters from sentimentType
                    if (filters.queryString && filters.queryString.trim() !== '') {
                        queryObj.bool.must.push({
                            query_string: {
                                query: filters.queryString
                            }
                        });
                    }

                    // Special coordinate filters for topicIds 2641, 2651, 2652
                    if (parseInt(topicId) === 2641 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    } else if (parseInt(topicId) === 2651) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    } else if (parseInt(topicId) === 2652) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2653) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2654) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2655) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }

                 
                    // Execute the count query
                    const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: queryObj }
                    });
                    
                    return { sentiment, count: result.count };
                }));
                
                // Convert results to the expected format
                return {
                    positive: results.find(r => r.sentiment === 'Positive').count,
                    negative: results.find(r => r.sentiment === 'Negative').count,
                    neutral: results.find(r => r.sentiment === 'Neutral').count
                };
                 }else{
                                // Define all possible sentiments
                    const allSentiments = ['Positive', 'Negative', 'Neutral'];

                    // Normalize sentimentType (handle cases where it's string or array)
                    const selectedSentiments = sentimentType
                    ? Array.isArray(sentimentType)
                        ? sentimentType
                        : [sentimentType]
                    : allSentiments; // If no filter is applied, query all

                    const results = await Promise.all(
                    allSentiments.map(async (sentiment) => {
                        if (!selectedSentiments.includes(sentiment)) {
                        // Return 0 if not selected
                        return { sentiment, count: 0 };
                        }

                        const queryObj = {
                        bool: {
                            must: [
                            {
                                range: {
                                p_created_time: {
                                    gte: greaterThanTime,
                                    lte: lessThanTime,
                                    format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                }
                                }
                            },
                            {
                                term: {
                                "predicted_sentiment_value.keyword": sentiment
                                }
                            }
                            ]
                        }
                        };
                        
                        // Add rating-based filter for GoogleMyBusiness (similar to mentions-trend)
                        if (source === 'GoogleMyBusiness') {
                            if (sentiment === 'Positive') {
                                queryObj.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                            } else if (sentiment === 'Negative') {
                                queryObj.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                            } else if (sentiment === 'Neutral') {
                                queryObj.bool.must.push({ term: { rating: 3 } });
                            }
                        }

                        // Add your other filters as before
                        if (source === '"Youtube" OR "Vimeo"') {
                        queryObj.bool.must.push({
                            bool: {
                            should: [
                                { term: { "source.keyword": "Youtube" } },
                                { term: { "source.keyword": "Vimeo" } }
                            ],
                            minimum_should_match: 1
                            }
                        });
                        } else if (source === '"FakeNews" OR "News" OR "Blogs" OR "Web"') {
                        queryObj.bool.must.push({
                            bool: {
                            should: [
                                { term: { "source.keyword": "FakeNews" } },
                                { term: { "source.keyword": "News" } },
                                { term: { "source.keyword": "Blogs" } },
                                { term: { "source.keyword": "Web" } }
                            ],
                            minimum_should_match: 1
                            }
                        });
                        } else {
                        queryObj.bool.must.push({
                            term: { "source.keyword": source }
                        });
                        }

                        if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                        const urlShouldClauses = [];

                        googleUrls.forEach(url => {
                            urlShouldClauses.push({ term: { "u_source.keyword": url } });
                            urlShouldClauses.push({ term: { "place_url.keyword": url } });
                        });

                        queryObj.bool.must.push({
                            bool: {
                            should: urlShouldClauses,
                            minimum_should_match: 1
                            }
                        });
                        }

                        if (filters.queryString && filters.queryString.trim() !== '') {
                        queryObj.bool.must.push({
                            query_string: {
                            query: filters.queryString
                            }
                        });
                        }

                        // Special coordinate filters for topicIds 2641, 2651, 2652
                        if (parseInt(topicId) === 2641 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662) {
                            queryObj.bool.must.push({
                                bool: {
                                    should: [
                                        {
                                            bool: {
                                                must: [
                                                    {
                                                        range: {
                                                            lat: {
                                                                gte: 24.2,
                                                                lte: 24.8,
                                                            },
                                                        },
                                                    },
                                                    {
                                                        range: {
                                                            long: {
                                                                gte: 54.1,
                                                                lte: 54.8,
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                    minimum_should_match: 1,
                                },
                            });
                        } else if (parseInt(topicId) === 2651) {
                            queryObj.bool.must.push({
                                bool: {
                                    should: [
                                        {
                                            bool: {
                                                must: [
                                                    {
                                                        range: {
                                                            lat: {
                                                                gte: 24.2,
                                                                lte: 24.8,
                                                            },
                                                        },
                                                    },
                                                    {
                                                        range: {
                                                            long: {
                                                                gte: 54.1,
                                                                lte: 54.8,
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                    minimum_should_match: 1,
                                },
                            });
                        } else if (parseInt(topicId) === 2652) {
                            queryObj.bool.must.push({
                                bool: {
                                    should: [
                                        {
                                            bool: {
                                                must: [
                                                    {
                                                        range: {
                                                            lat: {
                                                                gte: 24.2,
                                                                lte: 24.8,
                                                            },
                                                        },
                                                    },
                                                    {
                                                        range: {
                                                            long: {
                                                                gte: 54.1,
                                                                lte: 54.8,
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                    minimum_should_match: 1,
                                },
                            });
                        }

                     

                        const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: queryObj }
                        });

                        return { sentiment, count: result.count };
                    })
                    );

                    // Final structured output
                    return {
                    positive: results.find(r => r.sentiment === 'Positive')?.count || 0,
                    negative: results.find(r => r.sentiment === 'Negative')?.count || 0,
                    neutral: results.find(r => r.sentiment === 'Neutral')?.count || 0
                    };

            }
            };

            // Helper function for specific sources (like GoogleMyBusiness)
            const fetchCustomSourceSentiments = async (source) => {
                const cusRevElasticId = await getCustomerReviewElasticId(parentAccountId);
                if (!cusRevElasticId) return { positive: 0, negative: 0, neutral: 0 };

                // Prepare URL filters if needed
                const urlFilters = [];
                if (source === 'GoogleMyBusiness' && googleUrls.length > 0) {
                    googleUrls.forEach(url => {
                        urlFilters.push({ term: { "u_source.keyword": url } });
                        urlFilters.push({ term: { "place_url.keyword": url } });
                    });
                }

                // Common query parts
                const createQuery = (range) => {
                    const queryObj = {
                        bool: {
                            must: [
                                // Source filter
                                { term: { "source.keyword": source } },
                                // Manual entry type filter
                                { term: { "manual_entry_type.keyword": "review" } },
                                // Customer filter
                                { term: { "review_customer.keyword": cusRevElasticId } },
                                // Rating range
                                { range },
                                // Date range
                                {
                                    range: {
                                        p_created_time: {
                                            gte: greaterThanTime,
                                            lte: lessThanTime,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                }
                            ]
                        }
                    };
                    
                    // Add URL filters if available
                    if (urlFilters.length > 0) {
                        queryObj.bool.must.push({
                            bool: {
                                should: urlFilters,
                                minimum_should_match: 1
                            }
                        });
                    }

                    // Special coordinate filters for topicIds 2641, 2651, 2652
                    if (parseInt(topicId) === 2641 || parseInt(topicId) === 2658 || parseInt(topicId) === 2659 || parseInt(topicId) === 2660 || parseInt(topicId) === 2661 || parseInt(topicId) === 2662) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    } else if (parseInt(topicId) === 2651) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    } else if (parseInt(topicId) === 2652) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2653) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2654) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }
                    else if (parseInt(topicId) === 2655) {
                        queryObj.bool.must.push({
                            bool: {
                                should: [
                                    {
                                        bool: {
                                            must: [
                                                {
                                                    range: {
                                                        lat: {
                                                            gte: 24.2,
                                                            lte: 24.8,
                                                        },
                                                    },
                                                },
                                                {
                                                    range: {
                                                        long: {
                                                            gte: 54.1,
                                                            lte: 54.8,
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        });
                    }

                    return queryObj;
                };

                // Run the queries for each sentiment range
                const [positive, negative, neutral] = await Promise.all([
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { gt: 3 } }) }
                    }),
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { lt: 2 } }) }
                    }),
                    elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: { query: createQuery({ p_likes: { gte: 2, lte: 3 } }) }
                    })
                ]);

                return {
                    positive: positive.count,
                    negative: negative.count,
                    neutral: neutral.count
                };
            };

            // Process all sources
            await Promise.all(
                sourcesArray.map(async source => {
                    if (topicId === '2388' && source === 'GooglePlayStore') return; // Skip specific source for topicId 2388

                    let sentiments;
                    if (
                        topicId === '2325' ||
                        (topicId === '2388' &&
                            ['GooglePlayStore', 'GoogleMyBusiness', 'AppleAppStore', 'HuaweiAppGallery', 'Glassdoor'].includes(
                                source
                            ))
                    ) {
                        sentiments = await fetchCustomSourceSentiments(source);
                    } else {
                        const sourceQuery =
                            source === 'Youtube'
                                ? '"Youtube" OR "Vimeo"'
                                : source === 'Web'
                                    ? '"FakeNews" OR "News" OR "Blogs" OR "Web"'
                                    : source;

                        sentiments = await fetchSentiments(sourceQuery, filters.queryString,sentimentType);
                    }

                    // If we have sentimentType filter, filter the results client-side
                    if (sentimentType) {
                        if (sentimentType.includes('Positive') && sentiments.positive === 0 &&
                            sentimentType.includes('Negative') && sentiments.negative === 0 &&
                            sentimentType.includes('Neutral') && sentiments.neutral === 0) {
                            // Skip if no matching sentiments
                            return;
                        }
                    }

                    // Add non-zero sentiments to response
                    if (sentiments.positive > 0 || sentiments.negative > 0 || sentiments.neutral > 0) {
                        responseOutput[source] = sentiments;
                    }
                })
            );

            // Fetch posts for GoogleMyBusiness if it's in the sources
            let formattedPosts = [];
            let totalPosts = 0;
            if (sourcesArray.includes('GoogleMyBusiness') && googleUrls.length > 0) {
                // Build base query for posts
                const basePostsQuery = {
                    query: {
                        bool: {
                            must: [
                                {
                                    term: {
                                        "source.keyword": "GoogleMyBusiness"
                                    }
                                },
                                {
                                    range: {
                                        p_created_time: {
                                            gte: greaterThanTime,
                                            lte: lessThanTime,
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                }
                            ]
                        }
                    }
                };

                // Add URL filter
                if (googleUrls.length > 0) {
                    const urlShouldClauses = [];
                    googleUrls.forEach(url => {
                        urlShouldClauses.push({ term: { "u_source.keyword": url } });
                        urlShouldClauses.push({ term: { "place_url.keyword": url } });
                    });
                    basePostsQuery.query.bool.must.push({
                        bool: {
                            should: urlShouldClauses,
                            minimum_should_match: 1
                        }
                    });
                }

                // Add sentiment filter if provided
                // For GoogleMyBusiness, filter by rating first, then by predicted_sentiment_value
                if (sentimentType && sentimentType !== "") {
                    // First, add rating-based filter for GoogleMyBusiness (similar to mentions-trend)
                    if (sentimentType === 'Positive') {
                        basePostsQuery.query.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                    } else if (sentimentType === 'Negative') {
                        basePostsQuery.query.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                    } else if (sentimentType === 'Neutral') {
                        basePostsQuery.query.bool.must.push({ term: { rating: 3 } });
                    }
                    
                    // Also add predicted_sentiment_value filter (similar to mentions-trend)
                    if (Array.isArray(sentimentType)) {
                        basePostsQuery.query.bool.must.push({
                            bool: {
                                should: sentimentType.map(s => ({
                                    term: { "predicted_sentiment_value.keyword": s }
                                })),
                                minimum_should_match: 1
                            }
                        });
                    } else {
                        basePostsQuery.query.bool.must.push({
                            term: {
                                "predicted_sentiment_value.keyword": sentimentType
                            }
                        });
                    }
                }

                // Add query string filter if available
                if (filters.queryString && filters.queryString.trim() !== '') {
                    basePostsQuery.query.bool.must.push({
                        query_string: {
                            query: filters.queryString
                        }
                    });
                }

                // First, get total count with sentiment filter applied
                const countQuery = {
                    ...basePostsQuery,
                    size: 0, // Don't fetch documents, just get count
                };

                const countResponse = await elasticClient.search({
                    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                    body: countQuery
                });

                const totalHits = countResponse?.hits?.total?.value || 0;

                // Build posts query to fetch all posts (up to 10k limit) with sentiment filter
                const postsQuery = {
                    ...basePostsQuery,
                    size: Math.min(totalHits, 10000), // Fetch all posts up to 10k limit
                    sort: [{ p_created_time: { order: "desc" } }]
                };

                const postsResponse = await elasticClient.search({
                    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                    body: postsQuery
                });

                const hits = postsResponse?.hits?.hits || [];
                
                // Batch fetch all label data to avoid connection pool exhaustion
                const postIds = hits.map(hit => hit._id);
                let labelDataMap = {};
                
                if (postIds.length > 0) {
                    try {
                        // Fetch all label data in a single query
                        const allLabelData = await prisma.customers_label_data.findMany({
                            where: {
                                p_id: { in: postIds }
                            }
                        });
                        
                        // Group by p_id and find the latest (highest label_id) for each post
                        const labelDataByPostId = {};
                        allLabelData.forEach(label => {
                            if (!labelDataByPostId[label.p_id]) {
                                labelDataByPostId[label.p_id] = label;
                            } else {
                                // Keep the one with the highest label_id
                                if (label.label_id > labelDataByPostId[label.p_id].label_id) {
                                    labelDataByPostId[label.p_id] = label;
                                }
                            }
                        });
                        
                        // Create map with latest label for each post
                        postIds.forEach(pId => {
                            if (labelDataByPostId[pId]) {
                                labelDataMap[pId] = [labelDataByPostId[pId]];
                            } else {
                                labelDataMap[pId] = [];
                            }
                        });
                    } catch (labelError) {
                        console.error('Error fetching label data:', labelError);
                        // Continue with empty map if label data fetch fails
                        labelDataMap = {};
                    }
                }
                
                formattedPosts = await Promise.all(
                    hits.map(async (hit) => await formatPostData(hit, labelDataMap))
                );
                
                // Set totalPosts to the actual number of formatted posts (matches filtered count)
                totalPosts = formattedPosts.length;
            }

            return res.status(200).json({
                success: true,
                responseOutput,
                googleUrls: googleUrls.length,
                posts: formattedPosts,
                totalPosts: totalPosts
            });

        } catch (error) {
            console.error('Error fetching channel sentiments data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

module.exports = channelSentimentsController; 