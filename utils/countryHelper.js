/**
 * Gets the country code for a given country name
 * @param {string} countryName - The name of the country
 * @returns {string} - The country flag emoji or empty string
 */
const getCountryCode = async (countryName) => {
    try {
        // You might want to implement a more sophisticated country code mapping
        // For now, returning a simple flag emoji based on the country name
        return countryName ? '🏳️' : '&nbsp;';
    } catch (error) {
        console.error('Error getting country code:', error);
        return '&nbsp;';
    }
};

module.exports = {
    getCountryCode
}; 