/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleReviewRatingsRequest:
 *       type: object
 *       required:
 *         - id
 *       properties:
 *         id:
 *           type: string
 *           description: ID of the topic to analyze
 *           example: "254"
 *         subtopicId:
 *           type: string
 *           description: ID of the subtopic to filter by
 *           example: "45"
 *         touchId:
 *           type: string
 *           description: ID of the touchpoint to filter by
 *           example: "12"
 *         filterData:
 *           type: string
 *           description: URL-encoded JSON string containing filter parameters
 *           example: "%7B%22timeSlot%22%3A%2290%22%2C%22dataSource%22%3A%22GoogleMyBusiness%22%2C%22sentimentType%22%3A%22Positive%22%7D"
 *         filters:
 *           type: string
 *           enum: ['true', 'false']
 *           description: Flag indicating if filters should be applied
 *           example: "true"
 *       example:
 *         id: "254"
 *         filters: "true"
 *         filterData: "%7B%22timeSlot%22%3A%2290%22%2C%22dataSource%22%3A%22GoogleMyBusiness%22%7D"
 *     
 *     GoogleReviewRatingsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         esData:
 *           type: object
 *           properties:
 *             hits:
 *               type: object
 *               properties:
 *                 total:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: integer
 *                       example: 357
 *                     relation:
 *                       type: string
 *                       example: "eq"
 *                 hits:
 *                   type: array
 *                   items:
 *                     type: object
 *             aggregations:
 *               type: object
 *               properties:
 *                 rating_counts:
 *                   type: object
 *                   properties:
 *                     buckets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: number
 *                             example: 5
 *                           doc_count:
 *                             type: integer
 *                             example: 214
 */

module.exports = {}; 