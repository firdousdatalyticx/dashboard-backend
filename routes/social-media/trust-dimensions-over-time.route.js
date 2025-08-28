const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const trustDimensionsOverTimeController = require('../../controllers/social-media/trust-dimensions-over-time.controller');
const transformDataSource = require('../../middleware/dataSource.middleware');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, transformDataSource, trustDimensionsOverTimeController.getTrustDimensionsOverTime);
router.post('/posts', express.json(), authMiddleware, transformCategoryData, trustDimensionsOverTimeController.getTrustDimensionsOverTimePosts);

module.exports = router; 