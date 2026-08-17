const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, BUCKET_NAME } = require('../config/r2');
const photoModel = require('../models/photoModel');
const { watermarkBuffer } = require('../utils/watermark');

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

    const metadata = await sharp(req.file.buffer).metadata();

    const thumbnailRaw = await sharp(req.file.buffer)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .toBuffer();
    const thumbnailBuffer = await watermarkBuffer(thumbnailRaw);

    const previewRaw = await sharp(req.file.buffer)
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .toBuffer();
    const previewBuffer = await watermarkBuffer(previewRaw);

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: originalKey,
      Body: req.file.buffer,
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

    res.status(201).json({ photo: await withSignedUrls(photo, true) });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ error: 'Error al subir la foto.' });
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
