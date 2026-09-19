const pool = require('../config/db');

async function create({ adminId, name, slug, isPublic, passwordHash, accessUsername, pricePerPhoto }) {
  const [result] = await pool.query(
    `INSERT INTO galleries (admin_id, name, slug, is_public, password_hash, access_username, price_per_photo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [adminId, name, slug, isPublic, passwordHash || null, accessUsername || null, pricePerPhoto || null]
  );
  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM galleries WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM galleries WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] || null;
}

async function findByAdmin(adminId) {
  const [rows] = await pool.query(
    'SELECT * FROM galleries WHERE admin_id = ? ORDER BY created_at DESC',
    [adminId]
  );
  return rows;
}

async function findAll() {
  const [rows] = await pool.query(
    'SELECT * FROM galleries ORDER BY created_at DESC'
  );
  return rows;
}

async function slugExists(slug) {
  const [rows] = await pool.query('SELECT id FROM galleries WHERE slug = ? LIMIT 1', [slug]);
  return rows.length > 0;
}

async function update(id, { name, isPublic, passwordHash, clearPassword, accessUsername, coverPhotoId, pricePerPhoto }) {
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (isPublic !== undefined) {
    fields.push('is_public = ?');
    values.push(isPublic);
  }
  if (passwordHash !== undefined) {
    fields.push('password_hash = ?');
    values.push(passwordHash);
  }
  if (clearPassword) {
    fields.push('password_hash = NULL');
    fields.push('access_username = NULL');
  }
  if (accessUsername !== undefined) {
    fields.push('access_username = ?');
    values.push(accessUsername || null);
  }
  if (coverPhotoId !== undefined) {
    fields.push('cover_photo_id = ?');
    values.push(coverPhotoId || null);
  }
  if (pricePerPhoto !== undefined) {
    fields.push('price_per_photo = ?');
    values.push(pricePerPhoto || null);
  }

  if (!fields.length) return findById(id);

  values.push(id);
  await pool.query(`UPDATE galleries SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function deleteById(id) {
  await pool.query('DELETE FROM galleries WHERE id = ?', [id]);
}

module.exports = { create, findById, findBySlug, findByAdmin, findAll, slugExists, update, deleteById };
