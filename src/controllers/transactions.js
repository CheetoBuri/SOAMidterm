const pool = require('../db');
const { generateOtp, hashOtp, sendOtpEmail, sendConfirmationEmail, OTP_TTL_MIN } = require('../mailer');

async function startTransactionHandler(req, res) {
  try {
    const { studentId, tuitionId } = req.body;
    const normalizedStudentId = typeof studentId === 'string' ? studentId.trim() : studentId;
    console.log('[startTransaction] Request:', { studentId: normalizedStudentId, tuitionId, userId: req.user?.id, userBalance: req.user?.balance_cents });
    
    if (!normalizedStudentId) {
      console.log('[startTransaction] Missing studentId');
      return res.status(400).json({ error: 'missing_studentId' });
    }
    if (tuitionId == null || tuitionId === undefined) {
      console.log('[startTransaction] Missing tuitionId');
      return res.status(400).json({ error: 'missing_tuitionId' });
    }
    // Validate tuitionId is a positive integer
    const tuitionIdNum = Number(tuitionId);
    if (!Number.isInteger(tuitionIdNum) || tuitionIdNum <= 0) {
      console.log('[startTransaction] Invalid tuitionId:', tuitionIdNum);
      return res.status(400).json({ error: 'invalid_tuitionId', message: 'tuitionId must be a positive integer' });
    }
    
    // Get tuition record with student info, ensuring tuitionId is scoped to the student
    const [trows] = await pool.query(`
      SELECT * FROM (
        SELECT 
          t.*,
          s.full_name,
          s.student_id AS mssv,
          ROW_NUMBER() OVER (
            PARTITION BY s.id
            ORDER BY t.academic_year DESC, t.semester DESC, t.id DESC
          ) AS tuition_public_id
        FROM tuitions t
        JOIN students s ON s.id = t.student_id
        WHERE t.status = 'pending'
      ) tu
      WHERE tu.mssv = ? AND tu.tuition_public_id = ?
    `, [normalizedStudentId, tuitionIdNum]);
    
    if (trows.length === 0) {
      console.log('[startTransaction] Tuition not found for student:', { normalizedStudentId, tuitionIdNum });
      return res.status(404).json({ error: 'tuition_not_found_for_student', message: `Student ${normalizedStudentId} does not have pending tuition with id ${tuitionIdNum}` });
    }
    const tuition = trows[0];
    console.log('[startTransaction] Found tuition:', { student: normalizedStudentId, publicId: tuitionIdNum, amount: tuition.amount_cents, userBalance: req.user.balance_cents });
    
    if (req.user.balance_cents < tuition.amount_cents) {
      console.log('[startTransaction] Insufficient balance:', { required: tuition.amount_cents, available: req.user.balance_cents });
      return res.status(400).json({ 
        error: 'insufficient_balance', 
        message: `Insufficient balance. Required: ${tuition.amount_cents/100} VND, Available: ${req.user.balance_cents/100} VND`,
        required: tuition.amount_cents,
        available: req.user.balance_cents
      });
    }

    // create pending transaction
    const [tres] = await pool.query(
      'INSERT INTO transactions (payer_user_id, tuition_id, amount_cents, status) VALUES (?, ?, ?, ?)', 
      [req.user.id, tuition.id, tuition.amount_cents, 'pending']);
    const transactionId = tres.insertId;

    // create OTP and ensure uniqueness among active OTPs
    let code;
    let codeHash;
    let expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    // try to generate a code whose hash is not currently active (unused & unexpired)
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateOtp();
      codeHash = hashOtp(code);
      const [existing] = await pool.query('SELECT id FROM otps WHERE code_hash = ? AND used = 0 AND expires_at > NOW() LIMIT 1', [codeHash]);
      if (existing.length === 0) break; // unique among active OTPs
      code = null; codeHash = null;
    }
    if (!code) {
      // fallback to a longer random token to avoid collision
      code = (Math.random().toString(36).substring(2, 10)).toUpperCase();
      codeHash = hashOtp(code);
      expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    }
    await pool.query('INSERT INTO otps (transaction_id, code_hash, expires_at) VALUES (?, ?, ?)', [transactionId, codeHash, expiresAt]);

    // send OTP via email (mock) - plaintext code sent to user
    await sendOtpEmail(req.user.email, code);

    res.json({ transactionId, otpExpiresAt: expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

async function verifyTransactionHandler(req, res) {
  const { transactionId, otpCode } = req.body;
  if (!transactionId || !otpCode) return res.status(400).json({ error: 'missing_fields' });
  const conn = await pool.getConnection();
  try {
    // load transaction and OTP
    const [trows] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [transactionId]);
    if (trows.length === 0) return res.status(404).json({ error: 'transaction_not_found' });
    const tx = trows[0];
    if (tx.status !== 'pending') return res.status(400).json({ error: 'transaction_not_pending' });

    // Lock the OTP row for this transaction to safely update attempt counters
    const [otprows] = await conn.query('SELECT * FROM otps WHERE transaction_id = ? FOR UPDATE', [transactionId]);
    if (otprows.length === 0) {
      return res.status(400).json({ error: 'invalid_otp' });
    }
    const otp = otprows[0];
    if (otp.used) return res.status(400).json({ error: 'otp_already_used' });
    if (new Date(otp.expires_at) < new Date()) return res.status(400).json({ error: 'otp_expired' });

    const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);
    // If OTP code does not match, increment attempts and possibly disable
    const providedHash = hashOtp(otpCode);
    if (String(otp.code_hash) !== String(providedHash)) {
      const newAttempts = (otp.attempts || 0) + 1;
      await conn.execute('UPDATE otps SET attempts = ? WHERE id = ?', [newAttempts, otp.id]);
      if (newAttempts >= MAX_ATTEMPTS) {
        // mark transaction cancelled due to too many attempts
        await conn.execute('UPDATE transactions SET status = ? WHERE id = ?', ['cancelled', transactionId]);
        await conn.commit();
        return res.status(400).json({ error: 'otp_attempts_exceeded' });
      }
      await conn.commit();
      return res.status(400).json({ error: 'invalid_otp' });
    }

    await conn.beginTransaction();

    // Lock payer row to serialize operations on the payer account and prevent concurrent finalizations
    await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [tx.payer_user_id]);

    // Deduct payer balance atomically
    const [uRes] = await conn.execute('UPDATE users SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?', [tx.amount_cents, tx.payer_user_id, tx.amount_cents]);
    if (uRes.affectedRows !== 1) {
      await conn.rollback();
      return res.status(400).json({ error: 'insufficient_balance_at_finalize' });
    }

    // Mark tuition as paid if it's still pending and amount matches
    const [tRes] = await conn.execute(
      'UPDATE tuitions SET status = "paid", paid_at = NOW() WHERE id = ? AND status = "pending" AND amount_cents = ?',
      [tx.tuition_id, tx.amount_cents]
    );
    if (tRes.affectedRows !== 1) {
      await conn.rollback();
      return res.status(400).json({ error: 'tuition_already_paid_or_modified' });
    }

    // mark transaction confirmed and OTP used
    await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NOW() WHERE id = ?', ['confirmed', transactionId]);
    await conn.execute('UPDATE otps SET used = 1 WHERE id = ?', [otp.id]);

    // read updated balance for response
    const [uRows] = await conn.query('SELECT balance_cents FROM users WHERE id = ?', [tx.payer_user_id]);
    const newBalance = uRows.length ? uRows[0].balance_cents : null;

    await conn.commit();

    // send confirmation (mock)
    await sendConfirmationEmail(req.user.email, `Transaction ${transactionId} amount ${tx.amount_cents}`);

    res.json({ success: true, new_balance_cents: newBalance });
  } catch (err) {
    console.error(err);
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    res.status(500).json({ error: 'server_error' });
  } finally {
    conn.release();
  }
}

async function historyHandler(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.*, 
        s.student_id AS mssv, 
        s.full_name AS student_name 
      FROM transactions t 
      JOIN tuitions tu ON tu.id = t.tuition_id
      JOIN students s ON s.id = tu.student_id 
      WHERE t.payer_user_id = ? 
      ORDER BY t.created_at DESC 
      LIMIT 100
    `, [req.user.id]);
    res.json({ transactions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

async function resendOtpHandler(req, res) {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'missing_transactionId' });
    // verify transaction exists and belongs to user
    const [trows] = await pool.query('SELECT * FROM transactions WHERE id = ? AND payer_user_id = ?', [transactionId, req.user.id]);
    if (trows.length === 0) return res.status(404).json({ error: 'transaction_not_found' });
    const tx = trows[0];
    if (tx.status !== 'pending') return res.status(400).json({ error: 'transaction_not_pending' });

    const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);

    // create a new OTP (ensure uniqueness by hash)
    let code;
    let codeHash;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateOtp();
      codeHash = hashOtp(code);
      const [existing] = await pool.query('SELECT id FROM otps WHERE code_hash = ? AND used = 0 AND expires_at > NOW() LIMIT 1', [codeHash]);
      if (existing.length === 0) break;
      code = null; codeHash = null;
    }
    if (!code) code = (Math.random().toString(36).substring(2, 10)).toUpperCase(), codeHash = hashOtp(code);
    const expiresAtNew = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    await pool.query(`
      INSERT INTO otps (transaction_id, code_hash, expires_at, attempts, used)
      VALUES (?, ?, ?, 0, 0)
      ON DUPLICATE KEY UPDATE
        code_hash = VALUES(code_hash),
        expires_at = VALUES(expires_at),
        attempts = 0,
        used = 0
    `, [transactionId, codeHash, expiresAtNew]);
    await sendOtpEmail(req.user.email, code);
    return res.json({ transactionId, otpExpiresAt: expiresAtNew });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

async function cancelTransactionHandler(req, res) {
  let conn;
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'missing_transactionId' });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [transactionId]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'transaction_not_found' });
    }
    const tx = rows[0];
    if (tx.payer_user_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: 'forbidden' });
    }
    if (tx.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ error: 'transaction_not_pending' });
    }

    await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NULL WHERE id = ?', ['cancelled', transactionId]);
    await conn.execute('UPDATE otps SET used = 1 WHERE transaction_id = ?', [transactionId]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    if (conn) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: 'server_error' });
  } finally {
    if (conn) conn.release();
  }
}

async function deleteTransactionHandler(req, res) {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'missing_transactionId' });
    const [rows] = await pool.query('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    if (rows.length === 0) return res.status(404).json({ error: 'transaction_not_found' });
    const tx = rows[0];
    if (tx.payer_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    if (tx.status === 'pending') return res.status(400).json({ error: 'transaction_pending_cannot_delete' });
    if (tx.status === 'confirmed') return res.status(400).json({ error: 'transaction_confirmed_cannot_delete' });

    await pool.query('DELETE FROM otps WHERE transaction_id = ?', [transactionId]);
    await pool.query('DELETE FROM transactions WHERE id = ?', [transactionId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

module.exports = { startTransactionHandler, verifyTransactionHandler, historyHandler, resendOtpHandler, cancelTransactionHandler, deleteTransactionHandler };

