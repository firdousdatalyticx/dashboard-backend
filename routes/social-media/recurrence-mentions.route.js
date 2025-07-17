const express = require('express');
const router = express.Router();

const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')
const transformDataSource = require('../../middleware/dataSource.middleware');

router.post("/",transformDataSource,mentionsChartController.recurrenceMentions)
router.get('/posts', transformDataSource, mentionsChartController.mentionsPost);


module.exports = router;


