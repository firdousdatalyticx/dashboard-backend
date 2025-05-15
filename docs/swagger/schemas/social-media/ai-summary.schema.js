/**
 * @swagger
 * components:
 *   schemas:
 *     AiSummaryRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           example: "123"
 *           description: ID of the topic to analyze
 *         interval:
 *           type: string
 *           example: "monthly"
 *           description: Time interval for data aggregation (daily, weekly, monthly)
 *           enum: [daily, weekly, monthly]
 *         source:
 *           type: string
 *           example: "All"
 *           description: Social media source to filter by (All, Facebook, Twitter, etc.)
 *         category:
 *           type: string
 *           example: "all"
 *           description: Category to filter by, use 'all' for all categories
 *         chartType:
 *           type: string
 *           example: "emotionAnalysis"
 *           description: Type of analysis to perform
 *           enum: [emotionAnalysis, sentimentAnalysis]
 *     
 *     AiSummaryResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         summary:
 *           type: string
 *           example: "The sentiment analysis of social media posts over the past 3 months shows a predominantly positive trend. There was a notable increase in positive sentiment during March, with customer satisfaction mentions up by 15%..."
 *         chartData:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               p_message:
 *                 type: string
 *                 example: "Great customer service experience today!"
 *               predicted_sentiment_value:
 *                 type: string
 *                 example: "positive"
 *
 *     SaveAiSummaryRequest:
 *       type: object
 *       required:
 *         - topicId
 *         - summaryName
 *         - summaryText
 *       properties:
 *         topicId:
 *           type: string
 *           example: "123"
 *           description: ID of the topic the summary is for
 *         summaryName:
 *           type: string
 *           example: "Q1 Sentiment Overview"
 *           description: Name of the summary for reference
 *         summaryText:
 *           type: string
 *           example: "The sentiment analysis shows a positive trend..."
 *           description: The actual AI-generated summary text
 *         chartData:
 *           type: object
 *           description: Chart data associated with the summary
 *         dashboardType:
 *           type: string
 *           example: "sentimentAnalysis"
 *           description: Type of dashboard this summary is for
 *         fromDate:
 *           type: string
 *           example: "2023-01-01"
 *           description: Start date of data range
 *         toDate:
 *           type: string
 *           example: "2023-03-31"
 *           description: End date of data range
 *
 *     SaveAiSummaryResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "AI summary saved successfully"
 *         data:
 *           type: object
 *           properties:
 *             summary_id:
 *               type: integer
 *               example: 1
 *             summary_name:
 *               type: string
 *               example: "Q1 Sentiment Overview"
 *             topic_user_id:
 *               type: integer
 *               example: 123
 *             summary_text:
 *               type: string
 *               example: "The sentiment analysis shows a positive trend..."
 *             created_at:
 *               type: string
 *               format: date-time
 *               example: "2023-04-01T12:00:00Z"
 *
 *     SavedSummariesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               summary_id:
 *                 type: integer
 *                 example: 1
 *               summary_name:
 *                 type: string
 *                 example: "Q1 Sentiment Overview"
 *               topic_user_id:
 *                 type: integer
 *                 example: 123
 *               topic_name:
 *                 type: string
 *                 example: "Brand Monitoring"
 *               summary_text:
 *                 type: string
 *                 example: "The sentiment analysis shows a positive trend..."
 *               created_at:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-04-01T12:00:00Z"
 *               dashboard_type:
 *                 type: string
 *                 example: "sentimentAnalysis"
 *               from_date:
 *                 type: string
 *                 example: "2023-01-01"
 *               to_date:
 *                 type: string
 *                 example: "2023-03-31"
 */

module.exports = {}; 