const bcrypt = require('bcryptjs');
const galleryModel = require('../models/galleryModel');
const photoModel = require('../models/photoModel');
const selectionModel = require('../models/selectionModel');
const orderModel = require('../models/orderModel');
const { signToken } = require('../utils/jwt');
const { uniqueSlug } = require('../utils/slug');
const { sameId } = require('../utils/ids');
const { r2, BUCKET_NAME } = require('../config/r2');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { withSignedUrls } = require('./photoController');

async function createGallery(req, res) {
  try {
    const { name, isPublic = true, password, accessUsername, pricePerPhoto } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la galería es obligatorio.' });
    }
    if (!isPublic && !password) {
      return res.status(400).json({ error: 'Las galerías privadas necesitan una contraseña.' });
    }
    if (!isPublic && !String(accessUsername || '').trim()) {
      return res.status(400).json({ error: 'Las galerías privadas necesitan un usuario de acceso.' });
    }
    if (pricePerPhoto !== undefined && pricePerPhoto !== '' && Number(pricePerPhoto) < 0) {
      return res.status(400).json({ error: 'El precio no puede ser negativo.' });
    }

    const slug = await uniqueSlug(name);
    const passwordHash = !isPublic && password ? await bcrypt.hash(password, 12) : null;

    const gallery = await galleryModel.create({
      adminId: req.user.sub,
      name: name.trim(),
      slug,
      isPublic: !!isPublic,
      passwordHash,
      accessUsername: !isPublic ? String(accessUsername).trim() : null,
      pricePerPhoto: pricePerPhoto ? Number(pricePerPhoto) : null,
    });

    res.status(201).json({ gallery: toSafeGallery(gallery) });
  } catch (err) {
    console.error('createGallery error:', err);
    res.status(500).json({ error: 'Error al crear la galería.' });
  }
}

async function listMyGalleries(req, res) {
  try {
    const galleries = await galleryModel.findByAdmin(req.user.sub);
    const withCounts = await Promise.all(
      galleries.map(async (g) => {
        const photos = await photoModel.findByGallery(g.id);
        const orders = await orderModel.findByGallery(g.id);
        return { ...toSafeGallery(g), photoCount: photos.length, orderCount: orders.length };
      })
    );
    res.json({ galleries: withCounts });
  } catch (err) {
    console.error('listMyGalleries error:', err);
    res.status(500).json({ error: 'Error al listar las galerías.' });
  }
}

async function findCoverPhoto(gallery) {
  if (gallery.cover_photo_id) {
    const featured = await photoModel.findById(gallery.cover_photo_id);
    if (featured && featured.gallery_id === gallery.id) return featured;
  }
  const photos = await photoModel.findByGallery(gallery.id);
  return photos[0] || null;
}

async function listCatalog(req, res) {
  try {
    const galleries = await galleryModel.findAll();
    const items = await Promise.all(galleries.map(async (gallery) => {
      const cover = await findCoverPhoto(gallery);
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
        coverUrl,
      };
    }));
    res.json({ galleries: items });
  } catch (err) {
    console.error('listCatalog error:', err);
    res.status(500).json({ error: 'Error al listar las galerías.' });
  }
}

async function getGalleryInfo(req, res) {
  const gallery = req.gallery;
  const locked = !gallery.is_public && !req.hasGalleryAccess;
  res.json({
    gallery: {
      id: gallery.id,
      name: gallery.name,
      slug: gallery.slug,
      isPublic: !!gallery.is_public,
      locked,
      pricePerPhoto: gallery.price_per_photo,
    },
  });
}

async function unlockGallery(req, res) {
  try {
    const gallery = req.gallery;
    const { username, password } = req.body;

    if (gallery.is_public) {
      return res.status(400).json({ error: 'Esta galería ya es pública.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Ingresá el usuario y la contraseña.' });
    }
    if (gallery.access_username) {
      const expected = String(gallery.access_username).trim().toLowerCase();
      const given = String(username || '').trim().toLowerCase();
      if (!given || given !== expected) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }
    }

    const valid = await bcrypt.compare(password, gallery.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = signToken({ type: 'gallery-access', galleryId: gallery.id }, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    console.error('unlockGallery error:', err);
    res.status(500).json({ error: 'Error al validar la contraseña.' });
  }
}

async function updateGallery(req, res) {
  try {
    const gallery = await galleryModel.findById(req.params.id);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }

    const { name, isPublic, password, accessUsername, coverPhotoId, clearPassword, pricePerPhoto } = req.body;
    let passwordHash;

    if (isPublic === false && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }
    if (isPublic === false && !password && !gallery.password_hash && !clearPassword) {
      return res.status(400).json({ error: 'Las galerías privadas necesitan una contraseña.' });
    }
    if (isPublic === false) {
      const nextUsername = accessUsername !== undefined
        ? String(accessUsername || '').trim()
        : gallery.access_username;
      if (!nextUsername) {
        return res.status(400).json({ error: 'Las galerías privadas necesitan un usuario de acceso.' });
      }
    }
    if (coverPhotoId) {
      const photo = await photoModel.findById(coverPhotoId);
      if (!photo || photo.gallery_id !== gallery.id) {
        return res.status(400).json({ error: 'La foto destacada no pertenece a esta galería.' });
      }
    }
    if (pricePerPhoto !== undefined && pricePerPhoto !== '' && Number(pricePerPhoto) < 0) {
      return res.status(400).json({ error: 'El precio no puede ser negativo.' });
    }

    const updated = await galleryModel.update(gallery.id, {
      name,
      isPublic,
      passwordHash,
      clearPassword: isPublic === true || clearPassword,
      accessUsername: isPublic === true
        ? null
        : (accessUsername !== undefined ? String(accessUsername).trim() : undefined),
      coverPhotoId,
      pricePerPhoto: pricePerPhoto !== undefined ? (pricePerPhoto ? Number(pricePerPhoto) : null) : undefined,
    });

    res.json({ gallery: toSafeGallery(updated) });
  } catch (err) {
    console.error('updateGallery error:', err);
    res.status(500).json({ error: 'Error al actualizar la galería.' });
  }
}

async function deleteGallery(req, res) {
  try {
    const gallery = await galleryModel.findById(req.params.id);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }

    const photos = await photoModel.findByGallery(gallery.id);
    for (const photo of photos) {
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }));
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnail_key }));
    }

    await galleryModel.deleteById(gallery.id);
    res.json({ message: 'Galería eliminada.' });
  } catch (err) {
    console.error('deleteGallery error:', err);
    res.status(500).json({ error: 'Error al eliminar la galería.' });
  }
}

async function getSelections(req, res) {
  try {
    const gallery = await galleryModel.findById(req.params.id);
    if (!gallery || !sameId(gallery.admin_id, req.user.sub)) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }
    const selections = await selectionModel.findByGallery(gallery.id);
    res.json({ selections });
  } catch (err) {
    console.error('getSelections error:', err);
    res.status(500).json({ error: 'Error al obtener las selecciones.' });
  }
}

function toSafeGallery(gallery) {
  return {
    id: gallery.id,
    name: gallery.name,
    slug: gallery.slug,
    isPublic: !!gallery.is_public,
    hasPassword: !!gallery.password_hash,
    accessUsername: gallery.access_username || '',
    coverPhotoId: gallery.cover_photo_id || null,
    pricePerPhoto: gallery.price_per_photo,
    createdAt: gallery.created_at,
  };
}

module.exports = {
  createGallery,
  listMyGalleries,
  listCatalog,
  getGalleryInfo,
  unlockGallery,
  updateGallery,
  deleteGallery,
  getSelections,
};
