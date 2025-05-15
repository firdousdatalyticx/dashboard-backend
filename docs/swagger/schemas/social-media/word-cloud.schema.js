/**
 * @swagger
 * components:
 *   schemas:
 *     WordCloudPhrasesRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         sentimentType:
 *           type: string
 *           description: Type of sentiment to filter by
 *           enum: [positive, negative]
 *           default: positive
 *       example:
 *         topicId: "254"
 *         sentimentType: "positive"
 *     
 *     WordCloudPhrasesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         phrases:
 *           type: array
 *           description: List of extracted phrases from posts
 *           items:
 *             type: string
 *             example: "great product"
 *         dailyStats:
 *           type: array
 *           description: Daily statistics for post counts
 *           items:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2023-06-15"
 *               count:
 *                 type: integer
 *                 example: 42
 *         wordcloud:
 *           type: array
 *           description: Word cloud data with text and count values
 *           items:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 example: "customer service"
 *               value:
 *                 type: integer
 *                 example: 18
 *         total:
 *           type: integer
 *           description: Total number of posts/documents
 *           example: 156
 *     
 *     WordCloudPostsRequest:
 *       type: object
 *       required:
 *         - topicId
 *         - phrase
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         phrase:
 *           type: string
 *           description: The specific phrase to search for in posts
 *         sentimentType:
 *           type: string
 *           description: Type of sentiment to filter by
 *           enum: [positive, negative]
 *           default: positive
 *         page:
 *           type: string
 *           description: Page number for pagination
 *           default: "1"
 *         size:
 *           type: string
 *           description: Number of results per page
 *           default: "100"
 *         sort:
 *           type: string
 *           description: Sort field and direction
 *           default: "p_created_time:desc"
 *       example:
 *         topicId: "254"
 *         phrase: "great product"
 *         sentimentType: "positive"
 *         page: "1"
 *         size: "10"
 *     
 *     WordCloudPostsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         posts:
 *           type: array
 *           description: List of posts containing the phrase
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "123456789"
 *               p_message:
 *                 type: string
 *                 example: "This is a great product, really impressed with the quality!"
 *               source:
 *                 type: string
 *                 example: "Twitter"
 *               p_created_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-06-15T14:32:17Z"
 *               llm_polarity:
 *                 type: number
 *                 format: float
 *                 example: 0.75
 *               predicted_sentiment_value:
 *                 type: string
 *                 example: "Positive"
 *         total:
 *           type: integer
 *           description: Total number of matching posts
 *           example: 42
 *         page:
 *           type: string
 *           description: Current page number
 *           example: "1"
 *         size:
 *           type: string
 *           description: Number of results per page
 *           example: "10"
 */

module.exports = {}; 