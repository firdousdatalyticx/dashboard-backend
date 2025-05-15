/**
 * @swagger
 * components:
 *   schemas:
 *     CategoryData:
 *       type: object
 *       properties:
 *         hashtags:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of hashtags related to the category
 *           example: ["#innovation", "#technology"]
 *         keywords:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of keywords related to the category
 *           example: ["product launch", "AI"]
 *         urls:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of URLs related to the category
 *           example: ["https://example.com/page1", "https://example.com/page2"]
 *     
 *     CategoryRequest:
 *       type: object
 *       required:
 *         - categories
 *         - topicId
 *       properties:
 *         topicId:
 *           type: integer
 *           description: ID of the topic to associate categories with
 *           example: 123
 *         categories:
 *           type: array
 *           items:
 *             type: object
 *             additionalProperties:
 *               type: object
 *               properties:
 *                 hashtags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["#innovation", "#technology"]
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["product launch", "AI"]
 *                 urls:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://example.com/page1", "https://example.com/page2"]
 *           description: Array of category objects where key is the category title
 *           example: 
 *             - Technology:
 *                 hashtags: ["#innovation", "#technology"]
 *                 keywords: ["product launch", "AI"]
 *                 urls: ["https://example.com/tech1", "https://example.com/tech2"]
 *             - Marketing:
 *                 hashtags: ["#digital", "#campaign"]
 *                 keywords: ["marketing strategy", "brand awareness"]
 *                 urls: ["https://example.com/market1"]
 * 
 *     CategoryUpdateRequest:
 *       type: object
 *       properties:
 *         category_title:
 *           type: string
 *           description: Title of the category
 *           example: Technology
 *         topic_hash_tags:
 *           type: string
 *           description: Comma-separated list of hashtags
 *           example: "#innovation, #technology"
 *         topic_keywords:
 *           type: string
 *           description: Comma-separated list of keywords
 *           example: "product launch, AI"
 *         topic_urls:
 *           type: string
 *           description: Comma-separated list of URLs
 *           example: "https://example.com/tech1, https://example.com/tech2"
 * 
 *     CategoryResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Category ID
 *           example: 1
 *         customer_topic_id:
 *           type: integer
 *           description: ID of the associated topic
 *           example: 123
 *         category_title:
 *           type: string
 *           description: Title of the category
 *           example: Technology
 *         topic_hash_tags:
 *           type: string
 *           description: Comma-separated list of hashtags
 *           example: "#innovation, #technology"
 *         topic_keywords:
 *           type: string
 *           description: Comma-separated list of keywords
 *           example: "product launch, AI"
 *         topic_urls:
 *           type: string
 *           description: Comma-separated list of URLs
 *           example: "https://example.com/tech1, https://example.com/tech2"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: When the category was created
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: When the category was last updated
 * 
 *     CategoriesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         data:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/CategoryData'
 *           example:
 *             Technology:
 *               hashtags: ["#innovation", "#technology"]
 *               keywords: ["product launch", "AI"]
 *               urls: ["https://example.com/tech1", "https://example.com/tech2"]
 *             Marketing:
 *               hashtags: ["#digital", "#campaign"]
 *               keywords: ["marketing strategy", "brand awareness"]
 *               urls: ["https://example.com/market1"]
 * 
 *     CategoryCheckResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         exists:
 *           type: boolean
 *           description: Whether the category exists for the topic
 *           example: true
 *         category:
 *           $ref: '#/components/schemas/CategoryResponse'
 */

module.exports = {}; 