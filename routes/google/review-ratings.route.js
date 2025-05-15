const express = require('express');
const router = express.Router();
const reviewRatingsController = require('../../controllers/google/review-ratings.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const extractGoogleUrls = require('../../middleware/google-urls.middleware');
/**
 * @swagger
 * /google/review-ratings:
 *   post:
 *     summary: Get Google review ratings distribution
 *     description: Retrieves distribution of review ratings (1-5 stars) for Google Maps business reviews
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleReviewRatingsRequest'
 */
router.post('/', express.json(), authMiddleware, extractGoogleUrls, reviewRatingsController.getReviewRatings);


module.exports = router; 