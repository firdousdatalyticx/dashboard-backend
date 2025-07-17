const express = require('express');
const router = express.Router();
const wordCloudController = require('../../controllers/social-media/word-cloud.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/word-cloud/phrases:
 *   post:
 *     summary: Get word phrases for word cloud visualization
 *     description: Retrieves phrases and term frequency data for creating word cloud visualizations
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WordCloudPhrasesRequest'
 */
router.post('/phrases', express.json(), transformCategoryData, transformDataSource, wordCloudController.getWordPhrases);

/**
 * @swagger
 * /social-media/word-cloud/posts:
 *   post:
 *     summary: Get posts by specific phrase
 *     description: Retrieves social media posts containing a specific phrase
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WordCloudPostsRequest'
 */
router.post('/posts', express.json(), transformCategoryData, transformDataSource, wordCloudController.getPostsByPhrase);

module.exports = router; 