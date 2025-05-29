const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/undp.controller')

router.post('/:dynamicRoute', mentionsChartController.UNDP);
router.get('/posts', mentionsChartController.UNDP_Post);

module.exports = router;


