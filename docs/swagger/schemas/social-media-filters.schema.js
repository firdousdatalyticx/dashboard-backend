/**
 * @swagger
 * components:
 *   schemas:
 *     SocialMediaFilters:
 *       type: object
 *       description: Common filters used across social media endpoints
 *       properties:
 *         timeSlot:
 *           type: string
 *           enum: [custom, last24hours, last7days, last30days, last60days, last90days, last120days]
 *           description: Predefined time periods for filtering
 *           example: "last7days"
 *         fromDate:
 *           type: string
 *           format: date
 *           description: Start date for custom date range (used with timeSlot=custom)
 *           example: "2023-01-01"
 *         toDate:
 *           type: string
 *           format: date
 *           description: End date for custom date range (used with timeSlot=custom)
 *           example: "2023-01-31"
 *         sentimentType:
 *           type: string
 *           enum: [Positive, Negative, Neutral]
 *           description: Filter by sentiment analysis result
 *           example: "Positive"
 *
 *     ProcessedFilters:
 *       type: object
 *       description: Result of processing filter parameters
 *       properties:
 *         greaterThanTime:
 *           type: string
 *           format: date
 *           description: Calculated start date after processing
 *           example: "2023-01-01"
 *         lessThanTime:
 *           type: string
 *           format: date
 *           description: Calculated end date after processing
 *           example: "2023-01-31"
 *         queryString:
 *           type: string
 *           description: Elastichsearch query string part for sentiments
 *           example: "predicted_sentiment_value:(\"Positive\")"
 *
 *     FilterUtilityFunctions:
 *       type: object
 *       description: |
 *         Utility functions used for processing social media filters.
 *       properties:
 *         processTimeSlot:
 *           type: object
 *           description: |
 *             Processes a time slot value and returns appropriate date range.
 *             Input: string - One of "custom", "last24hours", "last7days", "last30days", "last60days", "last90days", "last120days"
 *             Output: Object with greaterThanTime and lessThanTime
 *         processSentimentType:
 *           type: object
 *           description: |
 *             Processes sentiment type filter and appends to query string.
 *             Input: string/array - Sentiment type(s) to filter by
 *             Output: string - Updated query string part
 *         processDateRange:
 *           type: object
 *           description: |
 *             Processes a custom date range from fromDate and toDate.
 *             Input: Object with fromDate and toDate
 *             Output: Object with greaterThanTime and lessThanTime
 *         processFilters:
 *           type: object
 *           description: |
 *             Main function that processes all filter parameters.
 *             Input: Object with filter parameters from request
 *             Output: Object with processed filter values for Elasticsearch
 *             The function:
 *             - Prioritizes time slot vs. custom date range
 *             - Formats dates consistently
 *             - Handles sentiment type filtering
 */

module.exports = {}; 