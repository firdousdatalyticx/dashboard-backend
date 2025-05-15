/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - id
 *         - username
 *         - email
 *       properties:
 *         id:
 *           type: integer
 *           description: The user ID
 *           example: 1
 *         username:
 *           type: string
 *           description: The user's username
 *           example: john_doe
 *         email:
 *           type: string
 *           description: The user's email
 *           example: john.doe@example.com
 *         fullName:
 *           type: string
 *           description: The user's full name
 *           example: John Doe
 *         role:
 *           type: string
 *           description: The user's role
 *           example: admin
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The time when the user was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The time when the user was last updated
 *       example:
 *         id: 1
 *         username: john_doe
 *         email: john.doe@example.com
 *         fullName: John Doe
 *         role: admin
 *         createdAt: 2023-01-01T00:00:00.000Z
 *         updatedAt: 2023-01-01T00:00:00.000Z
 *     UserResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         data:
 *           $ref: '#/components/schemas/User'
 *     UsersResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *     Error:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation failure status
 *           example: false
 *         error:
 *           type: string
 *           description: Error message
 *           example: User not found
 */

module.exports = {}; 