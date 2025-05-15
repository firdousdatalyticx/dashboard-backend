// Import Swagger docs
const swaggerSchemas = require('./docs/swagger/schemas');
const socialMediaSwagger = require('./docs/swagger/social-media');
const googleSwagger = require('./docs/swagger/google');

// Swagger setup
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'SCAD API Documentation',
            version: '1.0.0',
            description: 'API documentation for SCAD backend services'
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: [
        './routes/*.js',
        './routes/*/*.js'
    ]
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Add schema definitions to swagger spec
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec)); 

app.use((req, res, next) => {
    console.log(req.headers);
    next();
  });
  