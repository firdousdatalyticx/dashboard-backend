const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays } = require('date-fns');

/**
 * Controller for analyzing inflation-related phrases from social media posts
 */
const inflationAnalysisController = {
    /**
     * Get inflation phrases analysis data from social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with inflation phrases analysis
     */
    getInflationAnalysis: async (req, res) => {
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
                    inflationPhrases: [],
                    totalInflationPosts: 0
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
                                field: 'llm_inflation'
                            }
                        }
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
                size: 500, // Limit to 500 posts
                query: query,
                _source: [
                    "llm_inflation", 
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

            // Initialize phrase counters and collections
            const phraseCounts = {};
            const phrasesByDirection = {
                rising: [],
                falling: [],
                stabilizing: [],
                volatile: []
            };

            let totalInflationPosts = 0;

            // Process each post
            if (response.hits && response.hits.hits) {
                response.hits.hits.forEach(hit => {
                    const source = hit._source;
                    
                    try {
                        // Parse the llm_inflation field which is stored as a string
                        let inflationData;
                        if (typeof source.llm_inflation === 'string') {
                            inflationData = JSON.parse(source.llm_inflation);
                        } else {
                            inflationData = source.llm_inflation;
                        }

                        // Only process posts where is_inflation_related is true
                        if (inflationData && inflationData.is_inflation_related === true) {
                            totalInflationPosts++;
                            
                            // Get the inflation trend direction, default to "unknown" if not present
                            const direction = inflationData.inflation_trend_direction || "unknown";
                            
                            // Create post details object for this post
                            const postDetails = {
                                profilePicture: source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                profilePicture2: source.p_picture || '',
                                userFullname: source.u_fullname,
                                followers: source.u_followers > 0 ? `${source.u_followers}` : '',
                                following: source.u_following > 0 ? `${source.u_following}` : '',
                                posts: source.u_posts > 0 ? `${source.u_posts}` : '',
                                likes: source.p_likes > 0 ? `${source.p_likes}` : '',
                                commentsUrl: source.p_comments_text ? source.p_url.trim().replace('https: // ', 'https://') : '',
                                comments: `${source.p_comments}`,
                                shares: source.p_shares > 0 ? `${source.p_shares}` : '',
                                engagements: source.p_engagement > 0 ? `${source.p_engagement}` : '',
                                content: source.p_content || '',
                                image_url: source.p_picture_url || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                predicted_sentiment: source.predicted_sentiment_value || '',
                                youtube_video_url: source.video_embed_url || (source.source === 'Youtube' && source.p_id ? `https://www.youtube.com/embed/${source.p_id}` : ''),
                                source_icon: `${source.p_url},${source.source}`,
                                message_text: source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '',
                                source: source.source,
                                created_at: new Date(source.p_created_time).toLocaleString()
                            };
                            
                            // Gather all filter terms
                            let allFilterTerms = [];
                            if (categoryData) {
                                Object.values(categoryData).forEach((data) => {
                                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                                });
                            }
                            // When creating postDetails, add matched_terms
                            const textFields = [
                                source.p_message_text,
                                source.p_message,
                                source.keywords,
                                source.title,
                                source.hashtags,
                                source.u_source,
                                source.p_url,
                                source.u_fullname
                            ];
                            postDetails.matched_terms = allFilterTerms.filter(term =>
                                textFields.some(field => {
                                    if (!field) return false;
                                    if (Array.isArray(field)) {
                                        return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                                    }
                                    return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                                })
                            );

                            // Process each phrase in the inflation_trigger_phrases array
                            if (Array.isArray(inflationData.inflation_trigger_phrases)) {
                                inflationData.inflation_trigger_phrases.forEach(phrase => {
                                    // Clean up the phrase
                                    const cleanPhrase = phrase.trim();
                                    
                                    // Set color based on direction
                                    let color;
                                    switch(direction.toLowerCase()) {
                                        case 'rising':
                                            color = '#FF4D4F'; // Red
                                            break;
                                        case 'falling':
                                            color = '#52C41A'; // Green
                                            break;
                                        case 'volatile':
                                            color = '#FAAD14'; // Yellow
                                            break;
                                        case 'stabilizing':
                                            color = '#1890FF'; // Blue
                                            break;
                                        default:
                                            color = '#8C8C8C'; // Grey
                                    }
                                    
                                    // Update phrase count
                                    if (!phraseCounts[cleanPhrase]) {
                                        phraseCounts[cleanPhrase] = {
                                            text: cleanPhrase,
                                            value: 1, // Initial count
                                            direction: direction,
                                            posts: [postDetails]
                                        };
                                    } else {
                                        phraseCounts[cleanPhrase].value++;
                                        // Add post to existing phrase if not already included
                                        phraseCounts[cleanPhrase].posts.push(postDetails);
                                    }
                                    
                                    // Add to direction-based collection if not already present
                                    if (!phrasesByDirection[direction]) {
                                        phrasesByDirection[direction] = [];
                                    }
                                    
                                    const existingPhrase = phrasesByDirection[direction].find(p => p.text === cleanPhrase);
                                    if (!existingPhrase) {
                                        phrasesByDirection[direction].push({
                                            text: cleanPhrase,
                                            value: 1,
                                            posts: [postDetails]
                                        });
                                    } else {
                                        existingPhrase.value++;
                                        existingPhrase.posts.push(postDetails);
                                    }
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error processing inflation data:', error);
                    }
                });
            }

            // Convert phrase counts object to array for response
            const inflationPhrases = Object.values(phraseCounts);

            // Get direction totals
            const directionTotals = {
                rising: phrasesByDirection.rising ? phrasesByDirection.rising.length : 0,
                falling: phrasesByDirection.falling ? phrasesByDirection.falling.length : 0,
                stabilizing: phrasesByDirection.stabilizing ? phrasesByDirection.stabilizing.length : 0,
                volatile: phrasesByDirection.volatile ? phrasesByDirection.volatile.length : 0
            };

            return res.json({
                success: true,
                inflationPhrases,
                totalInflationPosts,
                directionTotals,
                dateRange: useTimeFilter ? {
                    from: greaterThanTime,
                    to: lessThanTime
                } : null
            });

        } catch (error) {
            console.error('Error fetching inflation analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    /**
     * Get statistics of inflation trigger phrases grouped by direction
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with phrase statistics by direction
     */
    getInflationTriggerPhraseStats: async (req, res) => {
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
                    data: [],
                    totalInflationPosts: 0
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
                                field: 'llm_inflation'
                            }
                        }
                    ]
                }
            };

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
                size: 500,
                query: query,
                _source: [
                    "llm_inflation",
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

            // Initialize sector stats
            const sectorStats = {};

            let totalInflationPosts = 0;

            // Process each post
            if (response.hits && response.hits.hits) {
                response.hits.hits.forEach(hit => {
                    const source = hit._source;
                    
                    try {
                        // Parse the llm_inflation field which is stored as a string
                        let inflationData;
                        if (typeof source.llm_inflation === 'string') {
                            inflationData = JSON.parse(source.llm_inflation);
                        } else {
                            inflationData = source.llm_inflation;
                        }

                        // Only process posts where is_inflation_related is true
                        if (inflationData && inflationData.is_inflation_related === true) {
                            totalInflationPosts++;
                            
                            // Get the inflation trend direction
                            const direction = inflationData.inflation_trend_direction?.toLowerCase() || "unknown";

                            // Create post details object for this post
                            const postDetails = {
                                profilePicture: source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                profilePicture2: source.p_picture || '',
                                userFullname: source.u_fullname,
                                followers: source.u_followers > 0 ? `${source.u_followers}` : '',
                                following: source.u_following > 0 ? `${source.u_following}` : '',
                                posts: source.u_posts > 0 ? `${source.u_posts}` : '',
                                likes: source.p_likes > 0 ? `${source.p_likes}` : '',
                                commentsUrl: source.p_comments_text ? source.p_url.trim().replace('https: // ', 'https://') : '',
                                comments: `${source.p_comments}`,
                                shares: source.p_shares > 0 ? `${source.p_shares}` : '',
                                engagements: source.p_engagement > 0 ? `${source.p_engagement}` : '',
                                content: source.p_content || '',
                                image_url: source.p_picture_url || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                predicted_sentiment: source.predicted_sentiment_value || '',
                                youtube_video_url: source.video_embed_url || (source.source === 'Youtube' && source.p_id ? `https://www.youtube.com/embed/${source.p_id}` : ''),
                                source_icon: `${source.p_url},${source.source}`,
                                message_text: source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '',
                                source: source.source,
                                created_at: new Date(source.p_created_time).toLocaleString()
                            };
                            
                            // Gather all filter terms
                            let allFilterTerms = [];
                            if (categoryData) {
                                Object.values(categoryData).forEach((data) => {
                                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                                });
                            }
                            // When creating postDetails, add matched_terms
                            const textFields = [
                                source.p_message_text,
                                source.p_message,
                                source.keywords,
                                source.title,
                                source.hashtags,
                                source.u_source,
                                source.p_url,
                                source.u_fullname
                            ];
                            postDetails.matched_terms = allFilterTerms.filter(term =>
                                textFields.some(field => {
                                    if (!field) return false;
                                    if (Array.isArray(field)) {
                                        return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                                    }
                                    return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                                })
                            );

                            // Process each sector in the inflation_affected_sectors array
                            if (Array.isArray(inflationData.inflation_affected_sectors)) {
                                inflationData.inflation_affected_sectors.forEach(sector => {
                                    // Clean up the sector name
                                    const cleanSector = sector.trim();
                                    
                                    // Initialize sector if not exists
                                    if (!sectorStats[cleanSector]) {
                                        sectorStats[cleanSector] = {
                                            sector: cleanSector,
                                            rising: 0,
                                            falling: 0,
                                            stabilizing: 0,
                                            volatile: 0,
                                            total: 0,
                                            posts: {
                                                rising: [],
                                                falling: [],
                                                stabilizing: [],
                                                volatile: []
                                            }
                                        };
                                    }
                                    
                                    // Increment the appropriate direction counter and add post details
                                    if (direction in sectorStats[cleanSector]) {
                                        sectorStats[cleanSector][direction]++;
                                        sectorStats[cleanSector].total++;
                                        sectorStats[cleanSector].posts[direction].push(postDetails);
                                    }
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error processing inflation data:', error);
                    }
                });
            }

            // Convert to array and sort by total mentions
            const chartData = Object.values(sectorStats).sort((a, b) => b.total - a.total);

            return res.json({
                success: true,
                data: chartData,
                totalInflationPosts,
                dateRange: useTimeFilter ? {
                    from: greaterThanTime,
                    to: lessThanTime
                } : null
            });

        } catch (error) {
            console.error('Error in getInflationTriggerPhraseStats:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message
            });
        }
    },

    /**
     * Get distribution of inflation types across all posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with inflation type distribution data
     */
    getInflationTypeDistribution: async (req, res) => {
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
                    data: [],
                    totalInflationPosts: 0
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
                                field: 'llm_inflation'
                            }
                        }
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

            // Add category filters (reusing existing category filter logic)
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
                const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
                const hasHashtags = Array.isArray(data.hashtags) && data.hashtags.length > 0;
                const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

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
                    query.bool.must.push({
                        bool: {
                            must_not: {
                                match_all: {}
                            }
                        }
                    });
                }
            }

            // Execute the search
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: {
                    size: 500,
                    query: query,
                    _source: [
                        "llm_inflation",
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
                }
            });

            // Initialize counters and storage for posts
            const inflationTypeData = {};
            let totalInflationPosts = 0;
            let totalInflationTypes = 0;

            // Process each post
            if (response.hits && response.hits.hits) {
                response.hits.hits.forEach(hit => {
                    const source = hit._source;
                    
                    try {
                        // Parse the llm_inflation field
                        let inflationData;
                        if (typeof source.llm_inflation === 'string') {
                            inflationData = JSON.parse(source.llm_inflation);
                        } else {
                            inflationData = source.llm_inflation;
                        }

                        // Only process posts where is_inflation_related is true
                        if (inflationData && inflationData.is_inflation_related === true) {
                            totalInflationPosts++;
                            
                            // Create post details object
                            const postDetails = {
                                profilePicture: source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                profilePicture2: source.p_picture || '',
                                userFullname: source.u_fullname,
                                followers: source.u_followers > 0 ? `${source.u_followers}` : '',
                                following: source.u_following > 0 ? `${source.u_following}` : '',
                                posts: source.u_posts > 0 ? `${source.u_posts}` : '',
                                likes: source.p_likes > 0 ? `${source.p_likes}` : '',
                                commentsUrl: source.p_comments_text ? source.p_url.trim().replace('https: // ', 'https://') : '',
                                comments: `${source.p_comments}`,
                                shares: source.p_shares > 0 ? `${source.p_shares}` : '',
                                engagements: source.p_engagement > 0 ? `${source.p_engagement}` : '',
                                content: source.p_content || '',
                                image_url: source.p_picture_url || `${process.env.PUBLIC_IMAGES_PATH}grey.png`,
                                predicted_sentiment: source.predicted_sentiment_value || '',
                                youtube_video_url: source.video_embed_url || (source.source === 'Youtube' && source.p_id ? `https://www.youtube.com/embed/${source.p_id}` : ''),
                                source_icon: `${source.p_url},${source.source}`,
                                message_text: source.p_message_text ? source.p_message_text.replace(/<\/?[^>]+(>|$)/g, '') : '',
                                source: source.source,
                                created_at: new Date(source.p_created_time).toLocaleString()
                            };
                            
                            // Gather all filter terms
                            let allFilterTerms = [];
                            if (categoryData) {
                                Object.values(categoryData).forEach((data) => {
                                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                                });
                            }
                            // When creating postDetails, add matched_terms
                            const textFields = [
                                source.p_message_text,
                                source.p_message,
                                source.keywords,
                                source.title,
                                source.hashtags,
                                source.u_source,
                                source.p_url,
                                source.u_fullname
                            ];
                            postDetails.matched_terms = allFilterTerms.filter(term =>
                                textFields.some(field => {
                                    if (!field) return false;
                                    if (Array.isArray(field)) {
                                        return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
                                    }
                                    return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
                                })
                            );

                            // Process inflation types
                            if (Array.isArray(inflationData.inflation_type)) {
                                inflationData.inflation_type.forEach(type => {
                                    const cleanType = type.trim().toLowerCase();
                                    
                                    // Initialize type data if not exists
                                    if (!inflationTypeData[cleanType]) {
                                        inflationTypeData[cleanType] = {
                                            type: cleanType,
                                            count: 0,
                                            posts: []
                                        };
                                    }
                                    
                                    inflationTypeData[cleanType].count++;
                                    inflationTypeData[cleanType].posts.push(postDetails);
                                    totalInflationTypes++;
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error processing inflation data:', error);
                    }
                });
            }

            // Calculate percentages and prepare chart data
            const chartData = Object.values(inflationTypeData).map(typeData => ({
                type: typeData.type,
                count: typeData.count,
                percentage: ((typeData.count / totalInflationTypes) * 100).toFixed(2),
                posts: typeData.posts
            }));

            // Sort by percentage in descending order
            chartData.sort((a, b) => b.percentage - a.percentage);

            return res.json({
                success: true,
                data: chartData,
                totalInflationPosts,
                totalInflationTypes,
                dateRange: useTimeFilter ? {
                    from: greaterThanTime,
                    to: lessThanTime
                } : null
            });

        } catch (error) {
            console.error('Error in getInflationTypeDistribution:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message
            });
        }
    }
};

module.exports = inflationAnalysisController; 