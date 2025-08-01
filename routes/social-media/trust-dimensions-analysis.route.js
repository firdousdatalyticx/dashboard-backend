const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const trustDimensionsAnalysisController = require('../../controllers/social-media/trust-dimensions-analysis.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, trustDimensionsAnalysisController.getTrustDimensionsAnalysisByCountry);

module.exports = router; 