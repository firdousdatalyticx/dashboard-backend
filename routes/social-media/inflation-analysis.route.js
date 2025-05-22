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
 *               topicId:
 *                 type: number
 *                 description: ID of the topic to analyze
 *               interval:
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

module.exports = router; 