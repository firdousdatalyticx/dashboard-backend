/**
 * @swagger
 * components:
 *   schemas:
 *     CreateAlertRequest:
 *       type: object
 *       required:
 *         - keywords
 *         - emails
 *         - sentimentTypes
 *         - sources
 *         - frequency
 *         - user_id
 *         - title
 *         - topicId
 *         - topicName
 *       properties:
 *         keywords:
 *           type: array
 *           description: Keywords to monitor for alerts
 *           items:
 *             type: string
 *           example: ["product launch", "new feature"]
 *         emails:
 *           type: array
 *           description: Email addresses to send alerts to
 *           items:
 *             type: string
 *           example: ["user@example.com", "manager@example.com"]
 *         sentimentTypes:
 *           type: array
 *           description: Types of sentiments to monitor
 *           items:
 *             type: string
 *             enum: [Positive, Negative, Neutral]
 *           example: ["Negative", "Neutral"]
 *         sources:
 *           type: array
 *           description: Social media sources to monitor
 *           items:
 *             type: string
 *             enum: [Twitter, X, Facebook, Instagram, Google, Youtube, Pinterest, Reddit, LinkedIn, Web]
 *           example: ["X", "Facebook"]
 *         frequency:
 *           type: string
 *           description: Frequency of alert checks
 *           enum: [Instant notification, 1 Hour, 6 Hours, 12 Hours, 24 Hours]
 *           example: "6 Hours"
 *         user_id:
 *           type: integer
 *           description: ID of the user creating the alert
 *           example: 42
 *         title:
 *           type: string
 *           description: Title of the alert
 *           example: "Negative Reviews Alert"
 *         topicId:
 *           type: string
 *           description: ID of the topic to monitor
 *           example: "topic123"
 *         topicName:
 *           type: string
 *           description: Name of the topic to monitor
 *           example: "Product XYZ"
 *     
 *     AlertResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         alert:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               description: Unique identifier for the alert
 *               example: 1
 *             title:
 *               type: string
 *               description: Title of the alert
 *               example: "Negative Reviews Alert"
 *             keywords:
 *               type: string
 *               description: Comma-separated keywords
 *               example: "product launch,new feature"
 *             emails:
 *               type: string
 *               description: Comma-separated email addresses
 *               example: "user@example.com,manager@example.com"
 *             sentimentTypes:
 *               type: string
 *               description: Comma-separated sentiment types
 *               example: "Negative,Neutral"
 *             filterBySource:
 *               type: string
 *               description: Comma-separated sources (mapped to internal names)
 *               example: "Twitter,Facebook"
 *             frequency:
 *               type: string
 *               description: Alert check frequency
 *               example: "6 Hours"
 *             user_id:
 *               type: integer
 *               description: ID of the user who created the alert
 *               example: 42
 *             topicId:
 *               type: string
 *               description: ID of the monitored topic
 *               example: "topic123"
 *             topicName:
 *               type: string
 *               description: Name of the monitored topic
 *               example: "Product XYZ"
 *             createdAt:
 *               type: string
 *               format: date-time
 *               description: Creation date and time
 *               example: "2023-05-15T10:30:00Z"
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               description: Last update date and time
 *               example: "2023-05-16T08:15:00Z"
 *             lastUpdatedAt:
 *               type: string
 *               format: date-time
 *               description: Last time the alert data was updated
 *               example: "2023-05-16T08:15:00Z"
 *             lastUpdatedFrom:
 *               type: string
 *               format: date-time
 *               description: Previous update time reference
 *               example: "2023-05-15T10:30:00Z"
 *             isDeleted:
 *               type: boolean
 *               description: Indicates if the alert has been deleted
 *               example: false
 *     
 *     AlertsListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         alerts:
 *           type: array
 *           description: List of alerts
 *           items:
 *             $ref: '#/components/schemas/AlertResponse/properties/alert'
 *     
 *     AlertNotification:
 *       type: object
 *       properties:
 *         alertId:
 *           type: integer
 *           description: ID of the associated alert
 *           example: 1
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Start date of the notification period
 *           example: "2023-05-15T10:30:00Z"
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: End date of the notification period
 *           example: "2023-05-16T10:30:00Z"
 *         type:
 *           type: string
 *           description: Type of notification
 *           example: "alerts"
 *         total_mentions:
 *           type: integer
 *           description: Total number of mentions detected
 *           example: 42
 *     
 *     EmailContent:
 *       type: object
 *       properties:
 *         trackedKeyword:
 *           type: string
 *           description: The keyword or topic being tracked
 *           example: "Product XYZ"
 *         totalNewMentions:
 *           type: integer
 *           description: Total number of new mentions
 *           example: 42
 *         sentimentBreakdown:
 *           type: object
 *           properties:
 *             '😊 Positive Mentions':
 *               type: integer
 *               example: 20
 *             '😐 Neutral Mentions':
 *               type: integer
 *               example: 15
 *             '😠 Negative Mentions':
 *               type: integer
 *               example: 7
 *         keyHighlights:
 *           type: object
 *           properties:
 *             overallSentimentTrend:
 *               type: string
 *               example: "Mostly Positive"
 *             notableDiscussionsFrom:
 *               type: string
 *               example: "Twitter"
 */

module.exports = {}; 