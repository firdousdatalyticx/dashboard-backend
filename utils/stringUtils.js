/**
 * Cleans input data by removing special characters
 * @param {string} str - The string to clean
 * @returns {string} - The cleaned string
 */
function cleanInputData(str) {
    if (!str) return '';
    
    str = str.trim();
    const charsToRemove = [
        '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
        '-', '_', '+', '=', '{', '[', '}', ']', '|', '\\', ':', ';', 
        '"', "'", '<', ',', '>', '.', '?', '/'
    ];

    charsToRemove.forEach(char => {
        str = str.split(char).join('');
    });

    return str;
}

module.exports = {
    cleanInputData
}; 