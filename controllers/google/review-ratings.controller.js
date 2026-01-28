const { elasticClient } = require('../../config/elasticsearch');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { format } = require('date-fns');
const { processFilters } = require('../social-media/filter.utils');

/**
 * Helper function to format date safely
 */
const formatSafeDate = (date) => {
    if (!date) return format(new Date(), 'yyyy-MM-dd');
    const dateObj = new Date(date);
    return isNaN(dateObj.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(dateObj, 'yyyy-MM-dd');
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
 * Controller for Google review ratings data
 */
const reviewRatingsController = {
    /**
     * Get Google review ratings data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} - JSON response with review ratings data
     */
    getReviewRatings: async (req, res) => {
        try {
            const { id, subtopicId, touchId, fromDate,toDate,filterData, filters, sentimentType } = req.body;

            
            // Get Google URLs from middleware
            const googleUrls = req.googleUrls || [];
            
            // If no Google URLs are provided and they're required, return empty data immediately
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    esData: {
                        aggregations: {
                            rating_counts: {
                                buckets: []
                            }
                        },
                        hits: {
                            total: {
                                value: 0
                            },
                            hits: []
                        }
                    },
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on"
                    }
                });
            }

            if (!id) {
                return res.status(400).json({ success: false, error: 'ID is required' });
            }

            const topicId = Number(id);
            if (isNaN(topicId)) {
                return res.status(400).json({ success: false, error: 'Invalid ID' });
            }

            let topicQueryString = '';
            let greaterThanTime = fromDate||process.env.DATA_FETCH_FROM_TIME;
            let lessThanTime = toDate||process.env.DATA_FETCH_TO_TIME;

            // Start with source filter for GoogleMyBusiness
            topicQueryString = 'source:(GoogleMyBusiness)';
            
            // Parse filter data if provided
            let filtersDat = null;
            if (filterData && filters === 'true') {
                try {
                    const decodedFilterData = decodeURIComponent(filterData);
                    filtersDat = JSON.parse(decodedFilterData);

                    // Handle time filters
                    if (filtersDat?.timeSlot && filtersDat?.timeSlot === 'Custom Dates') {
                        if (filtersDat?.startDate && filtersDat?.startDate !== '') {
                            greaterThanTime = formatSafeDate(new Date(filtersDat?.startDate));
                        } else {
                            greaterThanTime = formatSafeDate(new Date(new Date().setDate(new Date().getDate() - 90)));
                        }

                        if (filtersDat?.endDate && filtersDat?.endDate !== '') {
                            lessThanTime = formatSafeDate(new Date(filtersDat?.endDate));
                        } else {
                            lessThanTime = formatSafeDate(new Date());
                        }
                    } else if (filtersDat?.timeSlot) {
                        switch (filtersDat?.timeSlot) {
                            case 'today':
                                greaterThanTime = formatSafeDate(new Date());
                                lessThanTime = formatSafeDate(new Date());
                                break;
                            case '24h':
                                greaterThanTime = formatSafeDate(new Date(new Date().setHours(new Date().getHours() - 24)));
                                lessThanTime = formatSafeDate(new Date());
                                break;
                            default:
                                greaterThanTime = formatSafeDate(
                                    new Date(new Date().setDate(new Date().getDate() - parseInt(filtersDat?.timeSlot)))
                                );
                                lessThanTime = formatSafeDate(new Date());
                        }
                    }

                    // Handle tags filter
                    if (filtersDat?.tags && filtersDat?.tags !== '') {
                        let tagsStr = filtersDat?.tags;
                        let tagsArray = tagsStr.split(',');
                        let topicUrls = '', topicKeyHash = '';

                        tagsArray.forEach(tag => {
                            if (tag) {
                                if (tag.startsWith('http')) {
                                    topicUrls += `"${tag}" ${filtersDat?.operator || 'OR'} `;
                                } else {
                                    topicKeyHash += `"${tag}" ${filtersDat?.operator || 'OR'} `;
                                }
                            }
                        });

                        if (filtersDat?.operator === 'OR') {
                            topicKeyHash = topicKeyHash.slice(0, -4);
                            topicUrls = topicUrls.slice(0, -4);
                        } else {
                            topicKeyHash = topicKeyHash.slice(0, -5);
                            topicUrls = topicUrls.slice(0, -5);
                        }

                        // Override the base query with tags filter
                        if (topicKeyHash && topicUrls) {
                            topicQueryString += ` AND (p_message_text:(${topicKeyHash} OR ${topicUrls}) OR u_username:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}) OR u_source:(${topicUrls}))`;
                        } else if (topicKeyHash && !topicUrls) {
                            topicQueryString += ` AND (p_message_text:(${topicKeyHash}) OR u_fullname:(${topicKeyHash}))`;
                        } else if (!topicKeyHash && topicUrls) {
                            topicQueryString += ` AND u_source:(${topicUrls})`;
                        }
                    }

                    // Add sentiment filter
                    if (filtersDat?.sentimentType && filtersDat?.sentimentType !== 'null') {
                        let sentiArray = filtersDat?.sentimentType.split(',');
                        let sentiStr = sentiArray.map(s => `"${s}"`).join(' OR ');
                        topicQueryString += ` AND predicted_sentiment_value:(${sentiStr})`;
                    }

                    // Add data source filter
                    if (filtersDat?.dataSource && filtersDat?.dataSource !== 'null' && filtersDat?.dataSource !== '') {
                        let dsourceArray = filtersDat?.dataSource.split(',');
                        let dsourceStr = dsourceArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND source:(${dsourceStr})`;
                    }

                    // Add location filter
                    if (filtersDat?.location && filtersDat?.location !== 'null' && filtersDat?.location !== '') {
                        let dlocArray = filtersDat?.location.split(',');
                        let dlocStr = dlocArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND u_country:(${dlocStr})`;
                    }

                    // Add language filter
                    if (filtersDat?.language && filtersDat?.language !== 'null' && filtersDat?.language !== '') {
                        let dlangArray = filtersDat?.language.split(',');
                        let dlangStr = dlangArray.map(d => `"${d}"`).join(' OR ');
                        topicQueryString += ` AND lange_detect:(${dlangStr})`;
                    }
                } catch (error) {
                    console.error('Error parsing filter data:', error);
                }
            }

            // Process sentimentType
            if (sentimentType) {
                const filters = processFilters({
                    sentimentType,
                    queryString: topicQueryString
                });
                topicQueryString = filters.queryString;
            }

            // Format dates for query
            if (greaterThanTime && !greaterThanTime.includes('T') && !greaterThanTime.includes('now')) {
                greaterThanTime = `${greaterThanTime}T00:00:00`;
            }
            if (lessThanTime && !lessThanTime.includes('T') && !lessThanTime.includes('now')) {
                lessThanTime = `${lessThanTime}T23:59:59`;
            }

            // Build base query for counting and fetching
            const baseQuery = {
                query: {
                    bool: {
                        must: [
                            { query_string: { query: topicQueryString, default_operator: "AND" } },
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
            
            // Add Google URLs filter
            if (googleUrls.length > 0) {
                const urlTerms = googleUrls.map(url => `"${url}"`).join(' OR ');
                baseQuery.query.bool.must.push({
                    bool: {
                        should: [
                            { query_string: { query: `u_source:(${urlTerms})` } },
                            { query_string: { query: `place_url:(${urlTerms})` } }
                        ],
                        minimum_should_match: 1
                    }
                });
            }

            // Special coordinate filters for topicIds 2641, 2651, 2652
            if (parseInt(topicId) === 2641) {
                baseQuery.query.bool.must.push({
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
                baseQuery.query.bool.must.push({
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
                baseQuery.query.bool.must.push({
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
                baseQuery.query.bool.must.push({
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
                baseQuery.query.bool.must.push({
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
                baseQuery.query.bool.must.push({
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

            // First, get total count to determine how many posts to fetch
            const countQuery = {
                ...baseQuery,
                size: 0, // Don't fetch documents, just get count
            };

            const countResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: countQuery,
                timeout: '30s'
            });

            const totalHits = countResponse?.hits?.total?.value || 0;

            // Build query to fetch all posts (up to 10k limit) with aggregation
            const query = {
                ...baseQuery,
                size: Math.min(totalHits, 10000), // Fetch all posts up to 10k limit
                sort: [{ p_created_time: { order: "desc" } }],
                aggs: {
                    rating_counts: {
                        terms: {
                            field: "rating",
                            size: 6
                        },
                        aggs: {
                            missing_rating: {
                                missing: {
                                    field: "rating"
                                }
                            }
                        }
                    }
                }
            };

            const esData = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: query,
                timeout: '30s'
            });

            // Format posts from the fetched hits
            const hits = esData?.hits?.hits || [];
            
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
            
            // Format posts using the batched label data
            const formattedPosts = await Promise.all(
                hits.map(async (hit) => await formatPostData(hit, labelDataMap))
            );

            // Calculate rating counts from actual posts returned to ensure synchronization
            const ratingCountsFromPosts = {};
            let missingRatingCount = 0;
            
            formattedPosts.forEach(post => {
                const rating = post.rating;
                if (rating !== null && rating !== undefined) {
                    if (!ratingCountsFromPosts[rating]) {
                        ratingCountsFromPosts[rating] = 0;
                    }
                    ratingCountsFromPosts[rating]++;
                } else {
                    // Count posts without ratings
                    missingRatingCount++;
                }
            });

            // Build synchronized aggregation response from actual posts
            const synchronizedBuckets = [];
            Object.keys(ratingCountsFromPosts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(rating => {
                synchronizedBuckets.push({
                    key: parseInt(rating),
                    doc_count: ratingCountsFromPosts[rating],
                    missing_rating: {
                        doc_count: 0 // No missing ratings in this bucket
                    }
                });
            });

            // Add missing_rating bucket if there are posts without ratings
            if (missingRatingCount > 0) {
                synchronizedBuckets.push({
                    key: null,
                    key_as_string: null,
                    doc_count: missingRatingCount,
                    missing_rating: {
                        doc_count: missingRatingCount
                    }
                });
            }

            // Update esData aggregations with synchronized counts
            const synchronizedEsData = {
                ...esData,
                aggregations: {
                    rating_counts: {
                        buckets: synchronizedBuckets
                    }
                }
            };

            return res.status(200).json({
                success: true,
                esData: synchronizedEsData,
                googleUrls: googleUrls.length,
                posts: formattedPosts, // Return ALL posts, not just 50
                totalPosts: formattedPosts.length // Total posts returned (matches counts)
            });

        } catch (error) {
            console.error('Error fetching review ratings data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = reviewRatingsController;
