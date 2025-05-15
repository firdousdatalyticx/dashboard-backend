/**
 * @swagger
 * /social-media/actions-required:
 *   post:
 *     summary: Get social media content that requires action
 *     description: Retrieves categorized social media content counts based on required actions (e.g., No Action Needed, Immediate Response Needed) for each platform.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActionsRequiredRequest'
 *     responses:
 *       200:
 *         description: Action requirement data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActionsRequiredResponse'
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid
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


/**
 * @swagger
 * components:
 *   schemas:
 *     ActionsRequiredRequest:
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
 *     ActionsRequiredResponse:
 *       type: object
 *       properties:
 *         responseOutput:
 *           type: object
 *           properties:
 *             No Action Needed:
 *               type: object
 *               properties:
 *                 twitterContent:
 *                   type: integer
 *                   example: 14
 *                 facebookContent:
 *                   type: integer
 *                   example: 44
 *                 instagramContent:
 *                   type: integer
 *                   example: 41
 *             Immediate Response Needed:
 *               type: object
 *               properties:
 *                 twitterContent:
 *                   type: integer
 *                   example: 1
 *                 facebookContent:
 *                   type: integer
 *                   example: 0
 *                 instagramContent:
 *                   type: integer
 *                   example: 2
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "An error occurred"
 */
