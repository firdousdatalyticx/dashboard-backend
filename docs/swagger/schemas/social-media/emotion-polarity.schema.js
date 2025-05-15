/**
 * @swagger
 * components:
 *   schemas:
 *     EmotionPolarityRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *       example:
 *         topicId: "254"
 *     
 *     EmotionPolarityResponse:
 *       type: object
 *       properties:
 *         stats:
 *           type: object
 *           description: Statistical summary of polarity scores
 *           properties:
 *             mean:
 *               type: number
 *               format: float
 *               description: Average polarity score
 *               example: 0.32
 *             min:
 *               type: number
 *               format: float
 *               description: Minimum polarity score
 *               example: -0.85
 *             max:
 *               type: number
 *               format: float
 *               description: Maximum polarity score
 *               example: 0.97
 *             count:
 *               type: integer
 *               description: Total number of documents analyzed
 *               example: 532
 *         emotions:
 *           type: array
 *           description: Breakdown of emotions with their polarity
 *           items:
 *             type: object
 *             properties:
 *               emotion:
 *                 type: string
 *                 description: Emotion name
 *                 example: "joy"
 *               count:
 *                 type: integer
 *                 description: Number of documents with this emotion
 *                 example: 128
 *               averagePolarity:
 *                 type: string
 *                 description: Average polarity score for this emotion
 *                 example: "0.75"
 *         topicQueryString:
 *           type: string
 *           description: The query string used for the search
 *           example: "(product OR service) AND (quality OR performance)"
 */

module.exports = {}; 