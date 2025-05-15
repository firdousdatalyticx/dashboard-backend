const express = require('express');
const router = express.Router();
const emotionsController = require('../../controllers/social-media/emotions-analysis.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/emotions-analysis:
 *   post:
 *     summary: Get emotion analysis for social media posts
 *     description: Retrieves emotion analysis data (happy, sad, angry, etc.) based on topic, time range, and other filters
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmotionsAnalysisRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, emotionsController.getEmotionsAnalysis);

module.exports = router; 