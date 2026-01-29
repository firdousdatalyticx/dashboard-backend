const { elasticClient } = require('../../config/elasticsearch');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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
 * Controller for Google channel source data
 */
const channelSourceController = {
    /**
     * Get channel source data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with channel source data
     */
    getChannelSource: async (req, res) => {
        try {
            const { topicId, greaterThanTime, lessThanTime, isScadUser, selectedTab, sentimentType } = req.body;
            const googleUrls = req.googleUrls || [];
            let topicQueryString = '';
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    channelSourceCount: '',
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }
            
            // Process filters for sentiment
            const filters = processFilters({
                sentimentType,
                queryString: topicQueryString
            });

            // Define sources
            let sources = [
                { name: 'GoogleMyBusiness', query: 'source:("GoogleMyBusiness")', count: 0 }
            ];

            // Fetch counts for each source
            await Promise.all(
                sources.map(async source => {
                    // Build the full query template with structured bool query
                    const queryTemplate = {
                        query: {
                            bool: {
                                must: [
                                    // Source filter
                                    {
                                        term: {
                                            "source.keyword": "GoogleMyBusiness"
                                        }
                                    },
                                    // Date range filter with broad defaults to match data range
                                    {
                                        range: {
                                            p_created_time: {
                                                gte: greaterThanTime || '2020-01-01',
                                                lte: lessThanTime || '2026-12-31',
                                                format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                            }
                                        }
                                    }
                                ],
                                should: [],
                                minimum_should_match: 0
                            }
                        }
                    };
                    
                    // Add URL filter for GoogleMyBusiness if applicable
                    if (googleUrls.length > 0) {
                        const urlShouldClauses = [];
                        
                        // Add u_source clauses
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({
                                term: { "u_source.keyword": url }
                            });
                        });
                        
                        // Add place_url clauses
                        googleUrls.forEach(url => {
                            urlShouldClauses.push({
                                term: { "place_url.keyword": url }
                            });
                        });
                        
                        // Add should clause with minimum_should_match=1
                        queryTemplate.query.bool.must.push({
                            bool: {
                                should: urlShouldClauses,
                                minimum_should_match: 1
                            }
                        });
                    }
                    
                    // Add sentiment filter with rating-based logic for GoogleMyBusiness (similar to mentions-trend)
                    if (sentimentType && sentimentType !== "") {
                        // First, add rating-based filter for GoogleMyBusiness
                        if (sentimentType === 'Positive') {
                            queryTemplate.query.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                        } else if (sentimentType === 'Negative') {
                            queryTemplate.query.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                        } else if (sentimentType === 'Neutral') {
                            queryTemplate.query.bool.must.push({ term: { rating: 3 } });
                        }
                        
                        // Also add predicted_sentiment_value filter
                        if (Array.isArray(sentimentType)) {
                            queryTemplate.query.bool.must.push({
                                bool: {
                                    should: sentimentType.map(s => ({
                                        term: { "predicted_sentiment_value.keyword": s }
                                    })),
                                    minimum_should_match: 1
                                }
                            });
                        } else {
                            queryTemplate.query.bool.must.push({
                                term: {
                                    "predicted_sentiment_value.keyword": sentimentType
                                }
                            });
                        }
                    }

                    // Special coordinate filters for topicIds 2641, 2651, 2652
                    if (parseInt(topicId) === 2641) {
                        queryTemplate.query.bool.must.push({
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
                        queryTemplate.query.bool.must.push({
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
                        queryTemplate.query.bool.must.push({
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
                        queryTemplate.query.bool.must.push({
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
                        queryTemplate.query.bool.must.push({
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
                        queryTemplate.query.bool.must.push({
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

                    // Apply any additional filters from the filter processor (if not already handled by sentimentType)
                    if (filters.sentimentFilter && !sentimentType) {
                        queryTemplate.query.bool.must.push(filters.sentimentFilter);
                    }
                    
                    // Execute the count query against Elasticsearch
                    const result = await elasticClient.count({
                        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                        body: queryTemplate
                    });
                    source.count = result.count;
                })
            );

            const totalSourcesCount = sources.reduce((sum, source) => sum + source.count, 0);

            // Construct response for sources
            let responseOutput = sources
                .filter(source => source.count > 0)
                .map(source => `${source.name},${source.count},${((source.count / totalSourcesCount) * 100).toFixed(2)}`)
                .join('|');

            const channelSourceCount = responseOutput || '';

            // Fetch posts using the same query but without count
            let postsQuery = null;
            if (sources.length > 0 && sources[0].count > 0) {
                // Build base posts query
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
                                            gte: greaterThanTime || '2020-01-01',
                                            lte: lessThanTime || '2026-12-31',
                                            format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                        }
                                    }
                                }
                            ],
                            should: [],
                            minimum_should_match: 0
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

                // Add sentiment filter with rating-based logic for GoogleMyBusiness (similar to mentions-trend)
                if (sentimentType && sentimentType !== "") {
                    // First, add rating-based filter for GoogleMyBusiness
                    if (sentimentType === 'Positive') {
                        basePostsQuery.query.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                    } else if (sentimentType === 'Negative') {
                        basePostsQuery.query.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                    } else if (sentimentType === 'Neutral') {
                        basePostsQuery.query.bool.must.push({ term: { rating: 3 } });
                    }
                    
                    // Also add predicted_sentiment_value filter
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
                } else if (filters.sentimentFilter) {
                    // Apply filter from processor if sentimentType not provided
                    basePostsQuery.query.bool.must.push(filters.sentimentFilter);
                }

                // Special coordinate filters for topicIds 2641, 2651, 2652
                if (parseInt(topicId) === 2641) {
                    basePostsQuery.query.bool.must.push({
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
                    basePostsQuery.query.bool.must.push({
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
                    basePostsQuery.query.bool.must.push({
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
                postsQuery = {
                    ...basePostsQuery,
                    size: Math.min(totalHits, 10000), // Fetch all posts up to 10k limit
                    sort: [{ p_created_time: { order: "desc" } }]
                };
            }

            let formattedPosts = [];
            let totalPosts = 0;
            if (postsQuery) {
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
                channelSourceCount,
                googleUrls: googleUrls.length,
                posts: formattedPosts,
                totalPosts: totalPosts
            });

        } catch (error) {
            console.error('Error fetching channel source data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

module.exports = channelSourceController;
