const express = require('express');
const router = express.Router();
const channelSentimentsController = require('../../controllers/google/channel-sentiments.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const extractGoogleUrls = require('../../middleware/google-urls.middleware');

/**
 * @swagger
 * /google/channel-sentiments:
 *   post:
 *     summary: Get channel sentiments analysis
 *     description: Get sentiment analysis breakdown by channel for Google data
 *     tags: [Google Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topicId:
 *                 type: string
 *             required:
 *               - topicId
 */
router.post('/', express.json(), authMiddleware, extractGoogleUrls, channelSentimentsController.getChannelSentiments);

module.exports = router; 
