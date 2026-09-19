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
}

module.exports = { ensureSchema };
