const express = require('express');
const router = express.Router();
const scheduleDataController = require('../controllers/schedule-data.controller');
const apiKeyMiddleware = require('../middleware/api-key.middleware');

/**
 * @swagger
 * /schedule-data:
 *   post:
 *     summary: Get scheduling data posts
 *     description: Retrieves posts within a specified date range for scheduling data. Requires API key authentication via X-API-Key header.
 *     tags: [Schedule Data]
 *     parameters:
 *       - in: header
 *         name: X-API-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: API key for authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for the date range (optional, if not provided fetches all time data)
 *               toDate:
 *                 type: string
 *                 format: date
 *                 description: End date for the date range (optional, if not provided fetches all time data)
 *               topicIds:
 *                 oneOf:
 *                   - type: integer
 *                   - type: array
 *                     items:
 *                       type: integer
 *                 description: Single topic ID or array of topic IDs to fetch data for (optional, defaults to [2647, 2648, 2649])
 *           examples:
 *             - summary: With all parameters
 *               value:
 *                 fromDate: "2024-01-01"
 *                 toDate: "2024-01-31"
 *                 topicIds: [254, 255, 256]
 *             - summary: Default topicIds, all time data
 *               value: {}
 *             - summary: Custom topicIds, all time data
 *               value:
 *                 topicIds: [100, 200]
 */
router.post('/', express.json(), apiKeyMiddleware, scheduleDataController.getScheduleData);

module.exports = router;
