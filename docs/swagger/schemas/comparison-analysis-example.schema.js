/**
 * @swagger
 * components:
 *   schemas:
 *     ComparisonReportDataExample:
 *       type: object
 *       description: Example of the complex data structure stored in the report_data field
 *       properties:
 *         overallSentiment:
 *           type: object
 *           description: Overall sentiment comparison between the two topics
 *           properties:
 *             topic1:
 *               type: object
 *               properties:
 *                 Positive:
 *                   type: number
 *                   example: 62.5
 *                 Negative:
 *                   type: number
 *                   example: 25.0
 *                 Neutral:
 *                   type: number
 *                   example: 12.5
 *             topic2:
 *               type: object
 *               properties:
 *                 Positive:
 *                   type: number
 *                   example: 48.3
 *                 Negative:
 *                   type: number
 *                   example: 31.7
 *                 Neutral:
 *                   type: number
 *                   example: 20.0
 *         
 *         emotionAnalysis:
 *           type: object
 *           description: Emotion analysis comparison between the two topics
 *           properties:
 *             topic1:
 *               type: object
 *               properties:
 *                 joy:
 *                   type: number
 *                   example: 45.2
 *                 sadness:
 *                   type: number
 *                   example: 12.8
 *                 anger:
 *                   type: number
 *                   example: 15.3
 *                 fear:
 *                   type: number
 *                   example: 8.7
 *                 surprise:
 *                   type: number
 *                   example: 18.0
 *             topic2:
 *               type: object
 *               properties:
 *                 joy:
 *                   type: number
 *                   example: 32.1
 *                 sadness:
 *                   type: number
 *                   example: 18.5
 *                 anger:
 *                   type: number
 *                   example: 22.7
 *                 fear:
 *                   type: number
 *                   example: 14.2
 *                 surprise:
 *                   type: number
 *                   example: 12.5
 *                 
 *         mentionsOverTime:
 *           type: array
 *           description: Time series data showing mentions over time for both topics
 *           items:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2023-01-15"
 *               topic1Count:
 *                 type: number
 *                 example: 145
 *               topic2Count:
 *                 type: number
 *                 example: 87
 *               
 *         topSources:
 *           type: object
 *           description: Top sources of mentions for each topic
 *           properties:
 *             topic1:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   source:
 *                     type: string
 *                     example: "Twitter"
 *                   count:
 *                     type: number
 *                     example: 235
 *                   percentage:
 *                     type: number
 *                     example: 42.3
 *             topic2:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   source:
 *                     type: string
 *                     example: "Facebook"
 *                   count:
 *                     type: number
 *                     example: 187
 *                   percentage:
 *                     type: number
 *                     example: 38.9
 *                     
 *         keywordComparison:
 *           type: array
 *           description: Comparison of top keywords for each topic
 *           items:
 *             type: object
 *             properties:
 *               keyword:
 *                 type: string
 *                 example: "service"
 *               topic1Count:
 *                 type: number
 *                 example: 78
 *               topic2Count:
 *                 type: number
 *                 example: 45
 *               topic1Percentage:
 *                 type: number
 *                 example: 14.2
 *               topic2Percentage:
 *                 type: number
 *                 example: 9.3
 */

module.exports = {}; 