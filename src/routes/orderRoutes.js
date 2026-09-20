const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, requireRole('admin'), orderController.listMyOrders);
router.put('/settings', protect, requireRole('admin'), orderController.updateOrderSettings);
router.get('/download/:token/file/:photoId', orderController.downloadOrderFile);
router.get('/download/:token', orderController.getDownloadByToken);
router.post('/unlock', orderController.unlockOrder);
router.put('/:id', protect, requireRole('admin'), orderController.updateOrder);
router.delete('/:id', protect, requireRole('admin'), orderController.deleteOrder);

module.exports = router;
