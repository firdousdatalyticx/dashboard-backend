const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/image_upload');
const { authenticateUserToken } = require('../middleware/user.auth.token');
const videoController = require('../controllers/video.controller');


router.post('/analyze', authenticateUserToken, upload.single('file'), videoController.analyzeVideo);

router.get('/chat', authenticateUserToken, videoController.chatWithVideo);


router.get('/history', authenticateUserToken, videoController.getVideoHistory);

router.get('/:videoAnalysisId', authenticateUserToken, videoController.getVideoAnalysis);


router.get('/:videoAnalysisId/chat', authenticateUserToken, videoController.getVideoChatHistory);

module.exports = router;