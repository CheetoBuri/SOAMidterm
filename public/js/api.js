/**
 * API endpoints for the iBank application
 * @module api
 */

const API_BASE = 'http://localhost:3000'; // backend URL

/**
 * @typedef {Object} Profile
 * @property {number} id - User ID
 * @property {string} full_name - User's full name
 * @property {string} phone - User's phone number
 * @property {string} email - User's email
 * @property {number} balance_cents - User's balance in cents
 */

/**
 * @typedef {Object} Student
 * @property {number} id - Student ID
 * @property {string} student_id - Student's registration number (MSSV)
 * @property {string} full_name - Student's full name
 * @property {Array<TuitionRecord>} pending_tuitions - List of pending tuition records
 */

/**
 * @typedef {Object} TuitionRecord
 * @property {number} id - Tuition record ID
 * @property {number} academic_year - Academic year
 * @property {number} semester - Semester number
 * @property {number} amount_cents - Amount in cents
 * @property {string} description - Tuition description
 */

const api = {
  /**
   * Login with username and password
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<{token: string, profile: Profile}>}
   */
  login: (username, password) => 
    fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(r => r.json()),

  /**
   * Get student information and pending tuitions
   * @param {string} token - JWT token
   * @param {string} studentId - Student registration number
   * @returns {Promise<{student: Student}>}
   */
  getStudent: (token, studentId) => 
    fetch(`${API_BASE}/api/student/${studentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()),

  /**
   * Start a new payment transaction
   * @param {string} token - JWT token
   * @param {string} studentId - MSSV of the student whose tuition is being paid
   * @param {number} tuitionId - Per-student tuition ID to pay
   * @returns {Promise<{transactionId: number, otpExpiresAt: string}>}
   */
  startTx: (token, studentId, tuitionId) => 
    fetch(`${API_BASE}/api/transactions/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ studentId, tuitionId })
    }).then(r => r.json()),

  /**
   * Verify OTP and complete transaction
   * @param {string} token - JWT token
   * @param {number} transactionId - Transaction ID
   * @param {string} otpCode - OTP code
   * @returns {Promise<{success: boolean, new_balance_cents?: number}>}
   */
  verifyTx: (token, transactionId, otpCode) => 
    fetch(`${API_BASE}/api/transactions/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ transactionId, otpCode })
    }).then(r => r.json()),

  /**
   * Cancel a pending transaction
   * @param {string} token - JWT token
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<{success: boolean}>}
   */
  cancelTx: (token, transactionId) =>
    fetch(`${API_BASE}/api/transactions/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ transactionId })
    }).then(r => r.json()),

  /**
   * Delete a completed/failed transaction from history
   * @param {string} token
   * @param {number} transactionId
   */
  deleteTx: (token, transactionId) =>
    fetch(`${API_BASE}/api/transactions/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ transactionId })
    }).then(r => r.json()),

  /**
   * Resend OTP for a pending transaction
   * @param {string} token - JWT token
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<{transactionId: number, otpExpiresAt: string}>}
   */
  resendOtp: (token, transactionId) =>
    fetch(`${API_BASE}/api/transactions/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ transactionId })
    }).then(r => r.json()),

  /**
   * Get transaction history
   * @param {string} token - JWT token
   * @returns {Promise<{transactions: Array<Transaction>}>}
   */
  history: (token) => 
    fetch(`${API_BASE}/api/transactions/history`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()),

  /**
   * Get user profile
   * @param {string} token - JWT token
   * @returns {Promise<{profile: Profile}>}
   */
  profile: (token) => 
    fetch(`${API_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json())
};

export default api;