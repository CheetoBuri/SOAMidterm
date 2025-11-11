const swaggerJSDoc = require('swagger-jsdoc');

const definition = {
  openapi: '3.0.0',
  info: {
    title: 'iBank API',
    version: '1.0.0',
    description: 'API documentation for the iBank tuition payment system'
  },
  servers: [{ url: process.env.SWAGGER_SERVER || 'http://localhost:3000', description: 'Local server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  }
};

const options = {
  definition,
  apis: [
    // controllers that contain JSDoc @openapi blocks
    './src/controllers/*.js'
  ]
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
