/**
 * @swagger
 * components:
 *   schemas:
 *     ThemesSentimentAnalysisRequest:
 *       type: object
 *       properties:
 *         topicId:
 *           type: integer
 *           description: The topic ID to analyze
 *           example: 123
 *         source:
 *           type: string
 *           description: Social media source to filter by
 *           default: "All"
 *           enum: ["All", "Facebook", "Twitter", "Instagram", "Youtube", "LinkedIn", "Pinterest", "Web", "Reddit"]
 *           example: "All"
 *         category:
 *           type: string
 *           description: Category to filter by
 *           default: "all"
 *           example: "all"
 *         sentiment:
 *           type: string
 *           description: Overall post sentiment filter to apply (this filters the predicted_sentiment_value field)
 *           enum: ["All", "all", "Positive", "positive", "Negative", "negative", "Neutral", "neutral"]
 *           example: "All"
 *         greaterThanTime:
 *           type: string
 *           format: date
 *           description: Start date for analysis (YYYY-MM-DD). Defaults to 90 days ago for regular topics.
 *           example: "2024-01-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: End date for analysis (YYYY-MM-DD). Defaults to current date.
 *           example: "2024-12-31"
 *       required:
 *         - topicId
 *     
 *     StackedBarDataPoint:
 *       type: object
 *       description: Data point for stacked bar chart with theme as category and sentiment counts
 *       properties:
 *         category:
 *           type: string
 *           description: Theme name (used as x-axis category)
 *           example: "Social Cohesion & Inclusion"
 *         total:
 *           type: integer
 *           description: Total count across all sentiments for this theme
 *           example: 45
 *         Positive:
 *           type: integer
 *           description: Count of positive sentiment for this theme
 *           example: 25
 *         Negative:
 *           type: integer
 *           description: Count of negative sentiment for this theme
 *           example: 15
 *         Neutral:
 *           type: integer
 *           description: Count of neutral sentiment for this theme
 *           example: 5
 *       additionalProperties:
 *         type: integer
 *         description: Dynamic sentiment counts (sentiment names vary based on data)
 *     
 *     ThemeSentimentDetails:
 *       type: object
 *       properties:
 *         count:
 *           type: integer
 *           description: Number of mentions for this sentiment
 *           example: 15
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of posts that contain this theme with this sentiment
 *     
 *     DetailedThemeData:
 *       type: object
 *       properties:
 *         theme:
 *           type: string
 *           description: Theme name
 *           example: "Social Cohesion & Inclusion"
 *         sentiments:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/ThemeSentimentDetails'
 *           description: Sentiment breakdown with detailed post data
 *           example:
 *             Positive:
 *               count: 25
 *               posts: []
 *             Negative:
 *               count: 15
 *               posts: []
 *         totalCount:
 *           type: integer
 *           description: Total mentions across all sentiments for this theme
 *           example: 40
 *     
 *     ThemesSentimentAnalysisResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         themesSentimentData:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StackedBarDataPoint'
 *           description: Data formatted for stacked bar chart (themes as categories, sentiments as stacks)
 *         detailedData:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DetailedThemeData'
 *           description: Detailed breakdown with post data for each theme-sentiment combination
 *         totalCount:
 *           type: integer
 *           description: Total number of theme-sentiment pairs found
 *           example: 350
 *         sentimentTypes:
 *           type: array
 *           items:
 *             type: string
 *           description: List of all sentiment types found in the data
 *           example: ["Positive", "Negative", "Neutral", "Supportive", "Distrustful"]
 *         themes:
 *           type: array
 *           items:
 *             type: string
 *           description: List of all theme names found, sorted alphabetically
 *           example: ["Social Cohesion & Inclusion", "Governance & Public Trust", "Economic Development"]
 *         dateRange:
 *           type: object
 *           properties:
 *             from:
 *               type: string
 *               format: date
 *               example: "2024-01-01"
 *             to:
 *               type: string
 *               format: date
 *               example: "2024-12-31"
 */

/**
 * @swagger
 * /social-media/themes-sentiment-analysis:
 *   post:
 *     summary: Get themes grouped by sentiment analysis for stacked bar chart
 *     description: |
 *       Analyzes themes from the themes_sentiments JSON field and groups them by their sentiment values to create stacked bar charts.
 *       Perfect for visualizing "Themes by Sentiment" as shown in your example chart.
 *       
 *       **Data Source:**
 *       Parses themes_sentiments field like: `{"Social Cohesion & Inclusion": "Positive", "Governance & Public Trust": "Negative"}`
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - For other topics, includes all 8 social media sources
 *       - Defaults to last 90 days if no date range provided
 *       
 *       **Chart Structure:**
 *       - X-axis: Theme names (Social Cohesion & Inclusion, Governance & Public Trust, etc.)
 *       - Y-axis: Count of mentions
 *       - Stacks: Different sentiment values (Positive, Negative, Neutral, Supportive, Distrustful, etc.)
 *       - Colors: Different colors for each sentiment type
 *       
 *       **Response Formats:**
 *       1. **themesSentimentData**: Optimized for stacked bar charts
 *          - Each object represents one theme (x-axis category)
 *          - Properties for each sentiment type with counts
 *          - Ready to use with charting libraries
 *       
 *       2. **detailedData**: Full breakdown with post details
 *          - Complete theme-sentiment analysis
 *          - Includes actual post data for drill-down capabilities
 *          - Useful for tooltips and detailed views
 *       
 *       **Filtering Options:**
 *       - Filter by overall post sentiment (predicted_sentiment_value field)
 *       - Filter by social media source
 *       - Custom date ranges supported
 *       - Category-based filtering through middleware
 *       
 *       **Sorting:**
 *       - Themes sorted by total count descending (most mentioned themes first)
 *       - Sentiment types sorted alphabetically for consistent ordering
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ThemesSentimentAnalysisRequest'
 *           examples:
 *             basic:
 *               summary: Basic themes sentiment analysis
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *             special_topic:
 *               summary: Special topic (2600) analysis - Facebook/Twitter only
 *               value:
 *                 topicId: 2600
 *                 source: "All"
 *                 category: "all"
 *             filtered_by_sentiment:
 *               summary: Filter by overall positive post sentiment
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 sentiment: "Positive"
 *             date_range:
 *               summary: Analysis with custom date range
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 greaterThanTime: "2024-01-01"
 *                 lessThanTime: "2024-12-31"
 *             facebook_only:
 *               summary: Facebook posts only
 *               value:
 *                 topicId: 123
 *                 source: "Facebook"
 *                 category: "all"
 *     responses:
 *       200:
 *         description: Themes sentiment analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThemesSentimentAnalysisResponse'
 *             example:
 *               success: true
 *               themesSentimentData:
 *                 - category: "Social Cohesion & Inclusion"
 *                   total: 45
 *                   Positive: 25
 *                   Negative: 15
 *                   Neutral: 5
 *                 - category: "Governance & Public Trust"
 *                   total: 38
 *                   Positive: 10
 *                   Negative: 20
 *                   Neutral: 8
 *                 - category: "Economic Development"
 *                   total: 32
 *                   Positive: 18
 *                   Negative: 10
 *                   Neutral: 4
 *               detailedData:
 *                 - theme: "Social Cohesion & Inclusion"
 *                   sentiments:
 *                     Positive:
 *                       count: 25
 *                       posts: []
 *                     Negative:
 *                       count: 15
 *                       posts: []
 *                     Neutral:
 *                       count: 5
 *                       posts: []
 *                   totalCount: 45
 *               totalCount: 115
 *               sentimentTypes: ["Negative", "Neutral", "Positive"]
 *               themes: ["Economic Development", "Governance & Public Trust", "Social Cohesion & Inclusion"]
 *               dateRange:
 *                 from: "2024-10-01"
 *                 to: "2024-12-31"
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = {}; 