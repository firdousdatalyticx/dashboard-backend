/**
 * @swagger
 * /google/channel-sentiments:
 *   post:
 *     summary: Get channel sentiments distribution by source
 *     description: Retrieves sentiment distribution (positive, negative, neutral) across different sources like GoogleMyBusiness
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleChannelSentimentsRequest'
 *     responses:
 *       200:
 *         description: Channel sentiments data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoogleChannelSentimentsResponse'
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