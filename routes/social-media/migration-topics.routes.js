const express = require('express');
const router = express.Router();
const mentionsTrendController = require('../../controllers/social-media/mentions-trend.controller');
const mentionsChartController = require("../../controllers/social-media/mentions-charts.controller")
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/migration-topics:
 *   post:
 *     summary: Get social media mentions trend data
 *     description: Retrieves time-based mentions trend data for social media analysis
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MentionsTrendRequest'
 */
// router.post('/', express.json(), authMiddleware, transformCategoryData, mentionsChartController.migrationTopicsSummary);

router.get('/posts', express.json(), authMiddleware, transformCategoryData, mentionsTrendController.getMentionsTrendPost);

module.exports = router; 