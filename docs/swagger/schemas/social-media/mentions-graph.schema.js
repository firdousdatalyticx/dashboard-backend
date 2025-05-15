/**
 * @swagger
 * components:
 *   schemas:
 *     MentionsGraphRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - $ref: '#/components/schemas/SocialMediaFilterOptions'
 *     
 *     MentionsGraphResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaSuccessResponse'
 *         - type: object
 *           properties:
 *             data:
 *               type: object
 *               properties:
 *                 graphData:
 *                   type: array
 *                   description: Time-based data points for the mentions graph
 *                   items:
 *                     type: object
 *                     properties:
 *                       key_as_string:
 *                         type: string
 *                         description: Formatted date/time string
 *                         example: "2023-01-01"
 *                       key:
 *                         type: number
 *                         description: Timestamp in milliseconds
 *                         example: 1672531200000
 *                       doc_count:
 *                         type: number
 *                         description: Number of mentions for this time period
 *                         example: 42
 *                 totalMentions:
 *                   type: number
 *                   description: Total count of mentions
 *                   example: 256
 *                 sources:
 *                   type: object
 *                   description: Breakdown of mentions by source
 *                   additionalProperties:
 *                     type: number
 *                   example:
 *                     Twitter: 125
 *                     Facebook: 98
 *                     Instagram: 33
 *                 sentiments:
 *                   type: object
 *                   description: Breakdown of mentions by sentiment
 *                   properties:
 *                     Positive:
 *                       type: number
 *                       example: 120
 *                     Negative:
 *                       type: number
 *                       example: 75
 *                     Neutral:
 *                       type: number
 *                       example: 61
 */

module.exports = {}; 