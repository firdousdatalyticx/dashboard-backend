const express = require('express');
const router = express.Router();
const industryDistributionController = require('../../controllers/social-media/industry-distribution.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/industry-distribution:
 *   post:
 *     summary: Get industry distribution data
 *     description: Retrieves industry distribution data grouped by industry
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IndustryDistributionRequest'
 */
router.post('/', express.json(), authMiddleware, transformCategoryData, industryDistributionController.getIndustryDistribution);

/**
 * @swagger
 * /social-media/industry-distribution/sentiment:
 *   post:
 *     summary: Get industry sentiment distribution data
 *     description: Retrieves industry distribution data grouped by industry and sentiment
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IndustrySentimentDistributionRequest'
 */
router.post('/sentiment', express.json(), authMiddleware, transformCategoryData, industryDistributionController.getIndustrySentimentDistribution);

/**
 * @swagger
 * /social-media/industry-distribution/emotion:
 *   post:
 *     summary: Get industry emotion distribution data
 *     description: Retrieves industry distribution data grouped by industry and emotion
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IndustryEmotionDistributionRequest'
 */
router.post('/emotion', express.json(), authMiddleware, transformCategoryData, industryDistributionController.getIndustryEmotionDistribution);

/**
 * @swagger
 * /social-media/industry-distribution/posts:
 *   post:
 *     summary: Get posts for industry distribution
 *     description: Retrieves posts filtered by industry criteria
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IndustryPostsRequest'
 */
router.post('/posts', express.json(), authMiddleware, transformCategoryData, industryDistributionController.getIndustryPosts);

module.exports = router;

