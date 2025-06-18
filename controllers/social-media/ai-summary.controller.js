const axios = require('axios');
const { elasticClient } = require('../../config/elasticsearch');
const { format, parseISO, subDays, subMonths, subWeeks } = require('date-fns');

const aiSummaryController = {
    /**
     * Get AI-generated summary for social media posts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with AI summary
     */
    getAiSummary: async (req, res) => {
        try {
            const {
                topicId,
                interval = 'monthly',
                source = 'All',
                category = 'all',
                chartType = 'emotionAnalysis'
            } = req.body;

            // Check if this is the special topicId
            const isSpecialTopic = topicId && parseInt(topicId) === 2600;

            // Get category data from middleware
            const categoryData = req.processedCategories || {};

            if (Object.keys(categoryData).length === 0) {
                return res.json({
                    success: true,
                    summary: ''
                });
            }

            // Set date range based on interval - for special topic, use wider range
            const now = new Date();
            let startDate;
            let calendarInterval;
            let formatPattern;

            if (isSpecialTopic) {
                // For special topic, use a wider range instead of default restrictions
                startDate = new Date('2020-01-01');
                calendarInterval = 'month';
                formatPattern = 'yyyy-MM';
            } else {
                switch (interval) {
                    case 'daily':
                        startDate = subDays(now, 7);
                        calendarInterval = 'day';
                        formatPattern = 'yyyy-MM-dd';
                        break;
                    case 'weekly':
                        startDate = subWeeks(now, 4);
                        calendarInterval = 'week';
                        formatPattern = 'yyyy-w';
                        break;
                    default: // monthly
                        startDate = subMonths(now, 3);
                        calendarInterval = 'month';
                        formatPattern = 'yyyy-MM';
                }
            }

            // Format dates for Elasticsearch query
            const greaterThanTime = format(startDate, 'yyyy-MM-dd');
            const lessThanTime = format(now, 'yyyy-MM-dd');

            // Build base query
            const query = buildBaseQuery({
                greaterThanTime,
                lessThanTime
            }, source, isSpecialTopic);

            // Add category filters
            addCategoryFilters(query, category, categoryData);

            // Create params for Elasticsearch query
            const params = {
                size: 30,
                query: query
            };

            // Execute the query
            const response = await elasticClient.search({
                index: process.env.ELASTICSEARCH_DEFAULTINDEX,
                body: params
            });

            // Format the response for AI summary API
            const formattedArray = response.hits.hits.map(hit => ({
                p_message: hit._source.p_message,
                predicted_sentiment_value: hit._source.predicted_sentiment_value
            }));

            // Determine which summary API to use
            let summaryUrl = "https://api.datalyticx.ai/report/emotion-summary/";
            if (chartType === "sentimentAnalysis") {
                summaryUrl = "https://api.datalyticx.ai/report/sentiment-summary/";
            }

            // Call external AI summary API
            const summaryResponse = await axios.post(summaryUrl, {
                data: formattedArray
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Return the summary
            return res.json({
                success: true,
                summary: summaryResponse.data,
                chartData: formattedArray
            });

        } catch (error) {
            console.error('Error generating AI summary:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to generate AI summary'
            });
        }
    },

    /**
     * Save AI summary to database
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response confirming save
     */
    saveAiSummary: async (req, res) => {
        try {
            const { 
                topicId,
                summaryName,
                summaryText,
                chartData,
                dashboardType,
                fromDate,
                toDate
            } = req.body;

            const userId = req.user.id;

            // Create a new summary record in the database
            const newSummary = await prisma.ai_summary.create({
                data: {
                    summary_name: summaryName,
                    topic_user_id: userId,
                    summary_text: summaryText,
                    chart_data: chartData, // This will be stored as JSON
                    dashboard_type: dashboardType,
                    from_date: fromDate,
                    to_date: toDate,
                    created_at: new Date()
                }
            });

            return res.status(201).json({
                success: true,
                message: 'AI summary saved successfully',
                data: newSummary
            });

        } catch (error) {
            console.error('Error saving AI summary:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to save AI summary'
            });
        }
    },

    /**
     * Get saved AI summaries for a user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} JSON response with saved summaries
     */
    getSavedSummaries: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get saved summaries from database
            const savedSummaries = await prisma.ai_summary.findMany({
                where: {
                    topic_user_id: userId
                },
                orderBy: {
                    created_at: 'desc'
                }
            });

            return res.json({
                success: true,
                data: savedSummaries
            });

        } catch (error) {
            console.error('Error fetching saved AI summaries:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch saved AI summaries'
            });
        }
    }
};

/**
 * Build base query with date range and source filter
 * @param {Object} dateRange - Date range with greaterThanTime and lessThanTime
 * @param {string} source - Source to filter by
 * @returns {Object} Elasticsearch query object
 */
function buildBaseQuery(dateRange, source, isSpecialTopic = false) {
    const query = {
        bool: {
            must: [
                {
                    range: {
                        created_at: {
                            gte: dateRange.greaterThanTime,
                            lte: dateRange.lessThanTime
                        }
                    }
                }
            ]
        }
    };

    // Handle special topic source filtering
    if (isSpecialTopic) {
        query.bool.must.push({
            bool: {
                should: [
                    { match_phrase: { source: "Facebook" } },
                    { match_phrase: { source: "Twitter" } }
                ],
                minimum_should_match: 1
            }
        });
    } else {
        // Add source filter if a specific source is selected
        if (source !== 'All') {
            query.bool.must.push({
                match_phrase: { source: source }
            });
        } else {
            query.bool.must.push({
                bool: {
                    should: [
                        { match_phrase: { source: "Facebook" } },
                        { match_phrase: { source: "Twitter" } },
                        { match_phrase: { source: "Instagram" } },
                        { match_phrase: { source: "Youtube" } },
                        { match_phrase: { source: "LinkedIn" } },
                        { match_phrase: { source: "Pinterest" } },
                        { match_phrase: { source: "Web" } },
                        { match_phrase: { source: "Reddit" } },
                        { match_phrase: { source: "TikTok" } }

                    ],
                    minimum_should_match: 1
                }
            });
        }
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
        // For all categories, use should clause with all category filters
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
                            match_phrase: {
                                hashtags: hashtag
                            }
                        }))
                    ),
                    ...Object.values(categoryData).flatMap(data =>
                        (data.urls || []).map(url => ({
                            match_phrase: {
                                urls: url
                            }
                        }))
                    )
                ],
                minimum_should_match: 1
            }
        });
    } else if (categoryData[selectedCategory]) {
        // For specific category
        const data = categoryData[selectedCategory];
        
        // Add the filter if there's any criteria
        query.bool.must.push({
            bool: {
                should: [
                    ...(data.keywords || []).map(keyword => ({
                        multi_match: {
                            query: keyword,
                            fields: ['p_message_text', 'p_message', 'keywords', 'title'],
                            type: 'phrase'
                        }
                    })),
                    ...(data.hashtags || []).map(hashtag => ({
                        match_phrase: {
                            hashtags: hashtag
                        }
                    })),
                    ...(data.urls || []).map(url => ({
                        match_phrase: {
                            urls: url
                        }
                    }))
                ],
                minimum_should_match: 1
            }
        });
    }
}

module.exports = aiSummaryController; 