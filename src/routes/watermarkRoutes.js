const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireStaff } = require('../middleware/staffMiddleware');
const upload = require('../middleware/uploadMiddleware');
const watermarkController = require('../controllers/watermarkController');

const router = express.Router();

router.get('/', protect, requireStaff, watermarkController.getSettings);
router.put('/', protect, requireStaff, upload.single('logo'), watermarkController.saveSettings);
router.get('/preview', protect, requireStaff, watermarkController.preview);

module.exports = router;
