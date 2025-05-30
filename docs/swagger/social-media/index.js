/**
 * @swagger
 * tags:
 *   name: Social Media
 *   description: Social media analytics endpoints for mentions, sentiments, and engagement across various platforms
 */

// Import all social media swagger files
const mentionsGraphSwagger = require('./mentions-graph.swagger');
const socialsDistributionsSwagger = require('./socials-distributions.swagger');
const entitiesSwagger = require('./entities.swagger');
const influencersSwagger = require('./influencers.swagger');
const audienceSwagger = require('./audience.swagger');
const leaderboardAnalysisSwagger = require('./leaderboard-analysis.swagger');
const poiSentimentDistributionSwagger = require('./point-of-interest-sentiment-distribution.swagger');
const emotionPolaritySwagger = require('./emotion-polarity.swagger');
const sentimentsSwagger = require('./sentiments-analysis.swagger');
const emotionsSwagger = require('./emotions-analysis.swagger');
const inflationsSwagger = require('./inflations-analysis.swagger');
const wordCloudSwagger = require('./word-cloud.swagger');
const engagementSwagger = require('./engagement.metrics.swagger');
const mentionsTrendSwagger = require('./mentions-trend.swagger');
const actionRequiredMentionsSwagger = require('./actions-required.swagger');
const trustDimensionsSwagger = require('./trust-dimensions.swagger');
const themesOverTimeSwagger = require('./themes-over-time.swagger');
const sectorDistributionSwagger = require('./sector-distribution.swagger');


// Export collection of social media swagger files
module.exports = {
    mentionsGraphSwagger,
    socialsDistributionsSwagger,
    entitiesSwagger,
    influencersSwagger,
    audienceSwagger,
    leaderboardAnalysisSwagger,
    poiSentimentDistributionSwagger,
    emotionPolaritySwagger,
    sentimentsSwagger,
    emotionsSwagger,
    wordCloudSwagger,
    engagementSwagger,
    mentionsTrendSwagger,
    inflationsSwagger,
    actionRequiredMentionsSwagger,
    trustDimensionsSwagger,
    themesOverTimeSwagger,
    sectorDistributionSwagger
}; 