const express = require('express');
const router = express.Router();
const socialsDistributionsController = require('../../controllers/social-media/socials-distributions.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/socials-distributions:
 *   post:
 *     summary: Get social media distributions data
 *     description: Retrieves counts of mentions across different social media platforms
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
router.post('/', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getDistributions);

module.exports = router; 