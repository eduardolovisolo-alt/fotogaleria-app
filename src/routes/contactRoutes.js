const express = require('express');
const contactController = require('../controllers/contactController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', contactController.submit);
router.get('/', protect, requireRole('admin'), contactController.list);
router.put('/:id/read', protect, requireRole('admin'), contactController.markRead);

module.exports = router;
