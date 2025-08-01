const prisma = require('../config/database');

const transformCategoryData = async (req, res, next) => {
    try {
        // Only proceed if topicId is present in params or body
        const topicId = req.query.topicId || req.params.topicId || req.body.topicId;
        
        if (!topicId) {
            return next();
        }

        // Fetch categories for the topic with consistent ordering
        const categoryData = await prisma.topic_categories.findMany({
            where: {
                customer_topic_id: Number(topicId)
            },
            orderBy: [
                { category_title: 'asc' },
                { id: 'asc' } // Secondary sort for identical titles
            ]
        });

        // Helper function to normalize and sort arrays
        const normalizeArray = (str, delimiter = ', ') => {
            if (!str) return [];
            
            // Split by multiple possible delimiters and normalize
            const items = str.split(/[,|]/)
                .map(item => item.trim())
                .filter(item => item.length > 0)
                .map(item => item.toLowerCase()) // Normalize case
                .sort(); // Sort for consistency
            
            // Remove duplicates while maintaining order
            return [...new Set(items)];
        };

        // Transform the data into the desired format with consistent processing
        const categoriesData = categoryData.map(category => ({
            [category.category_title.trim()]: { // Normalize category title
                urls: normalizeArray(category.topic_urls),
                keywords: normalizeArray(category.topic_keywords),
                hashtags: normalizeArray(category.topic_hash_tags)
            }
        }));

        // Create the final processed data structure with sorted keys
        const processedData = {};
        
        // Sort categories by name for consistent processing
        const sortedCategories = categoriesData.sort((a, b) => {
            const keyA = Object.keys(a)[0];
            const keyB = Object.keys(b)[0];
            return keyA.localeCompare(keyB);
        });

        sortedCategories.forEach(item => {
            const categoryName = Object.keys(item)[0];
            processedData[categoryName] = {
                hashtags: item[categoryName].hashtags,
                keywords: item[categoryName].keywords,
                urls: item[categoryName].urls
            };
        });

        // Attach the processed data to the request object
        req.processedCategories = processedData;
        req.rawCategories = categoryData;
        
        // Add debug logging for troubleshooting

        
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