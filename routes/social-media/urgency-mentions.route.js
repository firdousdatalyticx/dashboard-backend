const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.post("/", transformCategoryData, mentionsChartController.urgencyMentions)
router.get('/posts', transformCategoryData, mentionsChartController.mentionsPost);

module.exports = router;


