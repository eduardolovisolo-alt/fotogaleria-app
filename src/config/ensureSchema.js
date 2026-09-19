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
}

module.exports = { ensureSchema };
