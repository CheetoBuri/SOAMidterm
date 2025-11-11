const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

async function loginHandler(req, res) {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, profile: { full_name: user.full_name, phone: user.phone, email: user.email, balance_cents: user.balance_cents, id: user.id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}

module.exports = { loginHandler };
