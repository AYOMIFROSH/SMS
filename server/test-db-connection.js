// test-db-connection.js
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    console.log('DBG DB_HOST:', process.env.DB_HOST, 'DB_PORT:', process.env.DB_PORT || 3306, 'DB_USER:', process.env.DB_USER);
    const pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '',
      port: Number(process.env.DB_PORT || 3306),
      waitForConnections: true,
      connectionLimit: 2,
      connectTimeout: 5000
    });

    await pool.query('SELECT 1');
    console.log('✅ Connected to MySQL successfully');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection error:', {
      code: err.code,
      message: err.message,
      stackLine: err.stack ? err.stack.split('\n')[0] : undefined
    });
    process.exit(1);
  }
})();
