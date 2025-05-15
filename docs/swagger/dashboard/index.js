/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard analytics endpoints for displaying data visualizations
 */

const keywordsSwagger = require('./keywords.swagger');

module.exports = {
  paths: {
    ...keywordsSwagger
  }
}; 