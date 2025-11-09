require('dotenv').config();

/**
 * Database configuration
 * @type {import('mysql2/promise').PoolOptions}
 */
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'ibankuser',
  password: process.env.DB_PASSWORD || 'ibankpass',
  database: process.env.DB_NAME || 'ibank',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

module.exports = dbConfig;