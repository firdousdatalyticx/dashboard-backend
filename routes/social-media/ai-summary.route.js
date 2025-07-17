const express = require('express');
const router = express.Router();
const aiSummaryController = require('../../controllers/social-media/ai-summary.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const prisma = require('../../config/database');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/ai-summary:
 *   post:
 *     summary: Get AI-generated summary for social media data
 *     description: Retrieves an AI-generated summary based on social media posts for a topic, with filtering by time interval, source, and category
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
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
 *                 example: "123"
 *                 description: ID of the topic to analyze
 *               interval:
 *                 type: string
 *                 example: "monthly"
 *                 description: Time interval for data aggregation (daily, weekly, monthly)
 *                 enum: [daily, weekly, monthly]
 *               source:
 *                 type: string
 *                 example: "All"
 *                 description: Social media source to filter by (All, Facebook, Twitter, etc.)
 *               category:
 *                 type: string
 *                 example: "all"
 *                 description: Category to filter by, use 'all' for all categories
 *               chartType:
 *                 type: string
 *                 example: "emotionAnalysis"
 *                 description: Type of analysis to perform
 *                 enum: [emotionAnalysis, sentimentAnalysis]
 *     responses:
 *       200:
 *         description: Successfully retrieved AI summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 summary:
 *                   type: string
 *                   example: "The sentiment analysis of social media posts over the past 3 months shows a predominantly positive trend. There was a notable increase in positive sentiment during March, with customer satisfaction mentions up by 15%..."
 *                 chartData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       p_message:
 *                         type: string
 *                       predicted_sentiment_value:
 *                         type: string
 *       400:
 *         description: Bad request - Invalid parameters
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
 *                   example: "Invalid parameters"
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
 *                   example: "Failed to generate AI summary"
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, transformDataSource, aiSummaryController.getAiSummary);

/**
 * @swagger
 * /social-media/ai-summary/save:
 *   post:
 *     summary: Save an AI-generated summary
 *     description: Saves an AI-generated summary to the database for future reference
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *               - summaryName
 *               - summaryText
 *             properties:
 *               topicId:
 *                 type: string
 *                 example: "123"
 *                 description: ID of the topic the summary is for
 *               summaryName:
 *                 type: string
 *                 example: "Q1 Sentiment Overview"
 *                 description: Name of the summary for reference
 *               summaryText:
 *                 type: string
 *                 example: "The sentiment analysis shows a positive trend..."
 *                 description: The actual AI-generated summary text
 *               chartData:
 *                 type: object
 *                 description: Chart data associated with the summary
 *               dashboardType:
 *                 type: string
 *                 example: "sentimentAnalysis"
 *                 description: Type of dashboard this summary is for
 *               fromDate:
 *                 type: string
 *                 example: "2023-01-01"
 *                 description: Start date of data range
 *               toDate:
 *                 type: string
 *                 example: "2023-03-31"
 *                 description: End date of data range
 *     responses:
 *       201:
 *         description: Successfully saved AI summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "AI summary saved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary_id:
 *                       type: integer
 *                       example: 1
 *                     summary_name:
 *                       type: string
 *                       example: "Q1 Sentiment Overview"
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
 *                   example: "Failed to save AI summary"
 */
router.post('/save', express.json(), authMiddleware, transformDataSource, aiSummaryController.saveAiSummary);

/**
 * @swagger
 * /social-media/ai-summary/saved:
 *   get:
 *     summary: Get saved AI summaries
 *     description: Retrieves all AI summaries saved by the user
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved saved summaries
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
 *                       summary_id:
 *                         type: integer
 *                         example: 1
 *                       summary_name:
 *                         type: string
 *                         example: "Q1 Sentiment Overview"
 *                       topic_user_id:
 *                         type: integer
 *                         example: 123
 *                       summary_text:
 *                         type: string
 *                         example: "The sentiment analysis shows a positive trend..."
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-04-01T12:00:00Z"
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
 *                   example: "Failed to fetch saved AI summaries"
 */
router.get('/saved', express.json(), authMiddleware, transformDataSource, aiSummaryController.getSavedSummaries);

module.exports = router; 