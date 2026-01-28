const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/image_upload');
const { authenticateUserToken } = require('../middleware/user.auth.token');
const videoController = require('../controllers/video.controller');

/**
 * @swagger
 * /video/analyze:
 *   post:
 *     summary: Analyze a video (URL or uploaded file)
 *     tags: [Video]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Video file to upload
 *               videoUrl:
 *                 type: string
 *                 description: Video URL (for URL type)
 *               type:
 *                 type: string
 *                 enum: [url, file]
 *                 default: url
 *                 description: Type of video source
 *     responses:
 *       200:
 *         description: Video analyzed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatId:
 *                   type: string
 *                 message:
 *                   type: string
 *                 videoMetadata:
 *                   type: object
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/analyze', authenticateUserToken, upload.single('file'), videoController.analyzeVideo);

/**
 * @swagger
 * /video/chat:
 *   get:
 *     summary: Chat about an analyzed video
 *     tags: [Video]
 *     parameters:
 *       - in: query
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *       - in: query
 *         name: message
 *         required: true
 *         schema:
 *           type: string
 *         description: Message to send to the video chat
 *     responses:
 *       200:
 *         description: Chat response streamed
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Bad request
 *       404:
 *         description: Chat session not found
 *       500:
 *         description: Internal server error
 */
router.get('/chat', videoController.chatWithVideo);

module.exports = router;