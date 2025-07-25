const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.get("/posts",transformCategoryData,mentionsChartController.mentionsPost)
router.post("/",transformCategoryData,mentionsChartController.complaintsAcrossCustomerJourneyStagesbyAudience)

module.exports = router;


