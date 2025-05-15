/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleChannelSentimentsRequest:
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
 *           description: Flag indicating if the user is a SCAD user
 *         selectedTab:
 *           type: string
 *           enum: ['GOOGLE', 'SOCIAL']
 *           description: Selected tab for source filtering
 *         parentAccountId:
 *           type: string
 *           description: Parent account ID for customer review data
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
 *     GoogleChannelSentimentsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         responseOutput:
 *           type: object
 *           description: Object containing sentiment data for each source
 *           additionalProperties:
 *             type: object
 *             properties:
 *               positive:
 *                 type: integer
 *                 description: Count of positive sentiments
 *                 example: 125
 *               negative:
 *                 type: integer
 *                 description: Count of negative sentiments
 *                 example: 45
 *               neutral:
 *                 type: integer
 *                 description: Count of neutral sentiments
 *                 example: 78
 *           example:
 *             GoogleMyBusiness:
 *               positive: 125
 *               negative: 45
 *               neutral: 78
 */

module.exports = {}; 