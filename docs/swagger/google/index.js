/**
 * @swagger
 * tags:
 *   name: Google
 *   description: Google Maps analytics endpoints
 */

const locationsSwagger = require('./locations.swagger');
const reviewTrendsSwagger = require('./review-trends.swagger');
const channelSourceSwagger = require('./channel-source.swagger');
const channelSentimentsSwagger = require('./channel-sentiments.swagger');
const reviewRatingsSwagger = require('./review-ratings.swagger');
const wordCloudSwagger = require('./word-cloud.swagger');
const mentionsTrendSwagger = require('./mentions-trend.swagger');

module.exports = {
    locationsSwagger,
    reviewTrendsSwagger,
    channelSourceSwagger,
    channelSentimentsSwagger,
    reviewRatingsSwagger,
    wordCloudSwagger,
    mentionsTrendSwagger
}; 