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
const trustDimensionsRoute = require('./trust-dimensions.route');
const  trustDimensionsWordCloudRoute = require('./trust-dimensions-word-cloud.route');
const trustDimensionsAnalysisRoute = require('./trust-dimensions-analysis.route');
const trustDimensionsOverTimeRoute = require('./trust-dimensions-over-time.route');
const themesOverTimeRoute = require('./themes-over-time.route');
const themesSentimentAnalysisRoute = require('./themes-sentiment-analysis.route');
const sectorDistributionRoute = require('./sector-distribution.route');
const touchpointsAnalysisRoute = require('./touchpoints-analysis.route');

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
const mentionAudienceMentionType=require("./mention-audience-mention-type.route")
const riskTypeAcrossCustomerJourney=require("./risk-type-across-customer-journey.route")
const complaintsAcrossCustomerJourneyStagesbyAudience = require("./complaints-across-customer-journey-stages-by-audience.route")
const undpRoutes = require("./UNDP.route")
const undpKeywordRoutes = require("./UNDP.keyword.route")
const migrationTopicsRoutes = require("./migration-topics.routes")

const trustDimensionsEducationSystemRoutes = require("./trust-dimensions-education-system.routes");
const  benchMarkingPresenceSentimentRoutes  = require('./bench-marking-presence-sentiment.route');
const eventTypePopularityRoute = require("./event-type-popularity.routes"); 
const llm_motivation_phase_route= require("./llm_motivation-phase.route")
const llm_motivation_sentiment_route = require("./llm-motivation-sentiment.route")
// migration-topics.routes.js
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
router.use('/inflation-analysis', inflationAnalysisRoute);
router.use('/trust-dimensions', trustDimensionsRoute);
router.use('/trust-dimensions-analysis', trustDimensionsAnalysisRoute);
router.use('/trust-dimensions-analysis-wold-cloud', trustDimensionsWordCloudRoute);
router.use('/trust-dimensions-over-time', trustDimensionsOverTimeRoute);
router.use('/themes-over-time', themesOverTimeRoute);
router.use('/themes-sentiment-analysis', themesSentimentAnalysisRoute);
router.use('/sector-distribution', sectorDistributionRoute);
router.use('/touchpoints-analysis', touchpointsAnalysisRoute);
router.use("/actions-required",actionRequiredRoute)
router.use("/type-of-mentions",typeOfMentions)
router.use("/recurrence-mentions",recurrenceMentions)
router.use("/urgency-mentions",urgencyMentions)
router.use("/product-complaints",productComplaints)
router.use("/language-summary",languageSummary);
router.use("/audience-summary",audienceSummary);
router.use('/mention-audience-mention-type',mentionAudienceMentionType)
router.use('/risk-type-across-customer-journey',riskTypeAcrossCustomerJourney)
router.use('/complaints-across-customer-journey-stages-by-audience',complaintsAcrossCustomerJourneyStagesbyAudience)
router.use("/undp",undpRoutes)
router.use("/undp-keyword",undpKeywordRoutes)
router.use("/migration-topics",migrationTopicsRoutes)
router.use("/trust-dimensions-education-system",trustDimensionsEducationSystemRoutes)
router.use('/bench-marking-presence-sentiment',benchMarkingPresenceSentimentRoutes)
router.use('/event-type-popularity',eventTypePopularityRoute)
router.use("/llm-motivation-phase",llm_motivation_phase_route);
router.use("/llm-motivation-sentiment",llm_motivation_sentiment_route)

module.exports = router; 