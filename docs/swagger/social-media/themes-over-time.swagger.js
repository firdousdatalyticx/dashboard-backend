/**
 * @swagger
 * components:
 *   schemas:
 *     ThemeTimePoint:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           description: Time interval date (format depends on interval type)
 *           example: "2024-01"
 *         count:
 *           type: integer
 *           description: Number of posts for this theme in this time period
 *           example: 45
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this time point
 *     
 *     ThemeData:
 *       type: object
 *       properties:
 *         theme:
 *           type: string
 *           description: Theme name
 *           example: "Economic Conditions"
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ThemeTimePoint'
 *           description: Time series data points for this theme
 *         totalCount:
 *           type: integer
 *           description: Total count across all time periods for this theme
 *           example: 1250
 *     
 *     ThemesOverTimeResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         themes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ThemeData'
 *           description: Array of theme data with time series information
 *         timeIntervals:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of time interval strings
 *           example: ["2023-10", "2023-11", "2023-12", "2024-01"]
 *         totalCount:
 *           type: integer
 *           description: Total number of theme mentions across all time periods
 *           example: 8750
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
 *     ThemesOverTimeRequest:
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
 *           description: Start date for analysis (YYYY-MM-DD). If not provided, defaults to 4 months ago.
 *           example: "2023-10-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: End date for analysis (YYYY-MM-DD). If not provided, defaults to current date.
 *           example: "2024-01-31"
 *       required:
 *         - topicId
 */

/**
 * @swagger
 * /social-media/themes-over-time:
 *   post:
 *     summary: Get themes over time analysis
 *     description: |
 *       Analyzes themes_sentiments data from social media posts to create a line chart showing
 *       theme trends over time. Parses themes_sentiments JSON field and aggregates by monthly intervals
 *       for the last 4 months by default.
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - Uses provided date ranges or defaults to last 4 months
 *       - For other topics, always uses last 4 months
 *       
 *       **Category Filtering:**
 *       - Requires topicId to fetch category data (keywords, hashtags, URLs)
 *       - Filters posts based on category-specific terms
 *       - Uses the transformCategoryData middleware
 *       
 *       **Time Interval:**
 *       - Fixed to monthly aggregation (yyyy-MM format)
 *       - Shows data for the last 4 months by default
 *       - Can be customized with greaterThanTime/lessThanTime parameters
 *       
 *       **Data Processing:**
 *       - Parses themes_sentiments JSON field from posts
 *       - Groups posts by monthly intervals and theme names
 *       - Returns time series data suitable for line chart visualization
 *       - Includes posts array for each time point to enable drill-down functionality
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ThemesOverTimeRequest'
 *           examples:
 *             basic:
 *               summary: Basic themes over time analysis
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
 *             custom_date_range:
 *               summary: Analysis with custom date range
 *               value:
 *                 topicId: 123
 *                 source: "Facebook"
 *                 category: "all"
 *                 greaterThanTime: "2024-01-01"
 *                 lessThanTime: "2024-03-31"
 *             sentiment_filtered:
 *               summary: Analysis with sentiment filter
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 sentiment: "Positive"
 *     responses:
 *       200:
 *         description: Themes over time analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThemesOverTimeResponse'
 *             example:
 *               success: true
 *               themes:
 *                 - theme: "Economic Conditions"
 *                   totalCount: 1250
 *                   data:
 *                     - date: "2023-10"
 *                       count: 120
 *                       posts:
 *                         - profilePicture: "https://example.com/profile.jpg"
 *                           userFullname: "John Doe"
 *                           content: "Economic situation is improving"
 *                           source: "Facebook"
 *                           created_at: "2023-10-15 10:30:00"
 *                     - date: "2023-11"
 *                       count: 145
 *                       posts: []
 *                     - date: "2023-12"
 *                       count: 89
 *                       posts: []
 *                 - theme: "Governance & Public Trust"
 *                   totalCount: 980
 *                   data:
 *                     - date: "2023-10"
 *                       count: 95
 *                       posts: []
 *                     - date: "2023-11"
 *                       count: 110
 *                       posts: []
 *                     - date: "2023-12"
 *                       count: 78
 *                       posts: []
 *               timeIntervals: ["2023-10", "2023-11", "2023-12", "2024-01"]
 *               totalCount: 8750
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