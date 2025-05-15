/**
 * @swagger
 * tags:
 *   - name: Social Media
 *     description: Social media analytics endpoints
 * 
 * /social-media/mentions-graph:
 *   post:
 *     summary: Get social media mentions graph data
 *     description: Retrieves time-based mentions data for social media posts to visualize trends
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MentionsGraphRequest'
 *     responses:
 *       200:
 *         description: Successfully retrieved mentions graph data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MentionsGraphResponse'
 *       400:
 *         description: Bad request - missing required parameters
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