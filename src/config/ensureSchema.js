const pool = require('./db');
const { generateDownloadToken, generateAccessPin } = require('../utils/orderAccess');

async function addColumn(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
      throw err;
    }
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
