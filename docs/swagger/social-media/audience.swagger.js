/**
 * @swagger
 * /social-media/audience/active-audience:
 *   post:
 *     summary: Get active audience data
 *     description: Retrieves active users engaging with the topic on social media
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
 *               sentimentType:
 *                 type: string
 *                 description: Filter by sentiment type
 *                 enum: [Positive, Negative, Neutral]
 *               fromDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for custom date range (used with timeSlot=custom)
 *               toDate:
 *                 type: string
 *                 format: date
 *                 description: End date for custom date range (used with timeSlot=custom)
 *               records:
 *                 type: string
 *                 description: Number of records to return
 *                 default: "20"
 *           example:
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             sentimentType: "Positive"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             records: "20"
 *     responses:
 *       200:
 *         description: Successfully retrieved active audience data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data_array:
 *                   type: array
 *                   description: List of active audience members
 *                   items:
 *                     type: object
 *                     properties:
 *                       profile_image:
 *                         type: string
 *                         description: URL to user's profile image
 *                         example: "https://example.com/profile.jpg"
 *                       fullname:
 *                         type: string
 *                         description: User's full name or handle
 *                         example: "John Smith"
 *                       source:
 *                         type: string
 *                         description: Source information (platform and icon)
 *                         example: "Twitter,Twitter"
 *                       country:
 *                         type: string
 *                         description: Country flag or code for the user
 *                         example: "US"
 *                       followers:
 *                         type: string
 *                         description: Number of followers as a string
 *                         example: "1250"
 *                       posts:
 *                         type: string
 *                         description: Number of posts as a string
 *                         example: "42"
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
 * 
 * /social-media/audience/distribution-by-country:
 *   post:
 *     summary: Get audience distribution by country
 *     description: Retrieves a breakdown of audience by country based on the topic
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
 *               sentimentType:
 *                 type: string
 *                 description: Filter by sentiment type
 *                 enum: [Positive, Negative, Neutral]
 *               fromDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for custom date range (used with timeSlot=custom)
 *               toDate:
 *                 type: string
 *                 format: date
 *                 description: End date for custom date range (used with timeSlot=custom)
 *           example:
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             sentimentType: "Positive"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             records: "20"
 *     responses:
 *       200:
 *         description: Successfully retrieved audience distribution by country
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 responseArray:
 *                   type: array
 *                   description: Distribution of audience by country
 *                   items:
 *                     type: object
 *                     properties:
 *                       key_count:
 *                         type: integer
 *                         description: Number of audience members from this country
 *                         example: 156
 *                       country_name:
 *                         type: string
 *                         description: Name of the country
 *                         example: "United States"
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