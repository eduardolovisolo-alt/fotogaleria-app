const pool = require('../config/db');

async function create({ galleryId, uploadedBy, originalKey, thumbnailKey, fileName, width, height, sizeBytes }) {
  const [result] = await pool.query(
    `INSERT INTO photos (gallery_id, uploaded_by, original_key, thumbnail_key, file_name, width, height, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [galleryId, uploadedBy, originalKey, thumbnailKey, fileName, width, height, sizeBytes]
  );
  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM photos WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByGallery(galleryId) {
  const [rows] = await pool.query(
    'SELECT * FROM photos WHERE gallery_id = ? ORDER BY created_at DESC',
    [galleryId]
  );
  return rows;
}

async function deleteById(id) {
  await pool.query('DELETE FROM photos WHERE id = ?', [id]);
}

module.exports = { create, findById, findByGallery, deleteById };
