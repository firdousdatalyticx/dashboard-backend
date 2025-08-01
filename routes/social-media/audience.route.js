const express = require('express');
const router = express.Router();
const audienceController = require('../../controllers/social-media/audience.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/audience/active-audience:
 *   post:
 *     summary: Get active audience data
 *     description: Retrieves active users engaging with the topic on social media
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AudienceActiveRequest'
 */
router.post('/active-audience', express.json(), authMiddleware, transformCategoryData, audienceController.getAudience);

/**
 * @swagger
 * /social-media/audience/distribution-by-country:
 *   post:
 *     summary: Get audience distribution by country
 *     description: Retrieves a breakdown of audience by country based on the topic
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AudienceCountryRequest'
 */
router.post('/distribution-by-country', express.json(), authMiddleware, transformCategoryData, audienceController.getAudienceDistributionByCountry);


router.post('/commenter-engagement-breakdown', express.json(), authMiddleware, transformCategoryData, audienceController.getCommenterEngagementBreakdown);
router.post('/commenter-engagement-by-seniority', express.json(), authMiddleware, transformCategoryData, audienceController.getCommenterEngagementBySeniority);
router.post('/comment-audience-trend', express.json(), authMiddleware, transformCategoryData, audienceController.getCommentAudienceTrend);

module.exports = router; 

