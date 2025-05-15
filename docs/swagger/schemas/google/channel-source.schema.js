/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleChannelSourceRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         greaterThanTime:
 *           type: string
 *           description: Start date for data range (ISO format or Elasticsearch date math)
 *           default: now-90d/d
 *         lessThanTime:
 *           type: string
 *           description: End date for data range (ISO format or Elasticsearch date math)
 *           default: now/d
 *         isScadUser:
 *           type: string
 *           enum: ['true', 'false']
 *           description: Flag indicating if the user is a SCAD user, affects source filtering
 *         selectedTab:
 *           type: string
 *           enum: ['GOOGLE', 'SOCIAL']
 *           description: Selected tab for source filtering
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment type (can be comma-separated for multiple values)
 *           example: "Positive,Negative"
 *       example:
 *         topicId: "254"
 *         greaterThanTime: "2023-01-01"
 *         lessThanTime: "2023-12-31"
 *         isScadUser: "false"
 *         selectedTab: "GOOGLE"
 *         sentimentType: "Positive"
 *     
 *     GoogleChannelSourceResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         channelSourceCount:
 *           type: string
 *           description: Pipe-delimited string of source data in format - source,count,percentage
 *           example: "Web,145,32.22|GoogleMyBusiness,304,67.78"
 *         printMediaCount:
 *           type: string
 *           description: Print media data in format - source,count
 *           example: "Printmedia,47"
 */

module.exports = {}; 