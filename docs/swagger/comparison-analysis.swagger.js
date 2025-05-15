/**
 * @swagger
 * tags:
 *   - name: Comparison Analysis
 *     description: Endpoints for comparing data between two topics
 * 
 * /comparison-analysis:
 *   post:
 *     summary: Create a new comparison analysis report
 *     description: Creates a new report comparing data between two topics
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateComparisonReport'
 *     responses:
 *       200:
 *         description: Report created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComparisonReportResponse'
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
 *     summary: Get all comparison analysis reports
 *     description: Retrieves all comparison analysis reports for a specific user
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the user whose reports to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved reports
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComparisonReportsResponse'
 *       400:
 *         description: Bad request - missing required userId parameter
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
 * /comparison-analysis/{id}:
 *   delete:
 *     summary: Delete a comparison analysis report
 *     description: Deletes a specific comparison analysis report by ID
 *     tags: [Comparison Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the report to delete
 *     responses:
 *       200:
 *         description: Report deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteReportResponse'
 *       400:
 *         description: Bad request - missing required ID parameter
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