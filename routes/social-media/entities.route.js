const express = require('express');
const router = express.Router();
const entitiesController = require('../../controllers/social-media/entities.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

// Support both POST and GET for better compatibility with different client implementations
router.post('/', express.json(), authMiddleware, transformCategoryData, entitiesController.getEntities);

module.exports = router; 