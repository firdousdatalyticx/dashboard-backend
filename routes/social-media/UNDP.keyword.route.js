const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/keyword')
const transformDataSource = require('../../middleware/dataSource.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.get('/posts', transformCategoryData,transformDataSource, mentionsChartController.UNDP_post);
router.post('/:dynamicRoute', transformCategoryData,transformDataSource, mentionsChartController.UNDP);

module.exports = router;


