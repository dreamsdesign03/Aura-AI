const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("CRITICAL: DATABASE_URL environment variable is missing!");
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('⚡ Connected to Neon PostgreSQL Database');
});

pool.on('error', (err) => {
  console.error('Unexpected Neon PostgreSQL Pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
