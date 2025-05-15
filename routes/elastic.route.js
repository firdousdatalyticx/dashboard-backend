const express = require('express');
const router = express.Router();
const elasticController = require('../controllers/elastic.controller')

router.post("/",elasticController.elasticSearch)

module.exports = router;


