const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformDataSource = require('../../middleware/dataSource.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.get("/posts",transformCategoryData,transformDataSource,mentionsChartController.mentionsPost)
router.post("/",transformCategoryData,transformDataSource,mentionsChartController.riskTypeAcrossCustomerJourney)

module.exports = router;


