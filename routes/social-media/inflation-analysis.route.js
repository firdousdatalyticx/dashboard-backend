const express = require('express');
const router = express.Router();
const inflationAnalysisController = require('../../controllers/social-media/inflation-analysis.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const authMiddleware = require('../../middleware/auth.middleware');

/**
 * @swagger
 * /social-media/inflation-analysis:
 *   post:
 *     summary: Get inflation phrases analysis from social media posts
 *     description: Analyzes inflation-related phrases from social media posts based on topic categories
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to
 *               interval:picId:
 *                 type: number
 *                 description: ID of the topic to analyze
 *                 type: string
 *                 description: Time interval for analysis (daily, weekly, monthly)
 *                 enum: [daily, weekly, monthly]
 *                 default: monthly
 *               source:
 *                 type: string
 *                 description: Social media source to filter by
 *                 default: All
 *               category:
 *                 type: string
 *                 description: Specific category to filter by
 *                 default: all
 *               timeSlot:
 *                 type: string
 *                 description: Predefined time range
 *                 enum: [last24hours, last7days, last30days, last60days, last90days, last120days, Custom date]
 *                 default: last90days
 *               fromDate:
 *                 type: string
 *                 description: Start date for custom time range (format YYYY-MM-DD)
 *               toDate:
 *                 type: string
 *                 description: End date for custom time range (format YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Successfully retrieved inflation analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 inflationPhrases:
 *                   type: array
 *                   description: List of inflation phrases with count and direction
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                         description: The inflation-related phrase
 *                       value:
 *                         type: number
 *                         description: Frequency count of the phrase
 *                       direction:
 *                         type: string
 *                         description: Inflation trend direction (rising, falling, stable, etc.)
 *                 phrasesByDirection:
 *                   type: object
 *                   description: Phrases grouped by inflation trend direction
 *                   properties:
 *                     rising:
 *                       type: array
 *                     falling:
 *                       type: array
 *                     stable:
 *                       type: array
 *                     fluctuating:
 *                       type: array
 *                     unknown:
 *                       type: array
 *                 totalInflationPosts:
 *                   type: number
 *                   description: Total count of posts related to inflation
 *                 dateRange:
 *                   type: object
 *                   properties:
 *                     from:
 *                       type: string
 *                       description: Start date of analysis
 *                     to:
 *                       type: string
 *                       description: End date of analysis
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
 */
router.post('/',  transformCategoryData, inflationAnalysisController.getInflationAnalysis);

/**
 * @swagger
 * /social-media/inflation-analysis/trigger-phrase-stats:
 *   post:
 *     summary: Get statistics of inflation trigger phrases grouped by direction
 *     description: Analyzes the frequency of inflation trigger phrases categorized by their trend direction (rising, falling, stabilizing, volatile)
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *                 description: Social media source to filter by
 *                 default: All
 *               category:
 *                 type: string
 *                 description: Specific category to filter by
 *                 default: all
 *               timeSlot:
 *                 type: string
 *                 description: Predefined time range
 *                 enum: [last24hours, last7days, last30days, last60days, last90days, last120days, Custom date]
 *                 default: last90days
 *               fromDate:
 *                 type: string
 *                 description: Start date for custom time range (format YYYY-MM-DD)
 *               toDate:
 *                 type: string
 *                 description: End date for custom time range (format YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Successfully retrieved trigger phrase statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       phrase:
 *                         type: string
 *                         description: The inflation trigger phrase
 *                       direction:
 *                         type: string
 *                         description: Inflation trend direction (rising, falling, stabilizing, volatile)
 *                       count:
 *                         type: number
 *                         description: Number of occurrences of the phrase in posts with this direction
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
 */
router.post('/trigger-phrase-stats', transformCategoryData, inflationAnalysisController.getInflationTriggerPhraseStats);

/**
 * @swagger
 * /social-media/inflation-analysis/type-distribution:
 *   post:
 *     summary: Get distribution of inflation types across all posts
 *     description: Analyzes the percentage distribution of different inflation types (e.g., cost-push, sectoral_imbalance) across all posts
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *                 description: Social media source to filter by
 *                 default: All
 *               category:
 *                 type: string
 *                 description: Specific category to filter by
 *                 default: all
 *               timeSlot:
 *                 type: string
 *                 description: Predefined time range
 *                 enum: [last24hours, last7days, last30days, last60days, last90days, last120days, Custom date]
 *                 default: last90days
 *               fromDate:
 *                 type: string
 *                 description: Start date for custom time range (format YYYY-MM-DD)
 *               toDate:
 *                 type: string
 *                 description: End date for custom time range (format YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Successfully retrieved inflation type distribution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         description: The type of inflation (e.g., cost-push, sectoral_imbalance)
 *                         example: cost-push
 *                       count:
 *                         type: number
 *                         description: Number of occurrences of this inflation type
 *                         example: 150
 *                       percentage:
 *                         type: string
 *                         description: Percentage of this inflation type among all types
 *                         example: "45.45"
 *                       posts:
 *                         type: array
 *                         description: Array of posts associated with this inflation type
 *                         items:
 *                           type: object
 *                           properties:
 *                             profilePicture:
 *                               type: string
 *                               description: URL of the user's profile picture
 *                             profilePicture2:
 *                               type: string
 *                               description: Alternative profile picture URL
 *                             userFullname:
 *                               type: string
 *                               description: Full name of the user
 *                             followers:
 *                               type: string
 *                               description: Number of followers
 *                             following:
 *                               type: string
 *                               description: Number of following
 *                             posts:
 *                               type: string
 *                               description: Number of user's posts
 *                             likes:
 *                               type: string
 *                               description: Number of likes on the post
 *                             commentsUrl:
 *                               type: string
 *                               description: URL to post comments
 *                             comments:
 *                               type: string
 *                               description: Number of comments
 *                             shares:
 *                               type: string
 *                               description: Number of shares
 *                             engagements:
 *                               type: string
 *                               description: Total engagement count
 *                             content:
 *                               type: string
 *                               description: Post content
 *                             image_url:
 *                               type: string
 *                               description: URL of post image
 *                             predicted_sentiment:
 *                               type: string
 *                               description: Predicted sentiment of the post
 *                             youtube_video_url:
 *                               type: string
 *                               description: YouTube video embed URL if applicable
 *                             source_icon:
 *                               type: string
 *                               description: Source platform icon URL
 *                             message_text:
 *                               type: string
 *                               description: Main text content of the post
 *                             source:
 *                               type: string
 *                               description: Source platform name
 *                             created_at:
 *                               type: string
 *                               description: Post creation timestamp
 *                 totalInflationPosts:
 *                   type: number
 *                   description: Total number of posts analyzed
 *                   example: 300
 *                 totalInflationTypes:
 *                   type: number
 *                   description: Total number of inflation type occurrences
 *                   example: 330
 *                 dateRange:
 *                   type: object
 *                   properties:
 *                     from:
 *                       type: string
 *                       description: Start date of analysis
 *                       example: "2024-01-01"
 *                     to:
 *                       type: string
 *                       description: End date of analysis
 *                       example: "2024-12-31"
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
 *                   example: Internal server error
 *                 details:
 *                   type: string
 *                   description: Detailed error message
 */
router.post('/type-distribution', transformCategoryData, inflationAnalysisController.getInflationTypeDistribution);

module.exports = router; 