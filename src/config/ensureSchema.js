const pool = require('./db');

async function addColumn(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
      throw err;
    }
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watermark_settings (
      admin_id INT PRIMARY KEY,
      text VARCHAR(80) NOT NULL DEFAULT 'FotoGalería Pro',
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
