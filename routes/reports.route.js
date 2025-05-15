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

module.exports = router; 