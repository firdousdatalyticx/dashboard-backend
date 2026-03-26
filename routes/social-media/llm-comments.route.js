const express = require("express");
const authMiddleware = require("../../middleware/auth.middleware");
const transformCategoryData = require("../../middleware/categoryTransform.middleware");
const llmCommentsController = require("../../controllers/social-media/llm-comments.controller");

const router = express.Router();

/**
 * @swagger
 * /social-media/llm-comments/sentiment-trend:
 *   post:
 *     summary: Trend line sentiment from llm_comments
 *     description: Builds sentiment trend using llm_comments for posts matching topic/category/source/date filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/sentiment-trend",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getSentimentTrend
);

/**
 * @swagger
 * /social-media/llm-comments/emotion-trend:
 *   post:
 *     summary: Trend line emotion from llm_comments
 *     description: Builds emotion trend using llm_comments for posts matching topic/category/source/date filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/emotion-trend",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getEmotionTrend
);

/**
 * @swagger
 * /social-media/llm-comments/sentiment-counts:
 *   post:
 *     summary: Comment sentiment counts
 *     description: Returns sentiment name and count for llm_comments matching filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/sentiment-counts",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getSentimentCounts
);

/**
 * @swagger
 * /social-media/llm-comments/emotion-counts:
 *   post:
 *     summary: Comment emotion counts
 *     description: Returns emotion name and count for llm_comments matching filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/emotion-counts",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getEmotionCounts
);

/**
 * @swagger
 * /social-media/llm-comments/comments:
 *   post:
 *     summary: Get full llm_comments objects for drill-down
 *     description: Returns full parsed llm_comments objects based on click filters (date/sentiment/emotion/source) and common topic filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/comments",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getCommentsOnClick
);

/**
 * @swagger
 * /social-media/llm-comments/sources:
 *   post:
 *     summary: Get llm_comments counts grouped by source (donut dataset)
 *     description: Returns {source, count} for all parsed llm_comments matching the same topic/category/date filters.
 *     tags: [Social Media]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/sources",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getCommentsSourceDonut
);

router.post(
  "/industry-subindustry-sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getIndustrySubIndustrySentimentDistribution
);

router.post(
  "/industry-subindustry-emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  llmCommentsController.getIndustrySubIndustryEmotionDistribution
);

module.exports = router;

