/**
 * @swagger
 * components:
 *   schemas:
 *     ElasticMentionsRequest:
 *       type: object
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to search mentions for
 *           example: "topic123"
 *         timeSlot:
 *           type: string
 *           description: Predefined time slot or 'Custom Dates'
 *           enum: [today, 24h, 7, 30, 90, Custom Dates]
 *           example: "7"
 *         startDate:
 *           type: string
 *           format: date
 *           description: Start date for custom date range (when timeSlot is 'Custom Dates')
 *           example: "2023-01-01"
 *         endDate:
 *           type: string
 *           format: date
 *           description: End date for custom date range (when timeSlot is 'Custom Dates')
 *           example: "2023-01-31"
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment values, comma-separated
 *           example: "Positive,Neutral"
 *     
 *     ElasticMentionsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         data:
 *           type: object
 *           description: Elasticsearch response data
 *           properties:
 *             took:
 *               type: integer
 *               description: Time in milliseconds for Elasticsearch to execute the search
 *               example: 42
 *             timed_out:
 *               type: boolean
 *               description: Whether the search request timed out
 *               example: false
 *             _shards:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 successful:
 *                   type: integer
 *                   example: 5
 *                 skipped:
 *                   type: integer
 *                   example: 0
 *                 failed:
 *                   type: integer
 *                   example: 0
 *             hits:
 *               type: object
 *               properties:
 *                 total:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: integer
 *                       description: Total number of matching documents
 *                       example: 125
 *                     relation:
 *                       type: string
 *                       description: Relation of the total count
 *                       example: "eq"
 *                 max_score:
 *                   type: number
 *                   nullable: true
 *                   example: null
 *                 hits:
 *                   type: array
 *                   description: Array of matching documents
 *                   items:
 *                     type: object
 *                     properties:
 *                       _index:
 *                         type: string
 *                         description: Index name
 *                         example: "social_mentions"
 *                       _id:
 *                         type: string
 *                         description: Document ID
 *                         example: "doc123"
 *                       _score:
 *                         type: number
 *                         description: Document relevance score
 *                         example: 1.0
 *                       _source:
 *                         type: object
 *                         description: Document source data
 *                         properties:
 *                           source:
 *                             type: string
 *                             description: Source of the mention
 *                             example: "Twitter"
 *                           predicted_sentiment_value:
 *                             type: string
 *                             description: Predicted sentiment of the mention
 *                             example: "Positive"
 *                           llm_mention_action:
 *                             type: string
 *                             description: Mention action classified by LLM
 *                             example: "Praise"
 *                           llm_mention_type:
 *                             type: string
 *                             description: Type of mention classified by LLM
 *                             example: "Product Review"
 *                           llm_mention_tone:
 *                             type: string
 *                             description: Tone of the mention classified by LLM
 *                             example: "Enthusiastic"
 *                           llm_mention_recurrence:
 *                             type: string
 *                             description: Recurrence pattern of the mention
 *                             example: "First Time"
 *                           p_engagement:
 *                             type: integer
 *                             description: Total engagement count
 *                             example: 42
 *                           p_likes:
 *                             type: integer
 *                             description: Number of likes
 *                             example: 25
 *                           p_comments:
 *                             type: integer
 *                             description: Number of comments
 *                             example: 12
 *                           p_shares:
 *                             type: integer
 *                             description: Number of shares
 *                             example: 5
 *                           day_of_week:
 *                             type: string
 *                             description: Day of the week when the mention was created
 *                             example: "Monday"
 *                           u_followers:
 *                             type: integer
 *                             description: Number of followers of the user who created the mention
 *                             example: 1500
 *                           p_created_time:
 *                             type: string
 *                             format: date-time
 *                             description: Creation time of the mention
 *                             example: "2023-01-15T14:30:00Z"
 *                           llm_mention_urgency:
 *                             type: string
 *                             description: Urgency level of the mention
 *                             example: "Medium"
 *                           llm_mention_touchpoint:
 *                             type: string
 *                             description: Customer touchpoint of the mention
 *                             example: "Customer Service"
 *                           p_message:
 *                             type: string
 *                             description: Content of the mention
 *                             example: "Loving the new features in the latest update!"
 *                           u_country:
 *                             type: string
 *                             description: Country of the user
 *                             example: "United States"
 *                           query_hashtag:
 *                             type: string
 *                             description: Hashtag that matched the query
 *                             example: "#productname"
 *                           llm_emotion:
 *                             type: string
 *                             description: Emotion detected in the mention
 *                             example: "Joy"
 *                           rating:
 *                             type: number
 *                             description: Rating associated with the mention
 *                             example: 4.5
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Creation time of the record
 *                             example: "2023-01-15T14:30:05Z"
 *                           llm_mention_audience:
 *                             type: string
 *                             description: Target audience of the mention
 *                             example: "Consumers"
 *                           llm_language:
 *                             type: string
 *                             description: Language of the mention
 *                             example: "English"
 *                           llm_positive_points:
 *                             type: array
 *                             description: Positive points identified in the mention
 *                             items:
 *                               type: string
 *                               example: "Great customer service"
 *                           llm_negative_points:
 *                             type: array
 *                             description: Negative points identified in the mention
 *                             items:
 *                               type: string
 *                               example: "Slow loading times"
 */

module.exports = {}; 