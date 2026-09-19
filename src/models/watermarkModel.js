const pool = require('../config/db');

const DEFAULTS = {
  text: 'FotoGalería Pro',
  pattern: 'diagonal',
  texture: 'strong',
  design: 'text',
  logo_key: null,
};

async function findByAdmin(adminId) {
  const [rows] = await pool.query(
    'SELECT * FROM watermark_settings WHERE admin_id = ? LIMIT 1',
    [adminId]
  );
  return rows[0] || { admin_id: adminId, ...DEFAULTS };
}

async function upsert(adminId, { text, pattern, texture, design, logoKey }) {
  await pool.query(
    `INSERT INTO watermark_settings (admin_id, text, pattern, texture, design, logo_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       text = VALUES(text),
       pattern = VALUES(pattern),
       texture = VALUES(texture),
       design = VALUES(design),
       logo_key = VALUES(logo_key)`,
    [adminId, text, pattern, texture, design, logoKey]
  );
  return findByAdmin(adminId);
}

module.exports = { findByAdmin, upsert, DEFAULTS };
