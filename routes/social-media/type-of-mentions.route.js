const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.post("/",transformCategoryData,mentionsChartController.typeofMentions)
router.get('/posts', transformCategoryData, mentionsChartController.mentionsPost);
router.post('/top10', transformCategoryData, mentionsChartController.typeofMentionsTo10);



module.exports = router;


