const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2, BUCKET_NAME } = require('../config/r2');
const photoModel = require('../models/photoModel');

const THUMBNAIL_WIDTH = 400;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

async function uploadPhoto(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const ownerId = req.user.sub;
    const id = randomUUID();
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';

    const originalKey = `photos/${ownerId}/${id}.${ext}`;
    const thumbnailKey = `thumbnails/${ownerId}/${id}.${ext}`;

    const metadata = await sharp(req.file.buffer).metadata();
    const thumbnailBuffer = await sharp(req.file.buffer)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .toBuffer();

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

    const photo = await photoModel.create({
      ownerId,
      originalKey,
      thumbnailKey,
      fileName: req.file.originalname,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: req.file.size,
    });

    res.status(201).json({ photo: await withSignedUrls(photo) });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ error: 'Error al subir la foto.' });
  }
}

async function listPhotos(req, res) {
  try {
    const photos = await photoModel.findByOwner(req.user.sub);
    const withUrls = await Promise.all(photos.map(withSignedUrls));
    res.json({ photos: withUrls });
  } catch (err) {
    console.error('listPhotos error:', err);
    res.status(500).json({ error: 'Error al listar las fotos.' });
  }
}

async function deletePhoto(req, res) {
  try {
    const photo = await photoModel.findById(req.params.id);
    if (!photo || photo.owner_id !== req.user.sub) {
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }));
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnail_key }));
    await photoModel.deleteById(photo.id);

    res.json({ message: 'Foto eliminada.' });
  } catch (err) {
    console.error('deletePhoto error:', err);
    res.status(500).json({ error: 'Error al eliminar la foto.' });
  }
}

async function withSignedUrls(photo) {
  const [url, thumbnailUrl] = await Promise.all([
    getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }), { expiresIn: SIGNED_URL_TTL_SECONDS }),
    getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnail_key }), { expiresIn: SIGNED_URL_TTL_SECONDS }),
  ]);
  return { ...photo, url, thumbnailUrl };
}

module.exports = { uploadPhoto, listPhotos, deletePhoto };
