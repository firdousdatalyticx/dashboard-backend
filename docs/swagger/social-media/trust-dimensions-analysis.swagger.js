/**
 * @swagger
 * components:
 *   schemas:
 *     ToneData:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the tone
 *           example: "Distrustful"
 *         count:
 *           type: integer
 *           description: Number of mentions with this tone
 *           example: 5
 *         percentage:
 *           type: integer
 *           description: Percentage of mentions with this tone (rounded to nearest integer)
 *           example: 62
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this tone
 *     
 *     CountryTrustData:
 *       type: object
 *       properties:
 *         country:
 *           type: string
 *           description: Country name
 *           example: "United Arab Emirates"
 *         tones:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ToneData'
 *           description: Array of tone data for this country
 *         totalCount:
 *           type: integer
 *           description: Total number of mentions for this country
 *           example: 8
 *     
 *     TrustDimensionAnalysis:
 *       type: object
 *       properties:
 *         dimension:
 *           type: string
 *           description: Trust dimension name
 *           example: "judiciary"
 *         countries:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CountryTrustData'
 *           description: Array of country data for this trust dimension
 *         totalCount:
 *           type: integer
 *           description: Total number of mentions for this trust dimension
 *           example: 25
 *     
 *     TrustDimensionsAnalysisResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         trustDimensionsAnalysis:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TrustDimensionAnalysis'
 *           description: Array of trust dimension analysis data grouped by country
 *         totalCount:
 *           type: integer
 *           description: Total number of trust dimension mentions across all countries
 *           example: 150
 *         filteredTone:
 *           type: string
 *           description: The tone filter applied (if any)
 *           example: "Distrustful"
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
 *     TrustDimensionsAnalysisRequest:
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
 *         tone:
 *           type: string
 *           description: Trust dimension tone filter (e.g., "Distrustful", "Supportive", "Neutral", "Mixed")
 *           enum: ["Distrustful", "Supportive", "Neutral", "Mixed", "Not Applicable"]
 *           example: "Distrustful"
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
 * /social-media/trust-dimensions-analysis:
 *   post:
 *     summary: Get trust dimensions analysis grouped by country and tone
 *     description: |
 *       Analyzes trust dimensions data from social media posts grouped by country and tone.
 *       Perfect for creating horizontal bar charts showing trust dimension distribution by country.
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - Uses wider date ranges (default from 2 years ago)
 *       - For other topics, uses 90-day default restriction
 *       
 *       **Data Processing:**
 *       - Parses the 'trust_dimensions' JSON field from posts
 *       - Groups data by trust dimension, then by country, then by tone
 *       - Counts mentions and calculates percentages for each combination
 *       - Returns structured data suitable for multi-series bar charts
 *       - Includes posts array for each combination to enable drill-down functionality
 *       - Percentages are rounded to nearest integer for clean display
 *       
 *       **Tone Filtering:**
 *       - Use the 'tone' parameter to filter for specific trust dimension tones
 *       - Perfect for creating "Distrustful tone by trust-dimension & country" charts
 *       - Available tones: Distrustful, Supportive, Neutral, Mixed, Not Applicable
 *       
 *       **Use Cases:**
 *       - Creating horizontal bar charts showing "Distrustful tone by trust-dimension & country"
 *       - Analyzing trust sentiment distribution across different countries
 *       - Comparing trust levels between countries for specific dimensions
 *       - Filtering by specific trust dimensions or countries for detailed analysis
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrustDimensionsAnalysisRequest'
 *           examples:
 *             distrustful_analysis:
 *               summary: Distrustful tone analysis by country (for chart creation)
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 tone: "Distrustful"
 *             basic:
 *               summary: Basic trust dimensions analysis by country
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
 *                 tone: "Distrustful"
 *             custom_date_range:
 *               summary: Analysis with custom date range
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 tone: "Distrustful"
 *                 greaterThanTime: "2024-01-01"
 *                 lessThanTime: "2024-03-31"
 *             sentiment_filtered:
 *               summary: Analysis with sentiment filter
 *               value:
 *                 topicId: 123
 *                 source: "Facebook"
 *                 category: "all"
 *                 sentiment: "Negative"
 *                 tone: "Distrustful"
 *     responses:
 *       200:
 *         description: Trust dimensions analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrustDimensionsAnalysisResponse'
 *             example:
 *               success: true
 *               trustDimensionsAnalysis:
 *                 - dimension: "judiciary"
 *                   countries:
 *                     - country: "United Arab Emirates"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 6
 *                           percentage: 100
 *                           posts:
 *                             - profilePicture: "https://example.com/profile.jpg"
 *                               userFullname: "John Doe"
 *                               content: "Judicial system concerns..."
 *                               source: "Facebook"
 *                               country: "United Arab Emirates"
 *                               created_at: "2024-01-15 10:30:00"
 *                       totalCount: 6
 *                     - country: "Saudi Arabia"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 1
 *                           percentage: 100
 *                           posts: []
 *                       totalCount: 1
 *                   totalCount: 7
 *                 - dimension: "government"
 *                   countries:
 *                     - country: "United Arab Emirates"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 7
 *                           percentage: 100
 *                           posts: []
 *                       totalCount: 7
 *                     - country: "Egypt"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 1
 *                           percentage: 100
 *                           posts: []
 *                       totalCount: 1
 *                   totalCount: 8
 *                 - dimension: "police"
 *                   countries:
 *                     - country: "Egypt"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 8
 *                           percentage: 100
 *                           posts: []
 *                       totalCount: 8
 *                     - country: "United Arab Emirates"
 *                       tones:
 *                         - name: "Distrustful"
 *                           count: 3
 *                           percentage: 100
 *                           posts: []
 *                       totalCount: 3
 *                   totalCount: 11
 *               totalCount: 26
 *               filteredTone: "Distrustful"
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