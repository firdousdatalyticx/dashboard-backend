/**
 * @swagger
 * components:
 *   schemas:
 *     ReportsUtilityFunctions:
 *       type: object
 *       description: |
 *         Documentation of utility functions used in the reports controllers.
 *         These functions are not directly exposed as API endpoints but are
 *         important for understanding the implementation.
 *       properties:
 *         dateDifference:
 *           type: object
 *           description: |
 *             Calculates the difference in days between two dates.
 *             Input:
 *               - endDate: string - End date in YYYY-MM-DD format
 *               - startDate: string - Start date in YYYY-MM-DD format
 *             Output: number - Number of days difference
 *         
 *         buildQueryString:
 *           type: object
 *           description: |
 *             Builds a query string for Elasticsearch based on a topic ID.
 *             Input:
 *               - topicId: string - ID of the topic to search for
 *               - isStrict: boolean - Whether to use strict matching
 *               - dataType: string - Type of data to query (e.g., "SOCIAL")
 *             Output: string - Elasticsearch query string
 *             
 *             The function constructs a query string that includes topic-specific
 *             search terms and handles different data sources based on the dataType.
 *     
 *     ElasticsearchQueryParams:
 *       type: object
 *       description: Parameters for an Elasticsearch query
 *       properties:
 *         from:
 *           type: integer
 *           description: Offset for pagination
 *           example: 0
 *         size:
 *           type: integer
 *           description: Number of results to return
 *           example: 1000
 *         _source:
 *           type: array
 *           description: Fields to include in the response
 *           items:
 *             type: string
 *           example: ["source", "predicted_sentiment_value", "p_message"]
 *         query:
 *           type: object
 *           description: Query definition
 *           properties:
 *             bool:
 *               type: object
 *               properties:
 *                 must:
 *                   type: array
 *                   description: Conditions that must match
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         properties:
 *                           query_string:
 *                             type: object
 *                             properties:
 *                               query:
 *                                 type: string
 *                                 example: "topic:myTopic AND source:(\"Twitter\")"
 *                       - type: object
 *                         properties:
 *                           range:
 *                             type: object
 *                             properties:
 *                               p_created_time:
 *                                 type: object
 *                                 properties:
 *                                   gte:
 *                                     type: string
 *                                     example: "2023-01-01"
 *                                   lte:
 *                                     type: string
 *                                     example: "2023-01-31"
 *         sort:
 *           type: array
 *           description: Sort order for results
 *           items:
 *             type: object
 *           example: [{ "p_created_time": { "order": "desc" } }]
 */

module.exports = {}; 