const prisma = require('../config/database');

const transformCategoryData = async (req, res, next) => {
    try {
        // Only proceed if topicId is present in params or body
        const topicId = req.query.topicId || req.params.topicId || req.body.topicId;
        
        if (!topicId) {
            return next();
        }

        // Fetch categories for the topic
        const categoryData = await prisma.topic_categories.findMany({
            where: {
                customer_topic_id: Number(topicId)
            }
        });


        // Transform the data into the desired format
        const categoriesData = categoryData.map(category => ({
            [category.category_title]: {
                urls: category.topic_urls ? category.topic_urls.split(', ') : [],
                keywords: category.topic_keywords ? category.topic_keywords.split(', ') : [],
                hashtags: category.topic_hash_tags ? category.topic_hash_tags.split(', ') : []
            }
        }));

        // Create the final processed data structure
        const processedData = {};
        categoriesData.forEach(item => {
            const categoryName = Object.keys(item)[0];
            processedData[categoryName] = {
                hashtags: item[categoryName].hashtags || [],
                keywords: item[categoryName].keywords || [],
                urls: item[categoryName].urls || []
            };
        });

        // Attach the processed data to the request object
        req.processedCategories = processedData;
        req.rawCategories = categoryData;
        
        next();
    } catch (error) {
        console.error('Error in category transform middleware:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process categories'
        });
    }
};

module.exports = transformCategoryData; 