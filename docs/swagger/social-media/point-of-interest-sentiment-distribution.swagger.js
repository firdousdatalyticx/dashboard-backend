/**
 * @swagger
 * /social-media/poi-sentiment-distribution:
 *   post:
 *     summary: Get point of interest sentiment distribution
 *     description: Retrieves sentiment distribution for each category in a topic
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicId
 *             properties:
 *               topicId:
 *                 type: string
 *                 description: ID of the topic to analyze
 *           example:
 *             topicId: "254"
 *     responses:
 *       200:
 *         description: Successfully retrieved sentiment distribution data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 distribution:
 *                   type: array
 *                   description: Sentiment distribution for each category
 *                   items:
 *                     type: object
 *                     properties:
 *                       poi:
 *                         type: string
 *                         description: Name of the category or point of interest
 *                         example: "Product"
 *                       sentiments:
 *                         type: array
 *                         description: Breakdown by sentiment
 *                         items:
 *                           type: object
 *                           properties:
 *                             sentiment:
 *                               type: string
 *                               description: Sentiment category
 *                               enum: [Positive, Negative, Neutral]
 *                               example: "Positive"
 *                             count:
 *                               type: integer
 *                               description: Number of mentions with this sentiment
 *                               example: 124
 *                             docs:
 *                               type: array
 *                               description: Sample documents with this sentiment
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                     description: Document ID
 *                                     example: "123456"
 *                                   title:
 *                                     type: string
 *                                     description: Document title
 *                                     example: "Great experience with the product"
 *                                   content:
 *                                     type: string
 *                                     description: Document content
 *                                     example: "I had a great experience with this product..."
 *                                   created_at:
 *                                     type: string
 *                                     format: date-time
 *                                     description: Document creation date
 *                                     example: "2023-06-15T14:32:17Z"
 *                                   predicted_sentiment_value:
 *                                     type: string
 *                                     description: Predicted sentiment
 *                                     example: "Positive"
 *                                   p_message:
 *                                     type: string
 *                                     description: Post message content
 *                                     example: "I had a great experience with this product..."
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */ 