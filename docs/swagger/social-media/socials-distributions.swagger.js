/**
 * @swagger
 * /social-media/socials-distributions:
 *   post:
 *     summary: Get social media distributions data
 *     description: Retrieves counts of mentions across different social media platforms
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
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             sentimentType: "Positive"
 *     responses:
 *       200:
 *         description: Successfully retrieved social media distributions data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mentions:
 *                   type: integer
 *                   description: Total count of mentions across all platforms
 *                   example: 356
 *                 twitterMentions:
 *                   type: integer
 *                   description: Count of mentions from Twitter/X
 *                   example: 156
 *                 facebookMentions:
 *                   type: integer
 *                   description: Count of mentions from Facebook
 *                   example: 98
 *                 instagramMentions:
 *                   type: integer
 *                   description: Count of mentions from Instagram
 *                   example: 87
 *                 googleReviews:
 *                   type: integer
 *                   description: Count of mentions from Google reviews
 *                   example: 15
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
 */ 