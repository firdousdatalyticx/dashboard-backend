const express = require('express');
const router = express.Router();
const poiSentimentDistributionController = require('../../controllers/social-media/point-of-interest-sentiment-distribution.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

/**
 * @swagger
 * /social-media/poi-sentiment-distribution:
 *   post:
 *     summary: Get point of interest sentiment distribution
 *     description: Retrieves sentiment distribution for each category in a topic
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PoiSentimentDistributionRequest'
 */
router.post('/', express.json(), transformCategoryData, poiSentimentDistributionController.getDistribution);

module.exports = router; 