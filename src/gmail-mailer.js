const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
require('dotenv').config();

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 5);
const OTP_SECRET = process.env.OTP_SECRET || (process.env.JWT_SECRET || 'otp-secret-dev');

// Load client secrets from file
const credentials = require('./client_secret_571123328621-ogk9tsbn5t3g6bcaokmj4h53vbn2hlo8.apps.googleusercontent.com.json');
const { client_secret, client_id, redirect_uris } = credentials.web;

// Create OAuth2 client
const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

// Gmail API requires these scopes
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// Token storage (in-memory for demo; use secure storage in production)
let savedToken = null;

async function getAccessToken() {
  if (savedToken) {
    // Check if token is expired
    const expiryDate = savedToken.expiry_date;
    if (expiryDate && expiryDate > Date.now()) {
      return savedToken;
    }
  }

  // Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting:', authUrl);
  console.log('After authorization, copy the code from the redirect URL and set it in GMAIL_AUTH_CODE env var');
  console.log('Then restart the server to complete Gmail API setup');

  // Check for auth code in env (for demo; use secure storage in production)
  const code = process.env.GMAIL_AUTH_CODE;
  if (!code) {
    throw new Error('Gmail API needs authorization. Set GMAIL_AUTH_CODE env var with the code from the auth URL');
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    savedToken = tokens;
    oAuth2Client.setCredentials(tokens);
    return tokens;
  } catch (err) {
    console.error('Error getting Gmail API token:', err);
    throw err;
  }
}

// Initialize Gmail API
let gmail = null;
async function getGmail() {
  if (!gmail) {
    await getAccessToken();
    gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
  }
  return gmail;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code) {
  return crypto.createHmac('sha256', OTP_SECRET).update(String(code)).digest('hex');
}

async function sendEmail(to, subject, text) {
  try {
    const gmail = await getGmail();
    
    // Encode email content
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      'From: iBank Tuition Payment <me>',
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('Email sent via Gmail API:', res.data);
    return res.data;
  } catch (err) {
    console.error('Gmail API error:', err);
    throw err;
  }
}

async function sendOtpEmail(to, code) {
  const subject = 'Your iBank OTP';
  const text = `Your OTP code is ${code} (valid ${OTP_TTL_MIN} minutes).`;
  return sendEmail(to, subject, text);
}

async function sendConfirmationEmail(to, details) {
  const subject = 'Payment confirmation';
  const text = `Your payment was successful: ${details}`;
  return sendEmail(to, subject, text);
}

// Try to initialize Gmail API on startup
getGmail().then(() => {
  console.log('Gmail API initialized successfully');
}).catch(err => {
  console.warn('Gmail API initialization failed (will retry on first email):', err.message);
});

module.exports = { generateOtp, hashOtp, sendOtpEmail, sendConfirmationEmail, OTP_TTL_MIN };