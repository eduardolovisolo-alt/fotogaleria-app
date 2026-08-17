const galleryModel = require('../models/galleryModel');
const { verifyToken } = require('../utils/jwt');

async function loadGallery(req, res, next) {
  const gallery = await galleryModel.findBySlug(req.params.slug);
  if (!gallery) {
    return res.status(404).json({ error: 'Galería no encontrada.' });
  }
  req.gallery = gallery;
  next();
}

function detectGalleryOwner(req) {
  const gallery = req.gallery;
  const authHeader = req.headers.authorization || '';
  const [scheme, bearerToken] = authHeader.split(' ');
  if (scheme === 'Bearer' && bearerToken) {
    try {
      const payload = verifyToken(bearerToken);
      if (payload.sub === gallery.admin_id) {
        req.isGalleryOwner = true;
      }
    } catch {
      // no era un token de admin válido, no hacemos nada
    }
  }
}

function requireGalleryAccess(req, res, next) {
  const gallery = req.gallery;

  // El admin dueño de la galería siempre puede verla, con su propio JWT de sesión,
  // sea la galería pública o privada.
  detectGalleryOwner(req);

  if (gallery.is_public || req.isGalleryOwner) {
    return next();
  }

  const galleryToken = req.headers['x-gallery-token'] || '';
  try {
    const payload = verifyToken(galleryToken);
    if (payload.type !== 'gallery-access' || payload.galleryId !== gallery.id) {
      throw new Error('token no corresponde a esta galería');
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Esta galería es privada. Ingresá la contraseña.', locked: true });
  }
}

module.exports = { loadGallery, requireGalleryAccess };
