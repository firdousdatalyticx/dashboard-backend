/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email
 *           example: user@example.com
 *         password:
 *           type: string
 *           format: password
 *           description: User's password
 *           example: password123
 *     
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           description: User's full name
 *           example: John Doe
 *         email:
 *           type: string
 *           format: email
 *           description: User's email
 *           example: user@example.com
 *         password:
 *           type: string
 *           format: password
 *           description: User's password (min 6 characters)
 *           example: password123
 *         companyName:
 *           type: string
 *           description: User's company name
 *           example: ACME Corp
 *         phone:
 *           type: string
 *           description: User's phone number
 *           example: +1234567890
 *     
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: User ID
 *           example: 1
 *         name:
 *           type: string
 *           description: User's name
 *           example: John Doe
 *         email:
 *           type: string
 *           description: User's email
 *           example: user@example.com
 *         company:
 *           type: string
 *           description: User's company
 *           example: ACME Corp
 *         scope:
 *           type: string
 *           description: User's registration scope
 *           example: FR
 *         accountType:
 *           type: boolean
 *           description: User's account type
 *           example: false
 *         allowedTopics:
 *           type: integer
 *           description: Number of topics user is allowed to create
 *           example: 5
 *         allowedInvitations:
 *           type: integer
 *           description: Number of invitations user is allowed to send
 *           example: 10
 *         layoutSettings:
 *           type: object
 *           description: User's layout settings
 *     
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         token:
 *           type: string
 *           description: JWT authentication token
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         user:
 *           $ref: '#/components/schemas/UserProfile'
 *     
 *     CurrentUserResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         user:
 *           $ref: '#/components/schemas/UserProfile'
 *
 *     ValidationError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation failure status
 *           example: false
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 description: Field with validation error
 *                 example: email
 *               message:
 *                 type: string
 *                 description: Error message
 *                 example: Please provide a valid email
 */

module.exports = {}; 