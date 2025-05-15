/**
 * @swagger
 * components:
 *   schemas:
 *     ElasticsearchQuery:
 *       type: object
 *       properties:
 *         from:
 *           type: integer
 *           description: Offset for pagination
 *           example: 0
 *         size:
 *           type: integer
 *           description: Number of results to return
 *           example: 50
 *         query:
 *           type: object
 *           properties:
 *             bool:
 *               type: object
 *               properties:
 *                 must:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         properties:
 *                           query_string:
 *                             type: object
 *                             properties:
 *                               query:
 *                                 type: string
 *                                 example: "source:(\"Twitter\") AND predicted_sentiment_value:(\"Positive\")"
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
 *           items:
 *             type: object
 *             example: { "p_created_time": { "order": "desc" } }
 *     
 *     PostsUtilityFunctions:
 *       type: object
 *       description: |
 *         Documentation of utility functions used in the posts controller.
 *         These functions are not directly exposed as API endpoints but are
 *         important for understanding the implementation.
 *       properties:
 *         formatSafeDate:
 *           type: object
 *           description: |
 *             Formats a date to a safe format for Elasticsearch.
 *             Input: string|Date - Date to format
 *             Output: string - Formatted date string (yyyy-MM-dd)
 *         mapSourceName:
 *           type: object
 *           description: |
 *             Maps a source name to its Elasticsearch equivalent.
 *             Input: string - Source name
 *             Output: string - Mapped source name
 *             Examples:
 *             - "Google" → "GoogleMyBusiness"
 *             - "X" → "Twitter"
 *         buildElasticsearchQuery:
 *           type: object
 *           description: |
 *             Builds a query for Elasticsearch based on parameters.
 *             Input: Object with filter parameters
 *             Output: Elasticsearch query object
 *             The function handles:
 *             - Source filtering (social media, news, web)
 *             - Sentiment filtering
 *             - Type-specific filtering (post types, emotions)
 *             - Date range filtering
 *             - Special cases (Twitter DMs, Google Maps, etc.)
 *         formatPostData:
 *           type: object
 *           description: |
 *             Processes Elasticsearch result and formats it for the frontend.
 *             Input: Elasticsearch hit object
 *             Output: Formatted post data object with user-friendly fields
 *             The function:
 *             - Formats profile pictures and user data
 *             - Processes metrics (followers, likes, etc.)
 *             - Handles special cases for different sources
 *             - Formats content for display
 */

module.exports = {}; 