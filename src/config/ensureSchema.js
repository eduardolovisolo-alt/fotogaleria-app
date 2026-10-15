const pool = require('./db');
const { generateDownloadToken, generateAccessPin } = require('../utils/orderAccess');

async function addColumn(sql) {
  try {
    await pool.query(sql);
    return true;
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
      throw err;
    }
    return false;
  }
}

async function addIndex(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME' && err.errno !== 1061) {
      throw err;
    }
  }
}

async function backfillOrderAccess() {
  const [rows] = await pool.query(
    `SELECT id, download_token, access_pin
     FROM orders
     WHERE download_token IS NULL OR download_token = '' OR access_pin IS NULL OR access_pin = ''`
  );
  for (const row of rows) {
    await pool.query(
      'UPDATE orders SET download_token = ?, access_pin = ? WHERE id = ?',
      [row.download_token || generateDownloadToken(), row.access_pin || generateAccessPin(), row.id]
    );
  }
}

async function ensureSchema() {
  await addColumn('ALTER TABLE galleries ADD COLUMN cover_photo_id INT NULL');
  await addColumn('ALTER TABLE galleries ADD COLUMN access_username VARCHAR(80) NULL');
  await addColumn('ALTER TABLE galleries ADD COLUMN author VARCHAR(150) NULL');
  await addColumn('ALTER TABLE galleries ADD COLUMN apply_watermark TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('ALTER TABLE galleries ADD COLUMN discount_tiers TEXT NULL');
  await addColumn('ALTER TABLE users ADD COLUMN order_auto_delete_days INT NULL');
  await addColumn('ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(20) NULL');
  await addColumn("ALTER TABLE users ADD COLUMN photographer_status ENUM('pending', 'approved', 'rejected') NULL");
  await addColumn('ALTER TABLE users ADD COLUMN public_slug VARCHAR(160) NULL');
  const addedFeatured = await addColumn('ALTER TABLE galleries ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0');
  try {
    await pool.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'photographer', 'client') NOT NULL DEFAULT 'client'"
    );
  } catch (err) {
    console.error('ensure user role enum:', err.message);
  }
  try {
    await addIndex('CREATE UNIQUE INDEX uniq_users_public_slug ON users (public_slug)');
  } catch (err) {
    console.error('ensure photographer slug:', err.message);
  }
  if (addedFeatured) {
    try {
      await pool.query(
        `UPDATE galleries g
         JOIN users u ON u.id = g.admin_id
         SET g.featured = 1
         WHERE u.role = 'admin'`
      );
    } catch (err) {
      console.error('ensure featured galleries:', err.message);
    }
  }
  try {
    const userModel = require('../models/userModel');
    const { uniquePhotographerSlug } = require('../utils/slug');
    const admins = await userModel.findAdmins();
    for (const admin of admins) {
      if (!admin.public_slug) {
        const slug = await uniquePhotographerSlug(admin.name || 'punto-directo');
        await userModel.setPublicSlug(admin.id, slug);
      }
    }
  } catch (err) {
    console.error('ensure admin slugs:', err.message);
  }
  await addColumn('ALTER TABLE orders ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0');
  await addColumn('ALTER TABLE orders ADD COLUMN download_token VARCHAR(64) NULL');
  await addColumn('ALTER TABLE orders ADD COLUMN access_pin VARCHAR(6) NULL');
  await addColumn('ALTER TABLE orders ADD COLUMN full_gallery TINYINT(1) NOT NULL DEFAULT 0');
  try {
    await backfillOrderAccess();
    await addIndex('CREATE UNIQUE INDEX uniq_orders_download_token ON orders (download_token)');
  } catch (err) {
    console.error('ensure order download access:', err.message);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watermark_settings (
      admin_id INT PRIMARY KEY,
      text VARCHAR(80) NOT NULL DEFAULT 'Punto Directo Media',
      pattern VARCHAR(20) NOT NULL DEFAULT 'diagonal',
      texture VARCHAR(20) NOT NULL DEFAULT 'soft',
      design VARCHAR(20) NOT NULL DEFAULT 'text',
      logo_key VARCHAR(500) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  try {
    await pool.query(`
      ALTER TABLE orders
      MODIFY COLUMN status ENUM('pending', 'paid', 'shipped', 'cancelled') NOT NULL DEFAULT 'pending'
    `);
  } catch (err) {
    console.error('ensure order status enum:', err.message);
  }
}

module.exports = { ensureSchema };
