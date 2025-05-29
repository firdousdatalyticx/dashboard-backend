const { format, subDays, subHours } = require('date-fns');

/**
 * Process time slot selection and return corresponding date range
 * @param {string} timeSlot - Selected time slot (Last 24 hours, Last 7 days, Last 30 days)
 * @param {string} fromDate - Start date for custom range
 * @param {string} toDate - End date for custom range
 * @returns {Object} - Object with formatted greaterThanTime and lessThanTime
 */
const processTimeSlot = (timeSlot, fromDate, toDate) => {
    const now = new Date();
    let greaterThanTime;
    let lessThanTime = format(now, 'yyyy-MM-dd');

    switch (timeSlot) {
        case 'Last 24 hours':
        case '24h':
        case 'last24hours':
            greaterThanTime = format(subHours(now, 24), 'yyyy-MM-dd');
            break;
        case 'Last 7 days':
        case '7d':
        case 'last7days':
            greaterThanTime = format(subDays(now, 7), 'yyyy-MM-dd');
            break;
        case 'Last 30 days':
        case '30d':
        case 'last30days':
            greaterThanTime = format(subDays(now, 30), 'yyyy-MM-dd');
            break;
        case 'Last 60 days':
        case '60d':
        case 'last60days':
            greaterThanTime = format(subDays(now, 60), 'yyyy-MM-dd');
            break;
        case 'Last 90 days':
        case '90d':
        case 'last90days':
            greaterThanTime = format(subDays(now, 90), 'yyyy-MM-dd');
            break;
        case 'Last 120 days':
        case '120d':
        case 'last120days':
            greaterThanTime = format(subDays(now, 120), 'yyyy-MM-dd');
            break;
        case 'today':
            greaterThanTime = format(now, 'yyyy-MM-dd');
            break;
        default:
            // Handle fromDate and toDate if present
            if (fromDate) {
                greaterThanTime = format(new Date(fromDate), 'yyyy-MM-dd');
            } else {
                greaterThanTime = format(subDays(now, 90), 'yyyy-MM-dd');
            }

            if (toDate) {
                lessThanTime = format(new Date(toDate), 'yyyy-MM-dd');
            }
    }

    return { greaterThanTime, lessThanTime };
};

/**
 * Process sentiment type selection and add to query string
 * @param {string} sentimentType - Selected sentiment type (Positive, Negative, Neutral)
 * @param {string} queryString - Existing query string to append to
 * @returns {string} - Updated query string with sentiment filter
 */
const processSentimentType = (sentimentType, queryString) => {
    if (!sentimentType || sentimentType === 'undefined' || sentimentType === 'null') {
        return queryString;
    }

    if (sentimentType.includes(',')) {
        // Handle multiple sentiment types
        const sentimentArray = sentimentType.split(',');
        const sentimentStr = sentimentArray.map(s => `"${s}"`).join(' OR ');
        return `${queryString} AND predicted_sentiment_value:(${sentimentStr})`;
    } else {
        // Handle single sentiment type
        return `${queryString} AND predicted_sentiment_value:("${sentimentType}")`;
    }
};

/**
 * Process all filters and return parameters for Elasticsearch query
 * @param {Object} filters - Filter parameters
 * @returns {Object} - Processed filter parameters
 */
const processFilters = (filters) => {
    const {
        sentimentType,
        timeSlot,
        fromDate,
        toDate,
        queryString = '',
        isSpecialTopic = false
    } = filters;    

    // Process date range using timeSlot or fromDate/toDate
    let dateRange;
    
    if (isSpecialTopic) {
        // For special topic (2600), use wider date range if no specific dates provided
        if (fromDate || toDate) {
            // Use provided dates
            dateRange = processTimeSlot(timeSlot, fromDate, toDate);
        } else {
            // Use wider range instead of default 90 days
            const now = new Date();
            dateRange = {
                greaterThanTime: '2020-01-01',
                lessThanTime: format(now, 'yyyy-MM-dd')
            };
        }
    } else {
        // Original logic for regular topics
        dateRange = processTimeSlot(timeSlot, fromDate, toDate);
    }

    // Process sentiment filter
    const updatedQueryString = processSentimentType(sentimentType, queryString);

    return {
        ...dateRange,
        queryString: updatedQueryString,
        isSpecialTopic
    };
};

module.exports = {
    processTimeSlot,
    processSentimentType,
    processFilters
}; 