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
 *           example: "topic123"
 *         timeSlot:
 *           type: string
 *           description: Predefined time slot for filtering
 *           enum: [custom, last24hours, last7days, last30days]
 *           example: "last7days"
 *         fromDate:
 *           type: string
 *           format: date
 *           description: Start date for custom date range (used with timeSlot=custom)
 *           example: "2023-01-01"
 *         toDate:
 *           type: string
 *           format: date
 *           description: End date for custom date range (used with timeSlot=custom)
 *           example: "2023-01-31"
 *     
 *     SocialMediaFilterOptions:
 *       type: object
 *       properties:
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment type
 *           enum: [Positive, Negative, Neutral]
 *           example: "Positive"
 *         source:
 *           type: string
 *           description: Filter by social media source
 *           example: "Twitter"
 *         categoryId:
 *           type: string
 *           description: ID of category to filter by
 *           example: "category123"
 *         interval:
 *           type: string
 *           description: Time interval for aggregation
 *           enum: [daily, weekly, monthly]
 *           example: "daily"
 *     
 *     SocialMediaSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 */

module.exports = {}; 