const express = require('express');
const router = express.Router();

const subsidiaryController = require('../../controllers/social-media/subsidiary-distributions.controller.js');
// const subsidiaryPostsController = require('../../controllers/social-media/subsidiary-distributions.posts.controller');

const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/subsidiary-distributions:
 *   post:
 *     summary: Get subsidiary social media distributions
 *     description: Retrieves counts of mentions across different platforms for a subsidiary
 *     tags: [Subsidiary Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subsidiaryId
 *             properties:
 *               subsidiaryId:
 *                 type: string
 *                 description: ID of the subsidiary to analyze
 *           example:
 *             subsidiaryId: "453"
 */
router.post(
  '/',
  express.json(),
  authMiddleware,
  transformCategoryData,
  transformDataSource,
  subsidiaryController.getSubsidiaryDistributions
);

/**
 * @swagger
 * /social-media/subsidiary-distributions/posts:
 *   post:
 *     summary: Get posts for a specific subsidiary and source
 *     description: Retrieves post-level data for selected subsidiary and platform
 *     tags: [Subsidiary Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subsidiaryId
 *               - source
 *             properties:
 *               subsidiaryId:
 *                 type: string
 *                 description: ID of the subsidiary
 *               source:
 *                 type: string
 *                 description: Social media platform (e.g., Facebook, LinkedIn)
 *           example:
 *             subsidiaryId: "453"
 *             source: "LinkedIn"
 */
router.get(
  '/posts',
  express.json(),
  authMiddleware,
  transformCategoryData,
  transformDataSource,
  subsidiaryController.getSubsidiaryDistributionsPosts
);

module.exports = router;