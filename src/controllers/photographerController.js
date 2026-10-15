const userModel = require('../models/userModel');
const galleryModel = require('../models/galleryModel');
const photoModel = require('../models/photoModel');
const { withSignedUrls } = require('./photoController');
const { formatWhatsAppDisplay, toWhatsAppNumber } = require('../utils/whatsapp');
const { isPublicPhotographer } = require('../middleware/staffMiddleware');

function publicPhotographer(user) {
  return {
    name: user.name,
    slug: user.public_slug,
  };
}

async function catalogItem(gallery, extra = {}) {
  const photos = await photoModel.findByGallery(gallery.id);
  let cover = null;
  if (gallery.cover_photo_id) {
    cover = photos.find((photo) => Number(photo.id) === Number(gallery.cover_photo_id)) || null;
  }
  if (!cover) cover = photos[0] || null;
  let coverUrl = null;
  if (cover) {
    try {
      const signed = await withSignedUrls(cover, false);
      coverUrl = signed.thumbnailUrl;
    } catch (err) {
      console.error('catalog cover error:', err);
    }
  }
  return {
    name: gallery.name,
    slug: gallery.slug,
    isPublic: !!gallery.is_public,
    author: extra.author || gallery.author || gallery.photographer_name || '',
    photographerSlug: extra.photographerSlug || gallery.photographer_slug || '',
    coverUrl,
    photoCount: photos.length,
  };
}

async function listPublic(req, res) {
  try {
    const photographers = await userModel.findPublicOwners();
    const items = await Promise.all(photographers.map(async (user) => {
      const galleries = await galleryModel.findPublicByOwner(user.id);
      const first = galleries[0];
      let coverUrl = null;
      if (first) {
        const card = await catalogItem(first, { author: user.name, photographerSlug: user.public_slug });
        coverUrl = card.coverUrl;
      }
      return {
        ...publicPhotographer(user),
        galleryCount: galleries.length,
        coverUrl,
      };
    }));
    res.json({ photographers: items.filter((item) => item.slug) });
  } catch (err) {
    console.error('listPublic photographers error:', err);
    res.status(500).json({ error: 'Error al listar fotógrafos.' });
  }
}

async function getPublicProfile(req, res) {
  try {
    const user = await userModel.findByPublicSlug(req.params.slug);
    if (!user || !isPublicPhotographer(user)) {
      return res.status(404).json({ error: 'No encontramos a ese fotógrafo.' });
    }
    const galleries = await galleryModel.findPublicByOwner(user.id);
    const items = await Promise.all(galleries.map((gallery) => (
      catalogItem(gallery, { author: user.name, photographerSlug: user.public_slug })
    )));
    const whatsappNumber = toWhatsAppNumber(user.whatsapp_number);
    res.json({
      photographer: {
        ...publicPhotographer(user),
        whatsappNumber,
        whatsappDisplay: formatWhatsAppDisplay(whatsappNumber),
      },
      galleries: items,
    });
  } catch (err) {
    console.error('getPublicProfile error:', err);
    res.status(500).json({ error: 'Error al cargar el fotógrafo.' });
  }
}

async function listForAdmin(req, res) {
  try {
    const [admins, photographers] = await Promise.all([
      userModel.findAdmins(),
      userModel.findPhotographers(),
    ]);
    const toItem = async (user, extra = {}) => {
      const galleries = await galleryModel.findByAdmin(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        status: extra.status || user.photographer_status,
        kind: extra.kind || 'photographer',
        slug: user.public_slug,
        whatsapp: formatWhatsAppDisplay(user.whatsapp_number),
        createdAt: user.created_at,
        galleries: galleries.map((gallery) => ({
          id: gallery.id,
          name: gallery.name,
          slug: gallery.slug,
          featured: !!gallery.featured,
          photoHint: gallery.author || '',
        })),
      };
    };
    const studio = await Promise.all(admins.map((user) => toItem(user, { status: 'studio', kind: 'studio' })));
    const items = await Promise.all(photographers.map((user) => toItem(user)));
    res.json({ photographers: [...studio, ...items] });
  } catch (err) {
    console.error('listForAdmin photographers error:', err);
    res.status(500).json({ error: 'Error al listar solicitudes.' });
  }
}

async function setStatus(req, res) {
  try {
    const status = String(req.body.status || '');
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }
    const user = await userModel.findById(req.params.id);
    if (!user || user.role !== 'photographer') {
      return res.status(404).json({ error: 'Fotógrafo no encontrado.' });
    }
    const updated = await userModel.setPhotographerStatus(user.id, status);
    res.json({
      photographer: {
        id: updated.id,
        name: updated.name,
        status: updated.photographer_status,
        slug: updated.public_slug,
      },
    });
  } catch (err) {
    console.error('setStatus photographer error:', err);
    res.status(500).json({ error: 'Error al actualizar el fotógrafo.' });
  }
}

async function setGalleryFeatured(req, res) {
  try {
    const gallery = await galleryModel.findById(req.params.id);
    if (!gallery) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }
    const updated = await galleryModel.update(gallery.id, { featured: !!req.body.featured });
    res.json({ gallery: { id: updated.id, featured: !!updated.featured } });
  } catch (err) {
    console.error('setGalleryFeatured error:', err);
    res.status(500).json({ error: 'Error al destacar la galería.' });
  }
}

module.exports = {
  catalogItem,
  listPublic,
  getPublicProfile,
  listForAdmin,
  setStatus,
  setGalleryFeatured,
};
