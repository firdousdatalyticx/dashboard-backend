/**
 * @swagger
 * /social-media/urgency-mentions:
 *   post:
 *     summary: Get urgency classification of social media mentions
 *     description: Analyzes and returns urgency levels (High, Medium, Low) for mentions across platforms.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UrgencyMentionsRequest'
 *     responses:
 *       200:
 *         description: Urgency mentions data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UrgencyMentionsResponse'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * components:
 *   schemas:
 *     UrgencyMentionsRequest:
 *       type: object
 *       properties:
 *         topicId:
 *           type: string
 *           example: "254"
 *         timeSlot:
 *           type: string
 *           example: "last7days"
 *         sentimentType:
 *           type: string
 *           example: "Positive"
 *         fromDate:
 *           type: string
 *           format: date
 *           example: "2023-01-01"
 *         toDate:
 *           type: string
 *           format: date
 *           example: "2023-01-31"
 *         records:
 *           type: string
 *           example: "20"
 *     UrgencyMentionsResponse:
 *       type: object
 *       properties:
 *         responseOutput:
 *           type: string
 *           example: "High,1|Medium,45|Low,35"
 *         totalSentiments:
 *           type: integer
 *           example: 81
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "An error occurred"
 */
