/**
 * @swagger
 * tags:
 *   - name: Alerts
 *     description: Endpoints for managing notification alerts
 * 
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAlertRequest'
 *     responses:
 *       200:
 *         description: Alert created or updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AlertResponse'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthenticationError'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   
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
 *     responses:
 *       200:
 *         description: Successfully retrieved alerts or deleted an alert
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AlertsListResponse'
 *                 - $ref: '#/components/schemas/AlertResponse'
 *       400:
 *         description: Bad request - missing required user_id parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthenticationError'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */ 