const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET_NAME } = require('../config/r2');
const watermarkModel = require('../models/watermarkModel');
const galleryModel = require('../models/galleryModel');
const photoModel = require('../models/photoModel');
const { watermarkBuffer, previewWatermark, normalizeSettings } = require('../utils/watermark');
const sharp = require('sharp');

const THUMBNAIL_WIDTH = 400;
const PREVIEW_WIDTH = 1600;

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function loadLogoBuffer(logoKey) {
  if (!logoKey) return null;
  try {
    const object = await r2.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: logoKey }));
    return streamToBuffer(object.Body);
  } catch (err) {
    console.error('watermark logo load error:', err);
    return null;
  }
}

async function settingsForAdmin(adminId) {
  const row = await watermarkModel.findByAdmin(adminId);
  const logoBuffer = await loadLogoBuffer(row.logo_key);
  return {
    text: row.text,
    pattern: row.pattern,
    texture: row.texture,
    design: row.design,
    logo_key: row.logo_key,
    logoBuffer,
  };
}

function toPublic(row) {
  return {
    text: row.text,
    pattern: row.pattern,
    texture: row.texture,
    design: row.design,
    hasLogo: Boolean(row.logo_key),
  };
}

async function getSettings(req, res) {
  try {
    const row = await watermarkModel.findByAdmin(req.user.sub);
    res.json({ settings: toPublic(row) });
  } catch (err) {
    console.error('get watermark error:', err);
    res.status(500).json({ error: 'Error al leer la marca de agua.' });
  }
}

async function saveSettings(req, res) {
  try {
    const current = await watermarkModel.findByAdmin(req.user.sub);
    const incoming = normalizeSettings({
      text: req.body.text,
      pattern: req.body.pattern,
      texture: req.body.texture,
      design: req.body.design,
    });

    let logoKey = current.logo_key || null;
    if (req.file) {
      logoKey = `watermarks/${req.user.sub}/logo.png`;
      const png = await sharp(req.file.buffer).png().toBuffer();
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: logoKey,
        Body: png,
        ContentType: 'image/png',
      }));
    }
    if (req.body.clearLogo === '1' || req.body.clearLogo === true) {
      logoKey = null;
    }

    const saved = await watermarkModel.upsert(req.user.sub, {
      text: incoming.text,
      pattern: incoming.pattern,
      texture: incoming.texture,
      design: incoming.design,
      logoKey,
    });
    res.json({ settings: toPublic(saved) });
  } catch (err) {
    console.error('save watermark error:', err);
    res.status(500).json({ error: 'Error al guardar la marca de agua.' });
  }
}

async function preview(req, res) {
  try {
    const current = await settingsForAdmin(req.user.sub);
    const settings = normalizeSettings({
      ...current,
      text: req.query.text || current.text,
      pattern: req.query.pattern || current.pattern,
      texture: req.query.texture || current.texture,
      design: req.query.design || current.design,
    });
    if (req.query.design === 'text') settings.logoBuffer = null;
    const jpeg = await previewWatermark(settings);
    res.set('Content-Type', 'image/jpeg');
    res.send(jpeg);
  } catch (err) {
    console.error('preview watermark error:', err);
    res.status(500).json({ error: 'Error al generar la vista previa.' });
  }
}

async function applyToPhoto(photo, settings) {
  const original = await r2.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.original_key }));
  const originalBuffer = await streamToBuffer(original.Body);

  const thumbnailRaw = await sharp(originalBuffer)
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .toBuffer();
  const previewRaw = await sharp(originalBuffer)
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .toBuffer();

  const [thumbnailBuffer, previewBuffer] = await Promise.all([
    watermarkBuffer(thumbnailRaw, settings),
    watermarkBuffer(previewRaw, settings),
  ]);

  const contentType = photo.file_name?.toLowerCase().endsWith('.png')
    ? 'image/png'
    : photo.file_name?.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: photo.thumbnail_key,
    Body: thumbnailBuffer,
    ContentType: contentType,
  }));
  if (photo.preview_key) {
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: photo.preview_key,
      Body: previewBuffer,
      ContentType: contentType,
    }));
  }
}

async function reprocessGallery(req, res) {
  try {
    const gallery = req.gallery;
    const settings = await settingsForAdmin(gallery.admin_id);
    const photos = await photoModel.findByGallery(gallery.id);
    let done = 0;
    let failed = 0;
    for (const photo of photos) {
      try {
        await applyToPhoto(photo, settings);
        done += 1;
      } catch (err) {
        console.error('reprocess photo error:', err);
        failed += 1;
      }
    }
    res.json({ message: `Marca de agua aplicada a ${done} foto(s).`, done, failed });
  } catch (err) {
    console.error('reprocess gallery error:', err);
    res.status(500).json({ error: 'Error al reaplicar la marca de agua.' });
  }
}

module.exports = {
  getSettings,
  saveSettings,
  preview,
  reprocessGallery,
  settingsForAdmin,
};
