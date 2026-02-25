const express = require('express');
const router = express.Router();
const audienceController = require('../../controllers/social-media/audience.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const transformCategoryData = require('../../middleware/categoryTransform.middleware');
const employee_engagement_leaderboardController= require("../../controllers/social-media/employee-engagement-leaderboard.controller")


router.post('/get', express.json(), transformCategoryData, audienceController.getCommentAudienceLeaderBoard);


router.post('/getEmployeeData', express.json(), transformCategoryData, audienceController.getCommentAudienceLeaderBoardEmployeeData);

router.post('/getEmployeeDataOIA', express.json(), authMiddleware, transformCategoryData, audienceController.getCommentAudienceLeaderBoardEmployeeDataOIA);

/**
 * API Endpoint: Create Employee Engagement Leaderboard by Topic
 * POST /api/employee-engagement-leaderboard/create
 */
router.post('/create', express.json(), authMiddleware, employee_engagement_leaderboardController.Create);
// router.post('/update', express.json(), authMiddleware, employee_engagement_leaderboardController.Update);

/**
 * API Endpoint: Get Employee Engagement Leaderboard by Topic
 * GET /api/employee-engagement-leaderboard/:topicId
 */
router.get('/:topicId', express.json(), authMiddleware, employee_engagement_leaderboardController.GET);
/**
 * API Endpoint: Delete Employee Engagement Data by Topic
 * DELETE /api/employee-engagement-leaderboard/:topicId
 */

router.delete('/:topicId', express.json(), authMiddleware, employee_engagement_leaderboardController.Delete);

module.exports = router; 

