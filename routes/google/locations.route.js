const express = require('express');
const router = express.Router();
const googleLocationsController = require('../../controllers/google/locations.controller');
const authMiddleware = require('../../middleware/auth.middleware');

/**
 * @swagger
 * /google/locations:
 *   post:
 *     summary: Get Google Maps locations data
 *     description: Retrieves Google Maps locations and their ratings for a specific topic
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleLocationsRequest'
 */
router.post('/', express.json(), authMiddleware, googleLocationsController.getGoogleLocations);

module.exports = router; 