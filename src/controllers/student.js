const pool = require('../db');

async function getStudentHandler(req, res) {
  try {
    const studentId = req.params.studentId;
    
    // Get student info and their pending tuition records, and compute per-student tuition ids
    const [rows] = await pool.query(`
      SELECT 
        s.id AS student_internal_id,
        s.student_id AS mssv,
        s.full_name,
        t.id AS tuition_internal_id,
        t.academic_year,
        t.semester,
        t.amount_cents,
        t.description,
        ROW_NUMBER() OVER (
          PARTITION BY s.id
          ORDER BY t.academic_year DESC, t.semester DESC, t.id DESC
        ) AS tuition_public_id
      FROM students s
      LEFT JOIN tuitions t 
        ON t.student_id = s.id 
       AND t.status = 'pending'
      WHERE s.student_id = ?
      ORDER BY t.academic_year DESC, t.semester DESC, t.id DESC
    `, [studentId]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'student_not_found' });

    // Format response with student info and list of pending tuitions
    const pendingTuitions = rows
      .filter(r => r.tuition_internal_id)
      .map(t => ({
        id: t.tuition_public_id,
        academic_year: t.academic_year,
        semester: t.semester,
        amount_cents: t.amount_cents,
        description: t.description
      }));

    // For student 20190001, if there are multiple pending tuitions, show individual tuitions + combined option
    let displayTuitions = pendingTuitions;
    if (studentId === '20190001' && pendingTuitions.length > 1) {
      const totalAmount = pendingTuitions.reduce((sum, t) => sum + t.amount_cents, 0);
      const combinedDescription = `Combined Payment - All ${pendingTuitions.length} Tuitions`;
      // Show individual tuitions (read-only) + combined payment option at the end
      displayTuitions = [
        ...pendingTuitions.map(t => ({ ...t, read_only: true })), // Mark individual tuitions as read-only
        {
          id: 0,
          academic_year: null,
          semester: null,
          amount_cents: totalAmount,
          description: combinedDescription,
          is_combined: true,
          tuition_count: pendingTuitions.length,
          mandatory: true
        }
      ];
    }

    const student = {
      id: rows[0].student_internal_id,
      student_id: rows[0].mssv,
      full_name: rows[0].full_name,
      pending_tuitions: displayTuitions
    };

    res.json({ student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

module.exports = { getStudentHandler };
