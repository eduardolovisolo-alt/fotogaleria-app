const pool = require('../config/db');
const { quotePhotoOrder, parseDiscountTiers } = require('../utils/pricing');

async function create({
  galleryId,
  clientToken,
  clientName,
  clientEmail,
  clientPhone,
  photoIds,
  pricePerPhoto,
  discountTiers,
}) {
  const quote = quotePhotoOrder(pricePerPhoto, photoIds.length, parseDiscountTiers(discountTiers));
  const itemPrice = photoIds.length
    ? Math.round((quote.total / photoIds.length) * 100) / 100
    : 0;

  const [result] = await pool.query(
    `INSERT INTO orders
      (gallery_id, client_token, client_name, client_email, client_phone, photo_count, total_amount, discount_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [galleryId, clientToken, clientName, clientEmail, clientPhone || null, photoIds.length, quote.total, quote.percent]
  );

  const orderId = result.insertId;
  for (const photoId of photoIds) {
    await pool.query(
      'INSERT INTO order_items (order_id, photo_id, price) VALUES (?, ?, ?)',
      [orderId, photoId, itemPrice]
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
    [Number(adminId)]
  );
  return rows;
}

async function updateStatus(id, status) {
  await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

async function deleteById(id) {
  await pool.query('DELETE FROM orders WHERE id = ?', [id]);
}

async function deleteCancelledOlderThan(adminId, days) {
  const safeDays = parseInt(days, 10);
  if (!safeDays || safeDays < 1) return 0;
  const [result] = await pool.query(
    `DELETE o FROM orders o
     JOIN galleries g ON g.id = o.gallery_id
     WHERE g.admin_id = ?
       AND o.status = 'cancelled'
       AND o.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [Number(adminId), safeDays]
  );
  return result.affectedRows || 0;
}

async function findItemsByOrderIds(orderIds) {
  if (!orderIds.length) return [];
  const placeholders = orderIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT oi.order_id, oi.photo_id, oi.price, p.file_name
     FROM order_items oi
     JOIN photos p ON p.id = oi.photo_id
     WHERE oi.order_id IN (${placeholders})
     ORDER BY oi.id ASC`,
    orderIds
  );
  return rows;
}

module.exports = {
  create,
  findById,
  findByGallery,
  findByAdmin,
  updateStatus,
  deleteById,
  deleteCancelledOlderThan,
  findItemsByOrderIds,
};
