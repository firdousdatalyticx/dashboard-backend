const express = require('express');
const router = express.Router();
const topicCategoriesController = require('../controllers/topic-categories.controller');
const transformCategoryData = require('../middleware/categoryTransform.middleware');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Topic Categories
 *   description: Topic categorization management
 */

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * @swagger
 * /topic-categories:
 *   post:
 *     summary: Create topic categories
 *     description: Creates new categories for a specific topic. Requires authentication.
 *     tags: [Topic Categories]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', topicCategoriesController.createCategories);

/**
 * @swagger
 * /topic-categories/topic/{topicId}:
 *   get:
 *     summary: Get topic categories
 *     description: Retrieves all categories for a specific topic. Requires authentication. The response is transformed by categoryTransform middleware.
 *     tags: [Topic Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the topic to get categories for
 */
router.get('/topic/:topicId', transformCategoryData, topicCategoriesController.getCategoriesByTopicId);

/**
 * @swagger
 * /topic-categories/{id}:
 *   put:
 *     summary: Update a topic category
 *     description: Updates an existing category. Requires authentication.
 *     tags: [Topic Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the category to update
 */
router.put('/:id', topicCategoriesController.updateCategory);

/**
 * @swagger
 * /topic-categories/{id}:
 *   delete:
 *     summary: Delete a topic category
 *     description: Deletes an existing category. Requires authentication.
 *     tags: [Topic Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the category to delete
 */
router.delete('/:id', topicCategoriesController.deleteCategory);

/**
 * @swagger
 * /topic-categories/check:
 *   post:
 *     summary: Check if categories exist for a topic
 *     description: Checks if any categories exist for the specified topic. Requires authentication. The response is transformed by categoryTransform middleware.
 *     tags: [Topic Categories]
 *     security:
 *       - bearerAuth: []
 */
router.post('/check', transformCategoryData, topicCategoriesController.checkCategoryExists);

// Route to get topic statistics with Google and social media counts
router.get('/stats', transformCategoryData, topicCategoriesController.getTopicStats);

// Bulk create topic categories (no Swagger)
router.post('/bulk', express.json(), topicCategoriesController.bulkCreateCategories);

module.exports = router; 