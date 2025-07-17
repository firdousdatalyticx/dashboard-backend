const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformDataSource = require('../../middleware/dataSource.middleware');

router.post("/",transformDataSource,mentionsChartController.typeofMentions)
router.get('/posts', transformDataSource, mentionsChartController.mentionsPost);
router.post('/top10', transformDataSource, mentionsChartController.typeofMentionsTo10);



module.exports = router;


