const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);
const OTP_SECRET = process.env.OTP_SECRET || (process.env.JWT_SECRET || 'otp-secret-dev');

// SMTP configuration via env vars. If SMTP_HOST is not set, fall back to jsonTransport (mock)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for 465
const SMTP_USER = process.env.SMTP_USER || undefined;
const SMTP_PASS = process.env.SMTP_PASS || undefined;
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@ibank.local';

let transporter;
if (SMTP_HOST) {
  // Real SMTP transport
  const opts = {
    host: SMTP_HOST,
    port: SMTP_PORT || 587,
    secure: SMTP_SECURE || false,
  };
  if (SMTP_USER) {
    opts.auth = { user: SMTP_USER, pass: SMTP_PASS };
  }
  // optional TLS settings
  if (process.env.SMTP_TLS_REJECT === 'false') {
    opts.tls = { rejectUnauthorized: false };
  }

  transporter = nodemailer.createTransport(opts);
  // verify transporter on startup (non-blocking)
  transporter.verify().then(() => {
    console.log('SMTP transporter ready');
  }).catch((err) => {
    console.warn('SMTP transporter verification failed:', err && err.message ? err.message : err);
  });
} else {
  // JSON transport for prototype/testing (prints to logs)
  transporter = nodemailer.createTransport({ jsonTransport: true });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code) {
  return crypto.createHmac('sha256', OTP_SECRET).update(String(code)).digest('hex');
}

async function sendOtpEmail(to, code) {
  const mail = {
    from: SMTP_FROM,
    to,
    subject: 'Your iBank OTP',
    text: `Your OTP code is ${code} (valid ${OTP_TTL_MIN} minutes).`
  };
  try {
    const info = await transporter.sendMail(mail);
    if (SMTP_HOST) {
      console.log('OTP mail sent via SMTP to', to, 'messageId=', info && info.messageId);
    } else {
      console.log('OTP mail (mock):', info);
    }
  } catch (err) {
    console.error('Failed to send OTP email:', err && err.message ? err.message : err);
    throw err;
  }
}

async function sendConfirmationEmail(to, details) {
  const mail = {
    from: SMTP_FROM,
    to,
    subject: 'Payment confirmation',
    text: `Your payment was successful: ${details}`
  };
  try {
    const info = await transporter.sendMail(mail);
    if (SMTP_HOST) {
      console.log('Confirmation mail sent via SMTP to', to, 'messageId=', info && info.messageId);
    } else {
      console.log('Confirmation mail (mock):', info);
    }
  } catch (err) {
    console.error('Failed to send confirmation email:', err && err.message ? err.message : err);
    // don't rethrow confirmation email failures; log only
  }
}

module.exports = { generateOtp, hashOtp, sendOtpEmail, sendConfirmationEmail, OTP_TTL_MIN };
