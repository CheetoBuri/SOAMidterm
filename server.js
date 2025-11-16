require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const authMiddleware = require('./src/middleware/auth');
const { loginHandler } = require('./src/controllers/auth');
const { getStudentHandler } = require('./src/controllers/student');
const { startTransactionHandler, verifyTransactionHandler, historyHandler, resendOtpHandler } = require('./src/controllers/transactions');
const { getProfileHandler } = require('./src/controllers/profile');

const app = express();
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'iBank Tuition Payment API',
      version: '1.0.0',
      description: 'API documentation for iBanking tuition payment system',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./server.js', './src/controllers/*.js'], // Paths to files containing OpenAPI definitions
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post('/api/login', loginHandler);

/**
 * @swagger
 * /api/student/{studentId}:
 *   get:
 *     summary: Get student information and pending tuitions
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student information
 *       404:
 *         description: Student not found
 */
app.get('/api/student/:studentId', authMiddleware, getStudentHandler);

/**
 * @swagger
 * /api/transactions/start:
 *   post:
 *     summary: Start a new payment transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tuitionId
 *             properties:
 *               tuitionId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Transaction started
 */
app.post('/api/transactions/start', authMiddleware, startTransactionHandler);

/**
 * @swagger
 * /api/transactions/verify:
 *   post:
 *     summary: Verify OTP and complete payment
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - otpCode
 *             properties:
 *               transactionId:
 *                 type: integer
 *               otpCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment successful
 */
app.post('/api/transactions/verify', authMiddleware, verifyTransactionHandler);

/**
 * @swagger
 * /api/transactions/resend:
 *   post:
 *     summary: Resend OTP for a transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *             properties:
 *               transactionId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: OTP resent
 */
app.post('/api/transactions/resend', authMiddleware, resendOtpHandler);

/**
 * @swagger
 * /api/transactions/history:
 *   get:
 *     summary: Get transaction history
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction history
 */
app.get('/api/transactions/history', authMiddleware, historyHandler);

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
app.get('/api/profile', authMiddleware, getProfileHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
