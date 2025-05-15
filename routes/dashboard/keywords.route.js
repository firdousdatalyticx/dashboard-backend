const express = require('express');
const router = express.Router();
const keywordsController = require('../../controllers/dashboard/keywords.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /dashboard/keywords:
 *   post:
 *     summary: Get keywords chart data
 *     description: Retrieves keywords frequency data for visualization in dashboard charts
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KeywordsChartRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, keywordsController.getNewKeywordsChart);

module.exports = router; 