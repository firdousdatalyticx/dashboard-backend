const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/mentions-charts.controller')

router.post('/:dynamicRoute', mentionsChartController.UNDP);
router.get('/posts', mentionsChartController.mentionsPost);

module.exports = router;


