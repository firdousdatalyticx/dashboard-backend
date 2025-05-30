/**
 * @swagger
 * components:
 *   schemas:
 *     SectorData:
 *       type: object
 *       properties:
 *         sector:
 *           type: string
 *           description: Sector name
 *           example: "Economic"
 *         count:
 *           type: integer
 *           description: Number of posts in this sector
 *           example: 1250
 *         percentage:
 *           type: integer
 *           description: Percentage of total posts (rounded to nearest integer)
 *           example: 28
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this sector
 *     
 *     SectorDistributionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         sectors:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SectorData'
 *           description: Array of sector data with counts and percentages
 *         totalCount:
 *           type: integer
 *           description: Total number of posts across all sectors
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
 *     SectorDistributionRequest:
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
 * /social-media/sector-distribution:
 *   post:
 *     summary: Get sector distribution analysis
 *     description: |
 *       Analyzes the 'sector' field from social media posts to create a pie chart showing
 *       post distribution by sector. Perfect for visualizing sector-wise content distribution.
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - Uses wider date ranges (default from 2 years ago)
 *       - For other topics, uses 90-day default restriction
 *       
 *       **Category Filtering:**
 *       - Requires topicId to fetch category data (keywords, hashtags, URLs)
 *       - Filters posts based on category-specific terms
 *       - Uses the transformCategoryData middleware
 *       
 *       **Data Processing:**
 *       - Analyzes the 'sector' field from posts
 *       - Counts posts by sector and calculates percentages
 *       - Returns data formatted for pie chart visualization
 *       - Includes posts array for each sector to enable drill-down functionality
 *       - Percentages are rounded to nearest integer for clean display
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SectorDistributionRequest'
 *           examples:
 *             basic:
 *               summary: Basic sector distribution analysis
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
 *             custom_source:
 *               summary: Analysis for specific source
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
 *         description: Sector distribution analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SectorDistributionResponse'
 *             example:
 *               success: true
 *               sectors:
 *                 - sector: "Social Services"
 *                   count: 2520
 *                   percentage: 29
 *                   posts:
 *                     - profilePicture: "https://example.com/profile.jpg"
 *                       userFullname: "John Doe"
 *                       content: "Social services improvement needed"
 *                       source: "Facebook"
 *                       created_at: "2024-01-15 10:30:00"
 *                 - sector: "Education"
 *                   count: 2070
 *                   percentage: 24
 *                   posts: []
 *                 - sector: "Governance"
 *                   count: 1085
 *                   percentage: 12
 *                   posts: []
 *                 - sector: "Economic"
 *                   count: 1023
 *                   percentage: 12
 *                   posts: []
 *                 - sector: "Technology"
 *                   count: 892
 *                   percentage: 10
 *                   posts: []
 *                 - sector: "Health"
 *                   count: 700
 *                   percentage: 8
 *                   posts: []
 *                 - sector: "Culture & Society"
 *                   count: 289
 *                   percentage: 3
 *                   posts: []
 *                 - sector: "Infrastructure"
 *                   count: 140
 *                   percentage: 2
 *                   posts: []
 *                 - sector: "Security"
 *                   count: 70
 *                   percentage: 1
 *                   posts: []
 *                 - sector: "Environment"
 *                   count: 70
 *                   percentage: 1
 *                   posts: []
 *               totalCount: 8859
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