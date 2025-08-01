    /**
 * Process categoryItems into the same format as req.processedCategories
 * @param {Array} categoryItems - Array of strings containing hashtags, keywords, and URLs
 * @returns {Object} Processed category data
 */
function processCategoryItems(categoryItems) {
    const processed = {
        'custom': {
            keywords: [],
            hashtags: [],
            urls: []
        }
    };
    
    categoryItems.forEach(item => {
        const trimmedItem = item.trim();
        
        // Categorize items based on their format
        if (trimmedItem.startsWith('@')) {
            // Handle as hashtag (remove @ symbol)
            processed.custom.hashtags.push(trimmedItem.substring(1));
        } else if (trimmedItem.startsWith('http://') || trimmedItem.startsWith('https://')) {
            // Handle as URL
            processed.custom.urls.push(trimmedItem);
        } else {
            // Handle as keyword
            processed.custom.keywords.push(trimmedItem);
        }
    });
    
    return processed;
}

module.exports = processCategoryItems;