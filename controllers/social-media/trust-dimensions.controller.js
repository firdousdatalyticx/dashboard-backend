const prisma = require('../../config/database');
const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays } = require('date-fns');

const trustDimensionsController = {
    /**
     * Get trust dimensions analysis data for social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with trust dimensions counts by category and tone
     */
    getTrustDimensionsAnalysis: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: true,
                    trustDimensions: [],
                    totalCount: 0
                });
            }

            // Set date range - for special topic, don't use default 90 days restriction
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
            
            if (isSpecialTopic) {
                // For special topic, use wider range if not provided
                effectiveGreaterThanTime = greaterThanTime || '2020-01-01';
                effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
            } else {
                // Original logic with 90 days default if not provided
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

            // Add filter to only include posts with trust_dimensions field
            query.bool.must.push({
                exists: {
                    field: 'trust_dimensions'
                }
            });

            // Execute the query to get all documents with trust_dimensions
            const params = {
                size: 10000, // Increase size to get more documents for processing
                query: query,
                _source: [
                    'trust_dimensions', 
                    'created_at', 
                    'source',
                    'p_message', 
                    'p_message_text', 
                    'u_profile_photo',
                    'u_followers',
                    'u_following',
                    'u_posts',
                    'p_likes',
                    'p_comments_text',
                    'p_url',
                    'p_comments',
                    'p_shares',
                    'p_engagement',
                    'p_content',
                    'p_picture_url',
                    'predicted_sentiment_value',
                    'predicted_category',
                    'u_fullname',
                    'p_created_time',
                    'video_embed_url',
                    'p_picture',
                    'p_id',
                    'rating',
                    'comment',
                    'business_response',
                    'u_source',
                    'name',
                    'llm_emotion'
                ]
            };

            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Process the trust dimensions data
            const trustDimensionsMap = new Map();
            let totalCount = 0;

            response.hits.hits.forEach(hit => {
                const trustDimensionsStr = hit._source.trust_dimensions;
                
                if (trustDimensionsStr && trustDimensionsStr.trim() !== '') {
                    try {
                        const trustDimensions = JSON.parse(trustDimensionsStr);
                        
                        // Create post details object for this post
                        const postDetails = formatPostData(hit);
                        
                        // Process each trust dimension in the document
                        Object.entries(trustDimensions).forEach(([dimension, tone]) => {
                            if (!trustDimensionsMap.has(dimension)) {
                                trustDimensionsMap.set(dimension, {
                                    category: dimension,
                                    totalCount: 0,
                                    Supportive: 0,
                                    'Not Applicable': 0,
                                    Distrustful: 0,
                                    Neutral: 0,
                                    Mixed: 0,
                                    posts: {
                                        Supportive: [],
                                        'Not Applicable': [],
                                        Distrustful: [],
                                        Neutral: [],
                                        Mixed: []
                                    }
                                });
                            }
                            
                            const dimensionData = trustDimensionsMap.get(dimension);
                            dimensionData.totalCount++;
                            
                            // Normalize tone value and increment count
                            const normalizedTone = tone.trim();
                            if (dimensionData.hasOwnProperty(normalizedTone)) {
                                dimensionData[normalizedTone]++;
                                dimensionData.posts[normalizedTone].push(postDetails);
                            } else {
                                // Handle any unexpected tone values as 'Mixed'
                                dimensionData.Mixed++;
                                dimensionData.posts.Mixed.push(postDetails);
                            }
                            
                            totalCount++;
                        });
                    } catch (error) {
                        console.error('Error parsing trust_dimensions JSON:', error, trustDimensionsStr);
                    }
                }
            });

            // Convert map to array and calculate percentages
            const trustDimensionsArray = Array.from(trustDimensionsMap.values()).map(dimension => {
                const totalForDimension = dimension.totalCount;
                
                return {
                    category: dimension.category,
                    totalCount: totalForDimension,
                    tones: [
                        {
                            name: 'Supportive',
                            count: dimension.Supportive,
                            percentage: totalForDimension > 0 ? Math.round((dimension.Supportive / totalForDimension) * 100) : 0,
                            posts: dimension.posts.Supportive
                        },
                        {
                            name: 'Not Applicable',
                            count: dimension['Not Applicable'],
                            percentage: totalForDimension > 0 ? Math.round((dimension['Not Applicable'] / totalForDimension) * 100) : 0,
                            posts: dimension.posts['Not Applicable']
                        },
                        {
                            name: 'Distrustful',
                            count: dimension.Distrustful,
                            percentage: totalForDimension > 0 ? Math.round((dimension.Distrustful / totalForDimension) * 100) : 0,
                            posts: dimension.posts.Distrustful
                        },
                        {
                            name: 'Neutral',
                            count: dimension.Neutral,
                            percentage: totalForDimension > 0 ? Math.round((dimension.Neutral / totalForDimension) * 100) : 0,
                            posts: dimension.posts.Neutral
                        },
                        {
                            name: 'Mixed',
                            count: dimension.Mixed,
                            percentage: totalForDimension > 0 ? Math.round((dimension.Mixed / totalForDimension) * 100) : 0,
                            posts: dimension.posts.Mixed
                        }
                    ]
                };
            });

            // Sort by total count descending
            trustDimensionsArray.sort((a, b) => b.totalCount - a.totalCount);

            return res.json({
                success: true,
                trustDimensions: trustDimensionsArray,
                totalCount: totalCount,
                query:params
            });

        } catch (error) {
            console.error('Error fetching trust dimensions analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },
    getTrustDimensionsAnalysisWordCloud: async (req, res) => {
    try {
        const {
            interval = 'monthly',
            source = 'All',
            category = 'all',
            timeSlot,
            fromDate,
            toDate,
            sentiment
        } = req.body;

        // Get category data from middleware
        const categoryData = req.processedCategories || {};
        const rawCategories = req.rawCategories || [];

        if (Object.keys(categoryData).length === 0) {
            return res.json({
                success: true,
                trustDimensions: [],
                totalTrustPosts: 0
            });
        }

        // Handle date range based on timeSlot
        const now = new Date();
        let startDate;
        let endDate = now;
        let useTimeFilter = true;

        // Only apply date filter if timeSlot is provided
        if (!timeSlot && !fromDate && !toDate) {
            useTimeFilter = false;
        } else if (timeSlot === 'Custom date' && fromDate && toDate) {
            startDate = parseISO(fromDate);
            endDate = parseISO(toDate);
        } else if (timeSlot) {
            // Handle predefined time slots
            switch (timeSlot) {
                case 'last24hours':
                    startDate = subDays(now, 1);
                    break;
                case 'last7days':
                    startDate = subDays(now, 7);
                    break;
                case 'last30days':
                    startDate = subDays(now, 30);
                    break;
                case 'last60days':
                    startDate = subDays(now, 60);
                    break;
                case 'last120days':
                    startDate = subDays(now, 120);
                    break;
                case 'last90days':
                    startDate = subDays(now, 90);
                    break;
                default:
                    useTimeFilter = false;
                    break;
            }
        } else {
            useTimeFilter = false;
        }
        
        const greaterThanTime = useTimeFilter ? format(startDate, 'yyyy-MM-dd') : null;
        const lessThanTime = useTimeFilter ? format(endDate, 'yyyy-MM-dd') : null;

        // Build base query
        const query = {
            bool: {
                must: [
                    {
                        exists: {
                            field: 'trust_dimensions'
                        }
                    }
                ],
                 must_not: [
              { term: { "trust_dimensions.keyword": "" } },
              { term: { "trust_dimensions.keyword": "{}" } },
               { term: { "theme_evidences.keyword": "" } },
               { term: { "theme_evidences.keyword": "{}" } },
                 ]
            }
        };
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

        // Only add date range filter if timeSlot is provided
        if (useTimeFilter) {
            query.bool.must.push({
                range: {
                    p_created_time: {
                        gte: `${greaterThanTime}T00:00:00.000Z`,
                        lte: `${lessThanTime}T23:59:59.999Z`
                    }
                }
            });
        }

        // Add category filters
        if (category === 'all') {
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
        } else if (categoryData[category]) {
            const data = categoryData[category];

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

        // Set up the search parameters
        const params = {
            size: 10000, // Increased size to get more documents for processing
            query: query,
            _source: [
                "trust_dimensions", 
                "theme_evidences",
                "p_message", 
                "p_message_text", 
                "created_at", 
                "source",
                "u_profile_photo",
                "u_followers",
                "u_following",
                "u_posts",
                "p_likes",
                "p_comments_text",
                "p_url",
                "p_comments",
                "p_shares",
                "p_engagement",
                "p_content",
                "p_picture_url",
                "predicted_sentiment_value",
                "u_fullname",
                "p_created_time",
                "video_embed_url",
                "p_picture",
                "p_id"
            ]
        };

        // Execute the search
        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: params
        });


const hits = response?.hits?.hits || [];
const trustDimensionsMap = {};
const dimensionsByTone = {
  Supportive: [],
  Distrustful: [],
  Neutral: [],
  Mixed: [],
  "Not Applicable": []
};

const toneColors = {
  Supportive: "#52C41A",
  Distrustful: "#FF4D4F",
  Neutral: "#1890FF",
  Mixed: "#FAAD14",
  "Not Applicable": "#8C8C8C"
};

let totalTrustPosts = 0;

for (const esData of hits) {
  const source = esData._source;

  let trustDimensionsData = {};
  try {
    trustDimensionsData = typeof source.trust_dimensions === "string"
      ? JSON.parse(source.trust_dimensions)
      : source.trust_dimensions || {};
  } catch (err) {
    console.error("Invalid trust_dimensions:", err);
  }

  const themes = source.theme_evidences || [];

  if (Object.keys(trustDimensionsData).length > 0) {
    totalTrustPosts++;

    const tone = Object.values(trustDimensionsData)[0]?.trim() || "Not Applicable";
    const color = toneColors[tone] || "#8C8C8C";

    const profilePic = source.u_profile_photo || `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;
    const imageUrl = source.p_picture_url?.trim() !== ""
      ? source.p_picture_url
      : `${process?.env?.PUBLIC_IMAGES_PATH}grey.png`;

    const commentsUrl = source.p_comments_text
      ? source.p_url?.trim().replace("https: // ", "https://")
      : "";

    let predicted_sentiment = "";
    const chk_senti = await prisma.customers_label_data.findMany({
      where: { p_id: esData._id },
      orderBy: { label_id: "desc" },
      take: 1,
    });
    if (chk_senti.length > 0 && chk_senti[0]?.predicted_sentiment_value_requested) {
      predicted_sentiment = chk_senti[0].predicted_sentiment_value_requested;
    } else {
      predicted_sentiment = source.predicted_sentiment_value || "";
    }

    const youtubeVideoUrl = source.source === "Youtube"
      ? (source.video_embed_url || (source.p_id ? `https://www.youtube.com/embed/${source.p_id}` : ""))
      : "";

    const sourceIcon = (() => {
      const s = source.source;
      if (["khaleej_times", "Omanobserver", "Time of oman", "Blogs"].includes(s)) return "Blog";
      if (s === "Reddit") return "Reddit";
      if (["FakeNews", "News"].includes(s)) return "News";
      if (s === "Tumblr") return "Tumblr";
      if (["Web", "DeepWeb"].includes(s)) return "Web";
      return s;
    })();

    const message_text = ["GoogleMaps", "Tripadvisor"].includes(source.source)
      ? (source.p_message_text?.split("***|||###")[0] || "").replace(/\n/g, "<br>")
      : (source.p_message_text || "").replace(/<\/?[^>]+(>|$)/g, "");

    const cardData = {
      profilePicture: profilePic,
      profilePicture2: source.p_picture || "",
      userFullname: source.u_fullname,
      user_data_string: "",
      followers: source.u_followers > 0 ? `${source.u_followers}` : "",
      following: source.u_following > 0 ? `${source.u_following}` : "",
      posts: source.u_posts > 0 ? `${source.u_posts}` : "",
      likes: source.p_likes > 0 ? `${source.p_likes}` : "",
      llm_emotion: source.llm_emotion || "",
      commentsUrl,
      comments: `${source.p_comments}`,
      shares: source.p_shares > 0 ? `${source.p_shares}` : "",
      engagements: source.p_engagement > 0 ? `${source.p_engagement}` : "",
      content: source.p_content || "",
      image_url: imageUrl,
      predicted_sentiment,
      predicted_category: source.predicted_category || "",
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
    };

    for (const theme of themes) {
      const themeText = theme.split(" ").slice(0, 5).join(" ");

      if (!trustDimensionsMap[themeText]) {
        trustDimensionsMap[themeText] = {
          text: themeText,
          value: 1,
          tone,
          color,
          posts: [cardData],
        };
      } else {
        trustDimensionsMap[themeText].value++;
        trustDimensionsMap[themeText].posts.push(cardData);
      }

      if (!dimensionsByTone[tone]) dimensionsByTone[tone] = [];
      const toneArr = dimensionsByTone[tone];

      const found = toneArr.find((d) => d.text === themeText);
      if (!found) {
        toneArr.push({ text: themeText, value: 1, posts: [cardData] });
      } else {
        found.value++;
        found.posts.push(cardData);
      }
    }
  }
}

const toneTotals = {};
Object.entries(dimensionsByTone).forEach(([tone, dimensions]) => {
  toneTotals[tone] = dimensions.reduce((acc, d) => acc + d.value, 0);
});

return res.json({
  response,
  success: true,
  trustDimensions: Object.values(trustDimensionsMap),
  totalTrustPosts,
  toneTotals,
  dimensionsByTone,
  dateRange: useTimeFilter
    ? { from: greaterThanTime, to: lessThanTime }
    : null
});

} catch (error) {
        console.error('Error fetching trust dimensions analysis data:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
},

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
        created_at: new Date(source.p_created_time || source.created_at).toLocaleString()
    };
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
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

module.exports = trustDimensionsController; 