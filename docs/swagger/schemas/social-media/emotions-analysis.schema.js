/**
 * @swagger
 * components:
 *   schemas:
 *     EmotionsAnalysisRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - type: object
 *           properties:
 *             interval:
 *               type: string
 *               description: Time interval for aggregation
 *               enum: [daily, weekly, monthly]
 *               default: monthly
 *             source:
 *               type: string
 *               description: Social media platform source
 *               enum: [All, Facebook, Twitter, Instagram, Youtube, LinkedIn, Pinterest, Web, Reddit]
 *               default: All
 *             category:
 *               type: string
 *               description: Category to filter by
 *               default: all
 *       example:
 *         topicId: "254"
 *         interval: "monthly"
 *         source: "All"
 *         category: "all"
 *     
 *     EmotionsAnalysisResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         emotions:
 *           type: array
 *           description: List of emotions with counts
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "happy"
 *               count:
 *                 type: integer
 *                 example: 145
 *         totalCount:
 *           type: integer
 *           description: Total number of posts analyzed
 *           example: 378
 *         timeIntervals:
 *           type: array
 *           description: Emotions data aggregated by time intervals
 *           items:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 example: "2023-01"
 *               emotions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "happy"
 *                     count:
 *                       type: integer
 *                       example: 42
 */

module.exports = {}; 