const express = require('express');
const router = express.Router();
const googleReviewTrendsController = require('../../controllers/google/review-trends.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const extractGoogleUrls = require('../../middleware/google-urls.middleware');

/**
 * @swagger
 * /google/review-trends:
 *   post:
 *     summary: Get Google review trends data
 *     description: Retrieves Google review trends data over time, grouped by month and rating
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleReviewTrendsRequest'
 */
router.post('/', express.json(), authMiddleware, extractGoogleUrls, googleReviewTrendsController.getReviewTrends);

module.exports = router; 