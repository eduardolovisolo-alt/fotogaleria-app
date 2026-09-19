const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const watermarkController = require('../controllers/watermarkController');

const router = express.Router();

router.get('/', protect, requireRole('admin'), watermarkController.getSettings);
router.put('/', protect, requireRole('admin'), upload.single('logo'), watermarkController.saveSettings);
router.get('/preview', protect, requireRole('admin'), watermarkController.preview);

module.exports = router;
