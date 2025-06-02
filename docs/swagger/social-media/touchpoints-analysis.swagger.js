/**
 * @swagger
 * components:
 *   schemas:
 *     TouchpointSentimentData:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the sentiment
 *           example: "Positive"
 *         count:
 *           type: integer
 *           description: Number of mentions with this sentiment
 *           example: 95
 *         percentage:
 *           type: integer
 *           description: Percentage of mentions with this sentiment (rounded to nearest integer)
 *           example: 78
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this sentiment
 *     
 *     TouchpointAnalysisData:
 *       type: object
 *       properties:
 *         touchpoint:
 *           type: string
 *           description: Touchpoint category name
 *           example: "Social Welfare Programs"
 *         sentiments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TouchpointSentimentData'
 *           description: Array of sentiment data for this touchpoint
 *         totalCount:
 *           type: integer
 *           description: Total number of mentions for this touchpoint
 *           example: 122
 *         positive:
 *           type: integer
 *           description: Count of positive mentions
 *           example: 95
 *         negative:
 *           type: integer
 *           description: Count of negative mentions
 *           example: 8
 *         neutral:
 *           type: integer
 *           description: Count of neutral mentions
 *           example: 15
 *         distrustful:
 *           type: integer
 *           description: Count of distrustful mentions
 *           example: 3
 *         supportive:
 *           type: integer
 *           description: Count of supportive mentions
 *           example: 1
 *     
 *     TouchpointsAnalysisResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         touchpointsAnalysis:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TouchpointAnalysisData'
 *           description: Array of touchpoint analysis data grouped by sentiment
 *         totalCount:
 *           type: integer
 *           description: Total number of touchpoint mentions across all categories
 *           example: 650
 *         dateRange:
 *           type: object
 *           properties:
 *             from:
 *               type: string
 *               format: date
 *               example: "2023-10-01"
 *             to:
 *               type: string
 *               format: date
 *               example: "2024-01-31"
 *     
 *     TouchpointsAnalysisRequest:
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
 *           description: Sentiment filter to apply
 *           enum: ["All", "all", "Positive", "positive", "Negative", "negative", "Neutral", "neutral"]
 *           example: "All"
 *         greaterThanTime:
 *           type: string
 *           format: date
 *           description: Start date for analysis (YYYY-MM-DD)
 *           example: "2023-10-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: End date for analysis (YYYY-MM-DD)
 *           example: "2024-01-31"
 *       required:
 *         - topicId
 */

/**
 * @swagger
 * /social-media/touchpoints-analysis:
 *   post:
 *     summary: Get touchpoints analysis grouped by sentiment for stacked bar chart
 *     description: |
 *       Analyzes touchpoints data from social media posts to create horizontal stacked bar charts.
 *       Parses the touchpoints JSON field to group data by touchpoint category and sentiment.
 *       
 *       **Data Source:**
 *       Parses touchpoints field like: `{"Social Welfare Programs": "Positive", "Political Change": "Neutral"}`
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - Uses wider date ranges (default from 2 years ago)
 *       - For other topics, uses 90-day default restriction
 *       
 *       **Chart Structure:**
 *       - Y-axis: Touchpoint categories (Social Welfare Programs, Improve living standards, etc.)
 *       - X-axis: Count values (stacked by sentiment)
 *       - Colors: Sentiment types (Neutral=blue, Distrustful=orange, Positive=green, Negative=red, Supportive=purple)
 *       - Stacking: Each bar shows sentiment breakdown for that touchpoint
 *       
 *       **Response Format:**
 *       - Returns both detailed sentiment arrays and direct count fields
 *       - Sorted by total count descending (highest bars first)
 *       - Includes post details for drill-down functionality
 *       - Percentages rounded to nearest integer
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TouchpointsAnalysisRequest'
 *           examples:
 *             basic:
 *               summary: Basic touchpoints analysis
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *             special_topic:
 *               summary: Special topic (2600) analysis
 *               value:
 *                 topicId: 2600
 *                 source: "All"
 *                 category: "all"
 *             date_filtered:
 *               summary: Analysis with date range
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 greaterThanTime: "2024-01-01"
 *                 lessThanTime: "2024-03-31"
 *     responses:
 *       200:
 *         description: Touchpoints analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TouchpointsAnalysisResponse'
 *             example:
 *               success: true
 *               touchpointsAnalysis:
 *                 - touchpoint: "Social Welfare Programs"
 *                   sentiments:
 *                     - name: "Positive"
 *                       count: 95
 *                       percentage: 78
 *                       posts: []
 *                     - name: "Neutral"
 *                       count: 15
 *                       percentage: 12
 *                       posts: []
 *                     - name: "Distrustful"
 *                       count: 8
 *                       percentage: 7
 *                       posts: []
 *                     - name: "Negative"
 *                       count: 3
 *                       percentage: 2
 *                       posts: []
 *                     - name: "Supportive"
 *                       count: 1
 *                       percentage: 1
 *                       posts: []
 *                   totalCount: 122
 *                   positive: 95
 *                   negative: 3
 *                   neutral: 15
 *                   distrustful: 8
 *                   supportive: 1
 *                 - touchpoint: "Improve living standards"
 *                   sentiments:
 *                     - name: "Positive"
 *                       count: 70
 *                       percentage: 74
 *                       posts: []
 *                     - name: "Neutral"
 *                       count: 20
 *                       percentage: 21
 *                       posts: []
 *                     - name: "Supportive"
 *                       count: 5
 *                       percentage: 5
 *                       posts: []
 *                   totalCount: 95
 *                   positive: 70
 *                   negative: 0
 *                   neutral: 20
 *                   distrustful: 0
 *                   supportive: 5
 *                 - touchpoint: "Governance Reforms"
 *                   sentiments:
 *                     - name: "Positive"
 *                       count: 45
 *                       percentage: 64
 *                       posts: []
 *                     - name: "Neutral"
 *                       count: 20
 *                       percentage: 29
 *                       posts: []
 *                     - name: "Distrustful"
 *                       count: 5
 *                       percentage: 7
 *                       posts: []
 *                   totalCount: 70
 *                   positive: 45
 *                   negative: 0
 *                   neutral: 20
 *                   distrustful: 5
 *                   supportive: 0
 *               totalCount: 287
 *               dateRange:
 *                 from: "2023-10-01"
 *                 to: "2024-01-31"
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