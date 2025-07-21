const express = require('express');
const router = express.Router();

// Import admin routes
const adminRoutes = require('./admin.route');

// Mount admin routes
router.use('/', adminRoutes);

module.exports = router; 