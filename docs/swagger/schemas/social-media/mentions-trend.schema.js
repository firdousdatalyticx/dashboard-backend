/**
 * @swagger
 * components:
 *   schemas:
 *     MentionsTrendRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - type: object
 *           properties:
 *             isScadUser:
 *               type: string
 *               description: Flag to indicate if user is a SCAD user
 *               enum: ['true', 'false']
 *             unTopic:
 *               type: string
 *               description: Flag to indicate if this is for UN topic
 *               enum: ['true', 'false']
 *       example:
 *         topicId: "254"
 *         timeSlot: "last7days"
 *         sentimentType: "Positive"
 *         fromDate: "2023-01-01"
 *         toDate: "2023-01-31"
 *         records: "20"
 *     
 *     MentionsTrendResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         mentionsGraphData:
 *           type: string
 *           description: Pipe-separated string of date,count pairs
 *           example: "2023-06-12,45|2023-06-13,38|2023-06-14,62"
 *         maxMentionData:
 *           type: string
 *           description: Date and count for the day with maximum mentions
 *           example: "2023-06-14,62"
 */

module.exports = {}; 