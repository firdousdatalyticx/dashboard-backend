 const formatSafeDate = (date) => {
    if (!date) return format(new Date(), 'yyyy-MM-dd');
    const dateObj = new Date(date);
    return isNaN(dateObj.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(dateObj, 'yyyy-MM-dd');
};

module.exports = {
    formatSafeDate
}; 