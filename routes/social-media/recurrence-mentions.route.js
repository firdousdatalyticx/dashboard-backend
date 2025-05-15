const express = require('express');
const router = express.Router();

const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')

router.post("/",mentionsChartController.recurrenceMentions)
router.get('/posts', mentionsChartController.mentionsPost);


module.exports = router;


