#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

async function main() {
  const credPath = process.argv[2] || '/usr/src/app/client_secret_571123328621-ogk9tsbn5t3g6bcaokmj4h53vbn2hlo8.apps.googleusercontent.com.json';

  if (!fs.existsSync(credPath)) {
    console.error('Client secret JSON not found at', credPath);
    process.exit(2);
  }

  const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_id, client_secret } = raw.web || raw.installed || {};
  if (!client_id || !client_secret) {
    console.error('client_id / client_secret not found in JSON');
    process.exit(2);
  }

  // Use a simple redirect URI that works for web apps
  const redirect = 'http://localhost:3000/auth/callback';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect);
  const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n=== Gmail OAuth Setup ===\n');
  console.log('1) Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2) Grant permission to the application.');
  console.log('3) After granting, you will be redirected to localhost:/auth/callback');
  console.log('4) A page will display your authorization code - copy it from the page.');
  console.log('5) Paste the code below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  rl.question('Enter the authorization code: ', async (code) => {
    rl.close();
    
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      
      console.log('\n=== SUCCESS ===\n');
      console.log('Copy these values to your .env or docker-compose environment:\n');
      console.log(`GMAIL_CLIENT_ID=${client_id}`);
      console.log(`GMAIL_CLIENT_SECRET=${client_secret}`);
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('GMAIL_USER=<your-gmail-email@gmail.com>');
      console.log('\nThen restart the app for Gmail OAuth2 email sending to work.');
      process.exit(0);
    } catch (err) {
      console.error('\nError:', err.message || err);
      process.exit(1);
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
