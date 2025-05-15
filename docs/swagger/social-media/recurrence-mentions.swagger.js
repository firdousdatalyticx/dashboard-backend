/**
 * @swagger
 * /social-media/recurrence-mentions:
 *   post:
 *     summary: Get recurrence of mentions data
 *     description: Returns recurrence data indicating how often influencers mention a topic across platforms.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecurrenceMentionsRequest'
 *     responses:
 *       200:
 *         description: Recurrence mentions data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RecurrenceMentionsResponse'
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
 *     RecurrenceMentionsRequest:
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
 *     RecurrenceMentionsResponse:
 *       type: object
 *       properties:
 *         influencersCoverage:
 *           type: array
 *           items:
 *             type: integer
 *           example: [43, 58, 58]
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "An error occurred"
 */
