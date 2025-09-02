const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin/admin.controller');
const authMiddleware = require('../../middleware/auth.middleware');
// const adminAuthMiddleware = require('../../middleware/adminAuth.middleware');

// Apply auth middleware to all admin routes
router.use(authMiddleware);
// router.use(adminAuthMiddleware);

// Customer segregation routes (must come before parameterized routes)
router.get('/customers/parent-accounts', adminController.getParentAccounts);
router.get('/customers/parent/:parentEmail', adminController.getCustomersByParent);

// Customer management routes
router.get('/customers', adminController.getAllCustomers);
router.get('/customers/:customerId', adminController.getCustomerDetails);
router.get('/customers/:customerId/topics', adminController.getCustomerTopics);
router.put('/customers/:customerId', adminController.updateCustomer);

// Topic management routes
router.get('/topics', adminController.getAllTopics);
router.get('/topics/:topicId', adminController.getTopicDetails);
router.put('/topics/:topicId', adminController.updateTopic);
router.patch('/topics/:topicId/dashboard-status', adminController.toggleDashboardStatus);
router.patch('/topics/:topicId/premium-status', adminController.togglePremiumStatus);
router.patch('/topics/:topicId/archive-data-status', adminController.toggleArchiveDataStatus);
router.patch('/topics/:topicId/allowed-sources', adminController.updateAllowedSources);
router.patch('/topics/bulk-update', adminController.bulkUpdateTopics);

// Dashboard and analytics routes
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/search', adminController.search);

module.exports = router; 