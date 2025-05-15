const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');

const keywordsRoute = require('./keywords.route');

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard analytics endpoints for displaying data visualizations
 */

// Apply auth middleware to all dashboard routes
router.use(express.json());
router.use(authMiddleware);

// Mount dashboard related routes
router.use('/keywords', keywordsRoute);

module.exports = router;    