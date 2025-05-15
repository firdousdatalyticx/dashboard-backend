const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validation.middleware');

// Apply auth middleware to all dashboard routes
router.use(authMiddleware);

// Get all dashboards/topics
// router.get('/', dashboardController.getDashboards);

// // Get dashboard info (topic count, allowed topics)
// router.get('/info', dashboardController.getDashboardInfo);

// Get country list
// router.get('/countries', dashboardController.getCountryList);

// Create a new dashboard/topic
// router.post('/', [
//     body('title').notEmpty().withMessage('Dashboard title is required'),
//     body('region').optional(),
//     body('keywords').optional(),
//     body('hashTags').optional(),
//     body('urls').optional(),
//     body('excludeWords').optional(),
//     body('excludeAccounts').optional(),
//     body('dataSources').optional(),
//     body('dataLocation').optional(),
//     body('dataLanguage').optional()
// ], validateRequest, dashboardController.createDashboard);

module.exports = router; 