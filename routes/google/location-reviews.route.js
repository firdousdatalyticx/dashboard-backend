const express = require('express');
const router = express.Router();
const googleLocationReviewsController = require('../../controllers/google/location-reviews.controller');
const authMiddleware = require('../../middleware/auth.middleware');

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
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reviews:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       message_text:
 *                         type: string
 *                         description: Review content
 *                       rating:
 *                         type: integer
 *                         description: Star rating (1-5)
 *                         example: 5
 *                       businessResponse:
 *                         type: string
 *                         description: Response from the business to the review
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         description: Date when the review was created
 *                       userFullname:
 *                         type: string
 *                         description: Name of the reviewer
 *                       source:
 *                         type: string
 *                         example: "GoogleMyBusiness"
 *                       uSource:
 *                         type: string
 *                         description: Source URL
 *                       placeId:
 *                         type: string
 *                         description: Google Place ID
 *                       locationName:
 *                         type: string
 *                         description: Name of the location
 *                 total:
 *                   type: integer
 *                   description: Total number of reviews returned
 *                 debug:
 *                   type: object
 *                   description: Debug information
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Internal server error
 */
router.get('/', authMiddleware, googleLocationReviewsController.getLocationReviews);

module.exports = router; 
