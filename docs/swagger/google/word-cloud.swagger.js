/**
 * @swagger
 * /google/word-cloud:
 *   post:
 *     summary: Get word cloud data from Google reviews
 *     description: Retrieves phrases for word cloud visualization from Google Maps reviews, filtered by sentiment type
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleWordCloudRequest'
 *     responses:
 *       200:
 *         description: Word cloud data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/GoogleWordCloudPhrasesResponse'
 *                 - $ref: '#/components/schemas/GoogleWordCloudPostsResponse'
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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