const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const sqlPath = path.join(__dirname, '..', 'db', 'init.sql');
  try {
    if (!fs.existsSync(sqlPath)) {
      console.log('No init.sql found at', sqlPath);
      return;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Connect without selecting a database so CREATE DATABASE / USE will work
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'ibankuser',
      password: process.env.DB_PASSWORD || 'ibankpass',
      multipleStatements: true
    });

    console.log('Applying database migrations from', sqlPath);
    await conn.query(sql);
    await conn.end();
    console.log('Database migrations applied successfully');
  } catch (err) {
    console.error('Failed to apply migrations:', err);
    throw err;
  }
}

module.exports = runMigrations;
