const express = require('express');
const router = express.Router();
const leaderboardAnalysisController = require('../../controllers/social-media/leaderboard-analysis.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/leaderboard-analysis:
 *   post:
 *     summary: Get social media leaderboard analysis
 *     description: Retrieves comparative analysis of topic categories with sentiment metrics and trends
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeaderboardAnalysisRequest'
 */
router.post('/', express.json(), transformCategoryData, leaderboardAnalysisController.getLeaderboardAnalysis);

module.exports = router; 