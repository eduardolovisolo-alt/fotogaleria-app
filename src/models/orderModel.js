const pool = require('../config/db');

async function create({ galleryId, clientToken, clientName, clientEmail, clientPhone, photoIds, pricePerPhoto }) {
  const totalAmount = (pricePerPhoto || 0) * photoIds.length;

  const [result] = await pool.query(
    `INSERT INTO orders (gallery_id, client_token, client_name, client_email, client_phone, photo_count, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [galleryId, clientToken, clientName, clientEmail, clientPhone || null, photoIds.length, totalAmount]
  );

  const orderId = result.insertId;
  for (const photoId of photoIds) {
    await pool.query(
      'INSERT INTO order_items (order_id, photo_id, price) VALUES (?, ?, ?)',
      [orderId, photoId, pricePerPhoto || 0]
    );
  }

  return findById(orderId);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByGallery(galleryId) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE gallery_id = ? ORDER BY created_at DESC',
    [galleryId]
  );
  return rows;
}

async function findByAdmin(adminId) {
  const [rows] = await pool.query(
    `SELECT o.*, g.name AS gallery_name, g.slug AS gallery_slug
     FROM orders o
     JOIN galleries g ON g.id = o.gallery_id
     WHERE g.admin_id = ?
     ORDER BY o.created_at DESC`,
    [adminId]
  );
  return rows;
}

async function updateStatus(id, status) {
  await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

module.exports = { create, findById, findByGallery, findByAdmin, updateStatus };
