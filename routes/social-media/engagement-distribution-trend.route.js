const express = require('express');
const router = express.Router();
const engagementDistributionTrendController = require('../../controllers/social-media/engagement-distribution-trend.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/engagement-distribution-trend:
 *   post:
 *     summary: Get social media engagement-distribution-trend  data
 *     description: Retrieves time-based engagement-distribution-trend data for social media analysis
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/engagement-distribution-TrendRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData,transformDataSource, engagementDistributionTrendController.getEngagementDistributionTrend);

router.get('/posts', express.json(), authMiddleware, transformCategoryData,transformDataSource, engagementDistributionTrendController.getEngagementDistributionTrendPost);

router.post('/data', express.json(), authMiddleware, transformCategoryData,transformDataSource, engagementDistributionTrendController.getData);

module.exports = router; 