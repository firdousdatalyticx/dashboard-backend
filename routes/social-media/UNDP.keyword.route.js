const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/keyword')

router.post('/:dynamicRoute', mentionsChartController.UNDP);

module.exports = router;


