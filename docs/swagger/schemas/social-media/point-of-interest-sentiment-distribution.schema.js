/**
 * @swagger
 * components:
 *   schemas:
 *     PoiSentimentDistributionRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *       example:
 *         topicId: "254"
 *     
 *     PoiSentimentDistributionResponse:
 *       type: object
 *       properties:
 *         distribution:
 *           type: array
 *           description: Sentiment distribution for each category
 *           items:
 *             type: object
 *             properties:
 *               poi:
 *                 type: string
 *                 description: Name of the category or point of interest
 *                 example: "Product"
 *               sentiments:
 *                 type: array
 *                 description: Breakdown by sentiment
 *                 items:
 *                   type: object
 *                   properties:
 *                     sentiment:
 *                       type: string
 *                       description: Sentiment category
 *                       enum: [Positive, Negative, Neutral]
 *                       example: "Positive"
 *                     count:
 *                       type: integer
 *                       description: Number of mentions with this sentiment
 *                       example: 124
 *                     docs:
 *                       type: array
 *                       description: Sample documents with this sentiment
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Document ID
 *                             example: "123456"
 *                           title:
 *                             type: string
 *                             description: Document title
 *                             example: "Great experience with the product"
 *                           content:
 *                             type: string
 *                             description: Document content
 *                             example: "I had a great experience with this product..."
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Document creation date
 *                             example: "2023-06-15T14:32:17Z"
 *                           predicted_sentiment_value:
 *                             type: string
 *                             description: Predicted sentiment
 *                             example: "Positive"
 *                           p_message:
 *                             type: string
 *                             description: Post message content
 *                             example: "I had a great experience with this product..."
 */

module.exports = {}; 