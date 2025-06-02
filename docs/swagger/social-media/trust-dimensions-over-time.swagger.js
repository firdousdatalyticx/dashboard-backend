/**
 * @swagger
 * components:
 *   schemas:
 *     TrustDimensionDataPoint:
 *       type: object
 *       properties:
 *         month:
 *           type: string
 *           description: Month in MMM yyyy format
 *           example: "Jun 2024"
 *         count:
 *           type: integer
 *           description: Number of mentions for this month
 *           example: 15
 *         monthDate:
 *           type: string
 *           format: date
 *           description: Month date in YYYY-MM-DD format for sorting
 *           example: "2024-06-01"
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this month and dimension/tone combination
 *     
 *     TrustDimensionTimeSeries:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Series name combining dimension and tone
 *           example: "government (Distrustful)"
 *         dimension:
 *           type: string
 *           description: Trust dimension category
 *           example: "government"
 *         tone:
 *           type: string
 *           description: Trust dimension tone
 *           enum: ["Supportive", "Distrustful"]
 *           example: "Distrustful"
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TrustDimensionDataPoint'
 *           description: Array of monthly data points for this series
 *     
 *     TrustDimensionsOverTimeResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         trustDimensionsOverTime:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TrustDimensionTimeSeries'
 *           description: Array of time series data for different trust dimensions and tones
 *         totalCount:
 *           type: integer
 *           description: Total number of trust dimension mentions across all categories and months
 *           example: 450
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
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *           description: List of all trust dimension categories found
 *           example: ["government", "social", "political_parties", "insurance_companies"]
 *         months:
 *           type: array
 *           items:
 *             type: string
 *           description: List of all months in the date range
 *           example: ["Jan 2024", "Feb 2024", "Mar 2024"]
 *     
 *     TrustDimensionsOverTimeRequest:
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
 *           description: Overall sentiment filter to apply
 *           enum: ["All", "all", "Positive", "positive", "Negative", "negative", "Neutral", "neutral"]
 *           example: "All"
 *         tone:
 *           type: string
 *           description: Trust dimension tone filter
 *           enum: ["All", "Supportive", "Distrustful"]
 *           default: "All"
 *           example: "All"
 *         greaterThanTime:
 *           type: string
 *           format: date
 *           description: Start date for analysis (YYYY-MM-DD). Defaults to 12 months ago.
 *           example: "2024-01-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: End date for analysis (YYYY-MM-DD). Defaults to current date.
 *           example: "2024-12-31"
 *       required:
 *         - topicId
 */

/**
 * @swagger
 * /social-media/trust-dimensions-over-time:
 *   post:
 *     summary: Get trust dimensions analysis trends over time for line chart
 *     description: |
 *       Analyzes trust dimensions data from social media posts to create line charts showing trends over time.
 *       Parses the trust_dimensions JSON field to track mentions by month for different dimensions and tones.
 *       
 *       **Data Source:**
 *       Parses trust_dimensions field like: `{"government": "Distrustful", "social": "Supportive"}`
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - For other topics, includes all 8 social media sources
 *       - Defaults to last 12 months if no date range provided
 *       
 *       **Chart Structure:**
 *       - X-axis: Months (Jun 2024, Jul 2024, Aug 2024, etc.)
 *       - Y-axis: Mention counts
 *       - Lines: Each trust dimension + tone combination (e.g., "government (Distrustful)", "social (Supportive)")
 *       - Colors: Different colors for each dimension-tone combination
 *       
 *       **Filtering Options:**
 *       - Filter by specific tone: "Supportive", "Distrustful", or "All"
 *       - Filter by overall sentiment: Positive, Negative, Neutral, or All
 *       - Filter by social media source
 *       - Custom date ranges supported
 *       
 *       **Response Format:**
 *       - Returns time series data suitable for line charts
 *       - Each series contains monthly data points
 *       - Sorted by dimension name and tone for consistent ordering
 *       - Only includes series with actual data points
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrustDimensionsOverTimeRequest'
 *           examples:
 *             basic:
 *               summary: Basic trust dimensions over time analysis
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 tone: "All"
 *             distrustful_only:
 *               summary: Distrustful tone analysis only
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 tone: "Distrustful"
 *             special_topic:
 *               summary: Special topic (2600) analysis
 *               value:
 *                 topicId: 2600
 *                 source: "All"
 *                 category: "all"
 *                 tone: "All"
 *             date_filtered:
 *               summary: Analysis with custom date range
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 tone: "All"
 *                 greaterThanTime: "2024-06-01"
 *                 lessThanTime: "2024-12-31"
 *     responses:
 *       200:
 *         description: Trust dimensions over time data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrustDimensionsOverTimeResponse'
 *             example:
 *               success: true
 *               trustDimensionsOverTime:
 *                 - name: "government (Distrustful)"
 *                   dimension: "government"
 *                   tone: "Distrustful"
 *                   data:
 *                     - month: "Jun 2024"
 *                       count: 25
 *                       monthDate: "2024-06-01"
 *                     - month: "Jul 2024"
 *                       count: 30
 *                       monthDate: "2024-07-01"
 *                     - month: "Aug 2024"
 *                       count: 18
 *                       monthDate: "2024-08-01"
 *                 - name: "government (Supportive)"
 *                   dimension: "government"
 *                   tone: "Supportive"
 *                   data:
 *                     - month: "Jun 2024"
 *                       count: 10
 *                       monthDate: "2024-06-01"
 *                     - month: "Jul 2024"
 *                       count: 12
 *                       monthDate: "2024-07-01"
 *                     - month: "Aug 2024"
 *                       count: 8
 *                       monthDate: "2024-08-01"
 *                 - name: "social (Distrustful)"
 *                   dimension: "social"
 *                   tone: "Distrustful"
 *                   data:
 *                     - month: "Jun 2024"
 *                       count: 5
 *                       monthDate: "2024-06-01"
 *                     - month: "Jul 2024"
 *                       count: 8
 *                       monthDate: "2024-07-01"
 *                     - month: "Aug 2024"
 *                       count: 3
 *                       monthDate: "2024-08-01"
 *               totalCount: 119
 *               dateRange:
 *                 from: "2024-06-01"
 *                 to: "2024-12-31"
 *               categories: ["government", "social", "political_parties"]
 *               months: ["Jun 2024", "Jul 2024", "Aug 2024", "Sep 2024", "Oct 2024", "Nov 2024", "Dec 2024"]
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