const express = require('express');
const galleryController = require('../controllers/galleryController');
const photoController = require('../controllers/photoController');
const selectionController = require('../controllers/selectionController');
const orderController = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { loadGallery, requireGalleryAccess } = require('../middleware/galleryAccessMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { verifyToken } = require('../utils/jwt');

const router = express.Router();

// --- Rutas de administración (requieren login de admin) ---
router.post('/', protect, requireRole('admin'), galleryController.createGallery);
router.get('/', protect, requireRole('admin'), galleryController.listMyGalleries);
router.put('/:id', protect, requireRole('admin'), galleryController.updateGallery);
router.delete('/:id', protect, requireRole('admin'), galleryController.deleteGallery);
router.get('/:id/selections', protect, requireRole('admin'), galleryController.getSelections);
router.get('/:id/orders', protect, requireRole('admin'), orderController.listGalleryOrders);

// Subida/borrado de fotos: requiere admin logueado, dueño de la galería (verificado en el controller vía slug)
router.post(
  '/:slug/photos',
  protect,
  requireRole('admin'),
  loadGallery,
  requireGalleryOwner,
  upload.single('photo'),
  photoController.uploadPhoto
);
router.delete(
  '/:slug/photos/:photoId',
  protect,
  requireRole('admin'),
  loadGallery,
  requireGalleryOwner,
  photoController.deletePhoto
);

// --- Rutas públicas / acceso de clientes (por slug, sin cuenta) ---
router.get('/:slug', loadGallery, checkGalleryAccessFlag, galleryController.getGalleryInfo);
router.post('/:slug/unlock', loadGallery, galleryController.unlockGallery);
router.get('/:slug/photos', loadGallery, requireGalleryAccess, photoController.listPhotos);
router.post('/:slug/selections', loadGallery, requireGalleryAccess, selectionController.toggleSelection);
router.get('/:slug/selections/mine', loadGallery, requireGalleryAccess, selectionController.getMySelections);
router.post('/:slug/orders', loadGallery, requireGalleryAccess, orderController.createOrder);

function requireGalleryOwner(req, res, next) {
  if (req.gallery.admin_id !== req.user.sub) {
    return res.status(403).json({ error: 'No sos el dueño de esta galería.' });
  }
  next();
}

function checkGalleryAccessFlag(req, res, next) {
  if (req.gallery.is_public) {
    req.hasGalleryAccess = true;
    return next();
  }
  const header = req.headers['x-gallery-token'] || '';
  try {
    const payload = verifyToken(header);
    req.hasGalleryAccess = payload.type === 'gallery-access' && payload.galleryId === req.gallery.id;
  } catch {
    req.hasGalleryAccess = false;
  }
  next();
}

module.exports = router;
