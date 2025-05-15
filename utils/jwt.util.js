const jwt = require('jsonwebtoken');

// JWT Secret should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-should-be-in-env-file';
const JWT_EXPIRES_IN = '30d'; // 30 days

/**
 * Generate a JWT token
 * @param {Object} payload - The data to encode in the token
 * @returns {string} - The JWT token
 */
const generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify a JWT token
 * @param {string} token - The JWT token to verify
 * @returns {Object} - The decoded token payload
 */
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

module.exports = {
    generateToken,
    verifyToken,
    JWT_SECRET,
    JWT_EXPIRES_IN
}; 