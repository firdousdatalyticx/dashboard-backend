const express = require('express');
const router = express.Router();
const influencersController = require('../../controllers/social-media/influencers.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const mentionsChartController = require("../../controllers/social-media/mentions-charts.controller")

/**
 * @swagger
 * /social-media/influencers:
 *   post:
 *     summary: Get social media influencers data
 *     description: Retrieves influencers sorted by category based on their follower count
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *             properties:
 *               topicId:
 *                 type: string
 *                 description: ID of the topic to analyze
 *           example:
 *             topicId: "254"
 */
router.post('/', express.json(), transformCategoryData, influencersController.getInfluencers);

/**
 * @swagger
 * /social-media/influencers/categories:
 *   post:
 *     summary: Get influencer categories data
 *     description: Retrieves counts of influencers by category based on follower count
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *             properties:
 *               topicId:
 *                 type: string
 *                 description: ID of the topic to analyze
 *           example:
 *             topicId: "254"
 */
router.post('/categories', express.json(), transformCategoryData, influencersController.getInfluencerCategories);
// router.get('/categories/posts', express.json(), mentionsChartController.mentionsPost);
router.get('/categories/posts', express.json(),  transformCategoryData, influencersController.getInfluencerPost);


module.exports = router; 