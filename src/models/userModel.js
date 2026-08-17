const pool = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function anyAdminExists() {
  const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return rows.length > 0;
}

async function create({ name, email, passwordHash, role = 'client' }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role]
  );
  return findById(result.insertId);
}

async function setResetToken(userId, tokenHash, expiresAt) {
  await pool.query(
    'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [tokenHash, expiresAt, userId]
  );
}

async function findByValidResetToken(tokenHash) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW() LIMIT 1',
    [tokenHash]
  );
  return rows[0] || null;
}

async function resetPassword(userId, passwordHash) {
  await pool.query(
    'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
    [passwordHash, userId]
  );
}

module.exports = {
  findByEmail,
  findById,
  anyAdminExists,
  create,
  setResetToken,
  findByValidResetToken,
  resetPassword,
};
