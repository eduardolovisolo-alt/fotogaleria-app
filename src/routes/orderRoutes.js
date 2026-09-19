const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, requireRole('admin'), orderController.listMyOrders);
router.put('/settings', protect, requireRole('admin'), orderController.updateOrderSettings);
router.put('/:id', protect, requireRole('admin'), orderController.updateOrderStatus);
router.delete('/:id', protect, requireRole('admin'), orderController.deleteOrder);

module.exports = router;
