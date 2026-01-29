const express = require('express');
const router = express.Router();
const wordCloudController = require('../../controllers/google/word-cloud.controller');
const authMiddleware = require('../../middleware/auth.middleware');

/**
 * @swagger
 * /google/word-cloud:
 *   post:
 *     summary: Get word cloud data from Google reviews
 *     description: Retrieves phrases for word cloud visualization from Google Maps reviews, filtered by sentiment type
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleWordCloudRequest'
 */
router.post('/', express.json(), authMiddleware, wordCloudController.getWordCloud);

module.exports = router; 
