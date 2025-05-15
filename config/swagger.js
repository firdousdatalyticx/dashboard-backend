const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { swaggerFiles } = require('../docs/swagger');
const path = require('path');

// Swagger definition
const swaggerConfig = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SCAD Backend API',
      version: '1.0.0',
      description: 'API documentation for SCAD Backend',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: '/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js',
    './routes/*/*.js',
    './routes/*/*/*.js',
    './docs/*.yaml',
    './docs/swagger/*.swagger.js',
    './docs/swagger/**/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(swaggerConfig);

const swaggerDocs = (app) => {
  // Swagger UI configuration
  const options = {
    explorer: true,
    swaggerOptions: {
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none'
    }
  };
  
  // Swagger page
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, options));

  // Docs in JSON format
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('Swagger docs available at /api/docs');
};

module.exports = { swaggerDocs }; 