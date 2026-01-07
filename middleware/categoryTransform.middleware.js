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

        // Fetch customer_topics to get SCAD fields
        const customerTopic = await prisma.customer_topics.findUnique({
            where: {
                topic_id: Number(topicId)
            },
            select: {
                scad_topic_hash_tags: true,
                scad_topic_keywords: true
            }
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

        // Helper function to merge arrays and remove duplicates
        const mergeArrays = (...arrays) => {
            const merged = arrays.flat().filter(item => item);
            return [...new Set(merged)].sort();
        };

        // Create the final processed data structure by merging duplicate categories
        const processedData = {};
        
        categoryData.forEach(category => {
            const categoryName = category.category_title.trim();
            const urls = normalizeArray(category.topic_urls);
            const keywords = normalizeArray(category.topic_keywords);
            const hashtags = normalizeArray(category.topic_hash_tags);
            
            if (processedData[categoryName]) {
                // Merge with existing category data
                processedData[categoryName] = {
                    urls: mergeArrays(processedData[categoryName].urls, urls),
                    keywords: mergeArrays(processedData[categoryName].keywords, keywords),
                    hashtags: mergeArrays(processedData[categoryName].hashtags, hashtags)
                };
            } else {
                // Create new category entry
                processedData[categoryName] = {
                    urls: urls,
                    keywords: keywords,
                    hashtags: hashtags
                };
            }
        });

        // Transform to array format (if needed for backward compatibility)
        const categoriesData = Object.keys(processedData)
            .sort() // Sort category names
            .map(categoryName => ({
                [categoryName]: processedData[categoryName]
            }));

            

        // Process SCAD data if available
        let processedScadData = null;
        if (customerTopic && (customerTopic.scad_topic_hash_tags || customerTopic.scad_topic_keywords)) {
            const scadKeywords = customerTopic.scad_topic_keywords ? normalizeArray(customerTopic.scad_topic_keywords) : [];
            const scadHashtags = customerTopic.scad_topic_hash_tags ? normalizeArray(customerTopic.scad_topic_hash_tags) : [];

            if (scadKeywords.length > 0 || scadHashtags.length > 0) {
                processedScadData = {
                    scad_keywords: scadKeywords,
                    scad_hashtags: scadHashtags
                };
            }
        }

        // Attach both formats to the request object
        req.processedCategories = processedData; // Object format (recommended)
        req.categoriesArray = categoriesData;    // Array format (for compatibility)
        req.rawCategories = categoryData;
        req.processedScadData = processedScadData; // SCAD data for additional trend
        
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