/**
 * @swagger
 * components:
 *   schemas:
 *     ComparisonAnalysisReport:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the report
 *           example: 1
 *         poiTitle1:
 *           type: string
 *           description: Title of the first point of interest
 *           example: "Starbucks"
 *         poiCity1:
 *           type: string
 *           description: City of the first point of interest
 *           example: "New York"
 *         poiTitle2:
 *           type: string
 *           description: Title of the second point of interest
 *           example: "Costa Coffee"
 *         poiCity2:
 *           type: string
 *           description: City of the second point of interest
 *           example: "London"
 *         report_data:
 *           type: object
 *           description: JSON data containing the comparison analysis results
 *           example: { "sentimentComparison": { "positive": { "topic1": 60, "topic2": 45 } } }
 *         date_created:
 *           type: string
 *           format: date-time
 *           description: Creation date and time of the report
 *           example: "2023-01-15T14:30:00Z"
 *         user_id:
 *           type: integer
 *           description: ID of the user who created the report
 *           example: 42
 *         topicId1:
 *           type: string
 *           description: ID of the first topic used for comparison
 *           example: "topic123"
 *         topicId2:
 *           type: string
 *           description: ID of the second topic used for comparison
 *           example: "topic456"
 *     
 *     CreateComparisonReport:
 *       type: object
 *       required:
 *         - topicId1
 *         - topicId2
 *         - userId
 *       properties:
 *         topicId1:
 *           type: string
 *           description: ID of the first topic to compare
 *           example: "topic123"
 *         topicId2:
 *           type: string
 *           description: ID of the second topic to compare
 *           example: "topic456"
 *         poiTitle1:
 *           type: string
 *           description: Title of the first point of interest
 *           example: "Starbucks"
 *         poiCity1:
 *           type: string
 *           description: City of the first point of interest
 *           example: "New York"
 *         poiTitle2:
 *           type: string
 *           description: Title of the second point of interest
 *           example: "Costa Coffee"
 *         poiCity2:
 *           type: string
 *           description: City of the second point of interest
 *           example: "London"
 *         report_data:
 *           type: object
 *           description: JSON data containing the comparison analysis results
 *           example: { "sentimentComparison": { "positive": { "topic1": 60, "topic2": 45 } } }
 *         userId:
 *           type: string
 *           description: ID of the user creating the report
 *           example: "42"
 *     
 *     ComparisonReportsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         reports:
 *           type: array
 *           description: List of comparison analysis reports
 *           items:
 *             $ref: '#/components/schemas/ComparisonAnalysisReport'
 *     
 *     ComparisonReportResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         response:
 *           $ref: '#/components/schemas/ComparisonAnalysisReport'
 *           
 *     DeleteReportResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: "Report deleted successfully"
 */

module.exports = {}; 