const pool = require('../config/db');

async function add(galleryId, photoId, clientToken) {
  await pool.query(
    'INSERT IGNORE INTO selections (gallery_id, photo_id, client_token) VALUES (?, ?, ?)',
    [galleryId, photoId, clientToken]
  );
}

async function remove(galleryId, photoId, clientToken) {
  await pool.query(
    'DELETE FROM selections WHERE gallery_id = ? AND photo_id = ? AND client_token = ?',
    [galleryId, photoId, clientToken]
  );
}

async function findByClient(galleryId, clientToken) {
  const [rows] = await pool.query(
    'SELECT photo_id FROM selections WHERE gallery_id = ? AND client_token = ?',
    [galleryId, clientToken]
  );
  return rows.map((r) => r.photo_id);
}

async function findByGallery(galleryId) {
  const [rows] = await pool.query(
    `SELECT s.photo_id, s.client_token, s.created_at, p.file_name
     FROM selections s
     JOIN photos p ON p.id = s.photo_id
     WHERE s.gallery_id = ?
     ORDER BY s.client_token, s.created_at`,
    [galleryId]
  );
  return rows;
}

module.exports = { add, remove, findByClient, findByGallery };
