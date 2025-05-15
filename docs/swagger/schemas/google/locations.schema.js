/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleLocationsRequest:
 *       type: object
 *       required:
 *         - topicId
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to analyze
 *         fromDate:
 *           type: string
 *           format: date
 *           description: Start date for filtering (optional)
 *         toDate:
 *           type: string
 *           format: date
 *           description: End date for filtering (optional)
 *         sentimentType:
 *           type: string
 *           description: Filter by sentiment type (can be comma-separated for multiple values)
 *           example: "Positive,Negative"
 *       example:
 *         topicId: "254"
 *         fromDate: "2023-01-01"
 *         toDate: "2023-12-31"
 *
 *     GoogleLocation:
 *       type: object
 *       properties:
 *         location:
 *           type: string
 *           description: Name of the location
 *           example: "Abu Dhabi Mall"
 *         latitude:
 *           type: number
 *           format: float
 *           description: Latitude coordinate
 *           example: 24.4865
 *         longitude:
 *           type: number
 *           format: float
 *           description: Longitude coordinate
 *           example: 54.3783
 *         placeId:
 *           type: string
 *           description: Google Maps place ID
 *           example: "ChIJN1t_tDeuEmsRUsoyG83frY4"
 *         u_source:
 *           type: string
 *           description: URL source
 *           example: "https://maps.google.com/?cid=12345678901234567890"
 *         avgRating:
 *           type: number
 *           format: float
 *           description: Average rating
 *           example: 4.3
 *         count:
 *           type: integer
 *           description: Total number of reviews
 *           example: 245
 *         stats:
 *           type: object
 *           properties:
 *             min:
 *               type: number
 *               description: Minimum rating
 *               example: 1
 *             max:
 *               type: number
 *               description: Maximum rating
 *               example: 5
 *             avg:
 *               type: number
 *               description: Average rating
 *               example: 4.3
 *             count:
 *               type: integer
 *               description: Total number of reviews
 *               example: 245
 *         recentStats:
 *           type: object
 *           properties:
 *             count:
 *               type: integer
 *               description: Number of recent reviews
 *               example: 42
 *             avgRating:
 *               type: number
 *               description: Average rating for recent reviews
 *               example: 4.5
 *         google_maps_category:
 *           type: string
 *           description: Category of the business
 *           example: "Shopping mall"
 *         google_maps_full_address:
 *           type: string
 *           description: Full address
 *           example: "Abu Dhabi Mall, Tourist Club Area, Abu Dhabi, United Arab Emirates"
 *     
 *     GoogleLocationsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         locations:
 *           type: array
 *           description: List of Google Maps locations
 *           items:
 *             $ref: '#/components/schemas/GoogleLocation'
 */

module.exports = {}; 