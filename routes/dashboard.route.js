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

// Update enabled graphs for a topic (enable/disable)
router.put('/graphs/:topicId', dashboardController.updateTopicGraphs);

// Get all enabled graphs for a topic with AI configuration
router.get('/enabled-graphs/:topicId', dashboardController.getEnabledGraphs);

// Update a specific enabled graph's AI configuration
router.put('/enabled-graphs/:topicId/:graphId', dashboardController.updateEnabledGraph);

// Bulk update enabled graphs with AI configuration
router.post('/enabled-graphs/:topicId/bulk', dashboardController.bulkUpdateEnabledGraphs);

module.exports = router; 