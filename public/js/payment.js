/**
 * Payment page functionality
 * @module payment
 */

import api from './api.js';

// DOM helper
const $ = id => document.getElementById(id);

/**
 * Debug helper for logging
 * @param {string} msg - Message to log
 * @param {*} [data] - Optional data to log
 */
function log(msg, data) {
  console.log(`[Payment] ${msg}`, data || '');
}

// State management
let selectedTuitionId = null;
let selectedTuitionAmount = null;
let otpTimerHandle = null;
let resendCooldownHandle = null;

/**
 * Initialize the payment page
 */
window.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  const token = localStorage.getItem('token');
  if (!token) {
    log('No token found, redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  log('Found existing token, populating payer info');
  populatePayer();

  // Auto-lookup student on Enter or blur
  const studentInput = $('studentId');
  if (studentInput) {
    studentInput.addEventListener('keydown', async (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        await doLookup();
      }
    });
    studentInput.addEventListener('blur', async () => {
      if (studentInput.value.trim()) await doLookup();
    });
  }

  // Event listeners
  $('lookupBtn').addEventListener('click', doLookup);
  $('acceptTerms').addEventListener('change', validateForm);
  $('confirmBtn').addEventListener('click', startTransaction);
  $('otpForm').addEventListener('submit', verifyTransaction);
  $('resendBtn')?.addEventListener('click', resendOTP);
  $('logoutBtn').addEventListener('click', logout);
});

/**
 * Look up a student's tuition records
 */
async function doLookup() {
  log('Looking up student...');
  const token = localStorage.getItem('token');
  if (!token) {
    log('No token found, redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  const studentId = $('studentId').value.trim();
  if (!studentId) {
    log('No student ID entered, skipping lookup');
    return;
  }

  log('Fetching student:', studentId);
  $('lookupBtn').disabled = true;
  clearPaymentForm();
  
  try {
    const resp = await api.getStudent(token, studentId);
    log('Student lookup response:', resp);
    
    if (resp.error) {
      log('Student lookup error:', resp.error);
      alert(resp.error === 'student_not_found' ? 'Student not found' : resp.error);
      $('studentName').value = '';
      $('noTuitions').style.display = 'none';
      $('tuitionRows').innerHTML = '';
    } else {
      log('Found student:', resp.student);
      $('studentName').value = resp.student.full_name;
      
      // Display tuition list
      const tuitions = resp.student.pending_tuitions || [];
      if (tuitions.length === 0) {
        $('noTuitions').style.display = 'block';
        $('tuitionRows').innerHTML = '';
      } else {
        $('noTuitions').style.display = 'none';
        $('tuitionRows').innerHTML = tuitions.map(t => `
          <div class="tuition-row">
            <div>${t.academic_year} (Semester ${t.semester})</div>
            <div>${t.description || 'Tuition Payment'}</div>
            <div style="text-align:right">${(t.amount_cents/100).toFixed(2)}</div>
            <div>
              <button 
                onclick="window.selectTuition(${t.id},${t.amount_cents})" 
                class="select-tuition-btn btn ${canPayTuition(t.amount_cents) ? 'btn-primary' : ''}"
                ${canPayTuition(t.amount_cents) ? '' : 'disabled'}
              >
                Select
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    log('Network error during lookup:', e);
    alert('Network error looking up student. Please try again.');
  } finally {
    $('lookupBtn').disabled = false;
  }
}

/**
 * Check if user has sufficient balance for a tuition amount
 * @param {number} amountCents - Tuition amount in cents
 * @returns {boolean}
 */
function canPayTuition(amountCents) {
  const profile = JSON.parse(localStorage.getItem('profile') || '{}');
  return (profile.balance_cents || 0) >= amountCents;
}

/**
 * Handle tuition selection
 * @param {number} tuitionId - ID of the selected tuition
 * @param {number} amountCents - Amount in cents
 */
window.selectTuition = function(tuitionId, amountCents) {
  log('Selecting tuition:', { tuitionId, amountCents });
  selectedTuitionId = tuitionId;
  selectedTuitionAmount = amountCents;
  
  // Update UI
  document.querySelectorAll('.select-tuition-btn').forEach(btn => {
    btn.style.background = '';
    btn.textContent = 'Select';
  });
  const btn = event.target;
  btn.style.background = '#4CAF50';
  btn.textContent = 'Selected';
  
  validateForm();
};

/**
 * Validate payment form
 */
function validateForm() {
  const profile = JSON.parse(localStorage.getItem('profile') || '{}');
  const payer_balance = profile.balance_cents || 0;
  
  const can = selectedTuitionId != null && // tuition selected
            selectedTuitionAmount > 0 && // valid amount
            payer_balance >= selectedTuitionAmount && // has enough balance
            $('studentName').value && // has student name (valid lookup)
            $('acceptTerms').checked; // terms accepted
            
  $('confirmBtn').disabled = !can;
  
  if (selectedTuitionAmount > payer_balance) {
    log('Insufficient balance:', {
      tuition: selectedTuitionAmount,
      balance: payer_balance
    });
  }
}

/**
 * Start a payment transaction
 */
async function startTransaction() {
  const token = localStorage.getItem('token');
  if (!selectedTuitionId) {
    alert('Please select a tuition to pay');
    return;
  }

  const verifyBtn = $('confirmBtn');
  verifyBtn.disabled = true;
  const originalText = verifyBtn.innerText;
  verifyBtn.innerText = 'Processing...';
  
  try {
    log('Starting transaction for tuition:', selectedTuitionId);
    const resp = await api.startTx(token, selectedTuitionId);
    if (resp.error) {
      log('Transaction start error:', resp.error);
      if (resp.error === 'tuition_not_found_or_already_paid') {
        alert('This tuition has already been paid or is no longer available');
        await doLookup();
      } else {
        alert(resp.error);
      }
      return;
    }
    
    $('otpTxId').value = resp.transactionId;
    $('otpModal').style.display = 'block';
    startOtpTimer(new Date(resp.otpExpiresAt));
    setTimeout(() => { $('otpCode').focus(); }, 50);
  } catch (e) {
    log('Network error starting transaction:', e);
    alert('Network error starting transaction');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.innerText = originalText;
  }
}

/**
 * Verify OTP and complete transaction
 * @param {Event} e - Submit event
 */
async function verifyTransaction(e) {
  e.preventDefault();
  const token = localStorage.getItem('token');
  const txId = $('otpTxId').value;
  const otp = $('otpCode').value.trim();
  
  const verifyBtn = $('verifyBtn');
  verifyBtn.disabled = true;
  const orig = verifyBtn.innerText;
  verifyBtn.innerText = 'Verifying...';
  $('otpError').innerText = '';
  
  try {
    const resp = await api.verifyTx(token, txId, otp);
    if (resp.error) {
      handleVerificationError(resp.error);
      return;
    }
    
    // Success
    alert('Payment successful');
    $('otpModal').style.display = 'none';
    await updateProfile(token, resp.new_balance_cents);
    clearPaymentForm();
  } catch (e) {
    log('Network error during verification:', e);
    $('otpError').innerText = 'Network error — please try again.';
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.innerText = orig;
  }
}

/**
 * Handle verification error messages
 * @param {string} error - Error code from API
 */
function handleVerificationError(error) {
  switch (error) {
    case 'invalid_otp':
      $('otpError').innerText = 'Invalid code. Please try again.';
      break;
    case 'otp_expired':
      $('otpError').innerText = 'This code expired. Please resend to get a new one.';
      break;
    case 'otp_attempts_exceeded':
      $('otpError').innerText = 'Too many invalid attempts. Transaction canceled.';
      setTimeout(() => { $('otpModal').style.display = 'none'; }, 1500);
      break;
    case 'insufficient_balance_at_finalize':
      $('otpModal').style.display = 'none';
      alert('Insufficient balance — payment could not be completed.');
      break;
    case 'tuition_already_paid_or_modified':
      $('otpModal').style.display = 'none';
      alert('Tuition has already been paid or was modified.');
      break;
    default:
      $('otpError').innerText = error;
  }
}

/**
 * Update user profile after successful payment
 * @param {string} token - JWT token
 * @param {number|null} new_balance_cents - New balance from API
 */
async function updateProfile(token, new_balance_cents) {
  if (new_balance_cents != null) {
    try {
      log('Refreshing profile...');
      const profResp = await api.profile(token);
      if (!profResp.error && profResp.profile) {
        localStorage.setItem('profile', JSON.stringify(profResp.profile));
      } else {
        // fallback: update stored balance
        const p = JSON.parse(localStorage.getItem('profile') || '{}');
        p.balance_cents = new_balance_cents;
        localStorage.setItem('profile', JSON.stringify(p));
      }
    } catch (e) {
      log('Error refreshing profile:', e);
    }
  }
  populatePayer();
}

/**
 * Start OTP expiration timer
 * @param {Date} expiresAt - OTP expiration timestamp
 */
function startOtpTimer(expiresAt) {
  const el = $('otpTimer');
  if (!el) return;
  
  if (otpTimerHandle) clearInterval(otpTimerHandle);
  
  function update() {
    const now = new Date();
    const diff = Math.max(0, Math.floor((new Date(expiresAt) - now) / 1000));
    const mm = String(Math.floor(diff/60)).padStart(2,'0');
    const ss = String(diff%60).padStart(2,'0');
    el.innerText = `OTP expires in ${mm}:${ss}`;
    
    if (diff <= 0) {
      clearInterval(otpTimerHandle);
      $('otpError').innerText = 'OTP expired. Please resend to get a new code.';
      if ($('verifyBtn')) $('verifyBtn').disabled = true;
    } else {
      if ($('verifyBtn')) $('verifyBtn').disabled = false;
    }
  }
  
  update();
  otpTimerHandle = setInterval(update, 1000);
}

/**
 * Handle resend OTP cooldown
 * @param {number} seconds - Cooldown duration
 */
function startResendCooldown(seconds) {
  const btn = $('resendBtn');
  if (!btn) return;
  
  let s = seconds;
  btn.disabled = true;
  btn.innerText = `Resend (${s}s)`;
  
  if (resendCooldownHandle) clearInterval(resendCooldownHandle);
  
  resendCooldownHandle = setInterval(() => {
    s -= 1;
    if (s <= 0) {
      clearInterval(resendCooldownHandle);
      btn.disabled = false;
      btn.innerText = 'Resend OTP';
    } else {
      btn.innerText = `Resend (${s}s)`;
    }
  }, 1000);
}

/**
 * Resend OTP
 */
async function resendOTP() {
  const token = localStorage.getItem('token');
  const txId = $('otpTxId').value;
  if (!txId) {
    alert('No transaction to resend OTP for');
    return;
  }

  const btn = $('resendBtn');
  btn.disabled = true;
  btn.innerText = 'Resending...';
  
  try {
    const resp = await api.resendOtp(token, txId);
    if (resp.error) {
      $('otpError').innerText = resp.error;
      return;
    }
    
    startOtpTimer(new Date(resp.otpExpiresAt));
    $('otpCode').value = '';
    $('otpError').innerText = '';
    startResendCooldown(30);
    alert('OTP resent. Check your email.');
  } catch (e) {
    log('Network error during resend:', e);
    $('otpError').innerText = 'Network error when resending OTP.';
  } finally {
    btn.innerText = 'Resend OTP';
  }
}

/**
 * Update payer information display
 */
function populatePayer() {
  log('Populating payer info');
  const p = JSON.parse(localStorage.getItem('profile') || '{}');
  $('payerName').value = p.full_name || '';
  $('payerPhone').value = p.phone || '';
  $('payerEmail').value = p.email || '';
  $('availableBalance').value = (p.balance_cents/100 || 0).toFixed(2);
}

/**
 * Clear payment form
 */
function clearPaymentForm() {
  $('studentId').value = '';
  $('studentName').value = '';
  $('tuitionRows').innerHTML = '';
  $('noTuitions').style.display = 'none';
  $('acceptTerms').checked = false;
  $('confirmBtn').disabled = true;
  selectedTuitionId = null;
  selectedTuitionAmount = null;
}

/**
 * Handle logout
 */
function logout() {
  log('Logging out');
  localStorage.removeItem('token');
  localStorage.removeItem('profile');
  window.location.href = 'login.html';
}