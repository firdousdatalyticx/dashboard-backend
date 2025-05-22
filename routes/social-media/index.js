const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');

const mentionsGraphRoute = require('./mentions-graph.route');
const socialsDistributionsRoute = require('./socials-distributions.route');
const entitiesRoute = require('./entities.route');
const influencersRoute = require('./influencers.route');
const audienceRoute = require('./audience.route');
const leaderboardAnalysisRoute = require('./leaderboard-analysis.route');
const poiSentimentDistributionRoute = require('./point-of-interest-sentiment-distribution.route');
const emotionPolarityRoute = require('./emotion-polarity.route');
const wordCloudRoute = require('./word-cloud.route');
const inflationAnalysisRoute = require('./inflation-analysis.route');

const engagementRoute = require('./engagement.route');
const mentionsTrendRoute = require('./mentions-trend.route');
const sentimentsRoute = require('./sentiments-analysis.route');
const emotionsRoute = require('./emotions-analysis.route');
const inflationsRoute = require('./inflations-analysis.route');
const aiSummaryRoute = require('./ai-summary.route');
const actionRequiredRoute = require("./actions-required.route")
const typeOfMentions=require('./type-of-mentions.route');
const recurrenceMentions =require('./recurrence-mentions.route');
const urgencyMentions =require('./urgency-mentions.route');
const productComplaints = require("./product-complaints.route")
const languageSummary=require("./language-summary.route")
const audienceSummary=require("./audience-summary.route")
/**
 * @swagger
 * tags:
 *   name: Social Media
 *   description: Social media analytics endpoints for mentions, sentiments, and engagement across various platforms
 */

// Apply auth middleware to all social media routes
router.use(authMiddleware);

// Mount social media related routes
router.use('/mentions-graph', mentionsGraphRoute);
router.use('/socials-distributions', socialsDistributionsRoute);
router.use('/entities', entitiesRoute);
router.use('/influencers', influencersRoute);
router.use('/audience', audienceRoute);
router.use('/leaderboard-analysis', leaderboardAnalysisRoute);
router.use('/poi-sentiment-distribution', poiSentimentDistributionRoute);
router.use('/emotion-polarity', emotionPolarityRoute);
router.use('/word-cloud', wordCloudRoute);
router.use('/engagement', engagementRoute);
router.use('/mentions-trend', mentionsTrendRoute);
router.use('/sentiments-analysis', sentimentsRoute);
router.use('/emotions-analysis', emotionsRoute);
router.use('/ai-summary', aiSummaryRoute);
router.use('/inflations-analysis', inflationsRoute);
router.use("/actions-required",actionRequiredRoute)
router.use("/type-of-mentions",typeOfMentions)
router.use("/recurrence-mentions",recurrenceMentions)
router.use("/urgency-mentions",urgencyMentions)
router.use("/product-complaints",productComplaints)
router.use("/language-summary",languageSummary);
router.use("/audience-summary",audienceSummary);
router.use('/inflation-analysis', inflationAnalysisRoute);




module.exports = router; 