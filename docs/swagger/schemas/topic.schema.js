/**
 * @swagger
 * components:
 *   schemas:
 *     Topic:
 *       type: object
 *       properties:
 *         topic_id:
 *           type: integer
 *           example: 123
 *         topic_title:
 *           type: string
 *           example: "Customer Experience Analysis"
 *         topic_logo:
 *           type: string
 *           example: "logo.png"
 *         topic_order:
 *           type: integer
 *           example: 1
 *         topic_created_at:
 *           type: string
 *           format: date-time
 *           example: "2023-01-01T12:00:00Z"
 *         topic_updated_at:
 *           type: string
 *           format: date-time
 *           example: "2023-01-15T14:30:00Z"
 *         categoryCount:
 *           type: integer
 *           example: 5
 *     
 *     TopicDetail:
 *       type: object
 *       properties:
 *         topic_id:
 *           type: integer
 *           example: 123
 *         topic_title:
 *           type: string
 *           example: "Customer Experience Analysis"
 *         topic_keywords:
 *           type: string
 *           example: "customer service,satisfaction,feedback"
 *         topic_hash_tags:
 *           type: string
 *           example: "#customerexperience|#satisfaction"
 *         topic_urls:
 *           type: string
 *           example: "https://example.com|https://maps.google.com/?cid=123456789"
 *         topic_exclude_words:
 *           type: string
 *           example: "spam,irrelevant"
 *         topic_exclude_accounts:
 *           type: string
 *           example: "competitor1,competitor2"
 *         topic_region:
 *           type: string
 *           example: "Abu Dhabi"
 *         topic_data_source:
 *           type: string
 *           example: "Twitter,Facebook,GoogleMyBusiness"
 *         topic_data_location:
 *           type: string
 *           example: "UAE,Saudi Arabia"
 *         topic_data_lang:
 *           type: string
 *           example: "en,ar"
 *         topic_logo:
 *           type: string
 *           example: "logo.png"
 *         categoryCount:
 *           type: integer
 *           example: 5
 *     
 *     CreateTopicRequest:
 *       type: object
 *       required:
 *         - title
 *       properties:
 *         title:
 *           type: string
 *           example: "Customer Experience Analysis"
 *         keywords:
 *           type: string
 *           example: "customer service,satisfaction,feedback,#customerexperience"
 *         urls:
 *           type: string
 *           example: "https://example.com,https://maps.google.com/?cid=123456789"
 *         excludeKeywords:
 *           type: string
 *           example: "spam,irrelevant"
 *         accounts:
 *           type: string
 *           example: "competitor1,competitor2"
 *         googleAndTripAdviserUrl:
 *           type: string
 *           example: "https://maps.google.com/?cid=123456789"
 *         selectLanguage:
 *           type: array
 *           items:
 *             type: string
 *           example: ["en", "ar"]
 *         selectLocation:
 *           type: array
 *           items:
 *             type: string
 *           example: ["UAE", "Saudi Arabia"]
 *         selectMonitoring:
 *           type: string
 *           example: "real-time"
 *         selectSource:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Twitter", "Facebook", "GoogleMyBusiness"]
 *         selectIndustry:
 *           type: string
 *           example: "Hospitality"
 *     
 *     UpdateTopicRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: "Updated Customer Experience Analysis"
 *         keywords:
 *           type: string
 *           example: "customer service,satisfaction,feedback"
 *         hashTags:
 *           type: string
 *           example: "#customerexperience|#satisfaction"
 *         urls:
 *           type: string
 *           example: "https://example.com|https://maps.google.com/?cid=123456789"
 *         excludeWords:
 *           type: string
 *           example: "spam,irrelevant"
 *         excludeAccounts:
 *           type: string
 *           example: "competitor1,competitor2"
 *         region:
 *           type: string
 *           example: "Abu Dhabi"
 *         dataSources:
 *           type: string
 *           example: "Twitter,Facebook,GoogleMyBusiness"
 *         dataLocation:
 *           type: string
 *           example: "UAE,Saudi Arabia"
 *         dataLanguage:
 *           type: string
 *           example: "en,ar"
 *         logo:
 *           type: string
 *           example: "logo.png"
 *     
 *     CreateSubTopicRequest:
 *       type: object
 *       required:
 *         - title
 *         - topicId
 *       properties:
 *         title:
 *           type: string
 *           example: "Customer Service"
 *         topicId:
 *           type: integer
 *           example: 123
 *         keywords:
 *           type: string
 *           example: "support,assistance,help"
 *         excludeKeywords:
 *           type: string
 *           example: "unrelated,spam"
 *         accounts:
 *           type: string
 *           example: "competitor1,competitor2"
 *         selectSource:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Twitter", "Facebook"]
 *         selectMonitoring:
 *           type: string
 *           example: "daily"
 *     
 *     CreateTouchpointRequest:
 *       type: object
 *       required:
 *         - title
 *         - subTopic
 *       properties:
 *         title:
 *           type: string
 *           example: "Online Chat Support"
 *         subTopic:
 *           type: integer
 *           example: 45
 *         keywords:
 *           type: string
 *           example: "chat,online support,live help"
 *     
 *     UpdateTopicOrderRequest:
 *       type: object
 *       required:
 *         - topicOrders
 *       properties:
 *         topicOrders:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               topicId:
 *                 type: integer
 *                 example: 123
 *               order:
 *                 type: integer
 *                 example: 2
 *     
 *     Country:
 *       type: object
 *       properties:
 *         country_name:
 *           type: string
 *           example: "United Arab Emirates"
 *     
 *     TopicTotalCount:
 *       type: object
 *       properties:
 *         googleCount:
 *           type: integer
 *           example: 245
 *         socialMediaCount:
 *           type: integer
 *           example: 578
 *         googlePOIs:
 *           type: integer
 *           example: 15
 *         googlePOIsCount:
 *           type: integer
 *           example: 20
 *         socialMediaPOIs:
 *           type: integer
 *           example: 35
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Operation completed successfully"
 *         data:
 *           type: object
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: "An error occurred"
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 example: "title"
 *               message:
 *                 type: string
 *                 example: "Title is required"
 */

module.exports = {}; 