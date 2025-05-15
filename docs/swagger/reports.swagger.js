/**
 * @swagger
 * tags:
 *   - name: Reports
 *     description: Endpoints for generating and retrieving various reports
 * 
 * /reports/elastic-mentions:
 *   post:
 *     summary: Get Elasticsearch mentions data
 *     description: Retrieves mentions data from Elasticsearch based on provided filters
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ElasticMentionsRequest'
 *     responses:
 *       200:
 *         description: Successfully retrieved mentions data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ElasticMentionsResponse'
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
 */ 