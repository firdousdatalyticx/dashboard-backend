const express = require('express');
const router = express.Router();
const topicController = require('../controllers/topic.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validation.middleware');
const upload = require('../middleware/fileUpload.middleware');

// Apply auth middleware to all topic routes
router.use(express.json(), authMiddleware);

/**
 * @swagger
 * /topics:
 *   get:
 *     summary: Get all topics for the authenticated user
 *     description: Retrieves a list of all topics created by the authenticated user
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', topicController.getAllTopics);

/**
 * @swagger
 * /topics/topic-total-count:
 *   get:
 *     summary: Get topic total counts
 *     description: Retrieves total counts of Google and social media data related to topics
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: topicId
 *         schema:
 *           type: integer
 *         required: false
 *         description: Optional topic ID to filter counts
 */
router.get('/topic-total-count', topicController.getTopicTotalCount);

/**
 * @swagger
 * /topics/countries:
 *   get:
 *     summary: Get list of countries
 *     description: Retrieves a list of all available countries
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/countries', topicController.getCountryList);

/**
 * @swagger
 * /topics/{id}:
 *   get:
 *     summary: Get a specific topic by ID
 *     description: Retrieves detailed information about a specific topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Topic ID
 */
router.get('/:id', [
    param('id').isInt().withMessage('Topic ID must be an integer')
], validateRequest, topicController.getTopicById);

/**
 * @swagger
 * /topics:
 *   post:
 *     summary: Create a new topic
 *     description: Creates a new topic for the authenticated user
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTopicRequest'
 */
router.post('/', upload.single('topicLogo'), [
    body('title').notEmpty().withMessage('Title is required'),
    body('keywords').optional(),
    body('urls').optional(),
    body('excludeWords').optional(),
    body('excludeAccounts').optional(),
    body('googleAndTripAdviserUrl').optional(),
    body('selectLanguage').optional(),
    body('selectLocation').optional(),
    body('selectMonitoring').optional(),
    body('dataSources').optional(),
    body('selectIndustry').optional(),
    body('region').optional()
], validateRequest, topicController.createTopic);


/**
 * @swagger
 * /topics/subtopic:
 *   post:
 *     summary: Create a new subtopic
 *     description: Creates a new subtopic for an existing topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateSubTopicRequest'
 */
router.post('/subtopic', upload.single('topic_logo'), [
    body('title').notEmpty().withMessage('Title is required'),
    body('topicId').isInt().withMessage('Topic ID must be an integer'),
    body('keywords').optional(),
    body('excludeKeywords').optional(),
    body('accounts').optional(),
    body('selectSource').optional(),
    body('selectMonitoring').optional()
], validateRequest, topicController.createSubTopic);

/**
 * @swagger
 * /topics/touchpoint:
 *   post:
 *     summary: Create a new touchpoint
 *     description: Creates a new touchpoint for an existing subtopic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTouchpointRequest'
 */
router.post('/touchpoint', [
    body('title').notEmpty().withMessage('Title is required'),
    body('subTopic').isInt().withMessage('Subtopic ID must be an integer'),
    body('keywords').optional()
], validateRequest, topicController.createTouchpoint);

/**
 * @swagger
 * /topics/{id}:
 *   put:
 *     summary: Update a topic
 *     description: Updates an existing topic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Topic ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTopicRequest'
 */
router.put('/:id', upload.single('topicLogo'), [
    param('id').isInt().withMessage('Topic ID must be an integer'),
    body('title').optional(),
    body('keywords').optional(),
    body('hashTags').optional(),
    body('urls').optional(),
    body('excludeWords').optional(),
    body('excludeAccounts').optional(),
    body('region').optional(),
    body('dataSources').optional(),
    body('dataLocation').optional(),
    body('dataLanguage').optional(),
    body('logo').optional()
], validateRequest, topicController.updateTopic);

/**
 * @swagger
 * /topics/subtopic/{subTopicId}:
 *   put:
 *     summary: Update a subtopic
 *     description: Updates an existing subtopic
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subTopicId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Subtopic ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateSubTopicRequest'
 *               - type: object
 *                 properties:
 *                   topicId:
 *                     required: false
 */
router.put('/subtopic/:subTopicId', upload.single('topic_logo'), [
    param('subTopicId').isInt().withMessage('Subtopic ID must be an integer'),
    body('title').optional(),
    body('keywords').optional(),
    body('excludeKeywords').optional(),
    body('accounts').optional(),
    body('selectSource').optional(),
    body('selectMonitoring').optional()
], validateRequest, topicController.updateSubTopic);

/**
 * @swagger
 * /topics/touchpoint/{touchpointId}:
 *   put:
 *     summary: Update a touchpoint
 *     description: Updates an existing touchpoint
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: touchpointId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Touchpoint ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTouchpointRequest'
 */
router.put('/touchpoint/:touchpointId', [
    param('touchpointId').isInt().withMessage('Touchpoint ID must be an integer'),
    body('title').optional(),
    body('keywords').optional(),
    body('subTopic').optional().isInt().withMessage('Subtopic ID must be an integer')
], validateRequest, topicController.updateTouchpoint);

/**
 * @swagger
 * /topics/{id}:
 *   delete:
 *     summary: Delete a topic
 *     description: Soft-deletes a topic by ID
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Topic ID
 */
router.delete('/:id', [
    param('id').isInt().withMessage('Topic ID must be an integer')
], validateRequest, topicController.deleteTopic);

/**
 * @swagger
 * /topics/order/update:
 *   put:
 *     summary: Update topic order
 *     description: Updates the display order of topics
 *     tags: [Topics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTopicOrderRequest'
 */
router.put('/order/update', [
    body('topicOrders').isArray().withMessage('Topic orders must be an array'),
    body('topicOrders.*.topicId').isInt().withMessage('Topic ID must be an integer'),
    body('topicOrders.*.order').isInt().withMessage('Order must be an integer')
], validateRequest, topicController.updateTopicOrder);

module.exports = router; 