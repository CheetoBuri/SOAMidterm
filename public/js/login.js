/**
 * Login page functionality
 * @module login
 */

import api from './api.js';

/**
 * Debug helper for logging
 * @param {string} msg - Message to log
 * @param {*} [data] - Optional data to log
 */
function log(msg, data) {
  console.log(`[Login] ${msg}`, data || '');
}

document.addEventListener('DOMContentLoaded', () => {
  log('Page loaded, checking backend...');
  
  // Test backend connection
  fetch(`${api.API_BASE}/api/login`)
    .then(r => log('Backend is reachable', { status: r.status }))
    .catch(e => log('Backend not reachable', e));

  const form = document.getElementById('loginForm');
  const errEl = document.getElementById('loginError');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    log('Attempting login', { username });
    try {
      log('Sending login request...');
      const body = await api.login(username, password);
      log('Got response', body);
      
      if (body.token) {
        log('Login successful, saving token and profile');
        localStorage.setItem('token', body.token);
        localStorage.setItem('profile', JSON.stringify(body.profile));
        
        // redirect to payment page
        log('Redirecting to payment page');
        window.location.href = 'index.html';
      } else {
        log('Login failed', body);
        errEl.textContent = body.error || 'Login failed';
      }
    } catch (err) {
      log('Error during login', err);
      errEl.textContent = `Error: ${err.message}. Make sure backend is running.`;
    }
  });
});