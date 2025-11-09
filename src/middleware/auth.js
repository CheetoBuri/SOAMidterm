const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing_token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad_auth' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [payload.userId]);
    if (rows.length === 0) return res.status(401).json({ error: 'user_not_found' });
    req.user = rows[0];
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = authMiddleware;
