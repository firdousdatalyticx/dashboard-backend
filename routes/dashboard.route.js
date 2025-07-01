const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all dashboard routes
router.use(authMiddleware);



// Get available graphs (optionally for a specific topic)
router.get('/graphs/:topicId?', dashboardController.getAvailableGraphs);

// Get dashboard configuration for a topic
router.get('/config/:topicId', dashboardController.getDashboardConfig);

// Update dashboard configuration for a topic
router.put('/config/:topicId', dashboardController.updateDashboardConfig);

// Update enabled graphs for a topic
router.put('/graphs/:topicId', dashboardController.updateTopicGraphs);

module.exports = router; 