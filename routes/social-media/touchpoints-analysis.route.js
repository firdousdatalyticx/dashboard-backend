const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const touchpointsAnalysisController = require('../../controllers/social-media/touchpoints-analysis.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, touchpointsAnalysisController.getTouchpointsAnalysisBySentiment);

// New route for posts by touchpoint and optional sentiment
router.post('/posts', express.json(), authMiddleware, transformCategoryData, touchpointsAnalysisController.getTouchpointPosts);

module.exports = router; 