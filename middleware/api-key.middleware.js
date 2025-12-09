/**
 * Simple API Key verification middleware
 * Checks for X-API-Key header value to verify access
 */
const apiKeyMiddleware = (req, res, next) => {
  try {
    // Get API key from environment variable or use a default
    const expectedApiKey = process.env.SCHEDULE_DATA_API_KEY || 'sk_9xK2mP8nQ5vR7tY3wZ6bC4dF1hJ0lM9nB2vX5cZ8aE';
    
    // Check for API key in X-API-Key header only
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required. Please provide X-API-Key header.'
      });
    }

    // Verify the API key matches
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // API key is valid, proceed
    next();
  } catch (error) {
    console.error('API key middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error during API key verification'
    });
  }
};

module.exports = apiKeyMiddleware;
