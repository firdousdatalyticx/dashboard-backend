const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middleware/auth.middleware');
const keywordLookupController = require('../../controllers/social-media/keyword-lookup.controller');

// POST /social-media/keyword-lookup/counts
router.post('/counts', express.json(), authMiddleware, keywordLookupController.getKeywordCounts);

// POST /social-media/keyword-lookup/posts
router.post('/posts', express.json(), authMiddleware, keywordLookupController.getKeywordPosts);

module.exports = router;

