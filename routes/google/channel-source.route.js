const express = require('express');
const router = express.Router();
const channelSourceController = require('../../controllers/google/channel-source.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const extractGoogleUrls = require('../../middleware/google-urls.middleware');

/**
 * @swagger
 * /google/channel-source:
 *   post:
 *     summary: Get data source distribution
 *     description: Get the breakdown of mentions by channel/source for Google data
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
router.post('/', express.json(), authMiddleware, extractGoogleUrls, channelSourceController.getChannelSource);

module.exports = router; 