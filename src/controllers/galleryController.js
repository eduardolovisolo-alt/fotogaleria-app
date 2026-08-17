const bcrypt = require('bcryptjs');
const galleryModel = require('../models/galleryModel');
const photoModel = require('../models/photoModel');
const selectionModel = require('../models/selectionModel');
const { signToken } = require('../utils/jwt');
const { uniqueSlug } = require('../utils/slug');
const { r2, BUCKET_NAME } = require('../config/r2');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function createGallery(req, res) {
  try {
    const { name, isPublic = true, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la galería es obligatorio.' });
    }
    if (!isPublic && !password) {
      return res.status(400).json({ error: 'Las galerías privadas necesitan una contraseña.' });
    }

    const slug = await uniqueSlug(name);
    const passwordHash = !isPublic && password ? await bcrypt.hash(password, 12) : null;

    const gallery = await galleryModel.create({
      adminId: req.user.sub,
      name: name.trim(),
      slug,
      isPublic: !!isPublic,
      passwordHash,
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
        return { ...toSafeGallery(g), photoCount: photos.length };
      })
    );
    res.json({ galleries: withCounts });
  } catch (err) {
    console.error('listMyGalleries error:', err);
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
    },
  });
}

async function unlockGallery(req, res) {
  try {
    const gallery = req.gallery;
    const { password } = req.body;

    if (gallery.is_public) {
      return res.status(400).json({ error: 'Esta galería ya es pública.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Ingresá la contraseña.' });
    }

    const valid = await bcrypt.compare(password, gallery.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
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
    if (!gallery || gallery.admin_id !== req.user.sub) {
      return res.status(404).json({ error: 'Galería no encontrada.' });
    }

    const { name, isPublic, password, clearPassword } = req.body;
    let passwordHash;

    if (isPublic === false && password) {
      passwordHash = await bcrypt.hash(password, 12);
    }
    if (isPublic === false && !password && !gallery.password_hash && !clearPassword) {
      return res.status(400).json({ error: 'Las galerías privadas necesitan una contraseña.' });
    }

    const updated = await galleryModel.update(gallery.id, {
      name,
      isPublic,
      passwordHash,
      clearPassword: isPublic === true || clearPassword,
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
    if (!gallery || gallery.admin_id !== req.user.sub) {
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
    if (!gallery || gallery.admin_id !== req.user.sub) {
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
    createdAt: gallery.created_at,
  };
}

module.exports = {
  createGallery,
  listMyGalleries,
  getGalleryInfo,
  unlockGallery,
  updateGallery,
  deleteGallery,
  getSelections,
};
