const express = require('express');
const router = express.Router();
const processCategories = require('../../middleware/categoryTransform.middleware');
const themesSentimentAnalysisController = require('../../controllers/social-media/themes-sentiment-analysis.controller');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/themes-sentiment-analysis:
 *   post:
 *     summary: Get themes grouped by sentiment analysis for stacked bar chart
 *     description: Analyzes themes from themes_sentiments JSON field and groups them by sentiment values to create stacked bar charts
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ThemesSentimentAnalysisRequest'
 *     responses:
 *       200:
 *         description: Themes sentiment analysis data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThemesSentimentAnalysisResponse'
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', processCategories, transformDataSource, themesSentimentAnalysisController.getThemesSentimentAnalysis);

module.exports = router; 