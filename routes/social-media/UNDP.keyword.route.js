const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/keyword')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.get('/posts', transformCategoryData, mentionsChartController.UNDP_post);
router.post('/:dynamicRoute', transformCategoryData, mentionsChartController.UNDP);

module.exports = router;


