const pool = require('../db');

/**
 * @openapi
 * /api/student/{studentId}:
 *   get:
 *     tags:
 *       - Students
 *     summary: Get student info and pending tuitions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Student identifier (mssv)
 *     responses:
 *       200:
 *         description: Student data with pending tuitions
 *       404:
 *         description: Student not found
 */
async function getStudentHandler(req, res) {
  try {
    const studentId = req.params.studentId;
    
    // Get student info and their pending tuition records
    const [rows] = await pool.query(`
      SELECT 
        s.id AS student_id,
        s.student_id AS mssv,
        s.full_name,
        t.id AS tuition_id,
        t.academic_year,
        t.semester,
        t.amount_cents,
        t.description
      FROM students s
      LEFT JOIN tuitions t ON t.student_id = s.id AND t.status = 'pending'
      WHERE s.student_id = ?
      ORDER BY t.academic_year DESC, t.semester DESC`, [studentId]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'student_not_found' });

    // Format response with student info and list of pending tuitions
    const student = {
      id: rows[0].student_id,
      student_id: rows[0].mssv,
      full_name: rows[0].full_name,
      pending_tuitions: rows.filter(r => r.tuition_id).map(t => ({
        id: t.tuition_id,
        academic_year: t.academic_year,
        semester: t.semester,
        amount_cents: t.amount_cents,
        description: t.description
      }))
    };

    res.json({ student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

module.exports = { getStudentHandler };
