/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: |
 *         Authentication using JWT tokens.
 *         
 *         All authenticated endpoints use the `authMiddleware` which:
 *         1. Extracts the Bearer token from the Authorization header
 *         2. Verifies the token using JWT verification
 *         3. Finds the user in the database based on the token's decoded user ID
 *         4. Attaches the user object to the request for use in controllers
 *         
 *         The middleware handles various authentication errors:
 *         - Missing token
 *         - Invalid token
 *         - Expired token
 *         - User not found
 *
 *   schemas:
 *     MiddlewareError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation failure status
 *           example: false
 *         error:
 *           type: string
 *           description: Error message
 *           example: Failed to process categories
 *
 * tags:
 *   - name: Middleware
 *     description: Application middleware documentation
 *     externalDocs:
 *       description: Learn more about our middleware
 *       url: #
 */

/**
 * @swagger
 * /docs/middleware/auth:
 *   get:
 *     summary: Authentication Middleware Documentation
 *     description: |
 *       **This endpoint doesn't exist - it's just documentation for the auth middleware.**
 *       
 *       The auth middleware (`authMiddleware`) is applied to protect routes that require authentication.
 *       
 *       ### Functionality:
 *       1. Extracts the JWT token from the Authorization header
 *       2. Verifies the token validity and expiration
 *       3. Retrieves the corresponding user from the database
 *       4. Attaches the user information to the request object
 *       
 *       ### Expected Request Headers:
 *       ```
 *       Authorization: Bearer <jwt_token>
 *       ```
 *       
 *       ### Possible Errors:
 *       - 401: No token provided
 *       - 401: Invalid token
 *       - 401: Token expired
 *       - 401: User not found
 *       - 500: Server error
 *     tags: [Middleware]
 *     responses:
 *       401:
 *         description: Authentication errors
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /docs/middleware/category-transform:
 *   get:
 *     summary: Category Transform Middleware Documentation
 *     description: |
 *       **This endpoint doesn't exist - it's just documentation for the category transform middleware.**
 *       
 *       The category transform middleware (`transformCategoryData`) processes and transforms category data
 *       for specific routes, particularly for topic categories.
 *       
 *       ### Functionality:
 *       1. Retrieves the topicId from request params or body
 *       2. Fetches all categories associated with the topic from the database
 *       3. Transforms the raw database format into a structured format with:
 *          - hashtags as arrays
 *          - keywords as arrays
 *          - URLs as arrays
 *       4. Attaches both the processed data (`req.processedCategories`) and raw data (`req.rawCategories`) to the request
 *       
 *       ### Input:
 *       The middleware expects `topicId` in the request parameters or body
 *       
 *       ### Output:
 *       Attaches to the request:
 *       - `req.processedCategories`: Object with category names as keys and structured data
 *       - `req.rawCategories`: Raw database records
 *       
 *       ### Example Processed Format:
 *       ```json
 *       {
 *         "Technology": {
 *           "hashtags": ["#innovation", "#technology"],
 *           "keywords": ["product launch", "AI"],
 *           "urls": ["https://example.com/tech1", "https://example.com/tech2"]
 *         },
 *         "Marketing": {
 *           "hashtags": ["#digital", "#campaign"],
 *           "keywords": ["marketing strategy", "brand awareness"],
 *           "urls": ["https://example.com/market1"]
 *         }
 *       }
 *       ```
 *       
 *       ### Possible Errors:
 *       - 500: Failed to process categories
 *     tags: [Middleware]
 *     responses:
 *       500:
 *         description: Error processing categories
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MiddlewareError'
 */

// This file provides documentation for middleware components
module.exports = {}; 