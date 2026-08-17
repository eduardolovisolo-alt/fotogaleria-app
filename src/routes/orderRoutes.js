const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, requireRole('admin'), orderController.listMyOrders);
router.put('/:id', protect, requireRole('admin'), orderController.updateOrderStatus);

module.exports = router;
