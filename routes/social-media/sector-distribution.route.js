const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const sectorDistributionController = require('../../controllers/social-media/sector-distribution.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, sectorDistributionController.getSectorDistributionAnalysis);

module.exports = router; 