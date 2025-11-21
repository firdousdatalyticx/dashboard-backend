/**
 * Builds an Elasticsearch query string from category data
 * @param {Object} categoryData - The processed category data from middleware
 * @returns {string} - Elasticsearch query string
 */
const buildTopicQueryString = (categoryData) => {
    if (!categoryData || Object.keys(categoryData).length === 0) {
        return '';
    }

    // Collect all keywords, hashtags, and urls from all categories
    const allTerms = Object.values(categoryData).reduce((acc, category) => {
        return {
            keywords: [...acc.keywords, ...(category.keywords || [])],
            hashtags: [...acc.hashtags, ...(category.hashtags || [])],
            urls: [...acc.urls, ...(category.urls || [])]
        };
    }, { keywords: [], hashtags: [], urls: [] });

    // Build the query parts
    const parts = [];

    // Add message text part (keywords and hashtags)
    const messageTextTerms = [
        ...allTerms.keywords.map(k => `"${k}"`),
        ...allTerms.hashtags.map(h => `"${h}"`)
    ];
    
    if (messageTextTerms.length > 0) {
        parts.push(`p_message_text:(${messageTextTerms.join(' OR ')})`);
    }

    // Add URLs part
    if (allTerms.urls.length > 0) {
        parts.push(`p_url:(${allTerms.urls.map(url => `"${url}"`).join(' OR ')})`);
    }
     if (allTerms.urls.length > 0) {
        parts.push(`u_source:(${allTerms.urls.map(url => `"${url}"`).join(' OR ')})`);
    }

    // Combine all parts with OR and add exclusions
    const mainQuery = parts.length > 0 ? `(${parts.join(' OR ')})` : '';
    
    // Add standard exclusions
    const exclusions = [
        'NOT p_message_text:("Dubai Islamic bank pakistan" OR "Pakistan" OR "#DubaiIslamicBankPakistan")',
        'NOT source:("DM")',
        'NOT manual_entry_type:("review")'
    ];

    return [mainQuery, ...exclusions].filter(Boolean).join(' AND ');
};

module.exports = {
    buildTopicQueryString
}; 