const pool = require('../config/db');

const USER_PUBLIC_FIELDS = 'id, name, email, role, photographer_status, public_slug, order_auto_delete_days, whatsapp_number, created_at';

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  try {
    const [rows] = await pool.query(
      `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [rows] = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }
}

async function findByPublicSlug(slug) {
  if (!slug) return null;
  try {
    const [rows] = await pool.query(
      `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE public_slug = ? LIMIT 1`,
      [slug]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    return null;
  }
}

async function anyAdminExists() {
  const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return rows.length > 0;
}

async function findAdmins() {
  try {
    const [rows] = await pool.query(
      `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE role = 'admin' ORDER BY id ASC`
    );
    return rows;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE role = \'admin\' ORDER BY id ASC'
    );
    return rows;
  }
}

async function publicSlugExists(slug) {
  if (!slug) return false;
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE public_slug = ? LIMIT 1', [slug]);
    return rows.length > 0;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    return false;
  }
}

async function create({
  name,
  email,
  passwordHash,
  role = 'client',
  photographerStatus = null,
  publicSlug = null,
  whatsappNumber = null,
}) {
  try {
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, photographer_status, public_slug, whatsapp_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, passwordHash, role, photographerStatus, publicSlug, whatsappNumber]
    );
    return findById(result.insertId);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
    );
    return findById(result.insertId);
  }
}

async function findPhotographers() {
  const [rows] = await pool.query(
    `SELECT ${USER_PUBLIC_FIELDS} FROM users
     WHERE role = 'photographer'
     ORDER BY FIELD(photographer_status, 'pending', 'approved', 'rejected'), created_at DESC`
  );
  return rows;
}

async function findApprovedPhotographers() {
  const [rows] = await pool.query(
    `SELECT ${USER_PUBLIC_FIELDS} FROM users
     WHERE role = 'photographer' AND photographer_status = 'approved'
     ORDER BY name ASC`
  );
  return rows;
}

async function findPublicOwners() {
  const [rows] = await pool.query(
    `SELECT ${USER_PUBLIC_FIELDS} FROM users
     WHERE public_slug IS NOT NULL AND public_slug <> ''
       AND (role = 'admin' OR (role = 'photographer' AND photographer_status = 'approved'))
     ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, name ASC`
  );
  return rows;
}

async function setPublicSlug(userId, slug) {
  await pool.query('UPDATE users SET public_slug = ? WHERE id = ?', [slug, userId]);
  return findById(userId);
}

async function setPhotographerStatus(userId, status) {
  await pool.query('UPDATE users SET photographer_status = ? WHERE id = ?', [status, userId]);
  return findById(userId);
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

async function updateOrderAutoDeleteDays(userId, days) {
  const value = days === null || days === undefined || days === '' ? null : Math.max(0, parseInt(days, 10) || 0);
  await pool.query('UPDATE users SET order_auto_delete_days = ? WHERE id = ?', [value || null, userId]);
  return findById(userId);
}

async function updateWhatsAppNumber(userId, number) {
  await pool.query('UPDATE users SET whatsapp_number = ? WHERE id = ?', [number || null, userId]);
  return findById(userId);
}

async function getStudioWhatsAppNumber() {
  const { DEFAULT_WHATSAPP_NUMBER, toWhatsAppNumber } = require('../utils/whatsapp');
  try {
    const [rows] = await pool.query(
      `SELECT whatsapp_number FROM users
       WHERE role = 'admin' AND whatsapp_number IS NOT NULL AND whatsapp_number <> ''
       ORDER BY id ASC
       LIMIT 1`
    );
    return toWhatsAppNumber(rows[0]?.whatsapp_number) || DEFAULT_WHATSAPP_NUMBER;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    return DEFAULT_WHATSAPP_NUMBER;
  }
}

async function getWhatsAppForUser(user) {
  const { DEFAULT_WHATSAPP_NUMBER, toWhatsAppNumber } = require('../utils/whatsapp');
  return toWhatsAppNumber(user && user.whatsapp_number) || (user && user.role === 'admin' ? DEFAULT_WHATSAPP_NUMBER : null);
}

module.exports = {
  findByEmail,
  findById,
  findByPublicSlug,
  anyAdminExists,
  findAdmins,
  publicSlugExists,
  create,
  findPhotographers,
  findApprovedPhotographers,
  findPublicOwners,
  setPublicSlug,
  setPhotographerStatus,
  setResetToken,
  findByValidResetToken,
  resetPassword,
  updateOrderAutoDeleteDays,
  updateWhatsAppNumber,
  getStudioWhatsAppNumber,
  getWhatsAppForUser,
};
