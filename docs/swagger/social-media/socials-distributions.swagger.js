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

/**
 * @swagger
 * /social-media/socials-distributions/sentiment-by-source:
 *   post:
 *     summary: Get sentiment distribution by source
 *     description: Retrieves sentiment counts (Positive, Negative, Neutral) grouped by social media platforms
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
 *                 description: Filter by sentiment type (affects overall results before grouping)
 *                 enum: [Positive, Negative, Neutral]
 *           example:
 *             topicId: "254"
 *             timeSlot: "last7days"
 *             fromDate: "2023-01-01"
 *             toDate: "2023-01-31"
 *             sentimentType: "Positive"
 *     responses:
 *       200:
 *         description: Successfully retrieved sentiment distribution by source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   Positive:
 *                     type: integer
 *                     description: Count of positive sentiment mentions for this source
 *                     example: 45
 *                   Negative:
 *                     type: integer
 *                     description: Count of negative sentiment mentions for this source
 *                     example: 12
 *                   Neutral:
 *                     type: integer
 *                     description: Count of neutral sentiment mentions for this source
 *                     example: 23
 *             example:
 *               Facebook:
 *                 Positive: 45
 *                 Negative: 12
 *                 Neutral: 23
 *               LinkedIn:
 *                 Positive: 78
 *                 Negative: 5
 *                 Neutral: 34
 *               Twitter:
 *                 Positive: 23
 *                 Negative: 8
 *                 Neutral: 15
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

/**
 * @swagger
 * /social-media/socials-distributions/active-users-distribution:
 *   post:
 *     summary: Get active users distribution by source
 *     description: Retrieves user activity metrics and distributions grouped by social media platforms
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
 *         description: Successfully retrieved active users distribution by source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   totalMentions:
 *                     type: integer
 *                     description: Total number of mentions from this source
 *                     example: 156
 *                   uniqueUsers:
 *                     type: integer
 *                     description: Number of unique users identified from this source
 *                     example: 45
 *                   activeUsers:
 *                     type: integer
 *                     description: Number of users with meaningful follower counts (> 0)
 *                     example: 32
 *                   totalFollowers:
 *                     type: integer
 *                     description: Sum of all followers across users from this source
 *                     example: 125000
 *                   totalPosts:
 *                     type: integer
 *                     description: Sum of all posts across users from this source
 *                     example: 8900
 *                   totalLikes:
 *                     type: integer
 *                     description: Sum of all likes across users from this source
 *                     example: 5600
 *                   avgFollowersPerUser:
 *                     type: integer
 *                     description: Average followers per unique user (rounded)
 *                     example: 2778
 *                   avgPostsPerUser:
 *                     type: integer
 *                     description: Average posts per unique user (rounded)
 *                     example: 198
 *             example:
 *               Facebook:
 *                 totalMentions: 156
 *                 uniqueUsers: 45
 *                 activeUsers: 32
 *                 totalFollowers: 125000
 *                 totalPosts: 8900
 *                 totalLikes: 5600
 *                 avgFollowersPerUser: 2778
 *                 avgPostsPerUser: 198
 *               LinkedIn:
 *                 totalMentions: 98
 *                 uniqueUsers: 67
 *                 activeUsers: 45
 *                 totalFollowers: 89000
 *                 totalPosts: 12000
 *                 totalLikes: 7800
 *                 avgFollowersPerUser: 1328
 *                 avgPostsPerUser: 179
 *               Twitter:
 *                 totalMentions: 87
 *                 uniqueUsers: 78
 *                 activeUsers: 65
 *                 totalFollowers: 2500000
 *                 totalPosts: 45000
 *                 totalLikes: 28000
 *                 avgFollowersPerUser: 32051
 *                 avgPostsPerUser: 577
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

/**
 * @swagger
 * /social-media/socials-distributions/popular-sources:
 *   post:
 *     summary: Get popular sources with percentages
 *     description: Retrieves sources ordered by popularity (mention count) with their percentage share of total mentions
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
 *         description: Successfully retrieved popular sources data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   source:
 *                     type: string
 *                     description: Name of the social media source
 *                     example: "Facebook"
 *                   mentions:
 *                     type: integer
 *                     description: Total number of mentions from this source
 *                     example: 156
 *                   percentage:
 *                     type: number
 *                     format: float
 *                     description: Percentage share of total mentions (rounded to 2 decimal places)
 *                     example: 43.82
 *             example:
 *               - source: "Facebook"
 *                 mentions: 156
 *                 percentage: 43.82
 *               - source: "LinkedIn"
 *                 mentions: 98
 *                 percentage: 27.53
 *               - source: "Twitter"
 *                 mentions: 87
 *                 percentage: 24.44
 *               - source: "Instagram"
 *                 mentions: 15
 *                 percentage: 4.21
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