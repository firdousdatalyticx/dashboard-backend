const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')

router.get("/posts",mentionsChartController.mentionsPost)
router.post("/",mentionsChartController.audienceMentionsAcrossMentionType)

module.exports = router;


