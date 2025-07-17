const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/keyword')
const transformDataSource = require('../../middleware/dataSource.middleware');

router.get('/posts', transformDataSource, mentionsChartController.UNDP_post);
router.post('/:dynamicRoute', transformDataSource, mentionsChartController.UNDP);

module.exports = router;


