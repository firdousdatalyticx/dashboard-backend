const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const transformDataSource = require('../../middleware/dataSource.middleware');

router.post("/",transformCategoryData,transformDataSource,mentionsChartController.languageMentions)
router.get("/posts",transformCategoryData,transformDataSource,mentionsChartController.mentionsPost)

module.exports = router;


