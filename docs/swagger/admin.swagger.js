/**
 * @swagger
 * components:
 *   schemas:
 *     AdminCustomer:
 *       type: object
 *       properties:
 *         customer_id:
 *           type: integer
 *           description: Customer ID
 *         customer_name:
 *           type: string
 *           description: Customer name
 *         customer_email:
 *           type: string
 *           description: Customer email
 *         customer_company_name:
 *           type: string
 *           description: Company name
 *         customer_reg_time:
 *           type: string
 *           format: date-time
 *           description: Registration time
 *         customer_reg_scope:
 *           type: string
 *           description: Registration scope (FR, PR, etc.)
 *         customer_account_type:
 *           type: boolean
 *           description: Account type
 *         customer_allowed_topics:
 *           type: string
 *           description: Allowed topics count
 *         customer_phone:
 *           type: string
 *           description: Phone number
 *         customer_country:
 *           type: string
 *           description: Country
 *         customer_industry:
 *           type: string
 *           description: Industry
 *         customer_acc_expiry:
 *           type: string
 *           format: date
 *           description: Account expiry date
 *         customer_dashboard_expiry:
 *           type: string
 *           format: date-time
 *           description: Dashboard expiry date
 *         customer_show_in_list:
 *           type: boolean
 *           description: Show in list flag
 *         customer_account_parent:
 *           type: string
 *           description: Parent account email
 *         _count:
 *           type: object
 *           properties:
 *             customer_topics:
 *               type: integer
 *               description: Number of topics
 *     
 *     AdminTopic:
 *       type: object
 *       properties:
 *         topic_id:
 *           type: integer
 *           description: Topic ID
 *         topic_title:
 *           type: string
 *           description: Topic title
 *         topic_keywords:
 *           type: string
 *           description: Topic keywords
 *         topic_user_id:
 *           type: integer
 *           description: User ID who created the topic
 *         topic_created_at:
 *           type: string
 *           format: date-time
 *           description: Topic creation date
 *         topic_updated_at:
 *           type: string
 *           format: date-time
 *           description: Topic last update date
 *         topic_is_deleted:
 *           type: string
 *           description: Deletion flag
 *         topic_is_premium:
 *           type: string
 *           description: Premium status (y/n)
 *         dashboard_enabled:
 *           type: string
 *           description: Dashboard enabled status (yes/no)
 *         dashboard_date_range:
 *           type: string
 *           description: Dashboard date range
 *         dashboard_start_date:
 *           type: string
 *           format: date-time
 *           description: Dashboard start date
 *         dashboard_end_date:
 *           type: string
 *           format: date-time
 *           description: Dashboard end date
 *         enable_archive_data:
 *           type: boolean
 *           description: Enable archive data for this topic
 *         allowed_sources:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of allowed data sources for this topic
 *         customers:
 *           $ref: '#/components/schemas/AdminCustomer'
 *     
 *     AdminDashboardStats:
 *       type: object
 *       properties:
 *         totalCustomers:
 *           type: integer
 *           description: Total number of customers
 *         totalTopics:
 *           type: integer
 *           description: Total number of topics
 *         activeTopics:
 *           type: integer
 *           description: Number of active topics
 *         premiumTopics:
 *           type: integer
 *           description: Number of premium topics
 *         recentCustomers:
 *           type: integer
 *           description: Number of customers registered in last 30 days
 *         recentTopics:
 *           type: integer
 *           description: Number of topics created in last 30 days
 *         inactiveTopics:
 *           type: integer
 *           description: Number of inactive topics
 *         nonPremiumTopics:
 *           type: integer
 *           description: Number of non-premium topics
 *     
 *     PaginationInfo:
 *       type: object
 *       properties:
 *         currentPage:
 *           type: integer
 *           description: Current page number
 *         totalPages:
 *           type: integer
 *           description: Total number of pages
 *         totalItems:
 *           type: integer
 *           description: Total number of items
 *         itemsPerPage:
 *           type: integer
 *           description: Number of items per page
 *     
 *     AdminSearchResult:
 *       type: object
 *       properties:
 *         customers:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdminCustomer'
 *         topics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AdminTopic'
 *     
 *     TopicUpdateRequest:
 *       type: object
 *       properties:
 *         dashboard_enabled:
 *           type: string
 *           enum: [yes, no]
 *           description: Enable/disable dashboard
 *         topic_is_premium:
 *           type: string
 *           enum: [y, n]
 *           description: Set premium status
 *         dashboard_date_range:
 *           type: string
 *           enum: [last_30_days, last_90_days, custom]
 *           description: Dashboard date range
 *         dashboard_start_date:
 *           type: string
 *           format: date-time
 *           description: Custom dashboard start date
 *         dashboard_end_date:
 *           type: string
 *           format: date-time
 *           description: Custom dashboard end date
 *         enable_archive_data:
 *           type: boolean
 *           description: Enable/disable archive data
 *         allowed_sources:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of allowed data sources
 *     
 *     BulkUpdateRequest:
 *       type: object
 *       required:
 *         - topicIds
 *         - updates
 *       properties:
 *         topicIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of topic IDs to update
 *         updates:
 *           $ref: '#/components/schemas/TopicUpdateRequest'
 *     
 *   parameters:
 *     customerIdParam:
 *       in: path
 *       name: customerId
 *       required: true
 *       schema:
 *         type: integer
 *       description: Customer ID
 *     
 *     topicIdParam:
 *       in: path
 *       name: topicId
 *       required: true
 *       schema:
 *         type: integer
 *       description: Topic ID
 *     
 *     pageQuery:
 *       in: query
 *       name: page
 *       schema:
 *         type: integer
 *         default: 1
 *       description: Page number for pagination
 *     
 *     limitQuery:
 *       in: query
 *       name: limit
 *       schema:
 *         type: integer
 *         default: 10
 *       description: Number of items per page
 *     
 *     searchQuery:
 *       in: query
 *       name: search
 *       schema:
 *         type: string
 *       description: Search term
 *     
 *     statusQuery:
 *       in: query
 *       name: status
 *       schema:
 *         type: string
 *       description: Filter by status
 *     
 *     premiumQuery:
 *       in: query
 *       name: premium
 *       schema:
 *         type: string
 *       description: Filter by premium status
 *     
 *     searchTypeQuery:
 *       in: query
 *       name: type
 *       schema:
 *         type: string
 *         enum: [all, customers, topics]
 *         default: all
 *       description: Type of search
 *     
 *     queryQuery:
 *       in: query
 *       name: query
 *       required: true
 *       schema:
 *         type: string
 *       description: Search query (minimum 2 characters)
 */

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management APIs
 */

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     summary: Get all customers
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/pageQuery'
 *       - $ref: '#/components/parameters/limitQuery'
 *       - $ref: '#/components/parameters/searchQuery'
 *       - $ref: '#/components/parameters/statusQuery'
 *     responses:
 *       200:
 *         description: List of customers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminCustomer'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/customers/{customerId}:
 *   get:
 *     summary: Get customer details with topics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/customerIdParam'
 *     responses:
 *       200:
 *         description: Customer details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminCustomer'
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 *   
 * /api/admin/customers/{customerId}/topics:
 *   get:
 *     summary: Get all topics for a specific customer
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/customerIdParam'
 *       - $ref: '#/components/parameters/pageQuery'
 *       - $ref: '#/components/parameters/limitQuery'
 *       - $ref: '#/components/parameters/searchQuery'
 *       - $ref: '#/components/parameters/statusQuery'
 *       - $ref: '#/components/parameters/premiumQuery'
 *     responses:
 *       200:
 *         description: Customer topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     customer:
 *                       $ref: '#/components/schemas/AdminCustomer'
 *                     topics:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AdminTopic'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationInfo'
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 *   
 *   put:
 *     summary: Update customer details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/customerIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_name:
 *                 type: string
 *               customer_company_name:
 *                 type: string
 *               customer_phone:
 *                 type: string
 *               customer_country:
 *                 type: string
 *               customer_industry:
 *                 type: string
 *               customer_allowed_topics:
 *                 type: string
 *               customer_acc_expiry:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminCustomer'
 *                 message:
 *                   type: string
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics:
 *   get:
 *     summary: Get all topics with customer information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/pageQuery'
 *       - $ref: '#/components/parameters/limitQuery'
 *       - $ref: '#/components/parameters/searchQuery'
 *       - $ref: '#/components/parameters/statusQuery'
 *       - $ref: '#/components/parameters/premiumQuery'
 *     responses:
 *       200:
 *         description: List of topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminTopic'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/{topicId}:
 *   get:
 *     summary: Get topic details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     responses:
 *       200:
 *         description: Topic details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 *   
 *   put:
 *     summary: Update topic settings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TopicUpdateRequest'
 *     responses:
 *       200:
 *         description: Topic updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/{topicId}/dashboard-status:
 *   patch:
 *     summary: Toggle dashboard enabled/disabled status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dashboard_enabled
 *             properties:
 *               dashboard_enabled:
 *                 type: string
 *                 enum: [yes, no]
 *                 description: Enable or disable dashboard
 *     responses:
 *       200:
 *         description: Dashboard status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/{topicId}/premium-status:
 *   patch:
 *     summary: Toggle premium status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic_is_premium
 *             properties:
 *               topic_is_premium:
 *                 type: string
 *                 enum: [y, n]
 *                 description: Enable or disable premium status
 *     responses:
 *       200:
 *         description: Premium status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/bulk-update:
 *   patch:
 *     summary: Bulk update multiple topics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkUpdateRequest'
 *     responses:
 *       200:
 *         description: Topics updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminDashboardStats'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/search:
 *   get:
 *     summary: Search customers and topics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/queryQuery'
 *       - $ref: '#/components/parameters/searchTypeQuery'
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminSearchResult'
 *       400:
 *         description: Bad request - Query too short
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/{topicId}/archive-data-status:
 *   patch:
 *     summary: Toggle archive data enabled/disabled status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enable_archive_data
 *             properties:
 *               enable_archive_data:
 *                 oneOf:
 *                   - type: boolean
 *                   - type: string
 *                 description: Enable or disable archive data (accepts true/false or "true"/"false")
 *     responses:
 *       200:
 *         description: Archive data status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/admin/topics/{topicId}/allowed-sources:
 *   patch:
 *     summary: Update allowed sources for a topic
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/topicIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allowed_sources
 *             properties:
 *               allowed_sources:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: string
 *                   - type: string
 *                 description: Array of allowed data sources (accepts array or JSON string)
 *     responses:
 *       200:
 *         description: Allowed sources updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AdminTopic'
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - Invalid allowed_sources format
 *       404:
 *         description: Topic not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

module.exports = {}; 