const express = require('express');
const router = express.Router();
const inflationController = require('../../controllers/social-media/inflations-analysis.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/inflations-analysis:
 *   post:
 *     summary: Get inflation analysis for social media posts
 *     description: Retrieves inflation analysis data (Positive and negative) based on topic, time range, and other filters
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InflationsAnalysisRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, inflationController.getinflationAnalysis);

module.exports = router; 