const express = require('express');
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { requireStaff } = require('../middleware/staffMiddleware');

const router = express.Router();

router.get('/', protect, requireStaff, orderController.listMyOrders);
router.put('/settings', protect, requireStaff, orderController.updateOrderSettings);
router.get('/download/:token/file/:photoId', orderController.downloadOrderFile);
router.get('/download/:token', orderController.getDownloadByToken);
router.post('/unlock', orderController.unlockOrder);
router.put('/:id', protect, requireStaff, orderController.updateOrder);
router.delete('/:id', protect, requireStaff, orderController.deleteOrder);

module.exports = router;
