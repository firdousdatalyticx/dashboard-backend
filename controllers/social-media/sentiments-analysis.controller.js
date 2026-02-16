const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays } = require('date-fns');
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

const getSentimentTrendData = async ({ query, formattedMinDate, formattedMaxDate, calendarInterval, formatPattern, analysisType }) => {
  const aggregations = {
    time_intervals: {
      date_histogram: {
        field: 'p_created_time',
        calendar_interval: calendarInterval,
        format: formatPattern,
        min_doc_count: 0,
        extended_bounds: {
          min: formattedMinDate,
          max: formattedMaxDate
        }
      },
      aggs: {}
    }
  };

  if (analysisType === 'sentiment' || analysisType === 'both') {
    aggregations.time_intervals.aggs.sentiments = {
      terms: {
        field: 'predicted_sentiment_value.keyword',
        size: 100
      }
    };
  }

  if (analysisType === 'phase' || analysisType === 'both') {
    aggregations.time_intervals.aggs.phases = {
      terms: {
        field: 'llm_motivation.phase.keyword',
        size: 100
      }
    };
  }

  const body = {
    size: 0,
    query,
    aggs: aggregations
  };

  const response = await elasticClient.search({
    index: process.env.ELASTICSEARCH_DEFAULTINDEX,
    body
  });

  const buckets = response.aggregations?.time_intervals?.buckets || [];
  return {
    success: true,
    timeIntervals: buckets
  };
}
const sentimentsController = {
    /**
     * Get sentiment analysis data for social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with sentiment counts and posts by time intervals
     */
    getSentimentsAnalysis: async (req, res) => {
        try {
            const {
                interval = 'monthly',
                source = 'All',
                category = 'all',
                topicId,
                 fromDate,
                toDate,
                sentiment,
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
                    sentiments: []
                });
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

            // Set default date range - last 90 days
             // Set default date range - last 90 days
              const now = new Date();
              let ninetyDaysAgo = subDays(now, 365);
              
              let startDate;
              let endDate = now;
              
  
              // Determine date range based on timeSlot
              if (fromDate && toDate) {
                  startDate = parseISO(fromDate);
                  endDate = parseISO(toDate);
              }else{
                  const topic = parseInt(topicId);
  
                // Topics requiring last 1 year
                const lastYearTopics = [2641, 2643, 2644];
                if (lastYearTopics.includes(topic)) {
                  startDate = format(ninetyDaysAgo, "yyyy-MM-dd");
                  endDate = format(now, "yyyy-MM-dd");
                } else {
                  ninetyDaysAgo = subDays(now, 90);
                  startDate = format(ninetyDaysAgo, "yyyy-MM-dd");
                  endDate = format(now, "yyyy-MM-dd");
                }
             
              } 


            const greaterThanTime = format(startDate, 'yyyy-MM-dd');
            const lessThanTime = format(endDate, 'yyyy-MM-dd');

            // Set calendar interval based on requested interval
            let calendarInterval = 'month';
            let formatPattern = 'yyyy-MM';

            switch (interval) {
                case 'daily':
                    calendarInterval = 'day';
                    formatPattern = 'yyyy-MM-dd';
                    break;
                case 'weekly':
                    calendarInterval = 'week';
                    formatPattern = 'yyyy-MM-dd';
                    break;
                default:
                    calendarInterval = 'month';
                    formatPattern = 'yyyy-MM';
            }

            // Format min and max dates according to the interval format
            const minDate = parseISO(greaterThanTime);
            const maxDate = parseISO(lessThanTime);
            const formattedMinDate = format(minDate, formatPattern);
            const formattedMaxDate = format(maxDate, formatPattern);

            // Build base query with special topic source filtering
            const query = buildBaseQuery({
                greaterThanTime,
                lessThanTime
            }, source, isSpecialTopic, parseInt(topicId));

            // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
            if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
                query.bool.must.push({
                    term: {
                        is_public_opinion: true
                    }
                });
            }

            if(workingCategory=="all" && category!=="all"){
                const categoryFilter = {
                    bool: {
                        should:  [
                            {
                                "multi_match": {
                                    "query": category,
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
            addCategoryFilters(query, workingCategory, categoryData);


                            const topic = parseInt(topicId);

      const termToAdd =
        topic === 2646
          ? { term: { "customer_name.keyword": "oia" } }
          : topic === 2650
          ? { term: { "customer_name.keyword": "omantel" } }
          : null;

      if (termToAdd) {
        // 🔍 find bool.should that contains p_message_text
        let messageTextShouldBlock = query.bool.must.find(
          (m) =>
            m.bool &&
            Array.isArray(m.bool.should) &&
            m.bool.should.some(
              (s) => s.match_phrase && s.match_phrase.p_message_text
            )
        );

        if (messageTextShouldBlock) {
          // ✅ already exists → push into same should
          messageTextShouldBlock.bool.should.push(termToAdd);
          messageTextShouldBlock.bool.minimum_should_match = 1;
        } else {
          // 🆕 not exists → create new should block
          query.bool.must.push({
            bool: {
              should: [termToAdd],
              minimum_should_match: 1,
            },
          });
        }
      }

        // Special filter for topicId 2651 - only fetch Healthcare results
        if (topic === 2651) {
          query.bool.must.push({
            term: { "p_tag_cat.keyword": "Healthcare" }
          });
        }

        // Special filter for topicId 2652 - only fetch Food and Beverages results
        if (topic === 2652 || topic === 2663) {
          query.bool.must.push({
            term: { "p_tag_cat.keyword": "Food and Beverages" }
          });
        }

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
                    sentiments_count: {
                        terms: {
                            field: 'predicted_sentiment_value.keyword',
                            size: 100,
                            exclude: '',
                            order: {
                                "_count": "desc"
                            }
                        }
                    },
                    time_intervals: {
                        date_histogram: {
                            field: 'p_created_time',
                            calendar_interval: calendarInterval,
                            format: formatPattern,
                            min_doc_count: 0,
                            extended_bounds: {
                                min: formattedMinDate,
                                max: formattedMaxDate
                            }
                        },
                        aggs: {
                            sentiments: {
                                terms: {
                                    field: 'predicted_sentiment_value.keyword',
                                    size: 100,
                                    exclude: ''
                                }
                            }
                        }
                    }
                }
            };

            // Execute the query to get sentiment counts
            const countResponse = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Get sentiment counts
            const sentimentBuckets = countResponse.aggregations?.sentiments_count?.buckets || [];
            
            // Format the response with just the sentiment counts
            const sentiments = sentimentBuckets.map(bucket => ({
                name: bucket.key,
                count: bucket.doc_count
            }));

            // Calculate total count
            const totalCount = sentiments.reduce((sum, sentiment) => sum + sentiment.count, 0);

            // Process time interval data
            const intervalData = countResponse.aggregations?.time_intervals?.buckets || [];
            
            // Prepare to collect posts by time interval
            const timeIntervalsWithPosts = [];
            
            // For each time interval, get the posts
            for (const interval of intervalData) {
                const intervalDate = interval.key_as_string;
                
                // Format date range for this interval
                let startDate, endDate;
                
                if (calendarInterval === 'month') {
                    const [year, month] = intervalDate.split('-');
                    startDate = `${year}-${month}-01`;
                    
                    // Calculate end of month
                    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                    endDate = `${year}-${month}-${lastDay}`;

                } else if (calendarInterval === 'week') {
                    // For weekly, we need to calculate the start/end of the week
                    const [year, week] = intervalDate.split('-');
                    const date = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);

                     startDate = intervalDate;
                    const endOfWeek = new Date(date);
                    endOfWeek.setDate(date.getDate() + 6);
                            // Create a Date object from the string
                             startDate = new Date(intervalDate);

                            // Add 6 days to get a 7-day interval
                             endDate = new Date(startDate);
                            endDate.setDate(startDate.getDate() + 6);

                            // Format the dates
                             startDate = startDate.toISOString().split('T')[0];
                             endDate = endDate.toISOString().split('T')[0];

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
                            lte: endDate
                        }
                    }
                };
                
                // Process all sentiments in this interval
                const sentimentsInInterval = [];
                
                // For each sentiment in this interval
                for (const sentimentBucket of (interval.sentiments.buckets || [])) {
                    const sentimentName = sentimentBucket.key;
                    const sentimentCount = sentimentBucket.doc_count;
                    
                    if (sentimentCount === 0) {
                        // If there are no posts, add an entry with an empty posts array
                        sentimentsInInterval.push({
                            name: sentimentName,
                            count: 0,
                            posts: []
                        });
                        continue;
                    }
                    
                    // Create query for this specific sentiment within the time interval
                    const sentimentIntervalQuery = {
                        bool: {
                            must: [
                                ...query.bool.must,
                                timeIntervalFilter,
                                {
                                    term: {
                                        "predicted_sentiment_value.keyword": sentimentName
                                    }
                                }
                            ]
                        }
                    };
                    
                    // Set up posts query with pagination for large datasets
                    const MAX_POSTS_PER_SENTIMENT = 30;
                    const limit = Math.min(sentimentCount, MAX_POSTS_PER_SENTIMENT);
                    
                    // console.log("sentimentIntervalQuery",JSON.stringify(sentimentIntervalQuery))
                    const sentimentPostsQuery = {
                        size: limit,
                        query: sentimentIntervalQuery,
                        sort: [{ p_created_time: { order: 'desc' } }]
                    };
                    
                    
                        // Execute the query
                        const sentimentPostsResponse = await elasticClient.search({
                            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                            body: sentimentPostsQuery
                        });

                        // Format posts for this sentiment
                        const posts = sentimentPostsResponse.hits.hits.map(hit => formatPostData(hit));

                        // Add to interval results with the actual count from posts
                        sentimentsInInterval.push({
                            name: sentimentName,
                            count: posts.length,  // Use actual posts count
                            posts: posts  // Limited to MAX_POSTS_PER_SENTIMENT
                        });
               
                }
                
                // Build the final time interval data structure
                timeIntervalsWithPosts.push({
                    date: intervalDate,
                    sentiments: sentimentsInInterval
                });
            }

            // Gather all filter terms
            let allFilterTerms = [];
            if (categoryData) {
                Object.values(categoryData).forEach((data) => {
                    if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                    if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                    if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
                });
            }
            // For each post in timeIntervalsWithPosts, add matched_terms
            for (const interval of timeIntervalsWithPosts) {
                for (const sentiment of interval.sentiments) {
                    if (sentiment.posts && Array.isArray(sentiment.posts)) {
                        sentiment.posts = sentiment.posts.map(post => {
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
                }
            }

            return res.json({
                success: true,
                sentiments,
                totalCount,
                timeIntervals: timeIntervalsWithPosts,
                
            });

        } catch (error) {
            console.error('Error fetching sentiments analysis data:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },
    getSentimentAnalysisPosts: async (req, res) => {
    try {
        const {
            interval = 'monthly',
            source = 'All',
            category = 'all',
            topicId,
            fromDate,
            toDate,
            sentiment,
            llm_mention_type,
            limit = 30,
            offset = 0
        } = req.body;
        
        // Check if this is the special topicId
        const isSpecialTopic = topicId && parseInt(topicId) === 2600;
        
        // Get category data from middleware
        let categoryData = {};
  
        if (req.body.categoryItems && Array.isArray(req.body.categoryItems) &&  req.body?.categoryItems?.length>0){
            categoryData = processCategoryItems(req.body.categoryItems);
        } else {
            categoryData = req.processedCategories || {};
        }

        if (Object.keys(categoryData).length === 0) {
            return res.json({
                success: true,
                posts: [],
                total: 0
            });
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

        // Set default date range - last 90 days
        const now = new Date();
        const ninetyDaysAgo = subDays(now, 90);
        
        let startDate;
        let endDate = now;
        
        // Determine date range
        if (fromDate && toDate) {
            startDate = parseISO(fromDate);
            endDate = parseISO(toDate);
        } else {
            startDate = format(ninetyDaysAgo, 'yyyy-MM-dd');
            endDate = format(now, 'yyyy-MM-dd');
        } 

        const greaterThanTime = format(startDate, 'yyyy-MM-dd');
        const lessThanTime = format(endDate, 'yyyy-MM-dd');

        // Build base query with special topic source filtering
        const query = buildBaseQuery({
            greaterThanTime,
            lessThanTime
        }, source, isSpecialTopic, parseInt(topicId));

        // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
        if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
            query.bool.must.push({
                term: {
                    is_public_opinion: true
                }
            });
        }

        if(workingCategory=="all" && category!=="all"){
            const categoryFilter = {
                bool: {
                    should:  [
                        {
                            "multi_match": {
                                "query": category,
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
        addCategoryFilters(query, workingCategory, categoryData);

        // Add sentiment filter if specified
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
      

        // Get total count for pagination
        const countResponse = await elasticClient.count({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: { query }
        });

        const total = countResponse.count;

        // Get posts with pagination
        const postsResponse = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: {
                size: limit,
                from: offset,
                query: query,
                sort: [{ p_created_time: { order: 'desc' } }]
            }
        });


        // Format posts
        let posts = postsResponse.hits.hits.map(hit => formatPostData(hit));

        // Gather all filter terms for matched_terms calculation
        let allFilterTerms = [];
        if (categoryData) {
            Object.values(categoryData).forEach((data) => {
                if (data.keywords && data.keywords.length > 0) allFilterTerms.push(...data.keywords);
                if (data.hashtags && data.hashtags.length > 0) allFilterTerms.push(...data.hashtags);
                if (data.urls && data.urls.length > 0) allFilterTerms.push(...data.urls);
            });
        }

        // // Add matched_terms to each post
        // posts = posts.map(post => {
        //     const textFields = [
        //         post.message_text,
        //         post.content,
        //         post.keywords,
        //         post.title,
        //         post.hashtags,
        //         post.uSource,
        //         post.source,
        //         post.p_url,
        //         post.userFullname
        //     ];
            
        //     return {
        //         ...post,
        //         matched_terms: allFilterTerms.filter(term =>
        //             textFields.some(field => {
        //                 if (!field) return false;
        //                 if (Array.isArray(field)) {
        //                     return field.some(f => typeof f === 'string' && f.toLowerCase().includes(term.toLowerCase()));
        //                 }
        //                 return typeof field === 'string' && field.toLowerCase().includes(term.toLowerCase());
        //             })
        //         )
        //     };
        // });

        return res.json({
            success: true,
            posts,
            total,
            limit,
            offset,
            // query
        });

    } catch (error) {
        console.error('Error fetching sentiment posts:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
},

llmMotivationSentimentTrend: async (req, res) => {
  try {
    const mergePhases = (buckets) => {
      const phaseMap = {};
      buckets.forEach((bucket) => {
        const phaseName = bucket.key;
        let basePhase = phaseName;
        if (phaseName.includes("|null")) {
          basePhase = phaseName.split("|")[0];
        } else if (phaseName === "null") {
          basePhase = "null";
        }
        if (phaseMap[basePhase]) {
          phaseMap[basePhase] += bucket.doc_count;
        } else {
          phaseMap[basePhase] = bucket.doc_count;
        }
      });
      return Object.entries(phaseMap).map(([name, count]) => ({ name, count }));
    };

    const {
      interval = "monthly",
      source = "All",
      category = "all",
      topicId,
      fromDate,
      toDate,
      sentiment,
      phase,
      llm_mention_type,
      eventType = "all", // New parameter for event type filtering
      analysisType = "both",
    } = req.body;

    const topicIdNum = parseInt(topicId);
    const isSpecialTopic = topicIdNum === 2600;
    const isTopic2603 = topicIdNum === 2603 || topicIdNum === 2601;
    const isTopic2604 = topicIdNum === 2604 || topicIdNum === 2602;

    let categoryData = {};
      
    if (req.body.categoryItems && Array.isArray(req.body.categoryItems) && req.body.categoryItems.length > 0) {
      categoryData = processCategoryItems(req.body.categoryItems);
    } else {
      // Fall back to middleware data
      categoryData = req.processedCategories || {};
    }    if (Object.keys(categoryData).length === 0) {
      return res.json({
        success: true,
        sentiments: [],
        phases: [],
        preEventData: [],
        postEventData: [],
        executionDaysData: [],
        eventTypeBreakdown: {},
      });
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

    const now = new Date();
    const ninetyDaysAgo = subDays(now, 90);
    let startDate = fromDate ? parseISO(fromDate) : ninetyDaysAgo;
    let endDate = toDate ? parseISO(toDate) : now;

    const greaterThanTime = format(startDate, "yyyy-MM-dd");
    const lessThanTime = format(endDate, "yyyy-MM-dd");

    let calendarInterval = "month";
    let formatPattern = "yyyy-MM";
    if (interval === "daily") {
      calendarInterval = "day";
      formatPattern = "yyyy-MM-dd";
    } else if (interval === "weekly") {
      calendarInterval = "week";
      formatPattern = "yyyy-MM-dd";
    }

    const formattedMinDate = format(parseISO(greaterThanTime), formatPattern);
    const formattedMaxDate = format(parseISO(lessThanTime), formatPattern);

    const query = buildBaseQuery({ greaterThanTime, lessThanTime }, source, isSpecialTopic, topicIdNum);

    // Special filter for topicId 2641 - only fetch posts where is_public_opinion is true
    if (parseInt(topicId) === 2643 || parseInt(topicId) === 2644 ) {
        query.bool.must.push({
            term: {
                is_public_opinion: true
            }
        });
    }

    if(workingCategory=="all" && category!=="all"){
        const categoryFilter = {
            bool: {
                should:  [
                    {
                        "multi_match": {
                            "query": category,
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

    addCategoryFilters(query, workingCategory, categoryData);

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

    if (phase && phase !== "" && phase !== "All") {
      if (phase === "exhibition_days") {
        query.bool.must.push({
          terms: {
            "llm_motivation.phase.keyword": ["day1", "day2", "day3", "day4", "day5"],
          },
        });
      } else {
        query.bool.must.push({ match_phrase: { "llm_motivation.phase": phase } });
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
 

    // Enhanced event type filtering
    if (eventType && eventType !== "" && eventType !== "all") {
      switch (eventType) {
        case "pre_event":
          query.bool.must.push({
            match_phrase: { "llm_motivation.phase.keyword": "pre_event" }
          });
          break;
        case "post_event":
          query.bool.must.push({
            match_phrase: { "llm_motivation.phase.keyword": "post_event" }
          });
          break;
        case "execution_days":
          query.bool.must.push({
            terms: {
              "llm_motivation.phase.keyword": ["day1", "day2", "day3", "day4", "day5"]
            }
          });
          break;
        case "day1":
        case "day2":
        case "day3":
        case "day4":
        case "day5":
          query.bool.must.push({
            match_phrase: { "llm_motivation.phase.keyword": eventType }
          });
          break;
      }
    }

    if (isTopic2603) {
      query.bool.should = [
        {
          bool: {
            must: [
              { match_phrase: { "llm_motivation.phase.keyword": "pre_event" } },
              {
                range: {
                  p_created_time: {
                    gte: "2023-01-30",
                    lte: "2024-03-03",
                  },
                },
              },
            ],
          },
        },
        {
          bool: {
            must: [
              {
                terms: {
                  "llm_motivation.phase.keyword": ["day1", "day2", "day3", "day4"],
                },
              },
              {
                range: {
                  p_created_time: {
                    gte: "2024-03-04",
                    lte: "2024-03-07",
                  },
                },
              },
            ],
          },
        },
        {
          bool: {
            must: [
              { match_phrase: { "llm_motivation.phase.keyword": "post_event" } },
              {
                range: {
                  p_created_time: {
                    gte: "2024-03-08",
                  },
                },
              },
            ],
          },
        },
      ];
      query.bool.minimum_should_match = 1;
    }

    if (isTopic2604) {
      query.bool.should = [
        {
          bool: {
            must: [
              { match_phrase: { "llm_motivation.phase.keyword": "pre_event" } },
              {
                range: {
                  p_created_time: {
                    gte: "2024-01-01",
                    lte: "2024-10-13",
                  },
                },
              },
            ],
          },
        },
        {
          bool: {
            must: [
              {
                terms: {
                  "llm_motivation.phase.keyword": ["day1", "day2", "day3", "day4", "day5"],
                },
              },
              {
                range: {
                  p_created_time: {
                    gte: "2024-10-14",
                    lte: "2024-10-18",
                  },
                },
              },
            ],
          },
        },
        {
          bool: {
            must: [
              { match_phrase: { "llm_motivation.phase.keyword": "post_event" } },
              {
                range: {
                  p_created_time: {
                    gte: "2024-10-19",
                  },
                },
              },
            ],
          },
        },
      ];
      query.bool.minimum_should_match = 1;
    }

    // Enhanced query to get sentiment data with event type breakdown
    const result = await getSentimentTrendDataWithEventTypes({
      query,
      formattedMinDate,
      formattedMaxDate,
      calendarInterval,
      formatPattern,
      analysisType,
      eventType,
    });

    return res.json(result);
  } catch (error) {
    console.error("Error fetching sentiments/phase analysis data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
},

// Enhanced function to handle event type breakdown








};

const getSentimentTrendDataWithEventTypes= async ({
  query,
  formattedMinDate,
  formattedMaxDate,
  calendarInterval,
  formatPattern,
  analysisType,
  eventType,
}) => {
  try {
    const aggregations = {
      sentiment_over_time: {
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
          sentiments: {
            terms: {
              field: "predicted_sentiment_value.keyword",
              size: 10,
            },
          },
          event_phases: {
            terms: {
              field: "llm_motivation.phase.keyword",
              size: 20,
            },
            aggs: {
              phase_sentiments: {
                terms: {
                  field: "predicted_sentiment_value.keyword",
                  size: 10,
                },
              },
            },
          },
        },
      },
      overall_event_breakdown: {
        terms: {
          field: "llm_motivation.phase.keyword",
          size: 20,
        },
        aggs: {
          sentiment_breakdown: {
            terms: {
              field: "predicted_sentiment_value.keyword",
              size: 10,
            },
          },
        },
      },
    };

    const searchBody = {
      query,
      aggs: aggregations,
      size: 0,
    };

    const response = await elasticClient.search({
      index: process.env.ELASTICSEARCH_INDEX,
      body: searchBody,
    });

    const buckets = response.aggregations.sentiment_over_time.buckets;
    const overallBreakdown = response.aggregations.overall_event_breakdown.buckets;

    // Process time-series data
    const sentimentData = buckets.map((bucket) => ({
      date: bucket.key_as_string,
      total: bucket.doc_count,
      sentiments: bucket.sentiments.buckets.reduce((acc, sentBucket) => {
        acc[sentBucket.key] = sentBucket.doc_count;
        return acc;
      }, {}),
      phases: bucket.event_phases.buckets.map((phaseBucket) => ({
        phase: phaseBucket.key,
        count: phaseBucket.doc_count,
        sentiments: phaseBucket.phase_sentiments.buckets.reduce((acc, sentBucket) => {
          acc[sentBucket.key] = sentBucket.doc_count;
          return acc;
        }, {}),
      })),
    }));

    // Process overall event type breakdown
    const eventTypeBreakdown = overallBreakdown.reduce((acc, bucket) => {
      const phase = bucket.key;
      acc[phase] = {
        total: bucket.doc_count,
        sentiments: bucket.sentiment_breakdown.buckets.reduce((sentAcc, sentBucket) => {
          sentAcc[sentBucket.key] = sentBucket.doc_count;
          return sentAcc;
        }, {}),
      };
      return acc;
    }, {});

    // Separate data by event types
    const preEventData = sentimentData.map((item) => ({
      ...item,
      phases: item.phases.filter((phase) => phase.phase === "pre_event"),
    }));

    const postEventData = sentimentData.map((item) => ({
      ...item,
      phases: item.phases.filter((phase) => phase.phase === "post_event"),
    }));

    const executionDaysData = sentimentData.map((item) => ({
      ...item,
      phases: item.phases.filter((phase) => 
        ["day1", "day2", "day3", "day4", "day5"].includes(phase.phase)
      ),
    }));

    return {
      success: true,
      sentiments: sentimentData,
      preEventData,
      postEventData,
      executionDaysData,
      eventTypeBreakdown,
      totalDocuments: response.hits.total.value,
    };
  } catch (error) {
    console.error("Error in getSentimentTrendDataWithEventTypes:", error);
    throw error;
  }
};


const normalizePhaseName = (phase) => {
  if (!phase || typeof phase !== 'string') return 'null';
  return phase.split('|')[0]; // Normalize to the first part of the phase
};


// Helper function to process sentiment intervals
async function processSentimentInterval(sentimentBuckets, baseQuery, startDate, endDate, elasticClient) {
    const sentimentsInInterval = [];
    const timeIntervalFilter = {
        range: {
            p_created_time: {
                gte: startDate,
                lte: endDate
            }
        }
    };

    for (const sentimentBucket of sentimentBuckets) {
        const sentimentName = sentimentBucket.key;
        const sentimentCount = sentimentBucket.doc_count;
        
        if (sentimentCount === 0) {
            sentimentsInInterval.push({
                name: sentimentName,
                count: 0,
                posts: []
            });
            continue;
        }
        
        const sentimentIntervalQuery = {
            bool: {
                must: [
                    ...baseQuery.bool.must,
                    timeIntervalFilter,
                    {
                        term: {
                            "predicted_sentiment_value.keyword": sentimentName
                        }
                    }
                ]
            }
        };
        
        const posts = await fetchPostsForQuery(sentimentIntervalQuery, elasticClient, 30);
        
        sentimentsInInterval.push({
            name: sentimentName,
            count: sentimentCount,
            posts: posts
        });
    }
    
    return sentimentsInInterval;
}

// Helper function to process phase intervals
async function processPhaseInterval(phaseBuckets, baseQuery, startDate, endDate, elasticClient) {
    const phasesInInterval = [];
    const timeIntervalFilter = {
        range: {
            p_created_time: {
                gte: startDate,
                lte: endDate
            }
        }
    };

    for (const phaseBucket of phaseBuckets) {
        const phaseName = phaseBucket.key;
        const phaseCount = phaseBucket.doc_count;
        
        if (phaseCount === 0) {
            phasesInInterval.push({
                name: phaseName,
                count: 0,
                posts: []
            });
            continue;
        }
        
        const phaseIntervalQuery = {
            bool: {
                must: [
                    ...baseQuery.bool.must,
                    timeIntervalFilter,
                    {
                        term: {
                            "llm_motivation.phase.keyword": phaseName
                        }
                    }
                ]
            }
        };
        
        const posts = await fetchPostsForQuery(phaseIntervalQuery, elasticClient, 30);
        
        phasesInInterval.push({
            name: phaseName,
            count: phaseCount,
            posts: posts
        });
    }
    
    return phasesInInterval;
}

// Helper function to process combined phase-sentiment intervals
async function processPhaseSentimentInterval(phaseSentimentBuckets, baseQuery, startDate, endDate, elasticClient) {
    const phaseSentimentInInterval = [];
    const timeIntervalFilter = {
        range: {
            p_created_time: {
                gte: startDate,
                lte: endDate
            }
        }
    };

    for (const phaseBucket of phaseSentimentBuckets) {
        const phaseName = phaseBucket.key;
        const phaseCount = phaseBucket.doc_count;
        const sentimentsInPhase = [];
        
        for (const sentimentBucket of (phaseBucket.sentiments?.buckets || [])) {
            const sentimentName = sentimentBucket.key;
            const sentimentCount = sentimentBucket.doc_count;
            
            if (sentimentCount === 0) {
                sentimentsInPhase.push({
                    name: sentimentName,
                    count: 0,
                    posts: []
                });
                continue;
            }
            
            const combinedQuery = {
                bool: {
                    must: [
                        ...baseQuery.bool.must,
                        timeIntervalFilter,
                        {
                            term: {
                                "llm_motivation.phase.keyword": phaseName
                            }
                        },
                        {
                            term: {
                                "predicted_sentiment_value.keyword": sentimentName
                            }
                        }
                    ]
                }
            };
            
            const posts = await fetchPostsForQuery(combinedQuery, elasticClient, 30);
            
            sentimentsInPhase.push({
                name: sentimentName,
                count: sentimentCount,
                posts: posts
            });
        }
        
        phaseSentimentInInterval.push({
            phase: phaseName,
            count: phaseCount,
            sentiments: sentimentsInPhase
        });
    }
    
    return phaseSentimentInInterval;
}

// Helper function to fetch posts for a given query
async function fetchPostsForQuery(query, elasticClient, maxPosts = 30) {
    try {
        const postsQuery = {
            size: maxPosts,
            query: query,
            sort: [{ p_created_time: { order: 'desc' } }]
        };
        
        const response = await elasticClient.search({
            index: process.env.ELASTICSEARCH_DEFAULTINDEX,
            body: postsQuery
        });
        
        return response.hits.hits.map(hit => formatPostData(hit));
    } catch (error) {
        console.error('Error fetching posts:', error);
        return [];
    }
}


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

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @param {boolean} isSpecialTopic - Whether this is a special topic
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false,topicIdNum) {
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

    const normalizedSources = normalizeSourceInput(source);

    // Check user-provided sources FIRST - they take precedence over topicId defaults
    if (normalizedSources.length > 0) {
        query.bool.must.push({
            bool: {
                should: normalizedSources.map(src => ({
                    match_phrase: { source: src }
                })),
                minimum_should_match: 1
            }
        });
    } else if(topicIdNum===2619 || topicIdNum===2639 || topicIdNum===2640 || topicIdNum===2647 || topicIdNum===2648 || topicIdNum===2649){
       query.bool.must.push({
              bool: {
                  should: [
                    { match_phrase: { source: "LinkedIn" } },
                          { match_phrase: { source: "Linkedin" } },
                  ],
                  minimum_should_match: 1
              }
          });
    } else  if(topicIdNum===2646 || topicIdNum===2650 ){
       query.bool.must.push({
              bool: {
                  should: [
                    { match_phrase: { source: "LinkedIn" } },
                          { match_phrase: { source: "Linkedin" } },
                          { match_phrase: { source: "Twitter" } },
                          { match_phrase: { source: "Web" } },
                          { match_phrase: { source: 'Facebook' } },
                 { match_phrase: { source: 'Instagram' } },
                 { match_phrase: { source: 'Youtube' } },
                  ],
                  minimum_should_match: 1
              }
          });
    }
    else if(topicIdNum === 2641 || parseInt(topicIdNum) === 2643 || parseInt(topicIdNum) === 2644 || parseInt(topicIdNum) === 2651 || parseInt(topicIdNum) === 2652 || parseInt(topicIdNum) === 2653 || parseInt(topicIdNum) === 2654 || parseInt(topicIdNum) === 2655 || parseInt(topicIdNum) === 2658 || parseInt(topicIdNum) === 2659 || parseInt(topicIdNum) === 2660 || parseInt(topicIdNum) === 2661 || parseInt(topicIdNum) === 2662 || parseInt(topicIdNum) === 2663){
      query.bool.must.push({
        bool: {
          should: [
            { match_phrase: { source: "Facebook" } },
            { match_phrase: { source: "Twitter" } },
            { match_phrase: { source: "Instagram" } }
          ],
          minimum_should_match: 1,
        }});
  
    }
    else if (parseInt(topicIdNum) === 2656 || parseInt(topicIdNum) === 2657) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
                    { match_phrase: { source: "Youtube" } },
                ],
                minimum_should_match: 1
            }
        });
    } else if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    }  else if (topicIdNum===2619) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } },
                    { match_phrase: { source: "Instagram" } },
                ],
                minimum_should_match: 1
            }
        });
    }else {
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
                    { match_phrase: { source: "TikTok" } }
                ],
                minimum_should_match: 1
            }
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
    if (selectedCategory === 'all') {
        query.bool.must.push({
            bool: {
                should: [
                    ...Object.values(categoryData).flatMap(data =>
                        (data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ])
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
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
                        ...(data.keywords || []).flatMap(keyword => [
                            { match_phrase: { p_message_text: keyword } },
                            { match_phrase: { keywords: keyword } }
                        ]),
                        ...(data.hashtags || []).flatMap(hashtag => [
                            { match_phrase: { p_message_text: hashtag } },
                            { match_phrase: { hashtags: hashtag } }
                        ]),
                        ...(data.urls || []).flatMap(url => [
                            { match_phrase: { u_source: url } },
                            { match_phrase: { p_url: url } }
                        ])
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

module.exports = sentimentsController; 
