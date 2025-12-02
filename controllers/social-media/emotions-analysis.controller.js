const { elasticClient } = require("../../config/elasticsearch");
const { format, parseISO, subDays } = require("date-fns");
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

/**
 * Find matching category key with flexible matching
 * @param {string} selectedCategory - Category to find
 * @param {Object} categoryData - Category data object
 * @returns {string|null} Matched category key or null
 */
const findMatchingCategoryKey = (selectedCategory, categoryData = {}) => {
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
};

const emotionsController = {
  /**
   * Get emotions analysis data for social media posts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} JSON response with emotions counts and posts by time intervals
   */
  getEmotionsAnalysis: async (req, res) => {
    try {
      const {
        interval = "monthly",
        source = "All",
        category: inputCategory = "all",
        topicId,
        fromDate,
        toDate,
        sentiment,
        llm_mention_type,
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
          emotions: [],
        });
      }

      let category = inputCategory;
      // Only filter categoryData if category is not 'all', not empty, not 'custom' AND exists
      if (category !== 'all' && category !== '' && category !== 'custom') {
        const matchedKey = findMatchingCategoryKey(category, categoryData);

        if (matchedKey) {
          // Category found - filter to only this category
          categoryData = { [matchedKey]: categoryData[matchedKey] };
          category = matchedKey;
        } else {
          // Category not found - keep all categoryData and set category to 'all'
          // This maintains existing functionality
          category = 'all';
        }
      }

      // Set default date range - last 90 days

      const now = new Date();
      let startDate;
      let endDate = now;

      const ninetyDaysAgo = subDays(now, 365);

      // Determine date range based on timeSlot
      if (fromDate && toDate) {
        startDate = parseISO(fromDate);
        endDate = parseISO(toDate);
      } else {
        startDate = format(ninetyDaysAgo, "yyyy-MM-dd");
        endDate = format(now, "yyyy-MM-dd");
      }

      const greaterThanTime = format(startDate, "yyyy-MM-dd");
      const lessThanTime = format(endDate, "yyyy-MM-dd");

      // Set calendar interval based on requested interval
      let calendarInterval = "month";
      let formatPattern = "yyyy-MM";

      switch (interval) {
        case "daily":
          calendarInterval = "day";
          formatPattern = "yyyy-MM-dd";
          break;
        case "weekly":
          calendarInterval = "week";
          formatPattern = "yyyy-MM-dd";

          // formatPattern = 'yyyy-w';
          break;
        default:
          calendarInterval = "month";
          formatPattern = "yyyy-MM";
      }

      // Format min and max dates according to the interval format
      const minDate = parseISO(greaterThanTime);
      const maxDate = parseISO(lessThanTime);
      const formattedMinDate = format(minDate, formatPattern);
      const formattedMaxDate = format(maxDate, formatPattern);

      // Build base query with special topic source filtering
      const query = buildBaseQuery(
        {
          greaterThanTime,
          lessThanTime,
        },
        source,
        isSpecialTopic,
        parseInt(topicId)
      );

      // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
      if ( parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
        query.bool.must.push({
          term: {
            is_public_opinion: true
          }
        });
      }

      if(category=="all" && inputCategory!=="all"){
        const categoryFilter = {
            bool: {
                should:  [
                    {
                        "multi_match": {
                            "query": inputCategory,
                            "fields": [
                                "p_message_text",
                                "p_message",
                                "hashtags",
                                "u_source",
                                "p_url"
                            ],
                            "type": "phrase"
                        }
                    }
                ],
                minimum_should_match: 1
            }
        };
        query.bool.must.push(categoryFilter);
      }

      // Add category filters
      addCategoryFilters(query, category, categoryData);

      // Add sentiment filter if provided
      if (sentiment && sentiment !== "" && sentiment !== 'undefined' && sentiment !== 'null') {
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
          query.bool.must.push({
            match: { predicted_sentiment_value: sentiment.trim() }
          });
        }
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
        query.bool.must.push({
          bool: {
            should: mentionTypesArray.map(type => ({
              match: { llm_mention_type: type }
            })),
            minimum_should_match: 1
          }
        });
      }
   

      // Create aggregations for both simple counts and interval-based data
      const params = {
        size: 0,
        query: query,
        aggs: {
          emotions_count: {
            terms: {
              field: "llm_emotion.keyword",
              size: 10,
              exclude: "",
              order: {
                _count: "desc",
              },
            },
          },
          time_intervals: {
            date_histogram: {
              field: "p_created_time",
              calendar_interval: calendarInterval,
              format: formatPattern,
              min_doc_count: 0,
              extended_bounds: {
                min: formattedMinDate,
                max: formattedMaxDate,
              },
            },
            aggs: {
              emotions: {
                terms: {
                  field: "llm_emotion.keyword",
                  size: 10,
                  exclude: "",
                },
              },
            },
          },
        },
      };

      // Execute the query to get emotion counts
      const countResponse = await elasticClient.search({
        index: process.env.ELASTICSEARCH_DEFAULTINDEX,
        body: params,
      });

      // Get emotion counts
      const emotionBuckets =
        countResponse.aggregations?.emotions_count?.buckets || [];

      // Format the response with just the emotion counts
      const emotions = emotionBuckets
        .map((bucket) => ({
          name: bucket.key,
          count: bucket.doc_count,
        }))
        .slice(0, 10); // Explicitly limit to top 4 emotions

      // Calculate total count
      const totalCount = emotions.reduce(
        (sum, emotion) => sum + emotion.count,
        0
      );

      // Process time interval data
      const intervalData =
        countResponse.aggregations?.time_intervals?.buckets || [];

      // Prepare to collect posts by time interval
      const timeIntervalsWithPosts = [];

      // Gather all filter terms
      let allFilterTerms = [];
      if (categoryData) {
        Object.values(categoryData).forEach((data) => {
          if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
          if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
          if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
        });
      }

      // For each time interval, get the posts
      for (const interval of intervalData) {
        const intervalDate = interval.key_as_string;

        // Format date range for this interval
        let startDate = null,
          endDate = null;

        if (calendarInterval === "month") {
          const [year, month] = intervalDate.split("-");
          startDate = `${year}-${month}-01`;

          // Calculate end of month
          const lastDay = new Date(
            parseInt(year),
            parseInt(month),
            0
          ).getDate();
          endDate = `${year}-${month}-${lastDay}`;
        } else if (calendarInterval === "week") {
          // For weekly, we need to calculate the start/end of the week
          const [year, week] = intervalDate.split("-");
          const date = new Date(
            parseInt(year),
            0,
            1 + (parseInt(week) - 1) * 7
          );
          startDate = intervalDate;
          const endOfWeek = new Date(date);
          endOfWeek.setDate(date.getDate() + 6);
          // Create a Date object from the string
          startDate = new Date(intervalDate);

          // Add 6 days to get a 7-day interval
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);

          // Format the dates
          startDate = startDate.toISOString().split("T")[0];
          endDate = endDate.toISOString().split("T")[0];
        } else {
          // For daily, the interval date is already in yyyy-MM-dd format
          startDate = intervalDate;
          endDate = intervalDate;
        }
        // Time interval filter for the current interval
        const timeIntervalFilter = {
          range: {
            p_created_time: {
              gte: startDate,
              lte: endDate,
            },
          },
          // ,
          //    range: {
          //     p_created_time: {
          //         gte: startDate,
          //         lte: endDate
          //     }
          // }
        };

        // Process all emotions in this interval
        const emotionsInInterval = [];

        // For each emotion in this interval
        for (const emotionBucket of interval.emotions.buckets || []) {
          const emotionName = emotionBucket.key;

          // Skip emotions that aren't in the top 4
          if (!emotions.some((e) => e.name === emotionName)) {
            continue;
          }

          const emotionCount = emotionBucket.doc_count;

          if (emotionCount === 0) {
            // If there are no posts, add an entry with an empty posts array
            emotionsInInterval.push({
              name: emotionName,
              count: 0,
              posts: [],
            });
            continue;
          }

          // Create query for this specific emotion within the time interval
          const emotionIntervalQuery = {
            bool: {
              must: [
                ...query.bool.must,
                timeIntervalFilter,
                {
                  term: {
                    "llm_emotion.keyword": emotionName,
                  },
                },
              ],
            },
          };

          // console.log("\n"
          //     +JSON.stringify(emotionIntervalQuery)+"\n");
          // Set up posts query with pagination for large datasets
          const MAX_POSTS_PER_EMOTION = 30;
          const limit = Math.min(emotionCount, MAX_POSTS_PER_EMOTION);

          const emotionPostsQuery = {
            size: limit,
            query: emotionIntervalQuery,
            sort: [{ p_created_time: { order: "desc" } }],
          };

          try {
            // Execute the query
            const emotionPostsResponse = await elasticClient.search({
              index: process.env.ELASTICSEARCH_DEFAULTINDEX,
              body: emotionPostsQuery,
            });

            // Format posts for this emotion
            const postsRaw = emotionPostsResponse.hits.hits.map((hit) => formatPostData(hit));
            // Add matched_terms to each post
            const posts = postsRaw.map(post => {
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

            // Add to interval results with the count matching returned posts
            emotionsInInterval.push({
              name: emotionName,
              count: posts.length, // Use actual posts count
              posts: posts, // Limited to MAX_POSTS_PER_EMOTION
            });
          } catch (error) {
            console.error(
              `Error fetching posts for emotion ${emotionName} in interval ${intervalDate}:`,
              error
            );
            // Add empty array if there was an error, but keep the aggregation count
            emotionsInInterval.push({
              name: emotionName,
              count: emotionCount, // Keep the aggregation count even if we couldn't get posts
              posts: [],
            });
          }
        }

        // Build the final time interval data structure
        timeIntervalsWithPosts.push({
          date: intervalDate,
          emotions: emotionsInInterval,
        });
      }

      return res.json({
        success: true,
        emotions,
        totalCount,
        timeIntervals: timeIntervalsWithPosts,
        // query: params.query,
      });
    } catch (error) {
      console.error("Error fetching emotions analysis data:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
  getEmotionAnalysisPosts: async (req, res) => {
  try {
    const {
      interval = "monthly",
      source = "All",
      category: inputCategory = "all",
      topicId,
      fromDate,
      toDate,
      sentiment,
      emotion,
      page = 1,
      limit = 30,
      llm_mention_type
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
        posts: [],
        total: 0
      });
    }

    let category = inputCategory;
    // Only filter categoryData if category is not 'all', not empty, not 'custom' AND exists
    if (category !== 'all' && category !== '' && category !== 'custom') {
      const matchedKey = findMatchingCategoryKey(category, categoryData);

      if (matchedKey) {
        // Category found - filter to only this category
        categoryData = { [matchedKey]: categoryData[matchedKey] };
        category = matchedKey;
      } else {
        // Category not found - keep all categoryData and set category to 'all'
        // This maintains existing functionality
        category = 'all';
      }
    }

    // Set default date range - last 90 days if no dates provided
    const now = new Date();
    let startDate;
    let endDate = now;

    if (fromDate && toDate) {
      startDate = parseISO(fromDate);
      endDate = parseISO(toDate);
    } else {
      const ninetyDaysAgo = subDays(now, 90);
      startDate = ninetyDaysAgo;
      endDate = now;
    }

    const greaterThanTime = format(startDate, "yyyy-MM-dd");
    const lessThanTime = format(endDate, "yyyy-MM-dd");

    // Build base query with special topic source filtering
    const query = buildBaseQuery(
      {
        greaterThanTime,
        lessThanTime,
      },
      source,
      isSpecialTopic,
      parseInt(topicId)
    );

    // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
    if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
      query.bool.must.push({
        term: {
          is_public_opinion: true
        }
      });
    }

    if(category=="all" && inputCategory!=="all"){
      const categoryFilter = {
          bool: {
              should:  [
                  {
                      "multi_match": {
                          "query": inputCategory,
                          "fields": [
                              "p_message_text",
                              "p_message",
                              "hashtags",
                              "u_source",
                              "p_url"
                          ],
                          "type": "phrase"
                      }
                  }
              ],
              minimum_should_match: 1
          }
      };
      query.bool.must.push(categoryFilter);
    }

    // Add category filters
    addCategoryFilters(query, category, categoryData);

    // Add sentiment filter if provided
    if (sentiment && sentiment !== "" && sentiment !== 'undefined' && sentiment !== 'null') {
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
        query.bool.must.push({
          match: { predicted_sentiment_value: sentiment.trim() }
        });
      }
    }

    // Add emotion filter
    if (emotion) {
      query.bool.must.push({
        term: {
          "llm_emotion.keyword": emotion
        }
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
      query.bool.must.push({
        bool: {
          should: mentionTypesArray.map(type => ({
            match: { llm_mention_type: type }
          })),
          minimum_should_match: 1
        }
      });
    }
  

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Get all filter terms for highlighting matches
    let allFilterTerms = [];
    if (categoryData) {
      Object.values(categoryData).forEach((data) => {
        if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
        if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
        if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
      });
    }

    // Set up posts query with pagination
    const postsQuery = {
      from: offset,
      size: limit,
      query: query,
      sort: [{ p_created_time: { order: "desc" } }]
    };

    // Execute the query
    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_DEFAULTINDEX,
      body: postsQuery
    });

    // Format posts and add matched terms
    const posts = response.hits.hits.map((hit) => {
      const post = formatPostData(hit);
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

    return res.json({
      success: true,
      posts: posts,
      total: response.hits.total.value,
      limit: limit,
      offset: offset
    });

  } catch (error) {
    console.error("Error fetching emotion posts:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
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
  const profilePic =
    source.u_profile_photo || `${process.env.PUBLIC_IMAGES_PATH}grey.png`;

  // Social metrics
  const followers = source.u_followers > 0 ? `${source.u_followers}` : "";
  const following = source.u_following > 0 ? `${source.u_following}` : "";
  const posts = source.u_posts > 0 ? `${source.u_posts}` : "";
  const likes = source.p_likes > 0 ? `${source.p_likes}` : "";

  // Emotion
  const llm_emotion =
    source.llm_emotion ||
    (source.source === "GoogleMyBusiness" && source.rating
      ? source.rating >= 4
        ? "Supportive"
        : source.rating <= 2
        ? "Frustrated"
        : "Neutral"
      : "");

  // Clean up comments URL if available
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

  // Determine sentiment
  let predicted_sentiment = "";
  let predicted_category = "";

  if (source.predicted_sentiment_value)
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

  // Handle YouTube-specific fields
  let youtubeVideoUrl = "";
  let profilePicture2 = "";
  if (source.source === "Youtube") {
    if (source.video_embed_url) youtubeVideoUrl = source.video_embed_url;
    else if (source.p_id)
      youtubeVideoUrl = `https://www.youtube.com/embed/${source.p_id}`;
  } else {
    profilePicture2 = source.p_picture ? source.p_picture : "";
  }

  // Determine source icon based on source name
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

  // Format message text – with special handling for GoogleMaps/Tripadvisor
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
    created_at: new Date(source.p_created_time || source.created_at).toLocaleString(),
    p_comments_data: source.p_comments_data,
    p_url: source.p_url,
    keywords: source.keywords,
    hashtags: source.hashtags,
    title: source.title
  };
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false, topicId) {
  const query = {
    bool: {
      must: [
        {
          range: {
            p_created_time: {
              gte: dateRange.greaterThanTime,
              lte: dateRange.lessThanTime,
            },
          },
        },
      ],
    },
  };
  const normalizedSources = normalizeSourceInput(source);

  if (topicId === 2619 || topicId === 2639 || topicId === 2640) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "LinkedIn" } },
          { match_phrase: { source: "Linkedin" } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  else if (normalizedSources.length > 0) {
    query.bool.must.push({
      bool: {
        should: normalizedSources.map(src => ({
          match_phrase: { source: src }
        })),
        minimum_should_match: 1,
      },
    });
  }
  else if (isSpecialTopic) {
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
        ],
        minimum_should_match: 1,
      },
    });
  } else if(topicId === 2641 || parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ){
    query.bool.must.push({
      bool: {
        should: [
          { match_phrase: { source: "Facebook" } },
          { match_phrase: { source: "Twitter" } },
          { match_phrase: { source: "Instagram" } }
        ],
        minimum_should_match: 1,
      }});

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
          { match_phrase: { source: "TikTok" } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return query;
}

/**
 * Add category filters to the query
 * @param {Object} query - Elasticsearch query object
 * @param {string} selectedCategory - Category to filter by
 * @param {Object} categoryData - Category data with filters
 */
function addCategoryFilters(query, selectedCategory, categoryData) {
  if (selectedCategory === "all") {
    query.bool.must.push({
      bool: {
        should: [
          ...Object.values(categoryData).flatMap((data) =>
            (data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } }
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } }
            ])
          ),
          ...Object.values(categoryData).flatMap((data) =>
            (data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } }
            ])
          ),
        ],
        minimum_should_match: 1,
      },
    });
  } else if (categoryData[selectedCategory]) {
    const data = categoryData[selectedCategory];

    // Check if the category has any filtering criteria
    const hasKeywords =
      Array.isArray(data.keywords) && data.keywords.length > 0;
    const hasHashtags =
      Array.isArray(data.hashtags) && data.hashtags.length > 0;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;

    // Only add the filter if there's at least one criteria
    if (hasKeywords || hasHashtags || hasUrls) {
      query.bool.must.push({
        bool: {
          should: [
            ...(data.keywords || []).flatMap((keyword) => [
              { match_phrase: { p_message_text: keyword } },
              { match_phrase: { keywords: keyword } }
            ]),
            ...(data.hashtags || []).flatMap((hashtag) => [
              { match_phrase: { p_message_text: hashtag } },
              { match_phrase: { hashtags: hashtag } }
            ]),
            ...(data.urls || []).flatMap((url) => [
              { match_phrase: { u_source: url } },
              { match_phrase: { p_url: url } }
            ]),
          ],
          minimum_should_match: 1,
        },
      });
    } else {
      // If the category has no filtering criteria, add a condition that will match nothing
      query.bool.must.push({
        bool: {
          must_not: {
            match_all: {},
          },
        },
      });
    }
  }
}

module.exports = emotionsController;
