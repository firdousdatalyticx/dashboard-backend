/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleMentionsTrendRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         isScadUser:
 *           type: string
 *           enum: ['true', 'false']
 *           description: Flag indicating if the user is a SCAD user
 *         greaterThanTime:
 *           type: string
 *           description: Start date for data range (ISO format or Elasticsearch date math)
 *           default: now-90d/d
 *         lessThanTime:
 *           type: string
 *           description: End date for data range (ISO format or Elasticsearch date math)
 *           default: now/d
 *         unTopic:
 *           type: string
 *           enum: ['true', 'false']
 *           description: Flag indicating if this is a UN topic
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment type (can be comma-separated for multiple values)
 *           example: "Positive,Negative"
 *       example:
 *         topicId: "254"
 *         isScadUser: "false"
 *         greaterThanTime: "2023-01-01"
 *         lessThanTime: "2023-12-31"
 *         sentimentType: "Positive"
 *     
 *     GoogleMentionsTrendResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         mentionsGraphData:
 *           type: string
 *           description: Pipe-separated string of date,count pairs
 *           example: "2023-06-15,12|2023-06-14,8|2023-06-13,15"
 *         maxMentionData:
 *           type: string
 *           description: Date and count for the day with maximum mentions
 *           example: "2023-06-13,15"
 */

module.exports = {}; 