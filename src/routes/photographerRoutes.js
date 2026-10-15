const express = require('express');
const photographerController = require('../controllers/photographerController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const publicRouter = express.Router();
publicRouter.get('/', photographerController.listPublic);
publicRouter.get('/:slug', photographerController.getPublicProfile);

const adminRouter = express.Router();
adminRouter.get('/', protect, requireRole('admin'), photographerController.listForAdmin);
adminRouter.put('/galleries/:id/featured', protect, requireRole('admin'), photographerController.setGalleryFeatured);
adminRouter.put('/:id/status', protect, requireRole('admin'), photographerController.setStatus);

module.exports = { publicRouter, adminRouter };
