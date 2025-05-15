/**
 * @swagger
 * components:
 *   schemas:
 *     AlertsUtilityFunctions:
 *       type: object
 *       description: |
 *         Documentation of utility functions used in the alerts controllers.
 *         These functions are not directly exposed as API endpoints but are
 *         important for understanding the implementation.
 *       properties:
 *         scheduleCronJob:
 *           type: object
 *           description: |
 *             Schedules a cron job for an alert based on frequency.
 *             Input:
 *               - alertId: string - ID of the alert
 *               - frequency: string - Frequency setting (e.g., "1 Hour", "24 Hours")
 *             Function behavior:
 *               - Creates appropriate cron expression based on frequency
 *               - Stops existing job if present
 *               - Sets initial delay
 *               - Schedules recurring job
 *             
 *         scheduleStopCronJob:
 *           type: object
 *           description: |
 *             Stops a scheduled cron job for an alert.
 *             Input:
 *               - alertId: string - ID of the alert
 *             Function behavior:
 *               - Finds and stops the cron job if it exists
 *               - Removes job from memory
 *         
 *         fetchAlertRecords:
 *           type: object
 *           description: |
 *             Fetches alert records from Elasticsearch.
 *             Input:
 *               - alert: object - Alert object with configuration
 *               - startDate: Date - Start date for data retrieval
 *               - endDate: Date - End date for data retrieval
 *             Output:
 *               - Object containing Elasticsearch response data
 *         
 *         sendEmail:
 *           type: object
 *           description: |
 *             Sends email notification.
 *             Input:
 *               - recipient: string - Comma-separated list of email addresses
 *               - subject: string - Email subject
 *               - html: string - Email HTML content
 *             Function behavior:
 *               - Uses SendGrid to send notification emails
 *               - Handles multiple recipients
 *         
 *         generateEmailTemplate:
 *           type: object
 *           description: |
 *             Generates HTML email template for notifications.
 *             Input:
 *               - data: object - Alert data containing statistics and details
 *             Output:
 *               - string - HTML email template with alert information
 *               
 *     CronExpressions:
 *       type: object
 *       description: Cron expressions used for different alert frequencies
 *       properties:
 *         instantNotification:
 *           type: string
 *           description: Every 5 minutes
 *           example: "5 * * * *"
 *         oneHour:
 *           type: string
 *           description: Every hour
 *           example: "0 * * * *"
 *         sixHours:
 *           type: string
 *           description: Every 6 hours
 *           example: "0 6,12,18,0 * * *"
 *         twelveHours:
 *           type: string
 *           description: Every 12 hours
 *           example: "0 0,12 * * *"
 *         twentyFourHours:
 *           type: string
 *           description: Every 24 hours (midnight)
 *           example: "0 0 * * *"
 */

module.exports = {}; 