const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/auth.middleware");
const transformCategoryData = require("../../middleware/categoryTransform.middleware");
const industrySubindustryController = require("../../controllers/social-media/industry-subindustry.controller");

router.post(
  "/sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getIndustrySubIndustrySentimentDistribution
);

router.post(
  "/emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getIndustrySubIndustryEmotionDistribution
);

router.post(
  "/posts",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getIndustrySubIndustryPosts
);

router.post(
  "/location-sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getLocationSentimentDistribution
);

router.post(
  "/location-emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getLocationEmotionDistribution
);

router.post(
  "/post-location-sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getPostLocationSentimentDistribution
);

router.post(
  "/comment-location-sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getCommentLocationSentimentDistribution
);

router.post(
  "/post-location-emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getPostLocationEmotionDistribution
);

router.post(
  "/comment-location-emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getCommentLocationEmotionDistribution
);

router.post(
  "/post-entity-sentiment",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getPostEntitySentimentDistribution
);

router.post(
  "/post-entity-emotion",
  express.json(),
  authMiddleware,
  transformCategoryData,
  industrySubindustryController.getPostEntityEmotionDistribution
);

module.exports = router;
