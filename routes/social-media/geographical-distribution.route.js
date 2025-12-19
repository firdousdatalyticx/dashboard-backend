const express = require('express');
const router = express.Router();
const geographicalDistributionController = require('../../controllers/social-media/geographical-distribution.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/geographical-distribution:
 *   post:
 *     summary: Get geographical distribution data
 *     description: Retrieves geographical distribution data grouped by country (u_country)
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GeographicalDistributionRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, geographicalDistributionController.getGeographicalDistribution);

/**
 * @swagger
 * /social-media/geographical-distribution/sentiment:
 *   post:
 *     summary: Get geographical sentiment distribution data
 *     description: Retrieves geographical distribution data grouped by country and sentiment
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GeographicalSentimentDistributionRequest'
 */
router.post('/sentiment', express.json(), authMiddleware, transformCategoryData, geographicalDistributionController.getGeographicalSentimentDistribution);

/**
 * @swagger
 * /social-media/geographical-distribution/emotion:
 *   post:
 *     summary: Get geographical emotion distribution data
 *     description: Retrieves geographical distribution data grouped by country and emotion
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GeographicalEmotionDistributionRequest'
 */
router.post('/emotion', express.json(), authMiddleware, transformCategoryData, geographicalDistributionController.getGeographicalEmotionDistribution);

/**
 * @swagger
 * /social-media/geographical-distribution/posts:
 *   post:
 *     summary: Get posts for geographical distribution
 *     description: Retrieves posts filtered by geographical criteria
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GeographicalPostsRequest'
 */
router.post('/posts', express.json(), authMiddleware, transformCategoryData, geographicalDistributionController.getGeographicalPosts);

module.exports = router;

