/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: false
 *         message:
 *           type: string
 *           description: Error message
 *           example: "An error occurred while processing your request"
 *         error:
 *           type: object
 *           description: Detailed error information (when available)
 *           properties:
 *             code:
 *               type: string
 *               description: Error code
 *               example: "INVALID_INPUT"
 *             details:
 *               type: string
 *               description: Additional error details
 *               example: "Invalid date format provided"
 *     
 *     ValidationError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: false
 *         message:
 *           type: string
 *           description: Error message
 *           example: "Validation error"
 *         errors:
 *           type: array
 *           description: Validation errors
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 description: The field that failed validation
 *                 example: "fromDate"
 *               message:
 *                 type: string
 *                 description: The validation error message
 *                 example: "Invalid date format. Expected yyyy-MM-dd"
 *     
 *     AuthenticationError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: false
 *         message:
 *           type: string
 *           description: Error message
 *           example: "Authentication failed"
 *         error:
 *           type: string
 *           description: Detailed error information
 *           example: "Invalid or expired token"
 */

module.exports = {}; 