/**
 * @swagger
 * /social-media/emotion-polarity:
 *   post:
 *     summary: Get emotion polarity data
 *     description: Retrieves emotion analysis with polarity scores for social media content
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *             properties:
 *               topicId:
 *                 type: string
 *                 description: ID of the topic to analyze
 *           example:
 *             topicId: "254"
 *     responses:
 *       200:
 *         description: Successfully retrieved emotion polarity data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   description: Statistical summary of polarity scores
 *                   properties:
 *                     mean:
 *                       type: number
 *                       format: float
 *                       description: Average polarity score
 *                       example: 0.32
 *                     min:
 *                       type: number
 *                       format: float
 *                       description: Minimum polarity score
 *                       example: -0.85
 *                     max:
 *                       type: number
 *                       format: float
 *                       description: Maximum polarity score
 *                       example: 0.97
 *                     count:
 *                       type: integer
 *                       description: Total number of documents analyzed
 *                       example: 532
 *                 emotions:
 *                   type: array
 *                   description: Breakdown of emotions with their polarity
 *                   items:
 *                     type: object
 *                     properties:
 *                       emotion:
 *                         type: string
 *                         description: Emotion name
 *                         example: "joy"
 *                       count:
 *                         type: integer
 *                         description: Number of documents with this emotion
 *                         example: 128
 *                       averagePolarity:
 *                         type: string
 *                         description: Average polarity score for this emotion
 *                         example: "0.75"
 *                 topicQueryString:
 *                   type: string
 *                   description: The query string used for the search
 *                   example: "(product OR service) AND (quality OR performance)"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */ 