const pool = require('../config/db');

async function create({ name, email, phone, message }) {
  const [result] = await pool.query(
    'INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone || null, message]
  );
  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM contact_messages WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findAll() {
  const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
  return rows;
}

async function markRead(id) {
  await pool.query('UPDATE contact_messages SET read_at = NOW() WHERE id = ?', [id]);
}

module.exports = { create, findById, findAll, markRead };
