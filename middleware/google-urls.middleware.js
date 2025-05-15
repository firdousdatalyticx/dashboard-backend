const prisma = require('../config/database');

/**
 * Middleware to extract Google URLs from topics
 * This middleware fetches the Google URLs associated with a topic
 * and attaches them to the request object for use in controllers
 */
const extractGoogleUrls = async (req, res, next) => {
    try {
        const topicId = req.body.topicId || req.query.topicId | req.body.id;

        if (!topicId) {
            // No topic ID provided, continue without URLs
            req.googleUrls = [];
            return next();
        }
        
        // Fetch topic data with URLs
        const customerTopics = await prisma.customer_topics.findMany({
            where: {
                topic_id: Number(topicId),
                topic_is_deleted: 'N',
            },
            select: {
                topic_id: true,
                topic_urls: true,
                topic_gmaps_url: true
            }
        });

        if (!customerTopics || customerTopics.length === 0) {
            req.googleUrls = [];
            return next();
        }

        // Extract Google URLs from topic URLs
        const googleUrls = [
            ...new Set(
                customerTopics
                    .flatMap(t => {
                        const urlsFromPipe = t.topic_urls?.split('|') || [];
                        const gmapsUrl = t.topic_gmaps_url ? [t.topic_gmaps_url] : [];
                        return [...urlsFromPipe, ...gmapsUrl];
                    })
                    .filter(url => url !== null && url !== undefined && url.trim() !== '' && url.includes('google.com'))
            )
        ];

        // Attach URLs to request object
        req.googleUrls = googleUrls;
        


        next();
    } catch (error) {
        console.error('Error extracting Google URLs:', error);
        req.googleUrls = [];
        next();
    }
};

module.exports = extractGoogleUrls; 