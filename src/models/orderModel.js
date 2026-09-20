const pool = require('../config/db');
const { quotePhotoOrder, parseDiscountTiers } = require('../utils/pricing');
const { generateDownloadToken, generateAccessPin } = require('../utils/orderAccess');

async function ensureCredentials(order) {
  if (!order) return order;
  if (order.download_token && order.access_pin) return order;
  const token = order.download_token || generateDownloadToken();
  const pin = order.access_pin || generateAccessPin();
  await pool.query(
    'UPDATE orders SET download_token = ?, access_pin = ? WHERE id = ?',
    [token, pin, order.id]
  );
  order.download_token = token;
  order.access_pin = pin;
  return order;
}

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
  const downloadToken = generateDownloadToken();
  const accessPin = generateAccessPin();

  const [result] = await pool.query(
    `INSERT INTO orders
      (gallery_id, client_token, client_name, client_email, client_phone, photo_count, total_amount, discount_percent, download_token, access_pin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      galleryId,
      clientToken,
      clientName,
      clientEmail,
      clientPhone || null,
      photoIds.length,
      quote.total,
      quote.percent,
      downloadToken,
      accessPin,
    ]
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
  return ensureCredentials(rows[0] || null);
}

async function findByDownloadToken(token) {
  if (!token) return null;
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE download_token = ? LIMIT 1',
    [token]
  );
  return ensureCredentials(rows[0] || null);
}

async function findByGallery(galleryId) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE gallery_id = ? ORDER BY created_at DESC',
    [galleryId]
  );
  return Promise.all(rows.map((row) => ensureCredentials(row)));
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
  return Promise.all(rows.map((row) => ensureCredentials(row)));
}

async function updateStatus(id, status) {
  await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

async function updateFullGallery(id, fullGallery) {
  await pool.query('UPDATE orders SET full_gallery = ? WHERE id = ?', [fullGallery ? 1 : 0, id]);
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
  findByDownloadToken,
  findByGallery,
  findByAdmin,
  updateStatus,
  updateFullGallery,
  deleteById,
  deleteCancelledOlderThan,
  findItemsByOrderIds,
};
