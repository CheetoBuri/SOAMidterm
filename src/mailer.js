const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { google } = require('googleapis');
require('dotenv').config();

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);
const OTP_SECRET = process.env.OTP_SECRET || (process.env.JWT_SECRET || 'otp-secret-dev');

// SMTP configuration via env vars. If SMTP_HOST is not set, we may use Gmail OAuth2
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for 465
const SMTP_USER = process.env.SMTP_USER || undefined;
const SMTP_PASS = process.env.SMTP_PASS || undefined;
const SMTP_FROM = process.env.SMTP_FROM || process.env.GMAIL_USER || 'no-reply@ibank.local';

// Gmail OAuth2 config (optional)
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
const GMAIL_USER = process.env.GMAIL_USER || '';

let transporter;

async function createTransporter() {
  // If explicit SMTP host provided, use SMTP transport
  if (SMTP_HOST) {
    const opts = {
      host: SMTP_HOST,
      port: SMTP_PORT || 587,
      secure: SMTP_SECURE || false,
    };
    if (SMTP_USER) {
      opts.auth = { user: SMTP_USER, pass: SMTP_PASS };
    }
    if (process.env.SMTP_TLS_REJECT === 'false') {
      opts.tls = { rejectUnauthorized: false };
    }
    const t = nodemailer.createTransport(opts);
    try {
      await t.verify();
      console.log('SMTP transporter ready');
    } catch (err) {
      console.warn('SMTP transporter verification failed:', err && err.message ? err.message : err);
    }
    return t;
  }

  // If Gmail OAuth2 credentials present, create OAuth2-based transporter
  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_USER) {
    const oAuth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
    oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    // getAccessToken() returns an object with token string; nodemailer accepts either string or object
    const accessTokenObj = await oAuth2Client.getAccessToken();
    const accessToken = accessTokenObj && accessTokenObj.token ? accessTokenObj.token : accessTokenObj;

    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
        accessToken
      }
    });

    try {
      await t.verify();
      console.log('Gmail OAuth2 transporter ready for', GMAIL_USER);
    } catch (err) {
      console.warn('Gmail transporter verification failed:', err && err.message ? err.message : err);
    }
    return t;
  }

  // Fallback: JSON transport for prototype/testing (prints to logs)
  console.log('Using JSON transport for emails (SMTP and Gmail OAuth2 not configured)');
  return nodemailer.createTransport({ jsonTransport: true });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code) {
  return crypto.createHmac('sha256', OTP_SECRET).update(String(code)).digest('hex');
}

async function ensureTransporter() {
  if (!transporter) transporter = await createTransporter();
  return transporter;
}

async function sendOtpEmail(to, code) {
  const t = await ensureTransporter();
  const mail = {
    from: SMTP_FROM,
    to,
    subject: 'Your iBank OTP',
    text: `Your OTP code is ${code} (valid ${OTP_TTL_MIN} minutes).`
  };
  try {
    const info = await t.sendMail(mail);
    // nodemailer returns different shapes depending on transport
    console.log('OTP mail sent to', to, 'info=', info && (info.messageId || info));
    return info;
  } catch (err) {
    console.error('Failed to send OTP email:', err && err.message ? err.message : err);
    throw err;
  }
}

async function sendConfirmationEmail(to, details) {
  const t = await ensureTransporter();
  const mail = {
    from: SMTP_FROM,
    to,
    subject: 'Payment confirmation',
    text: `Your payment was successful: ${details}`
  };
  try {
    const info = await t.sendMail(mail);
    console.log('Confirmation mail sent to', to, 'info=', info && (info.messageId || info));
    return info;
  } catch (err) {
    console.error('Failed to send confirmation email:', err && err.message ? err.message : err);
    // don't rethrow confirmation email failures; log only
  }
}

module.exports = { generateOtp, hashOtp, sendOtpEmail, sendConfirmationEmail, OTP_TTL_MIN };
