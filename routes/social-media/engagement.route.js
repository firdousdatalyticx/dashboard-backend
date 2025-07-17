const express = require('express');
const router = express.Router();
const engagementController = require('../../controllers/social-media/engagement.metrics.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/engagement:
 *   post:
 *     summary: Get social media engagement metrics
 *     description: Retrieves engagement metrics (shares, likes, comments, or total engagement) for social media posts
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EngagementMetricsRequest'
 */
router.post('/', express.json(), transformCategoryData, transformDataSource, engagementController.getEngagementMetrics);

module.exports = router; 