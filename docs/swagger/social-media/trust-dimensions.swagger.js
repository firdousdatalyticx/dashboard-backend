/**
 * @swagger
 * components:
 *   schemas:
 *     PostDetails:
 *       type: object
 *       properties:
 *         profilePicture:
 *           type: string
 *           description: User profile picture URL
 *         userFullname:
 *           type: string
 *           description: User's full name
 *         followers:
 *           type: string
 *           description: Number of followers
 *         following:
 *           type: string
 *           description: Number of following
 *         likes:
 *           type: string
 *           description: Number of likes on the post
 *         comments:
 *           type: string
 *           description: Number of comments
 *         shares:
 *           type: string
 *           description: Number of shares
 *         content:
 *           type: string
 *           description: Post content
 *         message_text:
 *           type: string
 *           description: Post message text
 *         source:
 *           type: string
 *           description: Social media source
 *         created_at:
 *           type: string
 *           description: Post creation date
 *         predicted_sentiment:
 *           type: string
 *           description: Predicted sentiment of the post
 *     
 *     TrustDimensionTone:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The tone/sentiment name
 *           example: "Supportive"
 *         count:
 *           type: integer
 *           description: Number of posts with this tone
 *           example: 500
 *         percentage:
 *           type: integer
 *           description: Percentage of posts with this tone (rounded)
 *           example: 42
 *         posts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostDetails'
 *           description: Array of detailed post information for this tone
 *     
 *     TrustDimensionCategory:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           description: The trust dimension category
 *           example: "government"
 *         totalCount:
 *           type: integer
 *           description: Total posts for this category
 *           example: 1200
 *         tones:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TrustDimensionTone'
 *           description: Array of tone data for this category
 *     
 *     TrustDimensionsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         trustDimensions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TrustDimensionCategory'
 *           description: Array of trust dimension categories with tone breakdowns
 *         totalCount:
 *           type: integer
 *           description: Total number of trust dimension mentions
 *           example: 5450
 *     
 *     TrustDimensionsRequest:
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
 *           example: "2024-01-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: End date for analysis (YYYY-MM-DD)
 *           example: "2024-12-31"
 *       required:
 *         - topicId
 */

/**
 * @swagger
 * /social-media/trust-dimensions:
 *   post:
 *     summary: Get trust dimensions analysis
 *     description: |
 *       Analyzes trust dimensions data from social media posts to create a stacked bar chart showing
 *       different institutional categories (government, education_system, institutions, etc.) and their
 *       trust tones (Supportive, Not Applicable, Distrustful, Neutral, Mixed).
 *       
 *       **Special Topic ID 2600 Behavior:**
 *       - Only includes Facebook and Twitter sources
 *       - Uses wider date ranges (default from 2020-01-01)
 *       - Removes 90-day default restriction
 *       
 *       **Category Filtering:**
 *       - Requires topicId to fetch category data (keywords, hashtags, URLs)
 *       - Filters posts based on category-specific terms
 *       - Uses the transformCategoryData middleware
 *       
 *       **Data Processing:**
 *       - Parses trust_dimensions JSON field from posts
 *       - Aggregates by institutional category and trust tone
 *       - Returns counts, percentages, and detailed post information for stacked bar chart visualization
 *       - Includes posts array for each tone to enable post viewing when clicking chart segments
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrustDimensionsRequest'
 *           examples:
 *             basic:
 *               summary: Basic trust dimensions analysis
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
 *                 source: "Facebook"
 *                 category: "all"
 *                 greaterThanTime: "2024-01-01"
 *                 lessThanTime: "2024-12-31"
 *             sentiment_filtered:
 *               summary: Analysis with sentiment filter
 *               value:
 *                 topicId: 123
 *                 source: "All"
 *                 category: "all"
 *                 sentiment: "Positive"
 *     responses:
 *       200:
 *         description: Trust dimensions analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrustDimensionsResponse'
 *             example:
 *               success: true
 *               trustDimensions:
 *                 - category: "government"
 *                   totalCount: 1200
 *                   tones:
 *                     - name: "Supportive"
 *                       count: 500
 *                       percentage: 42
 *                       posts:
 *                         - profilePicture: "https://example.com/profile.jpg"
 *                           userFullname: "John Doe"
 *                           followers: "1500"
 *                           likes: "25"
 *                           content: "Government initiatives are working well"
 *                           source: "Facebook"
 *                           created_at: "2024-01-15 10:30:00"
 *                     - name: "Not Applicable"
 *                       count: 200
 *                       percentage: 17
 *                       posts: []
 *                     - name: "Distrustful"
 *                       count: 350
 *                       percentage: 29
 *                       posts: []
 *                     - name: "Neutral"
 *                       count: 100
 *                       percentage: 8
 *                       posts: []
 *                     - name: "Mixed"
 *                       count: 50
 *                       percentage: 4
 *                       posts: []
 *                 - category: "education_system"
 *                   totalCount: 800
 *                   tones:
 *                     - name: "Supportive"
 *                       count: 400
 *                       percentage: 50
 *                       posts: []
 *                     - name: "Not Applicable"
 *                       count: 150
 *                       percentage: 19
 *                       posts: []
 *                     - name: "Distrustful"
 *                       count: 200
 *                       percentage: 25
 *                       posts: []
 *                     - name: "Neutral"
 *                       count: 30
 *                       percentage: 4
 *                       posts: []
 *                     - name: "Mixed"
 *                       count: 20
 *                       percentage: 2
 *                       posts: []
 *               totalCount: 5450
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