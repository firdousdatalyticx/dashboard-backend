/**
 * @swagger
 * components:
 *   schemas:
 *     AudienceActiveRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *         - type: object
 *           properties:
 *             records:
 *               type: string
 *               description: Number of records to return
 *               example: "20"
 *       example:
 *         topicId: "254"
 *         timeSlot: "last7days"
 *         sentimentType: "positive"
 *         fromDate: "2023-01-01"
 *         toDate: "2023-01-31"
 *         records: "20"
 *     
 *     AudienceActiveResponse:
 *       type: object
 *       properties:
 *         data_array:
 *           type: array
 *           description: List of active audience members
 *           items:
 *             type: object
 *             properties:
 *               profile_image:
 *                 type: string
 *                 description: URL to user's profile image
 *                 example: "https://example.com/profile.jpg"
 *               fullname:
 *                 type: string
 *                 description: User's full name or handle
 *                 example: "John Smith"
 *               source:
 *                 type: string
 *                 description: Source information (platform and icon)
 *                 example: "Twitter,Twitter"
 *               country:
 *                 type: string
 *                 description: Country flag or code for the user
 *                 example: "US"
 *               followers:
 *                 type: string
 *                 description: Number of followers as a string
 *                 example: "1250"
 *               posts:
 *                 type: string
 *                 description: Number of posts as a string
 *                 example: "42"
 *     
 *     AudienceCountryRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/SocialMediaBaseRequest'
 *       example:
 *         topicId: "254"
 *         timeSlot: "last7days"
 *         sentimentType: "positive"
 *         fromDate: "2023-01-01"
 *         toDate: "2023-01-31"
 *     
 *     AudienceCountryResponse:
 *       type: object
 *       properties:
 *         responseArray:
 *           type: array
 *           description: Distribution of audience by country
 *           items:
 *             type: object
 *             properties:
 *               key_count:
 *                 type: integer
 *                 description: Number of audience members from this country
 *                 example: 156
 *               country_name:
 *                 type: string
 *                 description: Name of the country
 *                 example: "United States"
 */

module.exports = {}; 