const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, BUCKET_NAME } = require('../config/r2');
const photoModel = require('../models/photoModel');
const galleryModel = require('../models/galleryModel');
const { watermarkBuffer } = require('../utils/watermark');
const { settingsForAdmin } = require('./watermarkController');

const THUMBNAIL_WIDTH = 400;
const PREVIEW_WIDTH = 1600;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

async function uploadPhoto(req, res) {
  try {
    const gallery = req.gallery;
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const id = randomUUID();
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';

    const originalKey = `photos/${gallery.id}/${id}.${ext}`;
    const thumbnailKey = `thumbnails/${gallery.id}/${id}.${ext}`;
    const previewKey = `previews/${gallery.id}/${id}.${ext}`;

    if (!BUCKET_NAME) {
      return res.status(500).json({ error: 'Falta configurar el almacenamiento de fotos (R2).' });
    }

    const oriented = await sharp(req.file.buffer).rotate().toBuffer();
    const metadata = await sharp(oriented).metadata();

    const thumbnailRaw = await sharp(oriented)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .toBuffer();
    const previewRaw = await sharp(oriented)
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .toBuffer();

    let thumbnailBuffer = thumbnailRaw;
    let previewBuffer = previewRaw;
    if (gallery.apply_watermark !== 0) {
      const watermarkSettings = await settingsForAdmin(gallery.admin_id);
      thumbnailBuffer = await watermarkBuffer(thumbnailRaw, watermarkSettings);
      previewBuffer = await watermarkBuffer(previewRaw, watermarkSettings);
    }

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: originalKey,
      Body: oriented,
      ContentType: req.file.mimetype,
    }));

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: req.file.mimetype,
    }));

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: previewKey,
      Body: previewBuffer,
      ContentType: req.file.mimetype,
    }));

    const photo = await photoModel.create({
      galleryId: gallery.id,
      uploadedBy: req.user.sub,
      originalKey,
      thumbnailKey,
      previewKey,
      fileName: req.file.originalname,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: req.file.size,
    });

    if (!gallery.cover_photo_id) {
      await galleryModel.update(gallery.id, { coverPhotoId: photo.id });
    }

    res.status(201).json({ photo: await withSignedUrls(photo, true) });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    const message = /credentials|access|bucket|nosuch|invalidaccess/i.test(String(err.message || ''))
      ? 'No se pudo guardar la foto en el almacenamiento. Revisá la configuración de R2.'
      : 'Error al subir la foto.';
    res.status(500).json({ error: message });
  }
}

async function listPhotos(req, res) {
  try {
    const photos = await photoModel.findByGallery(req.gallery.id);
    const withUrls = await Promise.all(photos.map((p) => withSignedUrls(p, !!req.isGalleryOwner)));
    res.json({ photos: withUrls });
  } catch (err) {
    console.error('listPhotos error:', err);
    res.status(500).json({ error: 'Error al listar las fotos.' });
  }
}

async function deletePhoto(req, res) {
  try {
    const photo = await photoModel.findById(req.params.photoId);
    if (!photo || photo.gallery_id !== req.gallery.id) {
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }));
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnail_key }));
    if (photo.preview_key) {
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.preview_key }));
    }
    await photoModel.deleteById(photo.id);
    if (req.gallery.cover_photo_id === photo.id) {
      const remaining = await photoModel.findByGallery(req.gallery.id);
      await galleryModel.update(req.gallery.id, {
        coverPhotoId: remaining[0] ? remaining[0].id : null,
      });
    }

    res.json({ message: 'Foto eliminada.' });
  } catch (err) {
    console.error('deletePhoto error:', err);
    res.status(500).json({ error: 'Error al eliminar la foto.' });
  }
}

async function withSignedUrls(photo, includeOriginal) {
  const signPromises = {
    thumbnailUrl: getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnail_key }), { expiresIn: SIGNED_URL_TTL_SECONDS }),
    previewUrl: photo.preview_key
      ? getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.preview_key }), { expiresIn: SIGNED_URL_TTL_SECONDS })
      : Promise.resolve(null),
  };
  if (includeOriginal) {
    signPromises.url = getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }), { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  const entries = await Promise.all(Object.entries(signPromises).map(async ([key, p]) => [key, await p]));
  const urls = Object.fromEntries(entries);

  return { ...photo, ...urls };
}

module.exports = { uploadPhoto, listPhotos, deletePhoto, withSignedUrls };
