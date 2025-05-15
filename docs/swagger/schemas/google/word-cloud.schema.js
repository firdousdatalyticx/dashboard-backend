/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleWordCloudRequest:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           enum: [positivegooglewordphrase, negativegooglewordphrase]
 *           description: Type of word cloud to generate
 *         isAll:
 *           type: string
 *           enum: ['true', 'false']
 *           description: Whether to include all locations
 *         locations:
 *           type: string
 *           description: URL-encoded JSON string of locations when isAll is true
 *         u_source:
 *           type: string
 *           description: URL source when isAll is false
 *         location:
 *           type: string
 *           description: Location name when isAll is false
 *         phrase:
 *           type: string
 *           description: Optional phrase to filter by
 *       example:
 *         type: "positivegooglewordphrase"
 *         isAll: "true"
 *         locations: "%5B%7B%22u_source%22%3A%22https%3A%2F%2Fmaps.google.com%2F%3Fcid%3D123456789%22%2C%22location%22%3A%22Abu%20Dhabi%20Mall%22%7D%5D"
 *     
 *     GoogleWordCloudPhrasesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         phrases:
 *           type: array
 *           description: List of extracted phrases
 *           items:
 *             type: string
 *           example: ["great service", "friendly staff", "clean rooms"]
 *         total:
 *           type: integer
 *           description: Total number of posts analyzed
 *           example: 145
 *     
 *     GoogleWordCloudPostsResponse:
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
 *                 example: "abc123def456"
 *               p_message:
 *                 type: string
 *                 example: "The staff was very friendly and the service was excellent!"
 *               p_created_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-05-15T14:30:00Z"
 *               predicted_sentiment_value:
 *                 type: string
 *                 example: "Positive"
 *               url:
 *                 type: string
 *                 example: "https://maps.google.com/?cid=123456789"
 *               p_likes:
 *                 type: integer
 *                 example: 5
 *               p_comments:
 *                 type: integer
 *                 example: 2
 *               p_shares:
 *                 type: integer
 *                 example: 0
 *               llmField:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["friendly staff", "excellent service"]
 */

module.exports = {}; 