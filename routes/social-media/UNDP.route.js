const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/undp.controller')
const transformDataSource = require('../../middleware/dataSource.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.post('/:dynamicRoute', transformCategoryData,transformDataSource, mentionsChartController.UNDP);
router.get('/posts', transformCategoryData,transformDataSource, mentionsChartController.UNDP_Post);

module.exports = router;


