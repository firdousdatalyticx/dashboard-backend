const express = require('express');
const router = express.Router();
const comparisonAnalysisController = require('../controllers/comparison-analysis.controller');
const authMiddleware = require('../middleware/auth.middleware');
const transformCategoryData = require('../middleware/categoryTransform.middleware');

/**
 * @swagger
 * tags:
 *   name: Comparison Analysis
 *   description: Endpoints for comparing data between two topics
 */

/**
 * @swagger
 * /comparison-analysis:
 *   post:
 *     summary: Create a new comparison analysis report
 *     description: Creates a new report comparing data between two topics
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId1
 *               - topicId2
 *               - userId
 *             properties:
 *               topicId1:
 *                 type: integer
 *                 example: 1
 *                 description: ID of the first topic to compare
 *               topicId2:
 *                 type: integer
 *                 example: 2
 *                 description: ID of the second topic to compare
 *               poiTitle1:
 *                 type: string
 *                 example: "Hotel A"
 *                 description: Title of the first point of interest
 *               poiCity1:
 *                 type: string
 *                 example: "Dubai"
 *                 description: City of the first point of interest
 *               poiTitle2:
 *                 type: string
 *                 example: "Hotel B"
 *                 description: Title of the second point of interest
 *               poiCity2:
 *                 type: string
 *                 example: "Abu Dhabi"
 *                 description: City of the second point of interest
 *               report_data:
 *                 type: object
 *                 description: JSON data containing the comparison analysis results
 *               userId:
 *                 type: integer
 *                 example: 123
 *                 description: ID of the user creating the report
 *     responses:
 *       200:
 *         description: Report created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 response:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     poiTitle1:
 *                       type: string
 *                       example: "Hotel A"
 *                     poiCity1:
 *                       type: string
 *                       example: "Dubai"
 *                     poiTitle2:
 *                       type: string
 *                       example: "Hotel B"
 *                     poiCity2:
 *                       type: string
 *                       example: "Abu Dhabi"
 *                     date_created:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, comparisonAnalysisController.createReport);

/**
 * @swagger
 * /comparison-analysis:
 *   get:
 *     summary: Get all comparison analysis reports
 *     description: Retrieves all comparison analysis reports for a specific user
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware, comparisonAnalysisController.getReports);

/**
 * @swagger
 * /comparison-analysis/sentiments:
 *   get:
 *     summary: Get sentiment analysis data for comparison
 *     description: Retrieves sentiment analysis data for a specific topic over time with various filtering options
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: topicId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the topic to analyze
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the analysis (YYYY-MM-DD)
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: monthly
 *         description: Time interval for data aggregation
 *       - in: query
 *         name: selectedCategory
 *         schema:
 *           type: string
 *           default: all
 *         description: Category to filter by, use 'all' for all categories
 *       - in: query
 *         name: selectedSource
 *         schema:
 *           type: string
 *           default: All
 *         description: Source to filter by (Facebook, Twitter, Instagram, Youtube, LinkedIn, Pinterest, Web, Reddit, or All)
 *       - in: query
 *         name: isGoogleSentimentChart
 *         schema:
 *           type: string
 *           enum: [true, false]
 *           default: true
 *         description: Whether to fetch Google sentiment chart data
 *     responses:
 *       200:
 *         description: Sentiment analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 monthlyData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                         description: Time period key (formatted date)
 *                         example: "2023-05"
 *                       doc_count:
 *                         type: integer
 *                         description: Number of documents in this time period
 *                         example: 42
 *                       sentiments:
 *                         type: object
 *                         properties:
 *                           buckets:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 key:
 *                                   type: string
 *                                   description: Sentiment value
 *                                   example: "Positive"
 *                                 doc_count:
 *                                   type: integer
 *                                   description: Number of documents with this sentiment
 *                                   example: 25
 *                                 emotions:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       key:
 *                                         type: string
 *                                         description: Emotion value
 *                                         example: "Happy"
 *                                       doc_count:
 *                                         type: integer
 *                                         description: Number of documents with this emotion
 *                                         example: 15
 *                                       messages:
 *                                         type: array
 *                                         items:
 *                                           type: object
 *                                           properties:
 *                                             p_message:
 *                                               type: string
 *                                               description: Message content
 *                                             llm_emotion:
 *                                               type: string
 *                                               description: Emotion detected by LLM
 *                                             predicted_sentiment_value:
 *                                               type: string
 *                                               description: Predicted sentiment value
 *                 categories:
 *                   type: integer
 *                   description: Number of categories found
 *                   example: 5
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Internal server error
 */
router.get('/sentiments', authMiddleware, transformCategoryData, comparisonAnalysisController.getSentiments);

/**
 * @swagger
 * /comparison-analysis/{id}:
 *   get:
 *     summary: Get a specific comparison analysis report
 *     description: Retrieves a specific comparison analysis report by ID
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the report to retrieve
 *     responses:
 *       200:
 *         description: Report retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 report:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     poiTitle1:
 *                       type: string
 *                       example: "Hotel A"
 *                     poiCity1:
 *                       type: string
 *                       example: "Dubai"
 *                     poiTitle2:
 *                       type: string
 *                       example: "Hotel B"
 *                     poiCity2:
 *                       type: string
 *                       example: "Abu Dhabi"
 *                     report_data:
 *                       type: object
 *                     date_created:
 *                       type: string
 *                       format: date-time
 *                     user_id:
 *                       type: integer
 *                     topicId1:
 *                       type: integer
 *                     topicId2:
 *                       type: integer
 *       400:
 *         description: Missing required parameters
 *       404:
 *         description: Report not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authMiddleware, comparisonAnalysisController.getReportById);

/**
 * @swagger
 * /comparison-analysis/{id}:
 *   delete:
 *     summary: Delete a comparison analysis report
 *     description: Deletes a specific comparison analysis report by ID
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the report to delete
 *     responses:
 *       200:
 *         description: Report deleted successfully
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
 *                   example: "Report deleted successfully"
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authMiddleware, comparisonAnalysisController.deleteReport);

router.post('/social-media-sources-distribution', express.json(), transformCategoryData, comparisonAnalysisController.getDistributions);

module.exports = router; 