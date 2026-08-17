const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const authRoutes = require('./src/routes/authRoutes');
const galleryRoutes = require('./src/routes/galleryRoutes');
const contactRoutes = require('./src/routes/contactRoutes');
const orderRoutes = require('./src/routes/orderRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/orders', orderRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño máximo permitido (25MB).'
      : err.message;
    return res.status(400).json({ error: message });
  }
  if (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
  next();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
