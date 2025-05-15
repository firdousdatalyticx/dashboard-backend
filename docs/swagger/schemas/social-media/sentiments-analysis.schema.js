/**
 * @swagger
 * components:
 *   schemas:
 *     SentimentsAnalysisRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - type: object
 *           properties:
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
 *     SentimentsAnalysisResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         sentiments:
 *           type: array
 *           description: List of sentiment types with counts
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 example: "Positive"
 *               count:
 *                 type: integer
 *                 example: 157
 *               percentage:
 *                 type: number
 *                 format: float
 *                 example: 45.2
 *         totalCount:
 *           type: integer
 *           description: Total number of posts analyzed
 *           example: 347
 */

module.exports = {}; 