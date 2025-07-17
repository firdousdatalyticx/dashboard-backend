const prisma = require('../config/database');

const transformDataSource = async (req, res, next) => {
    try {
        // Only proceed if topicId is present in params or body
        const topicId = req.query.topicId || req.params.topicId || req.body.topicId;
        
        if (!topicId) {
            return next();
        }

        // Fetch topic data source for the topic
        const topic = await prisma.customer_topics.findFirst({
            where: {
                topic_id: Number(topicId),
                topic_is_deleted: {
                    not: 'Y'
                }
            },
            select: {
                topic_data_source: true
            }
        });

        if (!topic || !topic.topic_data_source) {
            req.processedDataSources = [];
            return next();
        }

        // Transform the data into array format
        const dataSources = topic.topic_data_source
            .split(',')
            .map(source => source.trim())
            .filter(source => source.length > 0);

        // Attach the processed data to the request object
        req.processedDataSources = dataSources;
        
        next();
    } catch (error) {
        console.error('Error in data source transform middleware:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process data sources'
        });
    }
};

module.exports = transformDataSource; 