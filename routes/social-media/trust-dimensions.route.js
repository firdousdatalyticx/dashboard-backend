const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const trustDimensionsController = require('../../controllers/social-media/trust-dimensions.controller');
const transformDataSource = require('../../middleware/dataSource.middleware');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, transformDataSource, trustDimensionsController.getTrustDimensionsAnalysis);

module.exports = router; 