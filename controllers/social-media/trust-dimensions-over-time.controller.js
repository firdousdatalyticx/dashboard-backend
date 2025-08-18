const { elasticClient } = require('../../config/elasticsearch');
const { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } = require('date-fns');
const processCategoryItems = require('../../helpers/processedCategoryItems');
const trustDimensionsOverTimeController = {
    /**
     * Get trust dimensions analysis over time for line chart
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with trust dimensions trends over time
     */
    getTrustDimensionsOverTime: async (req, res) => {
        try {
            const {
                source = 'All',
                category = 'all',
                topicId,
                greaterThanTime,
                lessThanTime,
                sentiment,
                tone // 'Supportive', 'Distrustful', or 'All'
            } = req.body;
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
                    success: true,
                    trustDimensionsOverTime: [],
                    totalCount: 0
                });
            }

            // Set date range - default to last 12 months (June to December focus)
            const now = new Date();
            let effectiveGreaterThanTime, effectiveLessThanTime;
           
            
               // For regular topics, use 90 days default if not provided
                if (!greaterThanTime || !lessThanTime) {
                    const ninetyDaysAgo = subDays(now, 90);
                    effectiveGreaterThanTime = greaterThanTime || format(ninetyDaysAgo, 'yyyy-MM-dd');
                    effectiveLessThanTime = lessThanTime || format(now, 'yyyy-MM-dd');
                } else {
                    effectiveGreaterThanTime = greaterThanTime;
                    effectiveLessThanTime = lessThanTime;
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
			// Exclude empty placeholder
			query.bool.must_not = query.bool.must_not || [];
			query.bool.must_not.push({ term: { 'trust_dimensions.keyword': '' } });

            console.log('Trust Dimensions Over Time Query:', JSON.stringify(query, null, 2));

			// Aggregation-based approach: date histogram + terms on trust_dimensions array; tone from llm_emotion
			const AGG_SIZE = 200; // per-month distinct dimensions
			const POSTS_PER_BUCKET = 3;
			const params = {
				size: 0,
				query: query,
				aggs: {
					time_buckets: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: 'month',
                            min_doc_count: 0,
                            extended_bounds: {
                                min: `${effectiveGreaterThanTime}T00:00:00.000Z`,
                                max: `${effectiveLessThanTime}T23:59:59.999Z`
                            }
                        },
						aggs: {
							dimensions: {
								terms: { field: 'trust_dimensions.keyword', size: AGG_SIZE, order: { _count: 'desc' } },
								aggs: {
									tone: { terms: { field: 'llm_emotion.keyword', size: 20 } },
									top_posts_by_tone: {
										terms: { field: 'llm_emotion.keyword', size: 20 },
										aggs: {
											top_posts: {
												top_hits: {
													size: POSTS_PER_BUCKET,
													sort: [{ p_created_time: { order: 'desc' } }],
													_source: [
														'trust_dimensions','created_at','p_created_time','source','p_message','p_message_text','u_profile_photo','u_fullname','p_url','p_id','p_picture','p_picture_url','predicted_sentiment_value','predicted_category','llm_emotion','u_followers','u_following','u_posts','p_likes','p_comments_text','p_comments','p_shares','p_engagement','p_content','u_source','name','rating','comment','business_response','u_country'
													]
												}
											}
										}
									}
								}
							}
						}
					}
				},
				track_total_hits: false,
				timeout: '10s'
			};

			const response = await elasticClient.search({
				index: process.env.ELASTICSEARCH_DEFAULTINDEX,
				body: params
			});

			// Prepare structures
			const monthlyData = new Map();
			const trustDimensionCategories = new Set();
			let totalCount = 0;
			// Pre-build month keys using extended bounds
			const startDate = new Date(effectiveGreaterThanTime);
			const endDate = new Date(effectiveLessThanTime);
			const monthIntervals = eachMonthOfInterval({ start: startDate, end: endDate });
			monthIntervals.forEach(monthDate => {
				const monthKey = format(monthDate, 'MMM yyyy');
				monthlyData.set(monthKey, new Map());
			});

            const timeBuckets = response.aggregations?.time_buckets?.buckets || [];
			timeBuckets.forEach(tb => {
                const monthKey = format(new Date(tb.key), 'MMM yyyy');
				const tdBuckets = tb.td_json?.buckets || [];
				const monthMap = monthlyData.get(monthKey) || new Map();
				tdBuckets.forEach(b => {
					const dimName = b.key;
					if (!dimName) return;
					const bucketDocCount = b.doc_count || 0;
					totalCount += bucketDocCount;
					const samplePostsByTone = new Map();
					(b.top_posts_by_tone?.buckets || []).forEach(tb => {
						const hits = tb.top_posts?.hits?.hits || [];
						samplePostsByTone.set(tb.key, hits.map(h => formatPostData(h)));
					});
					(b.tone?.buckets || []).forEach(tb => {
						const emotion = (tb.key || '').toString().toLowerCase();
						let toneValue = 'Neutral';
						if (['supportive','happy','pleased','hopeful','content','satisfied','excited','delighted','grateful'].includes(emotion)) toneValue = 'Supportive';
						else if (['distrustful','frustrated','angry','upset','concerned','disappointed','sad','fearful','anxious'].includes(emotion)) toneValue = 'Distrustful';
						// Filter by requested tone if any
						if (tone && tone !== 'All' && toneValue.toLowerCase() !== tone.toLowerCase()) return;
						trustDimensionCategories.add(dimName);
						const dimensionToneKey = `${dimName}_${toneValue}`;
						if (!monthMap.has(dimensionToneKey)) monthMap.set(dimensionToneKey, { count: 0, posts: [] });
						const cur = monthMap.get(dimensionToneKey);
						cur.count += tb.doc_count || 0;
						const posts = samplePostsByTone.get(tb.key) || [];
						posts.forEach(p => { if (cur.posts.length < POSTS_PER_BUCKET) cur.posts.push(p); });
						monthMap.set(dimensionToneKey, cur);
					});
				});
				monthlyData.set(monthKey, monthMap);
			});

            console.log('Trust dimension categories found:', Array.from(trustDimensionCategories));
            console.log('Monthly data:', monthlyData);

            // Convert to chart-friendly format
            const chartData = [];
            const sortedCategories = Array.from(trustDimensionCategories).sort();
            
            // Create series for each dimension and tone combination
            sortedCategories.forEach(dimension => {
                ['Supportive', 'Distrustful'].forEach(toneType => {
                    // Skip if filtering by specific tone and this doesn't match
                    if (tone && tone !== 'All' && toneType.toLowerCase() !== tone.toLowerCase()) {
                        return;
                    }
                    
                    const series = {
                        name: `${dimension} (${toneType})`,
                        dimension: dimension,
                        tone: toneType,
                        data: []
                    };
                    
                    // Add data points for each month
                    monthIntervals.forEach(monthDate => {
                        const monthKey = format(monthDate, 'MMM yyyy');
                        const dimensionToneKey = `${dimension}_${toneType}`;
                        const monthData = monthlyData.get(monthKey);
                        const dataPoint = monthData ? monthData.get(dimensionToneKey) : null;
                        const count = dataPoint ? dataPoint.count : 0;
                        const posts = dataPoint ? dataPoint.posts : [];
                        
                        series.data.push({
                            month: monthKey,
                            count: count,
                            monthDate: format(monthDate, 'yyyy-MM-dd'),
                            posts: posts
                        });
                    });
                    
                    // Only include series with at least some data
                    const hasData = series.data.some(point => point.count > 0);
                    if (hasData) {
                        chartData.push(series);
                    }
                });
            });

            // Sort chart data by dimension name and tone
            chartData.sort((a, b) => {
                if (a.dimension !== b.dimension) {
                    return a.dimension.localeCompare(b.dimension);
                }
                return a.tone.localeCompare(b.tone);
            });

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }

            // For each post in chartData[].data[].posts, add matched_terms
            if (chartData && Array.isArray(chartData)) {
                chartData.forEach(seriesObj => {
                    if (seriesObj.data && Array.isArray(seriesObj.data)) {
                        seriesObj.data.forEach(dataObj => {
                            if (dataObj.posts && Array.isArray(dataObj.posts)) {
                                dataObj.posts = dataObj.posts.map(post => {
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

            return res.json({
                success: true,
                trustDimensionsOverTime: chartData,
                totalCount: totalCount,
                dateRange: {
                    from: effectiveGreaterThanTime,
                    to: effectiveLessThanTime
                },
                categories: sortedCategories,
                months: monthIntervals.map(date => format(date, 'MMM yyyy'))
            });

        } catch (error) {
            console.error('Error fetching trust dimensions over time data:', error);
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
        country: source.u_country,
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
                            gte: `${dateRange.greaterThanTime}T00:00:00.000Z`,
                            lte: `${dateRange.lessThanTime}T23:59:59.999Z`
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

module.exports = trustDimensionsOverTimeController; 