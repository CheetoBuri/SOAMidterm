const pool = require('../db');

/**
 * @openapi
 * /api/profile:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile object
 *       404:
 *         description: User not found
 */
async function getProfileHandler(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, full_name, phone, email, balance_cents FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'user_not_found' });
    const u = rows[0];
    res.json({ profile: { id: u.id, full_name: u.full_name, phone: u.phone, email: u.email, balance_cents: u.balance_cents } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

module.exports = { getProfileHandler };
