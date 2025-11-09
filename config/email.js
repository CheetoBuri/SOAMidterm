require('dotenv').config();

/**
 * Gmail API configuration
 */
const gmailConfig = {
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
  credentials: require('./client_secret.json'),
  tokenStoragePath: './config/gmail-token.json'
};

/**
 * Email configuration
 */
const emailConfig = {
  // SMTP configuration for fallback
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  },
  // Email settings
  from: process.env.SMTP_FROM || 'no-reply@ibank.local',
  templates: {
    otp: {
      subject: 'Your iBank OTP',
      getText: (code, ttl) => `Your OTP code is ${code} (valid ${ttl} minutes).`
    },
    confirmation: {
      subject: 'Payment confirmation',
      getText: (details) => `Your payment was successful: ${details}`
    }
  }
};

module.exports = { gmailConfig, emailConfig };