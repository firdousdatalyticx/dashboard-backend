const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/undp.controller')
const transformDataSource = require('../../middleware/dataSource.middleware');

router.post('/:dynamicRoute', transformDataSource, mentionsChartController.UNDP);
router.get('/posts', transformDataSource, mentionsChartController.UNDP_Post);

module.exports = router;


