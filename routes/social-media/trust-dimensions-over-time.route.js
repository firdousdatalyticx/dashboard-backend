const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const trustDimensionsOverTimeController = require('../../controllers/social-media/trust-dimensions-over-time.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, trustDimensionsOverTimeController.getTrustDimensionsOverTime);

module.exports = router; 