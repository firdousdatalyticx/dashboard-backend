const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')

router.post("/",mentionsChartController.typeofMentions)
router.get('/posts', mentionsChartController.mentionsPost);
router.post('/top10', mentionsChartController.typeofMentionsTo10);



module.exports = router;


