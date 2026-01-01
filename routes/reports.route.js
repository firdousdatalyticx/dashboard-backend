const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Endpoints for generating and retrieving various reports
 */

/**
 * @swagger
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
 */
router.post('/', authMiddleware, reportsController.getElasticMentions);

/**
 * @swagger
 * /reports/save:
 *   post:
 *     summary: Save a new report
 *     description: Creates a new report with the provided data
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - report_data
 *               - user_id
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the report
 *               report_data:
 *                 type: string
 *                 description: Report data (job_id)
 *               user_id:
 *                 type: string
 *                 description: ID of the user creating the report
 *     responses:
 *       200:
 *         description: Report saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 report:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post('/save', authMiddleware, reportsController.saveReport);

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get all reports
 *     description: Retrieves all reports from the database
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reports:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', authMiddleware, reportsController.getAllReports);

/**
 * @swagger
 * /reports/{id}:
 *   delete:
 *     summary: Delete a report
 *     description: Deletes a specific report by ID
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the report to delete
 *     responses:
 *       200:
 *         description: Report deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Report with ID 123 deleted successfully
 *       400:
 *         description: Invalid report ID
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, reportsController.deleteReport);

/**
 * @swagger
 * /reports/save-competitive:
 *   post:
 *     summary: Save a competitive analysis report
 *     description: Creates a new competitive analysis report comparing two topics/dashboards
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - report_data
 *               - user_id
 *               - topic_id_1
 *               - topic_id_2
 *             properties:
 *               report_data:
 *                 type: string
 *                 description: Report data (job_id)
 *               dashboard_name_1:
 *                 type: string
 *                 description: Dashboard name for first topic
 *               dashboard_name_2:
 *                 type: string
 *                 description: Dashboard name for second topic
 *               topic_id_1:
 *                 type: integer
 *                 description: ID of the first topic
 *               topic_id_2:
 *                 type: integer
 *                 description: ID of the second topic
 *               user_id:
 *                 type: integer
 *                 description: ID of the user creating the report
 *               start_date_1:
 *                 type: string
 *                 format: date-time
 *                 description: Start date for first topic
 *               end_date_1:
 *                 type: string
 *                 format: date-time
 *                 description: End date for first topic
 *               start_date_2:
 *                 type: string
 *                 format: date-time
 *                 description: Start date for second topic
 *               end_date_2:
 *                 type: string
 *                 format: date-time
 *                 description: End date for second topic
 *               comparison_analysis_id:
 *                 type: integer
 *                 description: ID of the comparison analysis this report belongs to (optional)
 *     responses:
 *       200:
 *         description: Competitive report saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 report:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post('/save-competitive', authMiddleware, reportsController.saveCompetitiveReport);

/**
 * @swagger
 * /reports/competitive:
 *   get:
 *     summary: Get competitive reports by comparison analysis ID
 *     description: Retrieves all competitive reports for a specific comparison analysis
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: comparison_analysis_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the comparison analysis to filter reports by
 *     responses:
 *       200:
 *         description: List of competitive reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reports:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing required parameter
 *       500:
 *         description: Server error
 */
router.get('/competitive', authMiddleware, reportsController.getCompetitiveReports);

/**
 * @swagger
 * /reports/competitive/{id}:
 *   delete:
 *     summary: Delete a competitive report
 *     description: Deletes a specific competitive report by ID. Users can only delete their own reports.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the competitive report to delete
 *     responses:
 *       200:
 *         description: Competitive report deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Competitive report with ID 123 deleted successfully
 *       400:
 *         description: Invalid report ID
 *       404:
 *         description: Report not found or permission denied
 *       500:
 *         description: Server error
 */
router.delete('/competitive/:id', authMiddleware, reportsController.deleteCompetitiveReport);

module.exports = router; 