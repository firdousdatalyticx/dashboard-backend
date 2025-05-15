/**
 * @swagger
 * /social-media/type-of-mentions:
 *   post:
 *     summary: Get categorized type of social media mentions
 *     description: Returns categorized types of mentions like Complaints, Praise, etc. across different social media platforms.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TypeOfMentionsRequest'
 *     responses:
 *       200:
 *         description: Type of mentions data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TypeOfMentionsResponse'
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
 * /social-media/type-of-mentions:
 *   post:
 *     summary: Get social media type of mentions breakdown
 *     description: Returns categorized mentions (Complaint, Praise, etc.) by platform (Twitter, Facebook, Instagram)
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TypeOfMentionsRequest'
 *     responses:
 *       200:
 *         description: Successfully fetched type of mentions breakdown
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TypeOfMentionsResponse'
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
 *     TypeOfMentionsRequest:
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
 *     TypeOfMentionsResponse:
 *       type: object
 *       properties:
 *         responseOutput:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               twitterContent:
 *                 type: integer
 *                 example: 6
 *               facebookContent:
 *                 type: integer
 *                 example: 30
 *               instagramContent:
 *                 type: integer
 *                 example: 27
 *           example:
 *             Complaint:
 *               twitterContent: 1
 *               facebookContent: 0
 *               instagramContent: 0
 *             Praise:
 *               twitterContent: 6
 *               facebookContent: 30
 *               instagramContent: 27
 *             Other:
 *               twitterContent: 5
 *               facebookContent: 7
 *               instagramContent: 8
 *             Product Feedback:
 *               twitterContent: 0
 *               facebookContent: 0
 *               instagramContent: 3
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "An error occurred"
 */
