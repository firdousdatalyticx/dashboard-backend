const express = require('express');
const router = express.Router();

// Import routes
const authRoutes = require('./auth.route');
const chatRoutes = require('./chat.route');

const userRoutes = require('./user.routes');
const topicRoutes = require('./topic.route');
const topicCategoriesRoutes = require('./topic-categories.routes');
const dashboardRoutes = require('./dashboard.route');
const socialMediaRoutes = require('./social-media');
const googleRoutes = require('./google');
const dashboardAnalyticsRoutes = require('./dashboard');
const comparisonAnalysisRoutes = require('./comparison-analysis.route');
const reportsRoutes = require('./reports.route');
const alertsRoutes = require('./alerts.route');
const notificationsRoutes = require('./notifications.route')
const postsRoutes = require('./posts.route');
const aiSummaryRoutes = require('./social-media/ai-summary.route');
const googleLocationReviewsRoutes = require('./google/location-reviews.route');
const elasticRoutes= require("./elastic.route");

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/topics', topicRoutes);
router.use('/topic-categories', topicCategoriesRoutes);
router.use('/dashboards', dashboardRoutes);
router.use('/social-media', socialMediaRoutes);
router.use('/google', googleRoutes);
router.use('/dashboard', dashboardAnalyticsRoutes);
router.use('/comparison-analysis', comparisonAnalysisRoutes);
router.use('/reports', reportsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/chats', chatRoutes);

router.use('/notification', notificationsRoutes);
router.use('/posts', postsRoutes);
router.use('/social-media/ai-summary', aiSummaryRoutes);
router.use('/google/location-reviews', googleLocationReviewsRoutes);
router.use('/elastic-search', elasticRoutes);
// Base route for API health check
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        version: '1.0.0'
    });
});

module.exports = router; 