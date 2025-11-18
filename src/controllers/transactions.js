const pool = require('../db');
const { generateOtp, hashOtp, sendOtpEmail, sendConfirmationEmail, OTP_TTL_MIN } = require('../mailer');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';
const APP_TIMEZONE_OFFSET = process.env.APP_TIMEZONE_OFFSET || '+07:00';
const APP_TIMEZONE_OFFSET_MINUTES = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES || 7 * 60);

function toAppTimezoneIso(dateValue) {
  if (!dateValue) return null;
  const baseDate = new Date(dateValue);
  if (Number.isNaN(baseDate.getTime())) return null;

  // Shift the UTC timestamp by configured offset (default +07:00)
  const offsetMs = APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const shifted = new Date(baseDate.getTime() + offsetMs);
  const iso = shifted.toISOString().replace(/\.\d{3}Z$/, '');
  return `${iso}${APP_TIMEZONE_OFFSET}`;
}

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
    
    const tuitionIdNum = Number(tuitionId);
    
    // Handle combined payment for student 20190001 (tuitionId = 0)
    if (normalizedStudentId === '20190001' && tuitionIdNum === 0) {
      // Get all pending tuitions for this student
      const [allTuitions] = await pool.query(`
        SELECT 
          t.*,
          s.student_id AS mssv
        FROM tuitions t
        JOIN students s ON s.id = t.student_id
        WHERE s.student_id = ? AND t.status = 'pending'
        ORDER BY t.academic_year DESC, t.semester DESC, t.id DESC
      `, [normalizedStudentId]);
      
      if (allTuitions.length === 0) {
        console.log('[startTransaction] No pending tuitions found for combined payment');
        return res.status(404).json({ error: 'tuition_not_found_for_student', message: `Student ${normalizedStudentId} has no pending tuitions` });
      }
      
      const totalAmount = allTuitions.reduce((sum, t) => sum + t.amount_cents, 0);
      console.log('[startTransaction] Combined payment:', { student: normalizedStudentId, tuitionCount: allTuitions.length, totalAmount, userBalance: req.user.balance_cents });
      
      if (req.user.balance_cents < totalAmount) {
        console.log('[startTransaction] Insufficient balance for combined payment:', { required: totalAmount, available: req.user.balance_cents });
        return res.status(400).json({ 
          error: 'insufficient_balance', 
          message: `Insufficient balance. Required: ${totalAmount/100} VND, Available: ${req.user.balance_cents/100} VND`,
          required: totalAmount,
          available: req.user.balance_cents
        });
      }

      // Generate OTP first
      let code;
      let codeHash;
      let expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateOtp();
        codeHash = hashOtp(code);
        const [existing] = await pool.query('SELECT id FROM otps WHERE code_hash = ? AND used = 0 AND expires_at > NOW() LIMIT 1', [codeHash]);
        if (existing.length === 0) break;
        code = null; codeHash = null;
      }
      if (!code) {
        code = (Math.random().toString(36).substring(2, 10)).toUpperCase();
        codeHash = hashOtp(code);
        expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
      }

      // Create transaction records for each tuition, linked with transaction_group_id
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        
        // Get a group ID (use the first transaction ID as group ID)
        const [firstTx] = await conn.query(
          'INSERT INTO transactions (payer_user_id, tuition_id, amount_cents, status, transaction_group_id) VALUES (?, ?, ?, ?, NULL)', 
          [req.user.id, allTuitions[0].id, allTuitions[0].amount_cents, 'pending']
        );
        const groupId = firstTx.insertId;
        const firstTransactionId = groupId;
        
        // Update first transaction with its own ID as group ID
        await conn.query('UPDATE transactions SET transaction_group_id = ? WHERE id = ?', [groupId, firstTransactionId]);
        
        // Create OTP for the first transaction
        await conn.query('INSERT INTO otps (transaction_id, code_hash, expires_at) VALUES (?, ?, ?)', [firstTransactionId, codeHash, expiresAt]);
        
        // Create remaining transactions
        for (let i = 1; i < allTuitions.length; i++) {
          await conn.query(
            'INSERT INTO transactions (payer_user_id, tuition_id, amount_cents, status, transaction_group_id) VALUES (?, ?, ?, ?, ?)', 
            [req.user.id, allTuitions[i].id, allTuitions[i].amount_cents, 'pending', groupId]
          );
        }
        
        await conn.commit();
        
        // send OTP via email
        await sendOtpEmail(req.user.email, code);
        
        res.json({ transactionId: firstTransactionId, otpExpiresAt: expiresAt, isCombined: true, tuitionCount: allTuitions.length });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      return;
    }
    
    // Regular single tuition payment
    if (!Number.isInteger(tuitionIdNum) || tuitionIdNum <= 0) {
      console.log('[startTransaction] Invalid tuitionId:', tuitionIdNum);
      return res.status(400).json({ error: 'invalid_tuitionId', message: 'tuitionId must be a positive integer' });
    }
    
    // For student 20190001 with multiple tuitions, reject individual tuition payments
    if (normalizedStudentId === '20190001') {
      const [countRows] = await pool.query(`
        SELECT COUNT(*) as count
        FROM tuitions t
        JOIN students s ON s.id = t.student_id
        WHERE s.student_id = ? AND t.status = 'pending'
      `, [normalizedStudentId]);
      
      if (countRows.length > 0 && countRows[0].count > 1) {
        console.log('[startTransaction] Student 20190001 has multiple tuitions, individual payment rejected:', { normalizedStudentId, tuitionIdNum });
        return res.status(400).json({ 
          error: 'individual_payment_not_allowed', 
          message: `Student ${normalizedStudentId} has multiple pending tuitions. Individual tuitions cannot be paid separately. Please use tuitionId = 0 to pay all tuitions combined.` 
        });
      }
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

    // Check if this is a combined transaction (has transaction_group_id)
    const isCombined = tx.transaction_group_id !== null;
    let groupTransactions = [tx];
    let totalAmount = tx.amount_cents;
    
    if (isCombined) {
      // Get all transactions in the group
      const [groupRows] = await conn.query('SELECT * FROM transactions WHERE transaction_group_id = ? FOR UPDATE', [tx.transaction_group_id]);
      groupTransactions = groupRows.filter(t => t.status === 'pending');
      totalAmount = groupTransactions.reduce((sum, t) => sum + t.amount_cents, 0);
      console.log('[verifyTransaction] Combined transaction:', { groupId: tx.transaction_group_id, transactionCount: groupTransactions.length, totalAmount });
    }

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
        // mark all transactions in group as cancelled due to too many attempts
        if (isCombined) {
          await conn.execute('UPDATE transactions SET status = ? WHERE transaction_group_id = ?', ['cancelled', tx.transaction_group_id]);
        } else {
          await conn.execute('UPDATE transactions SET status = ? WHERE id = ?', ['cancelled', transactionId]);
        }
        await conn.commit();
        return res.status(400).json({ error: 'otp_attempts_exceeded' });
      }
      await conn.commit();
      return res.status(400).json({ error: 'invalid_otp' });
    }

    await conn.beginTransaction();

    // Lock payer row to serialize operations on the payer account and prevent concurrent finalizations
    await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [tx.payer_user_id]);

    // Deduct payer balance atomically (total amount for combined, single amount for regular)
    const [uRes] = await conn.execute('UPDATE users SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?', [totalAmount, tx.payer_user_id, totalAmount]);
    if (uRes.affectedRows !== 1) {
      await conn.rollback();
      return res.status(400).json({ error: 'insufficient_balance_at_finalize' });
    }

    // Mark tuitions as paid
    if (isCombined) {
      // Mark all tuitions in the group as paid
      for (const groupTx of groupTransactions) {
        const [tRes] = await conn.execute(
          'UPDATE tuitions SET status = "paid", paid_at = NOW() WHERE id = ? AND status = "pending" AND amount_cents = ?',
          [groupTx.tuition_id, groupTx.amount_cents]
        );
        if (tRes.affectedRows !== 1) {
          await conn.rollback();
          return res.status(400).json({ error: 'tuition_already_paid_or_modified' });
        }
      }
      // Mark all transactions in the group as confirmed
      await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NOW() WHERE transaction_group_id = ? AND status = "pending"', ['confirmed', tx.transaction_group_id]);
    } else {
      // Mark single tuition as paid
      const [tRes] = await conn.execute(
        'UPDATE tuitions SET status = "paid", paid_at = NOW() WHERE id = ? AND status = "pending" AND amount_cents = ?',
        [tx.tuition_id, tx.amount_cents]
      );
      if (tRes.affectedRows !== 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'tuition_already_paid_or_modified' });
      }
      // Mark transaction as confirmed
      await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NOW() WHERE id = ?', ['confirmed', transactionId]);
    }

    // Mark OTP as used
    await conn.execute('UPDATE otps SET used = 1 WHERE id = ?', [otp.id]);

    // read updated balance for response
    const [uRows] = await conn.query('SELECT balance_cents FROM users WHERE id = ?', [tx.payer_user_id]);
    const newBalance = uRows.length ? uRows[0].balance_cents : null;

    await conn.commit();

    // send confirmation (mock)
    await sendConfirmationEmail(req.user.email, `Transaction ${transactionId} amount ${totalAmount}${isCombined ? ` (${groupTransactions.length} tuitions)` : ''}`);

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

    const transactions = rows.map((row) => ({
      ...row,
      created_at: toAppTimezoneIso(row.created_at),
      confirmed_at: toAppTimezoneIso(row.confirmed_at)
    }));

    res.json({ transactions });
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

    // Check if this is a combined transaction
    const isCombined = tx.transaction_group_id !== null;
    if (isCombined) {
      // Cancel all transactions in the group
      await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NULL WHERE transaction_group_id = ? AND status = "pending"', ['cancelled', tx.transaction_group_id]);
      // Mark OTP as used for the first transaction
      await conn.execute('UPDATE otps SET used = 1 WHERE transaction_id = ?', [transactionId]);
    } else {
      // Cancel single transaction
      await conn.execute('UPDATE transactions SET status = ?, confirmed_at = NULL WHERE id = ?', ['cancelled', transactionId]);
      await conn.execute('UPDATE otps SET used = 1 WHERE transaction_id = ?', [transactionId]);
    }

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

