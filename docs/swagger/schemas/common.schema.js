/**
 * @swagger
 * components:
 *   schemas:
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
 *           example: Internal server error
 *     
 *     AuthError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation failure status
 *           example: false
 *         error:
 *           type: string
 *           description: Authentication error message
 *           example: No token provided, authorization denied
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: Operation completed successfully
 *
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total number of items
 *           example: 100
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *           example: 10
 *         page:
 *           type: integer
 *           description: Current page number
 *           example: 1
 *         pages:
 *           type: integer
 *           description: Total number of pages
 *           example: 10
 */

module.exports = {}; 