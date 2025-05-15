/**
 * Gets the source icon name based on the source type
 * @param {string} userSource - The source type
 * @returns {string} - The source icon name
 */
const getSourceIcon = (userSource) => {
    if (['khaleej_times', 'Omanobserver', 'Time of oman', 'Blogs'].includes(userSource)) {
        return 'Blog';
    } else if (userSource === 'Reddit') {
        return 'Reddit';
    } else if (['FakeNews', 'News'].includes(userSource)) {
        return 'News';
    } else if (userSource === 'Tumblr') {
        return 'Tumblr';
    } else if (userSource === 'Vimeo') {
        return 'Vimeo';
    } else if (['Web', 'DeepWeb'].includes(userSource)) {
        return 'Web';
    }
    return userSource;
};

module.exports = {
    getSourceIcon
}; 