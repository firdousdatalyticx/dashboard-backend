const { elasticClient } = require('../../config/elasticsearch');
const { formatSafeDate } = require('../../utils/date.utils');
const { buildQueryString } = require('../../utils/query.utils');
const { processFilters } = require('../social-media/filter.utils');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Format post data for GoogleMyBusiness posts
 * Similar to formatPostData in posts.controller.js
 * @param {Object} hit - Elasticsearch hit object
 * @param {Object} labelDataMap - Map of p_id -> labelData to avoid individual queries
 */
const formatPostData = async (hit, labelDataMap = {}) => {
    const source = hit._source;

    // Use a default image if a profile picture is not provided.
    const profilePic =
        source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

    // Social metrics
    const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
    const following = source.u_following > 0 ? `${source.u_following}` : "";
    const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
    const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

    // Emotion: derive from rating for GoogleMyBusiness.
    const llm_emotion =
        source.llm_emotion ||
        (source.source === "GoogleMyBusiness" && source.rating
            ? source.rating >= 4
                ? "Supportive"
                : source.rating <= 2
                ? "Frustrated"
                : "Neutral"
            : "");

    // Clean up comments URL if available.
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

    // Determine sentiment. If updated manually in the DB, prefer that.
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

    // Handle YouTube-specific fields.
    let youtubeVideoUrl = "";
    let profilePicture2 = "";
    if (source.source === "Youtube") {
        if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
        else if (source.p_id)
            youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
    } else {
        profilePicture2 = source.p_picture ? source.p_picture : "";
    }

    // Determine source icon based on source name.
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

    // Format message text – with special handling for GoogleMaps/Tripadvisor.
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

const mentionsTrendController = {
    /**
     * Get Google mentions trend data
     */
    getMentionsTrend: async (req, res) => {
        try {
            const { topicId, isScadUser, greaterThanTime, lessThanTime, unTopic, sentimentType } = req.body;
            
            // Get Google URLs from middleware - similar to review-trends.controller.js
            const googleUrls = req.googleUrls || [];
            
            // If no Google URLs are provided and they're required, return empty data immediately
            // This ensures we don't show trends for all GoogleMyBusiness entries when no URLs are specified
            if (googleUrls.length === 0) {
                return res.status(200).json({
                    success: true,
                    mentionsGraphData: "",
                    maxMentionData: ",0",
                    googleUrls: 0,
                    debug: {
                        message: "No Google URLs available to filter on",
                        urlFilters: [],
                        sentimentFilter: sentimentType || 'none'
                    }
                });
            }

            // Build topic query string
            let topicQueryString = ""

            // Process filters (including sentiment)
            const filters = processFilters({
                // sentimentType,
                fromDate: greaterThanTime,
                toDate: lessThanTime,
                queryString: topicQueryString
            });

            // Handle unTopic case
            let queryTimeRange = {
                gte: filters.greaterThanTime || greaterThanTime || '2020-01-01',
                lte: filters.lessThanTime || lessThanTime || '2026-12-31'
            };

            if (unTopic === 'true') {
                queryTimeRange = {
                    gte: '2020-01-01',
                    lte: '2026-12-31'
                };
            }

            // Build query with Google source filter - restructured to use must array like review-trends
            // NO AGGREGATION - we'll calculate counts from actual posts returned
            const queryTemplate = {
                query: {
                    bool: {
                        must: [
                            {
                                match: {
                                    source: 'GoogleMyBusiness'
                                }
                            },
                            {
                                range: {
                                    p_created_time: {
                                        gte: queryTimeRange.gte,
                                        lte: queryTimeRange.lte,
                                        format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd||yyyy-MM-dd\'T\'HH:mm:ss'
                                    }
                                }
                            }
                        ]
                    }
                }
            };
            
            // Add query string filter if available
            if (filters.queryString && filters.queryString.trim() !== "") {
                queryTemplate.query.bool.must.push({
                    query_string: {
                        query: filters.queryString
                    }
                });
            }

            
            // Always add Google URLs filter - this is now required as we're checking above
            const urlTerms = googleUrls.map(url => `"${url}"`).join(' OR ');
            queryTemplate.query.bool.must.push({
                bool: {
                    should: [
                        { query_string: { query: `u_source:(${urlTerms})` } },
                        { query_string: { query: `place_url:(${urlTerms})` } }
                    ],
                    minimum_should_match: 1
                }
            });
            
            // Add sentiment filter if needed
            if (sentimentType) {
                if (sentimentType === 'Positive') {
                    queryTemplate.query.bool.must.push({ range: { rating: { gte: 4, lte: 5 } } });
                } else if (sentimentType === 'Negative') {
                    queryTemplate.query.bool.must.push({ range: { rating: { gte: 1, lte: 2 } } });
                } else if (sentimentType === 'Neutral') {
                    queryTemplate.query.bool.must.push({ term: { rating: 3 } });
                } else {
                    // Extract sentiment from query string for other types
                    const sentimentMatch = filters.queryString.match(/AND\s+predicted_sentiment_value:\((.*?)\)/);
                    if (sentimentMatch && sentimentMatch[1]) {
                        queryTemplate.query.bool.must.push({
                            query_string: {
                                query: `predicted_sentiment_value:(${sentimentMatch[1]})`
                            }
                        });
                    }
                }
            }
                  // Add sentiment filter conditionally
                  if (sentimentType &&sentimentType!="") {
                    queryTemplate.query.bool.must.push({
                        term: {
                            "predicted_sentiment_value.keyword": sentimentType
                        }
                    });
                }
            

         

            // First, get total count to determine how many posts to fetch
            const countQuery = {
                ...queryTemplate,
                size: 0, // Don't fetch documents, just get count
            };

            const countResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: countQuery
            });

            const totalHits = countResponse?.hits?.total?.value || 0;

            // Fetch ALL posts (up to 10k limit) - counts will be based on these exact posts
            const postsQuery = {
                ...queryTemplate,
                size: Math.min(totalHits, 10000), // Fetch all posts up to 10k limit
                sort: [{ p_created_time: { order: "desc" } }],
            };

            const postsResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: postsQuery
            });

            // Get all hits - these are the posts we will return
            const allHits = postsResponse?.hits?.hits || [];
            
            // Batch fetch all label data to avoid connection pool exhaustion
            const postIds = allHits.map(hit => hit._id);
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
            
            // Format ALL posts FIRST - these are the exact posts we will return
            const formattedPosts = await Promise.all(
                allHits.map(async (hit) => await formatPostData(hit, labelDataMap))
            );

            // Calculate counts from the EXACT formatted posts we are returning
            // This ensures perfect synchronization - count matches posts exactly
            let postsByDate = {};
            formattedPosts.forEach(post => {
                // Extract date from created_at (format: "MM/DD/YYYY, HH:MM:SS AM/PM")
                const dateStr = post.created_at.split(',')[0];
                const [month, day, year] = dateStr.split('/');
                // Convert to YYYY-MM-DD format to match mentionsGraphData format
                const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                
                if (!postsByDate[isoDate]) {
                    postsByDate[isoDate] = 0;
                }
                postsByDate[isoDate]++;
            });

            // Build synchronized dates array from actual formatted posts
            const synchronizedDatesArray = [];
            let synchronizedMaxDate = '';
            let synchronizedMaxMentions = 0;

            // Get all unique dates from posts and sort them
            const sortedDates = Object.keys(postsByDate).sort((a, b) => new Date(b) - new Date(a));
            
            sortedDates.forEach(date => {
                const count = postsByDate[date];
                synchronizedDatesArray.push(`${date},${count}`);
                
                if (count > synchronizedMaxMentions) {
                    synchronizedMaxMentions = count;
                    synchronizedMaxDate = date;
                }
            });

            // Return ALL posts to ensure synchronization with counts
            // This ensures that if a date shows a count, those posts are in the response
            return res.status(200).json({
                success: true,
                queryTemplate: queryTemplate,
                mentionsGraphData: synchronizedDatesArray.length > 0 ? synchronizedDatesArray.join('|') : "",
                maxMentionData: `${synchronizedMaxDate},${synchronizedMaxMentions}`,
                googleUrls: googleUrls.length,
                posts: formattedPosts, // Return ALL posts, not just 50
                totalPosts: formattedPosts.length, // Total posts returned (matches counts)
                debug: {
                    urlFilters: googleUrls,
                    sentimentFilter: sentimentType || 'none',
                    hasTrendData: synchronizedDatesArray.length > 0,
                    postsFetched: formattedPosts.length,
                    postsReturned: formattedPosts.length,
                    totalHitsInIndex: totalHits
                },
            });

        } catch (error) {
            console.error('Error fetching Google mentions trend data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = mentionsTrendController; 