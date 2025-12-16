
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const sentimentAnalysisController = require('../../controllers/social-media/sentimentAnalysis.controller.js');

/**
 * @swagger
 * /social-media/sentiment-analysis-edu.route:
 *   post:
 *     summary: Get social media sentiment-analysis-edu.route data
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
 *           example:
 *             topicId: "254"
 */

router.post('/posts',express.json(), authMiddleware, transformCategoryData, sentimentAnalysisController.getPosts);

router.post('/distribution', express.json(), authMiddleware, transformCategoryData, sentimentAnalysisController.getSentimentDistribution);
router.post('/subtopic-frequency', express.json(), authMiddleware, transformCategoryData, sentimentAnalysisController.getSubtopicFrequency);
router.post('/by-subtopic',  express.json(), authMiddleware, transformCategoryData,sentimentAnalysisController.getSentimentBySubtopic);
router.post('/trend',  express.json(), authMiddleware, transformCategoryData,sentimentAnalysisController.getTrendOverTime);
router.post('/emotions', express.json(), authMiddleware, transformCategoryData, sentimentAnalysisController.getEmotionBreakdown);
router.post('/keywords', express.json(), authMiddleware, transformCategoryData, sentimentAnalysisController.getKeywordsCloud);

module.exports = router; 