const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alerts.controller');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Alerts
 *   description: Endpoints for managing notification alerts
 */

/**
 * @swagger
 * /alerts:
 *   post:
 *     summary: Create or update an alert
 *     description: Creates a new alert or updates an existing one based on provided parameters
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: ID of the alert to update (omit for creating a new alert)
 */
router.post('/', 
    authMiddleware,
     alertsController.createOrUpdateAlert);

router.put('/', 
        authMiddleware,
         alertsController.createOrUpdateAlert);

router.get('/alertPostShow',alertsController.alertPostShow)

/**
 * @swagger
 * /alerts:
 *   get:
 *     summary: Get alerts or delete an alert
 *     description: Retrieves all alerts for a user or deletes a specific alert
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the user whose alerts to retrieve
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: ID of the alert to delete (omit to get all alerts)
 */
router.get('/', 
    authMiddleware,
     alertsController.getOrDeleteAlert);

router.delete('/', 
        authMiddleware,
         alertsController.getOrDeleteAlert);

module.exports = router; 