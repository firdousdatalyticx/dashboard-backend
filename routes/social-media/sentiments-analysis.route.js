const express = require('express');
const router = express.Router();
const sentimentsController = require('../../controllers/social-media/sentiments-analysis.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const sentimentsMultipleCategoriesController = require('../../controllers/social-media/categories-sentiments-analysis-counts.controller');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/sentiments-analysis:
 *   post:
 *     summary: Get sentiment analysis for social media posts
 *     description: Retrieves sentiment analysis data (positive, negative, neutral) based on topic, time range, and other filters
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SentimentsAnalysisRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData,transformDataSource, sentimentsController.getSentimentsAnalysis);
router.post('/sentiments/multiple-categories',express.json(), authMiddleware, transformCategoryData,transformDataSource, sentimentsMultipleCategoriesController.getMultipleCategoriesSentimentCountsOptimized);
router.get('/sentiments/multiple-categories/posts',express.json(), authMiddleware, transformCategoryData,transformDataSource, sentimentsMultipleCategoriesController.getMultipleCategoriesSentimentCountsOptimizedPost);


module.exports = router; 