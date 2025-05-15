/**
 * @swagger
 * components:
 *   schemas:
 *     PostQueryParams:
 *       type: object
 *       properties:
 *         topicId:
 *           type: string
 *           description: ID of the topic to filter posts by
 *           example: "123"
 *         isScadUser:
 *           type: string
 *           description: Whether the request is from a SCAD user
 *           enum: ["true", "false"]
 *           example: "true"
 *         selectedTab:
 *           type: string
 *           description: Selected tab for filtering (GOOGLE or other)
 *           example: "SOCIAL_MEDIA"
 *         postTypeSource:
 *           type: string
 *           description: Source type for filtering posts
 *           example: "Twitter"
 *         postType:
 *           type: string
 *           description: Type of post to filter
 *           example: "allSourcesPosts"
 *         postTypeData:
 *           type: string
 *           description: Additional data for filtering posts by type
 *           example: "2023-01-01|2023-01-31"
 *         sentiment:
 *           type: string
 *           description: Sentiment value to filter by
 *           enum: ["Positive", "Negative", "Neutral"]
 *           example: "Positive"
 *         greaterThanTime:
 *           type: string
 *           description: Start date for time range filtering (YYYY-MM-DD)
 *           example: "2023-01-01"
 *         lessThanTime:
 *           type: string
 *           description: End date for time range filtering (YYYY-MM-DD)
 *           example: "2023-01-31"
 *         touchId:
 *           type: string
 *           description: ID for touchpoint filtering
 *           example: "45"
 *         parentAccountId:
 *           type: string
 *           description: Parent account ID for filtering
 *           example: "789"
 *         limit:
 *           type: string
 *           description: Maximum number of posts to return
 *           example: "50"
 *           
 *     PostData:
 *       type: object
 *       properties:
 *         profilePicture:
 *           type: string
 *           description: URL to the user's profile picture
 *           example: "https://example.com/profile.jpg"
 *         profilePicture2:
 *           type: string
 *           description: Secondary profile picture URL
 *           example: "https://example.com/profile2.jpg"
 *         userFullname:
 *           type: string
 *           description: Full name of the user
 *           example: "John Doe"
 *         followers:
 *           type: string
 *           description: Number of followers
 *           example: "1200"
 *         following:
 *           type: string
 *           description: Number of accounts following
 *           example: "500"
 *         posts:
 *           type: string
 *           description: Number of posts
 *           example: "320"
 *         likes:
 *           type: string
 *           description: Number of likes
 *           example: "45"
 *         llm_emotion:
 *           type: string
 *           description: Emotion detected by LLM
 *           example: "Joy"
 *         comments:
 *           type: string
 *           description: Number of comments
 *           example: "12"
 *         shares:
 *           type: string
 *           description: Number of shares
 *           example: "5"
 *         engagements:
 *           type: string
 *           description: Number of engagements
 *           example: "62"
 *         message_text:
 *           type: string
 *           description: Text content of the post
 *           example: "This is a great product! #recommended"
 *         content:
 *           type: string
 *           description: Full content of the post
 *           example: "This is a great product! I've been using it for a month and I'm really satisfied. #recommended"
 *         image_url:
 *           type: string
 *           description: URL to post image
 *           example: "https://example.com/post-image.jpg"
 *         predicted_sentiment:
 *           type: string
 *           description: Predicted sentiment of the post
 *           example: "Positive"
 *         predicted_category:
 *           type: string
 *           description: Predicted category of the post
 *           example: "Product Review"
 *         youtube_video_url:
 *           type: string
 *           description: URL for YouTube videos
 *           example: "https://www.youtube.com/embed/videoId"
 *         source_icon:
 *           type: string
 *           description: Icon information for the source
 *           example: "https://twitter.com/post123,Twitter"
 *         source:
 *           type: string
 *           description: Source of the post
 *           example: "Twitter"
 *         rating:
 *           type: string
 *           description: Rating value (for review posts)
 *           example: "4.5"
 *         uSource:
 *           type: string
 *           description: User's source
 *           example: "@johndoe"
 *         created_at:
 *           type: string
 *           description: Creation date and time of the post
 *           example: "2023-01-15 14:30:00"
 *           
 *     PostsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indicates if the request was successful
 *           example: true
 *         responseArray:
 *           type: array
 *           description: Array of post data
 *           items:
 *             $ref: '#/components/schemas/PostData'
 *         total:
 *           type: integer
 *           description: Total number of posts matching the query
 *           example: 150
 */

module.exports = {}; 