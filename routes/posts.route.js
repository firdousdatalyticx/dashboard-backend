const express = require('express');
const router = express.Router();
const postsController = require('../controllers/posts.controller');
const authMiddleware = require('../middleware/auth.middleware');
const transformCategoryData = require('../middleware/categoryTransform.middleware');
const extractGoogleUrls = require('../middleware/google-urls.middleware');
const distributionbyCountryPostsController = require("../controllers/social-media/distributionbyCountryPosts")
/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Social media posts management and retrieval
 */

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Retrieve social media posts
 *     description: |
 *       Fetches social media posts based on multiple filtering criteria. 
 *       Supports complex filtering by topic, source, date range, sentiment, and more.
 *       Requires authentication.
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware, transformCategoryData, extractGoogleUrls, postsController.getPosts);

router.get('/audience/distribution-by-country', authMiddleware, transformCategoryData, distributionbyCountryPostsController.getDistributionbyCountryPosts);

module.exports = router; 