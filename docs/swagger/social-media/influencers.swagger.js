/**
 * @swagger
 * /social-media/influencers:
 *   post:
 *     summary: Get social media influencers data
 *     description: Retrieves influencers sorted by category based on their follower count
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
 *               isScadUser:
 *                 type: string
 *                 description: Filter to include only specific sources for SCAD users
 *                 enum: [true, false]
 *                 default: "false"
 *           example:
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             sentimentType: "Positive"
 *             isScadUser: "true"
 *     responses:
 *       200:
 *         description: Successfully retrieved influencers data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 finalDataArray:
 *                   type: array
 *                   description: List of influencer categories with their data
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         description: Influencer category type
 *                         enum: [Nano, Micro, Midtier, Macro, Mega, Celebrity]
 *                         example: "Macro"
 *                       data:
 *                         type: array
 *                         description: List of influencers in this category
 *                         items:
 *                           type: object
 *                           properties:
 *                             profile_image:
 *                               type: string
 *                               description: URL to influencer's profile image
 *                               example: "https://example.com/profile.jpg"
 *                             fullname:
 *                               type: string
 *                               description: Influencer's full name or handle
 *                               example: "John Smith"
 *                             source:
 *                               type: string
 *                               description: Source information (platform and icon)
 *                               example: "Twitter,Twitter"
 *                             country:
 *                               type: string
 *                               description: Country flag or code for the influencer
 *                               example: "US"
 *                             followers:
 *                               type: string
 *                               description: Number of followers as a string
 *                               example: "780000"
 *                             posts:
 *                               type: string
 *                               description: Number of posts as a string
 *                               example: "156"
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
 * 
 * /social-media/influencers/categories:
 *   post:
 *     summary: Get influencer categories data
 *     description: Retrieves counts of influencers by category based on follower count
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
 *               isScadUser:
 *                 type: string
 *                 description: Filter to include only specific sources for SCAD users
 *                 enum: [true, false]
 *                 default: "false"
 *               selectedTab:
 *                 type: string
 *                 description: Selected tab for filtering (GOOGLE for Google, empty for social media)
 *                 default: ""
 *           example:
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             sentimentType: "Positive"
 *             isScadUser: "true"
 *             selectedTab: ""
 *     responses:
 *       200:
 *         description: Successfully retrieved influencer categories data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 infArray:
 *                   type: object
 *                   description: Counts of influencers by category
 *                   properties:
 *                     celebrity:
 *                       type: integer
 *                       description: Count of celebrity influencers (5M+ followers)
 *                       example: 2
 *                     mega:
 *                       type: integer
 *                       description: Count of mega influencers (1M-5M followers)
 *                       example: 5
 *                     macro:
 *                       type: integer
 *                       description: Count of macro influencers (500K-1M followers)
 *                       example: 8
 *                     midtier:
 *                       type: integer
 *                       description: Count of mid-tier influencers (50K-500K followers)
 *                       example: 15
 *                     micro:
 *                       type: integer
 *                       description: Count of micro influencers (10K-50K followers)
 *                       example: 25
 *                     nano:
 *                       type: integer
 *                       description: Count of nano influencers (1K-10K followers)
 *                       example: 42
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