const express = require('express');
const {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  updateWhatsApp,
} = require('../controllers/authController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);
router.put('/whatsapp', protect, requireRole('admin'), updateWhatsApp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
