const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Build Elasticsearch query string based on topic data
 * @param {number} topicId - Topic ID
 * @param {string} isScadUser - Whether the user is a SCAD user ('true' or 'false')
 * @param {string} selectedTab - Selected tab ('GOOGLE' or other)
 * @returns {Promise<string>} - Built query string
 */
const buildQueryString = async (topicId, isScadUser, selectedTab) => {
    try {
        const topicData = await prisma.customer_topics.findUnique({
            where: { topic_id: parseInt(topicId) }
        });

        if (!topicData) return '';

        let inVal = '';
        let tpkUrls = '';
        let searchStr = '';

        // Process hashtags
        const htags = topicData?.topic_hash_tags
            ?.split('|')
            .map(tag => tag.trim())
            .filter(tag => tag !== '');
        htags?.forEach(tag => {
            inVal += `'${tag}',`;
        });

        // Process keywords
        const keywords = topicData?.topic_keywords
            ?.split(',')
            .map(keyword => keyword.trim())
            .filter(keyword => keyword !== '');
        keywords?.forEach(keyword => {
            inVal += `'${keyword}',`;
        });

        // Process URLs
        if (topicData.topic_urls) {
            const tUrls = topicData.topic_urls
                .split('|')
                .map(url => url.trim())
                .filter(url => url !== '');
            tUrls.forEach(url => {
                if (selectedTab === "GOOGLE") {
                    if (url.includes("google")) {
                        inVal += `'${url}',`;
                        tpkUrls += `"${url}" OR `;
                    }
                } else {
                    if (!url.includes("google")) {
                        inVal += `'${url}',`;
                        tpkUrls += `"${url}" OR `;
                    }
                }
            });
        }



        searchStr = inVal.slice(0, -1).replace(/'/g, '');
        let strArray = searchStr.split(',');

        if (isScadUser === "true") {
            if (selectedTab === "GOOGLE") {
                strArray = strArray.filter(tag => tag.toLowerCase().includes("google"));
            } else {
                strArray = strArray.filter(tag => !tag.toLowerCase().includes("google"));
            }
        }

        let strToSearch = '';
        strArray.forEach(str => {
            strToSearch += `"${str}" OR `;
        });

        // Build final search string
        if (selectedTab === "GOOGLE") {
            // Only include u_source for Google URLs
            if (tpkUrls.trim()) {
                strToSearch = `u_source:(${tpkUrls.slice(0, -4)})`;
            } else {
                // fallback — maybe just search GoogleMyBusiness entries
                strToSearch = `source:"GoogleMyBusiness"`;
            }
            
        } else {
            // Existing logic for other tabs
            strToSearch = `(p_message_text:(${strToSearch.slice(0, -4)}) OR u_fullname:(${strToSearch.slice(0, -4)}) )`;
        }

        // Handle exclusion filters
        if (topicData.topic_exclude_words) {
            const tempStr = topicData.topic_exclude_words
                .split(',')
                .map(word => word.trim())
                .filter(word => word !== '');
            let tempExcludeStr = '';
            tempStr.forEach(word => {
                tempExcludeStr += `"${word}" OR `;
            });
            strToSearch += ` AND NOT p_message_text:(${tempExcludeStr.slice(0, -4)})`;
        }

        if (topicData.topic_exclude_accounts) {
            const tempStr = topicData.topic_exclude_accounts
                .split(',')
                .map(account => account.trim())
                .filter(account => account !== '');
            let tempExcludeStr = '';
            tempStr.forEach(account => {
                tempExcludeStr += `"${account}" OR `;
            });
            strToSearch += ` AND NOT u_username:(${tempExcludeStr.slice(0, -4)}) AND NOT u_source:(${tempExcludeStr.slice(0, -4)})`;
        }

        if (topicData.topic_data_source) {
            const tempStr = topicData.topic_data_source
                .split(',')
                .map(source => source.trim())
                .filter(source => source !== '');
            let tempSourceStr = '';
            tempStr.forEach(source => {
                tempSourceStr += `"${source}" OR `;
            });
            strToSearch += ` AND source:(${tempSourceStr.slice(0, -4)})`;
        }

        if (topicData.topic_data_location) {
            const tempStr = topicData.topic_data_location
                .split(',')
                .map(location => location.trim())
                .filter(location => location !== '');
            let tempLocationStr = '';
            tempStr.forEach(location => {
                tempLocationStr += `"${location}" OR `;
            });
            strToSearch += ` AND u_location:(${tempLocationStr.slice(0, -4)})`;
        }

        if (topicData.topic_data_lang) {
            const tempStr = topicData.topic_data_lang
                .split(',')
                .map(lang => lang.trim())
                .filter(lang => lang !== '');
            let tempLangStr = '';
            tempStr.forEach(lang => {
                tempLangStr += `"${lang}" OR `;
            });
            strToSearch += ` AND lange_detect:(${tempLangStr.slice(0, -4)})`;
        }

        // Additional filters
        strToSearch += ` AND NOT source:("DM") AND NOT manual_entry_type:("review")`;

        return strToSearch;
    } catch (error) {
        console.error('Error building query string:', error);
        return '';
    }
};

module.exports = {
    buildQueryString
}; 