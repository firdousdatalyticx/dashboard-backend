const express = require('express');
const router = express.Router();
const mentionsChartController = require('../../controllers/social-media/undp/undp.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.post('/:dynamicRoute', transformCategoryData, mentionsChartController.UNDP);
router.get('/posts', transformCategoryData, mentionsChartController.UNDP_Post);

module.exports = router;


