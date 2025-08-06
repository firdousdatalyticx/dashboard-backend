const express = require('express');
const router = express.Router();
const businessLocationController = require('../../controllers/social-media/business-location.controller')
const transformCategoryData = require('../../middleware/categoryTransform.middleware');

router.post("/",express.json(),transformCategoryData,businessLocationController.businessLocation)
router.post("/posts",express.json(),transformCategoryData,businessLocationController.businessLocationPost)

module.exports = router;


