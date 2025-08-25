const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const fieldCountsController = require('../../controllers/social-media/field-counts.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, fieldCountsController.getFieldCounts);
router.post('/posts', express.json(), authMiddleware, transformCategoryData, fieldCountsController.getFieldPosts);

module.exports = router; 