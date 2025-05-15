const express = require('express');
const router = express.Router();
const mentionsGraphController = require('../../controllers/social-media/mentions-graph.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/mentions-graph:
 *   post:
 *     summary: Get social media mentions graph data
 *     description: Retrieves time-based mentions data for social media posts to visualize trends
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MentionsGraphRequest'
 */
router.post('/', transformCategoryData, mentionsGraphController.getMentionsGraph);

module.exports = router; 