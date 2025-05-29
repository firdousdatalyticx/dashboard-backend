const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/keyword')

router.get('/posts', mentionsChartController.UNDP_post);
router.post('/:dynamicRoute', mentionsChartController.UNDP);

module.exports = router;


