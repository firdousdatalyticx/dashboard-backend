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

module.exports = router;
