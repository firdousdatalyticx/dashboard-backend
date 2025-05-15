// Import all Swagger documentation files
const fs = require('fs');
const path = require('path');

// Import all swagger documentation modules
const socialMediaSwagger = require('./social-media');
const googleSwagger = require('./google');
const topicsSwagger = require('./topics.swagger');
const authSwagger = require('./auth.swagger');
const usersSwagger = require('./users.swagger');
const postsSwagger = require('./posts.swagger');
const topicCategoriesSwagger = require('./topic-categories.swagger');
const reportsSwagger = require('./reports.swagger');
const comparisonAnalysisSwagger = require('./comparison-analysis.swagger');
const alertsSwagger = require('./alerts.swagger');
const middlewareSwagger = require('./middleware.swagger');
const dashboardSwagger = require('./dashboard');

/**
 * Recursively loads all .swagger.js files from a directory
 * @param {string} dir - Directory to scan
 * @returns {Array} - Array of file paths
 */
function loadSwaggerFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      results = results.concat(loadSwaggerFiles(filePath));
    } else if (file.endsWith('.swagger.js')) {
      // Add swagger files to results
      results.push(filePath);
    }
  }
  
  return results;
}

// Combine all paths from different swagger modules
const paths = {
  ...socialMediaSwagger.paths,
  ...googleSwagger.paths,
  ...dashboardSwagger.paths,
  ...topicsSwagger,
  ...authSwagger,
  ...usersSwagger,
  ...postsSwagger,
  ...topicCategoriesSwagger,
  ...reportsSwagger,
  ...comparisonAnalysisSwagger,
  ...alertsSwagger,
  ...middlewareSwagger
};

// Log loaded swagger paths for debugging

// Export the loaded paths
module.exports = { paths }; 