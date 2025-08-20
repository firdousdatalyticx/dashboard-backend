const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const themesOverTimeController = require('../../controllers/social-media/themes-over-time.controller');

// Apply middleware and route handler
router.post('/', express.json(), authMiddleware, transformCategoryData, themesOverTimeController.getThemesOverTimeAnalysis);
router.post('/posts', express.json(), authMiddleware, transformCategoryData, themesOverTimeController.getThemesOverTimePosts);

module.exports = router; 