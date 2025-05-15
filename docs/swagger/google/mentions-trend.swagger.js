/**
 * @swagger
 * /google/mentions-trend:
 *   post:
 *     summary: Get Google mentions trend data
 *     description: Retrieves time-based trend data for Google Maps mentions, aggregated by day
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleMentionsTrendRequest'
 *     responses:
 *       200:
 *         description: Mentions trend data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoogleMentionsTrendResponse'
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = {}; 