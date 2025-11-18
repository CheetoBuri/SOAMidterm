require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const authMiddleware = require('./src/middleware/auth');
const { loginHandler } = require('./src/controllers/auth');
const { getStudentHandler } = require('./src/controllers/student');
const { startTransactionHandler, verifyTransactionHandler, historyHandler, resendOtpHandler, cancelTransactionHandler, deleteTransactionHandler } = require('./src/controllers/transactions');
const { getProfileHandler } = require('./src/controllers/profile');

const app = express();
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
}));

// Middleware to override date header with Vietnam timezone
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    // Set date header with Vietnam timezone format
    const vietnamDate = new Date().toLocaleString('en-US', { 
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    res.set('date', vietnamDate + ' +07:00');
    return originalJson.call(this, data);
  };
  next();
});

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

// Swagger UI setup with authentication support
const swaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'iBank API Documentation',
  swaggerOptions: {
    persistAuthorization: true, // Persist authorization token
    displayRequestDuration: true,
  },
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

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
 *                 example: "alice"
 *               password:
 *                 type: string
 *                 example: "alice123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *                 profile:
 *                   type: object
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid credentials"
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
 *         description: Student registration number (MSSV)
 *         example: "20190001"
 *     responses:
 *       200:
 *         description: Student information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 student:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Internal student ID
 *                     student_id:
 *                       type: string
 *                       description: Student registration number (MSSV)
 *                       example: "20190001"
 *                     full_name:
 *                       type: string
 *                       example: "Tran Van A"
 *                     pending_tuitions:
 *                       type: array
 *                       description: |
 *                         List of pending tuition records.
 *                         
 *                         **Special behavior for student 20190001 with multiple tuitions:**
 *                         - Individual tuitions are listed first (read-only, for information only)
 *                         - A combined payment option (id=0, mandatory=true) is included at the end
 *                         - Individual tuitions cannot be paid separately - only the combined option (id=0) can be used for payment
 *                         - This ensures all pending tuitions are paid together in a single transaction
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: |
 *                               Tuition record ID.
 *                               - For regular students: Use this ID to pay individual tuitions
 *                               - For student 20190001 with multiple tuitions: Individual tuition IDs are read-only (cannot be used for payment). Only id=0 (combined payment) can be used.
 *                             example: 1
 *                           academic_year:
 *                             type: integer
 *                             nullable: true
 *                             description: Academic year (null for combined payment option)
 *                             example: 2023
 *                           semester:
 *                             type: integer
 *                             nullable: true
 *                             description: Semester number (null for combined payment option)
 *                             example: 1
 *                           amount_cents:
 *                             type: integer
 *                             description: Amount in cents (for combined payment, this is the total of all tuitions)
 *                             example: 50000
 *                           description:
 *                             type: string
 *                             example: "Fall 2023 Semester Tuition"
 *                           read_only:
 *                             type: boolean
 *                             description: True if this tuition is read-only (individual tuition for student 20190001, cannot be paid separately)
 *                             example: false
 *                           is_combined:
 *                             type: boolean
 *                             description: True if this is a combined payment option (student 20190001 only)
 *                             example: false
 *                           mandatory:
 *                             type: boolean
 *                             description: True if this payment option is mandatory (combined payment for student 20190001)
 *                             example: false
 *                           tuition_count:
 *                             type: integer
 *                             description: Number of tuitions included in combined payment (only for combined option)
 *                             example: 2
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "missing_token"
 *       404:
 *         description: Student not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "student_not_found"
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
 *               - studentId
 *               - tuitionId
 *             properties:
 *               studentId:
 *                 type: string
 *                 description: Student registration number (MSSV) that owns the tuition
 *                 example: "20190001"
 *               tuitionId:
 *                 type: integer
 *                 description: |
 *                   Per-student tuition ID (as shown in /api/student/{studentId}).
 *                   
 *                   **Special rules for student 20190001 with multiple pending tuitions:**
 *                   - Individual tuition IDs (1, 2, etc.) are NOT accepted - they are read-only for information only
 *                   - **MUST use tuitionId = 0** to pay all tuitions combined in a single transaction
 *                   - This is mandatory - individual tuitions cannot be paid separately
 *                   
 *                   For other students, use the tuition ID from the pending_tuitions list.
 *                 example: 0
 *     responses:
 *       200:
 *         description: Transaction started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionId:
 *                   type: integer
 *                   description: Transaction ID (for combined payments, this is the group ID)
 *                 otpExpiresAt:
 *                   type: string
 *                   format: date-time
 *                 isCombined:
 *                   type: boolean
 *                   description: True if this is a combined payment (only for student 20190001)
 *                   example: true
 *                 tuitionCount:
 *                   type: integer
 *                   description: Number of tuitions included in combined payment (only for combined payments)
 *                   example: 2
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum: [missing_studentId, missing_tuitionId, invalid_tuitionId, insufficient_balance]
 *                   example: "invalid_tuitionId"
 *       404:
 *         description: Tuition not found for the provided student or already paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "tuition_not_found_for_student"
 *       401:
 *         description: Unauthorized
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
 * /api/transactions/cancel:
 *   post:
 *     summary: Cancel a pending transaction
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
 *                 description: Transaction ID to cancel
 *                 example: 42
 *     responses:
 *       200:
 *         description: Transaction cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Bad request (missing id, not pending)
 *       403:
 *         description: Transaction does not belong to user
 *       404:
 *         description: Transaction not found
 */
app.post('/api/transactions/cancel', authMiddleware, cancelTransactionHandler);

/**
 * @swagger
 * /api/transactions/delete:
 *   post:
 *     summary: Delete a non-successful transaction from history
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
 *                 description: Transaction ID to delete (only failed/cancelled)
 *                 example: 15
 *     responses:
 *       200:
 *         description: Transaction deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Transaction not eligible for deletion
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Transaction not found
 */
app.post('/api/transactions/delete', authMiddleware, deleteTransactionHandler);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       amount_cents:
 *                         type: integer
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         description: ISO string in Asia/Ho_Chi_Minh timezone (UTC+07:00)
 *                         example: "2025-11-18T13:45:12+07:00"
 *                       confirmed_at:
 *                         type: string
 *                         nullable: true
 *                         description: ISO string in Asia/Ho_Chi_Minh timezone (UTC+07:00)
 *                       mssv:
 *                         type: string
 *                       student_name:
 *                         type: string
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

function toAppTimezoneIso(dateTime) {
  if (!dateTime) return null;
  // Convert to Asia/Ho_Chi_Minh timezone (UTC+07:00) and format as ISO string
  return new Date(dateTime + 'Z').toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replace('T', ' ').replace('Z', '');
}

function convertTransactionRows(rows) {
  const transactions = rows.map((row) => ({
    ...row,
    created_at: toAppTimezoneIso(row.created_at),
    confirmed_at: toAppTimezoneIso(row.confirmed_at)
  }));
}
