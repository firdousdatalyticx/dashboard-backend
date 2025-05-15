/**
 * @swagger
 * components:
 *   schemas:
 *     EngagementMetricsRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - type: object
 *           properties:
 *             type:
 *               type: string
 *               description: Type of engagement metric to retrieve
 *               enum: [shares, comments, likes, engagements]
 *               default: engagements
 *             unTopic:
 *               type: string
 *               description: Flag to indicate if this is for UN topic
 *               enum: ['true', 'false']
 *               default: 'false'
 *             comparisonStartDate:
 *               type: string
 *               description: Start date for comparison period
 *               default: now-180d/d
 *             comparisonEndDate:
 *               type: string
 *               description: End date for comparison period
 *               default: now-90d/d
 *       example:
 *         topicId: "254"
 *         type: "engagements"
 *         timeSlot: "last7days"
 *         sentimentType: "Positive"
 *         fromDate: "2023-01-01"
 *         toDate: "2023-01-31"
 *         records: "20"
 *     
 *     EngagementMetricsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         totalCount:
 *           type: number
 *           description: Total count of the requested engagement metric
 *           example: 2567
 *         percentageDifference:
 *           type: string
 *           description: Percentage difference with comparison period in format "trend|percentage"
 *           example: "increase|15.75"
 *         graphData:
 *           type: array
 *           description: Daily data for the graph
 *           items:
 *             type: string
 *             example: "Mon,125"
 */

module.exports = {}; 