/**
 * @swagger
 * /social-media/ai-summary:
 *   post:
 *     summary: Get AI-generated summary for social media data
 *     description: Retrieves an AI-generated summary based on social media posts for a topic, with filtering by time interval and category
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AiSummaryRequest'
 *     responses:
 *       200:
 *         description: Successfully retrieved AI summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AiSummaryResponse'
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid parameters"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to generate AI summary"
 *
 * /social-media/ai-summary/save:
 *   post:
 *     summary: Save an AI-generated summary
 *     description: Saves an AI-generated summary to the database for future reference
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveAiSummaryRequest'
 *     responses:
 *       201:
 *         description: Successfully saved AI summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaveAiSummaryResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to save AI summary"
 *
 * /social-media/ai-summary/saved:
 *   get:
 *     summary: Get saved AI summaries
 *     description: Retrieves all AI summaries saved by the user
 *     tags: [Social Media Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved saved summaries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SavedSummariesResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch saved AI summaries"
 */

module.exports = {}; 