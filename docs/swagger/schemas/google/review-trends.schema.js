/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleReviewTrendsRequest:
 *       type: object
 *       properties:
 *         placeId:
 *           type: string
 *           description: Google Maps place ID to filter reviews
 *         startDate:
 *           type: string
 *           description: Start date for review data (ISO format or Elasticsearch date math e.g. 'now-1y/d')
 *           default: now-1y/d
 *         endDate:
 *           type: string
 *           description: End date for review data (ISO format or Elasticsearch date math e.g. 'now/d')
 *           default: now/d
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment type (can be comma-separated for multiple values)
 *           example: "Positive,Negative"
 *       example:
 *         placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4"
 *         startDate: "2023-01-01"
 *         endDate: "2023-12-31"
 *         sentimentType: "Positive"
 *     
 *     GoogleReviewTrendsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           description: Monthly review data
 *           items:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 description: Month in YYYY-MM format
 *                 example: "2023-01"
 *               rating_1:
 *                 type: integer
 *                 description: Count of 1-star reviews
 *                 example: 3
 *               rating_2:
 *                 type: integer
 *                 description: Count of 2-star reviews
 *                 example: 5
 *               rating_3:
 *                 type: integer
 *                 description: Count of 3-star reviews
 *                 example: 12
 *               rating_4:
 *                 type: integer
 *                 description: Count of 4-star reviews
 *                 example: 28
 *               rating_5:
 *                 type: integer
 *                 description: Count of 5-star reviews
 *                 example: 45
 *               total:
 *                 type: integer
 *                 description: Total reviews for this month
 *                 example: 93
 *         total:
 *           type: integer
 *           description: Total number of months in the data
 *           example: 12
 */

module.exports = {}; 