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
let selectedTuitionPublicId = null;
let selectedTuitionAmount = null;
let currentStudentMssv = null;
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
    studentInput.addEventListener('input', () => {
      currentStudentMssv = null;
      selectedTuitionPublicId = null;
      selectedTuitionAmount = null;
      validateForm();
    });
  }

  // Event listeners
  $('lookupBtn').addEventListener('click', doLookup);
  $('acceptTerms').addEventListener('change', validateForm);
  $('confirmBtn').addEventListener('click', startTransaction);
  $('otpForm').addEventListener('submit', verifyTransaction);
  $('resendBtn')?.addEventListener('click', resendOTP);
  $('logoutBtn').addEventListener('click', logout);
  $('refreshHistoryBtn')?.addEventListener('click', async () => {
    await loadHistory();
    const token = localStorage.getItem('token');
    if (token) await updateProfile(token);
  });
  document.addEventListener('click', onHistoryActionClick);

  // Load transaction history on page load
  loadHistory();
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
  $('studentId').value = studentId;
  currentStudentMssv = null;
  selectedTuitionPublicId = null;
  selectedTuitionAmount = null;
  
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
      currentStudentMssv = studentId;
      
      // Display tuition list
      const tuitions = resp.student.pending_tuitions || [];
      if (tuitions.length === 0) {
        $('noTuitions').style.display = 'block';
        $('tuitionRows').innerHTML = '';
      } else {
        $('noTuitions').style.display = 'none';
        // Check if this is student 20190001 with mandatory combined payment
        const hasMandatoryCombined = tuitions.some(t => t.mandatory === true);
        const individualTuitions = tuitions.filter(t => !t.is_combined && !t.mandatory);
        const combinedOption = tuitions.find(t => t.is_combined && t.mandatory);
        
        let html = '';
        
        // Display individual tuitions (read-only, no select button) for student 20190001
        if (hasMandatoryCombined && individualTuitions.length > 0) {
          // Show individual tuitions as a list (read-only)
          html += individualTuitions.map(t => `
            <div class="tuition-row">
              <div style="font-weight:600;color:#0b74de">#${t.id}</div>
              <div>${t.academic_year || ''} ${t.academic_year ? `(Semester ${t.semester})` : ''}</div>
              <div>${t.description || 'Tuition Payment'}</div>
              <div style="text-align:right">${(t.amount_cents/100).toFixed(2)}</div>
              <div></div>
            </div>
          `).join('');
          
          // Display separate Pay All button section
          if (combinedOption) {
            const totalAmount = combinedOption.amount_cents;
            html += `
              <div style="margin-top:20px;padding:15px;background-color:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <div>
                    <div style="font-weight:bold;font-size:1.1em;margin-bottom:5px;">Total Amount to Pay</div>
                    <div style="color:#666;font-size:0.9em;">All ${combinedOption.tuition_count || individualTuitions.length} tuitions (Mandatory)</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:bold;font-size:1.3em;color:#0b74de;">${(totalAmount/100).toFixed(2)} VND</div>
                  </div>
                </div>
                <button 
                  onclick="window.selectTuition(${combinedOption.id},${totalAmount})" 
                  class="select-tuition-btn pay-all-btn btn ${canPayTuition(totalAmount) ? 'btn-primary' : 'btn-secondary'}"
                  ${canPayTuition(totalAmount) ? '' : 'disabled'}
                  style="width:100%;padding:12px;font-size:1.1em;font-weight:bold;background-color:#0b74de;border-color:#0b74de;"
                >
                  Pay All Tuitions
                </button>
              </div>
            `;
          }
        } else {
          // Regular display for other students (with select buttons)
          html = tuitions.map(t => {
            const isCombined = t.is_combined === true || t.id === 0;
            const displayId = isCombined ? 'Combined' : `#${t.id}`;
            const displayInfo = isCombined 
              ? `All Pending Tuitions (${t.tuition_count || 'multiple'})`
              : `${t.academic_year || ''} ${t.academic_year ? `(Semester ${t.semester})` : ''}`.trim();
            return `
            <div class="tuition-row">
              <div style="font-weight:600;color:#0b74de">${displayId}</div>
              <div>${displayInfo}</div>
              <div>${t.description || 'Tuition Payment'}</div>
              <div style="text-align:right;font-weight:${isCombined ? 'bold' : 'normal'}">${(t.amount_cents/100).toFixed(2)}</div>
              <div>
                <button 
                  onclick="window.selectTuition(${t.id},${t.amount_cents})" 
                  class="select-tuition-btn btn ${canPayTuition(t.amount_cents) ? 'btn-primary' : ''}"
                  ${canPayTuition(t.amount_cents) ? '' : 'disabled'}
                  title="${isCombined ? 'Combined Payment' : `Tuition ID: ${t.id}`}"
                >
                  Select
                </button>
              </div>
            </div>
          `;
          }).join('');
        }
        
        $('tuitionRows').innerHTML = html;
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
  selectedTuitionPublicId = tuitionId;
  selectedTuitionAmount = amountCents;
  
  // Update UI - reset all buttons
  document.querySelectorAll('.select-tuition-btn').forEach(btn => {
    if (btn.classList.contains('pay-all-btn')) {
      btn.style.background = '#0b74de';
      btn.textContent = 'Pay All Tuitions';
    } else {
      btn.style.background = '';
      btn.textContent = 'Select';
    }
  });
  
  // Update the clicked button
  const btn = event.target;
  if (btn.classList.contains('pay-all-btn')) {
    btn.style.background = '#28a745';
    btn.textContent = 'Selected - Pay All Tuitions';
  } else {
    btn.style.background = '#4CAF50';
    btn.textContent = 'Selected';
  }
  
  validateForm();
};

/**
 * Validate payment form
 */
function validateForm() {
  const profile = JSON.parse(localStorage.getItem('profile') || '{}');
  const payer_balance = profile.balance_cents || 0;
  
  // Allow tuitionId = 0 for combined payment
  const can = (selectedTuitionPublicId !== null && selectedTuitionPublicId !== undefined) && // tuition selected (including 0 for combined)
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
  const studentId = currentStudentMssv;
  if (!studentId) {
    alert('Please lookup a student before starting a transaction');
    return;
  }
  // Allow tuitionId = 0 for combined payment (check for null/undefined, not falsy)
  if (selectedTuitionPublicId === null || selectedTuitionPublicId === undefined) {
    alert('Please select a tuition to pay');
    return;
  }

  const verifyBtn = $('confirmBtn');
  verifyBtn.disabled = true;
  const originalText = verifyBtn.innerText;
  verifyBtn.innerText = 'Processing...';
  
  try {
    log('Starting transaction for tuition:', { studentId, tuition: selectedTuitionPublicId });
    const resp = await api.startTx(token, studentId, selectedTuitionPublicId);
    if (resp.error) {
      log('Transaction start error:', resp.error);
      if (resp.error === 'tuition_not_found_or_already_paid') {
        alert('This tuition has already been paid or is no longer available');
        await doLookup();
      } else if (resp.error === 'tuition_not_found_for_student') {
        alert('Selected tuition no longer belongs to this student. Please lookup again.');
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
    // Refresh transaction history after successful payment
    await loadHistory();
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
  let updated = false;
  try {
    log('Refreshing profile...');
    const profResp = await api.profile(token);
    if (!profResp.error && profResp.profile) {
      localStorage.setItem('profile', JSON.stringify(profResp.profile));
      updated = true;
    }
  } catch (e) {
    log('Error refreshing profile:', e);
  }

  if (!updated && new_balance_cents != null) {
    const p = JSON.parse(localStorage.getItem('profile') || '{}');
    p.balance_cents = new_balance_cents;
    localStorage.setItem('profile', JSON.stringify(p));
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
  selectedTuitionPublicId = null;
  selectedTuitionAmount = null;
  currentStudentMssv = null;
}

/**
 * Load and display transaction history
 */
async function loadHistory() {
  const token = localStorage.getItem('token');
  if (!token) {
    log('No token found, cannot load history');
    return;
  }

  const loadingEl = $('historyLoading');
  const errorEl = $('historyError');
  const tableEl = $('historyTable');
  const noHistoryEl = $('noHistory');
  const rowsEl = $('historyRows');

  // Show loading state
  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  tableEl.style.display = 'none';
  noHistoryEl.style.display = 'none';

  try {
    log('Loading transaction history...');
    const resp = await api.history(token);
    
    if (resp.error) {
      log('History error:', resp.error);
      errorEl.textContent = `Error loading history: ${resp.error}`;
      errorEl.style.display = 'block';
      loadingEl.style.display = 'none';
      return;
    }

    const transactions = resp.transactions || [];
    log('Loaded transactions:', transactions.length);

    loadingEl.style.display = 'none';

    if (transactions.length === 0) {
      noHistoryEl.style.display = 'block';
      return;
    }

    // Display transactions
    rowsEl.innerHTML = transactions.map(tx => {
      const statusClass = `status-${tx.status}`;
      const statusText = tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
      const amount = (tx.amount_cents / 100).toFixed(2);
      const date = new Date(tx.created_at).toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const confirmedDate = tx.confirmed_at 
        ? new Date(tx.confirmed_at).toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '-';
    const actionButtons = [];
    if (tx.status === 'pending') {
      actionButtons.push(`<button type="button" class="btn btn-danger cancel-tx-btn" data-tx-id="${tx.id}">Cancel</button>`);
    }
    if (tx.status === 'failed' || tx.status === 'cancelled') {
      actionButtons.push(`<button type="button" class="btn btn-secondary delete-tx-btn" data-tx-id="${tx.id}">Delete</button>`);
    }
    const actionHtml = actionButtons.length
      ? `<div class="history-actions">${actionButtons.join(' ')}</div>`
      : '-';

      return `
        <tr>
          <td>#${tx.id}</td>
          <td>${tx.student_name || 'N/A'}</td>
          <td>${tx.mssv || 'N/A'}</td>
          <td style="text-align:right">${amount}</td>
          <td style="text-align:center">
            <span class="status-badge ${statusClass}">${statusText}</span>
          </td>
          <td>
            <div>Created: ${date}</div>
            ${tx.confirmed_at ? `<div style="font-size:0.85em;color:#666">Confirmed: ${confirmedDate}</div>` : ''}
          </td>
          <td style="text-align:center">${actionHtml}</td>
        </tr>
      `;
    }).join('');

    tableEl.style.display = 'block';
  } catch (e) {
    log('Network error loading history:', e);
    errorEl.textContent = 'Network error loading transaction history. Please try again.';
    errorEl.style.display = 'block';
    loadingEl.style.display = 'none';
  }
}

async function cancelTransaction(transactionId) {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Session expired. Please login again.');
    window.location.href = 'login.html';
    return;
  }
  const confirmCancel = confirm('Cancel this pending transaction?');
  if (!confirmCancel) return;

  try {
    const resp = await api.cancelTx(token, transactionId);
    if (resp.error) {
      alert(resp.error);
      return;
    }
    alert('Transaction cancelled.');
    await loadHistory();
    await updateProfile(token);
  } catch (e) {
    log('Network error cancelling transaction:', e);
    alert('Network error cancelling transaction.');
  }
}

async function deleteTransaction(transactionId) {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Session expired. Please login again.');
    window.location.href = 'login.html';
    return;
  }
  const confirmDelete = confirm('Delete this transaction from history?');
  if (!confirmDelete) return;

  try {
    const resp = await api.deleteTx(token, transactionId);
    if (resp.error) {
      alert(resp.error);
      return;
    }
    alert('Transaction deleted.');
    await loadHistory();
  } catch (e) {
    log('Network error deleting transaction:', e);
    alert('Network error deleting transaction.');
  }
}

function onHistoryActionClick(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;

  const btn = target.closest('.cancel-tx-btn');
  if (btn) {
    const txId = Number(btn.dataset.txId);
    if (!Number.isFinite(txId)) return;
    cancelTransaction(txId);
    return;
  }
  const deleteBtn = target.closest('.delete-tx-btn');
  if (deleteBtn) {
    const txId = Number(deleteBtn.dataset.txId);
    if (!Number.isFinite(txId)) return;
    deleteTransaction(txId);
  }
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