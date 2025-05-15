/**
 * @swagger
 * /social-media/entities:
 *   post:
 *     summary: Get social media entities data
 *     description: Retrieves organization entities mentioned in social media content
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
 *               timeSlot:
 *                 type: string
 *                 description: Predefined time slot for filtering
 *                 enum: [custom, last24hours, last7days, last30days]
 *               fromDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for custom date range (used with timeSlot=custom)
 *               toDate:
 *                 type: string
 *                 format: date
 *                 description: End date for custom date range (used with timeSlot=custom)
 *               sentimentType:
 *                 type: string
 *                 description: Filter by sentiment type
 *                 enum: [Positive, Negative, Neutral]
 *           example:
 *             topicId: "123"
 *             timeSlot: "last7days"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             sentimentType: "Positive"
 *     responses:
 *       200:
 *         description: Successfully retrieved entities data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entitiesData:
 *                   type: array
 *                   description: List of organization entities detected in social media content
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                         description: Name of the organization entity
 *                         example: "Apple Inc."
 *                       doc_count:
 *                         type: integer
 *                         description: Number of times this entity was mentioned
 *                         example: 42
 *       400:
 *         description: Bad request - missing required parameters
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
 *                   example: "Missing required parameter: topicId"
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
 *                 entities:
 *                   type: array
 *                   example: []
 */ 