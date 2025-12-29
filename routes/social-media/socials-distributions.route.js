const express = require('express');
const router = express.Router();
const socialsDistributionsController = require('../../controllers/social-media/socials-distributions.controller');
const postsController = require('../../controllers/social-media/socials-distributions.posts.controller');
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
// Counts-only endpoint (same body structure as before, returns just counts)
router.post('/', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getDistributions);

// New posts-only endpoint: same params plus "source" to fetch posts for a single source
router.post('/posts', express.json(), authMiddleware, transformCategoryData, postsController.getDistributionPosts);

// New sentiment by source endpoint: returns sentiment counts grouped by source
router.post('/sentiment-by-source', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getSentimentBySource);

// New emotion by source endpoint: returns emotion counts grouped by source
router.post('/emotion-by-source', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getEmotionBySource);

// New popular sources endpoint: returns sources ordered by popularity with percentages
router.post('/popular-sources', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getPopularSources);

// New active users distribution endpoint: returns user activity metrics grouped by source
router.post('/active-users-distribution', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getActiveUsersDistribution);

// New dashboard metrics endpoint: returns total mentions, average sentiment, and active users
router.post('/dashboard-metrics', express.json(), authMiddleware, transformCategoryData, socialsDistributionsController.getDashboardMetrics);

module.exports = router; 