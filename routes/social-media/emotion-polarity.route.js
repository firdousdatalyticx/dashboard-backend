const express = require('express');
const router = express.Router();
const emotionPolarityController = require('../../controllers/social-media/emotion-polarity.controller');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

/**
 * @swagger
 * /social-media/emotion-polarity:
 *   post:
 *     summary: Get emotion polarity data
 *     description: Retrieves emotion analysis with polarity scores for social media content
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmotionPolarityRequest'
 */
router.post('/', express.json(), transformCategoryData, transformDataSource, emotionPolarityController.getEmotionPolarity);

module.exports = router; 
