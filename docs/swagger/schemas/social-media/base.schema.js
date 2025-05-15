/**
 * @swagger
 * components:
 *   schemas:
 *     SocialMediaBaseRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         timeSlot:
 *           type: string
 *           description: Predefined time slot for filtering
 *           enum: [custom, last24hours, last7days, last30days]
 *         fromDate:
 *           type: string
 *           format: date
 *           description: Start date for custom date range (used with timeSlot=custom)
 *         toDate:
 *           type: string
 *           format: date
 *           description: End date for custom date range (used with timeSlot=custom)
 *         sentimentType:
 *           type: string
 *           description: Sentiment type to filter by
 *           enum: [Positive, Negative, Neutral]
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: "Internal server error"
 */

module.exports = {}; 