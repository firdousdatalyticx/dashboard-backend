/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Social media posts management and retrieval
 *
 * /posts:
 *   get:
 *     summary: Retrieve social media posts
 *     description: |
 *       Fetches social media posts based on multiple filtering criteria. 
 *       Supports complex filtering by topic, source, date range, sentiment, and more.
 *       Requires authentication.
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: topicId
 *         schema:
 *           type: string
 *         description: ID of the topic to filter posts by
 *       - in: query
 *         name: isScadUser
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Whether the request is from a SCAD user
 *       - in: query
 *         name: selectedTab
 *         schema:
 *           type: string
 *         description: Selected tab for filtering (GOOGLE or other)
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Keyword
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: country
 *       - in: query
 *         name: postTypeSource
 *         schema:
 *           type: string
 *         description: |
 *           Source type to filter posts by. Examples:
 *           - "Twitter", "Facebook", "Instagram", "Youtube", "Pinterest", "Reddit", "LinkedIn", "Web"
 *           - "News", "Web" for web content
 *           - "All" for all sources
 *       - in: query
 *         name: postType
 *         schema:
 *           type: string
 *         description: |
 *           Type of post to filter. Examples:
 *           - "allSourcesPosts" - posts from all sources
 *           - "postsByDate" - posts by specific date
 *           - "twitter_dm" - Twitter direct messages
 *           - "Positive", "Negative", "Neutral" - sentiment types
 *       - in: query
 *         name: postTypeData
 *         schema:
 *           type: string
 *         description: |
 *           Additional data for filtering posts by type:
 *           - Date range format: "2023-01-01|2023-01-31"
 *           - "llm_mention_type", "predicted_category" - for LLM and prediction-based filtering
 *           - "llm_mention_touchpoint", "llm_mention_urgency" - for specific LLM-derived filters
 *       - in: query
 *         name: sentiment
 *         schema:
 *           type: string
 *           enum: ["Positive", "Negative", "Neutral"]
 *         description: Sentiment value to filter posts by
 *       - in: query
 *         name: emotion
 *         schema:
 *           type: string
 *           enum: ["Supportive", "Frustration", "Neutral", "Fear"]
 *         description: Sentiment value to filter posts by
 *       - in: query
 *         name: greaterThanTime
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for time range filtering (YYYY-MM-DD)
 *       - in: query
 *         name: lessThanTime
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for time range filtering (YYYY-MM-DD)
 *       - in: query
 *         name: touchId
 *         schema:
 *           type: string
 *         description: ID for touchpoint filtering
 *       - in: query
 *         name: parentAccountId
 *         schema:
 *           type: string
 *         description: Parent account ID for filtering
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *         default: "50"
 *         description: Maximum number of posts to return
 *     responses:
 *       200:
 *         description: Successfully retrieved posts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PostsResponse'
 *       401:
 *         description: Unauthorized - Authentication required
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
 */

// This file works with the Swagger system to document the API
// The actual implementation is in routes/posts.route.js
module.exports = {}; 