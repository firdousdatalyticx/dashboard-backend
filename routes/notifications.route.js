const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alerts.controller');
const notificationsController = require('../controllers/notifications.controller')
const authMiddleware = require('../middleware/auth.middleware');

router.get('/', 
    authMiddleware,
    notificationsController.ReadUpdateDeleteNotifications);




module.exports = router; 