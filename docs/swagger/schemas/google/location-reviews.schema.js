/**
 * @swagger
 * components:
 *   schemas:
 *     GoogleLocationReview:
 *       type: object
 *       properties:
 *         message_text:
 *           type: string
 *           description: Review content
 *           example: "Great service! Very satisfied with my visit."
 *         rating:
 *           type: integer
 *           description: Star rating (1-5)
 *           example: 5
 *         businessResponse:
 *           type: string
 *           description: Response from the business to the review
 *           nullable: true
 *           example: "Thank you for your feedback! We appreciate your business."
 *         createdAt:
 *           type: string
 *           description: Date when the review was created
 *           example: "2023-05-15T12:30:00Z"
 *         userFullname:
 *           type: string
 *           description: Name of the reviewer
 *           example: "John Smith"
 *         source:
 *           type: string
 *           description: Source of the review
 *           example: "GoogleMyBusiness"
 *         uSource:
 *           type: string
 *           description: Source URL
 *           example: "https://www.google.com/maps/place/data=!3m1!4b1!4m2!3m1!1s0x3e8abb652883d07d:0x918d9c430f68a366"
 *         placeId:
 *           type: string
 *           description: Google Place ID
 *           example: "ChIJN1t_tDeuEmsRUsoyG83frY4"
 *         locationName:
 *           type: string
 *           description: Name of the location
 *           example: "Bank Branch - Main Street"
 *           
 *     GoogleLocationReviewsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         reviews:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GoogleLocationReview'
 *         total:
 *           type: integer
 *           description: Total number of reviews returned
 *           example: 42
 *         debug:
 *           type: object
 *           properties:
 *             totalHits:
 *               type: integer
 *               description: Total number of hits in Elasticsearch
 *               example: 42
 *             dateRange:
 *               type: object
 *               properties:
 *                 greaterThanTime:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-02-15T00:00:00Z"
 *                 lessThanTime:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-05-15T23:59:59Z"
 *             placeId:
 *               type: string
 *               example: "ChIJN1t_tDeuEmsRUsoyG83frY4"
 */ 