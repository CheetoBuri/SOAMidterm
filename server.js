require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const authMiddleware = require('./src/middleware/auth');
const { loginHandler } = require('./src/controllers/auth');
const { getStudentHandler } = require('./src/controllers/student');
const { startTransactionHandler, verifyTransactionHandler, historyHandler, resendOtpHandler } = require('./src/controllers/transactions');
const { getProfileHandler } = require('./src/controllers/profile');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/swagger');

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

// Swagger UI and JSON
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

// OAuth callback endpoint (used by gmail_oauth.js script)
app.get('/auth/callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    res.send(`
      <html>
        <body>
          <h1>Authorization Successful!</h1>
          <p>Authorization code received. You can close this window.</p>
          <p>Go back to the terminal and paste this code:</p>
          <code style="background: #f0f0f0; padding: 10px; display: block; margin: 20px 0;">${code}</code>
          <script>
            // Copy to clipboard automatically
            navigator.clipboard.writeText('${code}').then(() => {
              console.log('Code copied to clipboard!');
            });
          </script>
        </body>
      </html>
    `);
  } else {
    res.status(400).send('No authorization code found in URL.');
  }
});

const runMigrations = require('./src/db_migrate');

const PORT = process.env.PORT || 3000;


async function start() {
  try {
    // Apply any missing schema/migrations before starting the server
    await runMigrations();
  } catch (err) {
    console.error('Migration step failed, exiting:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
