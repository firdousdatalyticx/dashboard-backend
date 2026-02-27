const express = require('express');
const router = express.Router();
const sentimentsController = require('../../controllers/social-media/sentiments-analysis.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/latest-posts:
 *   post:
 *     summary: Get latest posts for a topic
 *     description: Retrieves the latest posts for a given topic with filtering options
 *     tags: [Social Media]
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
 *                 type: number
 *               source:
 *                 type: string
 *               category:
 *                 type: string
 *               fromDate:
 *                 type: string
 *               toDate:
 *                 type: string
 *               sentiment:
 *                 type: string
 *               llm_mention_type:
 *                 type: string
 *               limit:
 *                 type: number
 *               offset:
 *                 type: number
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, sentimentsController.getLatestPosts);

module.exports = router;
