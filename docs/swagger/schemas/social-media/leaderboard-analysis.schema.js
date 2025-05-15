/**
 * @swagger
 * components:
 *   schemas:
 *     LeaderboardAnalysisRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *       example:
 *         topicId: "254"
 *     
 *     LeaderboardAnalysisResponse:
 *       type: object
 *       properties:
 *         leaderboard:
 *           type: array
 *           description: List of categories with analysis metrics
 *           items:
 *             type: object
 *             properties:
 *               poi:
 *                 type: string
 *                 description: Name of the category or point of interest
 *                 example: "Product"
 *               averageScore:
 *                 type: number
 *                 format: float
 *                 description: Average sentiment score (-1 to 1)
 *                 example: 0.65
 *               relevanceScore:
 *                 type: number
 *                 format: float
 *                 description: Relevance score based on match quality
 *                 example: 3.27
 *               totalMentions:
 *                 type: integer
 *                 description: Total number of mentions for this category
 *                 example: 256
 *               topThemes:
 *                 type: array
 *                 description: Top themes/keywords for this category
 *                 items:
 *                   type: object
 *                   properties:
 *                     theme:
 *                       type: string
 *                       description: Theme keyword
 *                       example: "innovation"
 *                     count:
 *                       type: integer
 *                       description: Number of occurrences
 *                       example: 42
 *               trends:
 *                 type: array
 *                 description: Daily trend data for this category
 *                 items:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date-time
 *                       description: Date of the trend point
 *                       example: "2023-06-15T00:00:00Z"
 *                     count:
 *                       type: integer
 *                       description: Number of mentions on this date
 *                       example: 24
 *               sampleReviews:
 *                 type: array
 *                 description: Sample reviews/mentions for this category
 *                 items:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       description: The content of the post/review
 *                       example: "Great product, really impressed with the quality!"
 *                     date:
 *                       type: string
 *                       format: date-time
 *                       description: Date of the review
 *                       example: "2023-06-15T14:32:17Z"
 *                     sentiment:
 *                       type: string
 *                       description: Sentiment classification
 *                       example: "Positive"
 *                     keywords:
 *                       type: array
 *                       description: Keywords extracted from the message
 *                       items:
 *                         type: string
 *                         example: "quality"
 *                     relevanceScore:
 *                       type: number
 *                       format: float
 *                       description: Relevance score for this review
 *                       example: 4.2
 */

module.exports = {}; 