const express = require('express');
const router = express.Router();
const mentionsTrendController = require('../../controllers/google/mentions-trend.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const extractGoogleUrls = require('../../middleware/google-urls.middleware');
/**
 * @swagger
 * /google/mentions-trend:
 *   post:
 *     summary: Get Google mentions trend data
 *     description: Retrieves time-based trend data for Google Maps mentions, aggregated by day with optional sentiment filtering
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleMentionsTrendRequest'
 */
router.post('/', express.json(), authMiddleware,extractGoogleUrls, mentionsTrendController.getMentionsTrend);

module.exports = router; 