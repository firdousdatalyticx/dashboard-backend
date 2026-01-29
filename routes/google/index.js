const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');

const googleLocationsRoute = require('./locations.route');
const googleReviewTrendsRoute = require('./review-trends.route');
const channelSourceRoute = require('./channel-source.route');
const channelSentimentsRoute = require('./channel-sentiments.route');
const reviewRatingsRoute = require('./review-ratings.route');
const wordCloudRoute = require('./word-cloud.route');
const mentionsTrendRoute = require('./mentions-trend.route');

/**
 * @swagger
 * tags:
 *   name: Google
 *   description: Google Maps analytics endpoints
 */

// Apply auth middleware to all Google routes
router.use(authMiddleware);

// Mount Google related routes
router.use('/locations', googleLocationsRoute);
router.use('/review-trends', googleReviewTrendsRoute);
router.use('/channel-source', channelSourceRoute);
router.use('/channel-sentiments', channelSentimentsRoute);
router.use('/review-ratings', reviewRatingsRoute);
router.use('/word-cloud', wordCloudRoute);
router.use('/mentions-trend', mentionsTrendRoute);

module.exports = router; 
