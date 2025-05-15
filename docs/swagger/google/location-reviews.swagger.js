/**
 * @swagger
 * tags:
 *   name: Google Reviews
 *   description: Endpoints for working with Google My Business reviews
 */

/**
 * @swagger
 * /google/location-reviews:
 *   get:
 *     summary: Get reviews for a specific Google location
 *     description: Retrieves Google My Business reviews for a specific location by placeId
 *     tags: [Google Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Google Place ID of the location
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for filtering reviews (ISO format). Default is 90 days ago
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for filtering reviews (ISO format). Default is current date
 *       - in: query
 *         name: rating
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4, 5]
 *         description: Filter reviews by specific rating (1-5)
 *     responses:
 *       200:
 *         description: List of Google reviews for the specified location
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoogleLocationReviewsResponse'
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Internal server error
 */ 