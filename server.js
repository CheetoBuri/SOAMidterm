require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

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

// Routes
app.post('/api/login', loginHandler);
app.get('/api/student/:studentId', authMiddleware, getStudentHandler);
app.post('/api/transactions/start', authMiddleware, startTransactionHandler);
app.post('/api/transactions/verify', authMiddleware, verifyTransactionHandler);
app.post('/api/transactions/resend', authMiddleware, resendOtpHandler);
app.get('/api/transactions/history', authMiddleware, historyHandler);
app.get('/api/profile', authMiddleware, getProfileHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
