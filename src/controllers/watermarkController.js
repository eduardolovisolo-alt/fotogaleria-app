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
  try {
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
  } catch (err) {
    console.error('watermark settings fallback:', err);
    return {
      text: 'FotoGalería Pro',
      pattern: 'diagonal',
      texture: 'strong',
      design: 'text',
      logo_key: null,
      logoBuffer: null,
    };
  }
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

async function getObjectBuffer(key) {
  const object = await r2.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  return streamToBuffer(object.Body);
}

async function loadSourceBuffer(photo) {
  const keys = [photo.original_key, photo.preview_key, photo.thumbnail_key].filter(Boolean);
  let lastError;
  for (const key of keys) {
    try {
      return await getObjectBuffer(key);
    } catch (err) {
      lastError = err;
    }
  }
  const name = photo.file_name || photo.id;
  throw new Error(`No se pudo leer ${name} en el almacenamiento${lastError?.message ? `: ${lastError.message}` : '.'}`);
}

function contentTypeFor(photo) {
  const name = String(photo.file_name || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function encodeForPhoto(buffer, photo) {
  const type = contentTypeFor(photo);
  if (type === 'image/png') return sharp(buffer).png().toBuffer();
  if (type === 'image/webp') return sharp(buffer).webp({ quality: 84 }).toBuffer();
  return sharp(buffer).jpeg({ quality: 84 }).toBuffer();
}

async function applyToPhoto(photo, settings) {
  if (!photo.thumbnail_key) {
    throw new Error(`La foto ${photo.file_name || photo.id} no tiene miniatura.`);
  }

  const sourceBuffer = await loadSourceBuffer(photo);
  const thumbnailRaw = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .toBuffer();
  const previewRaw = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .toBuffer();

  const [thumbnailMarked, previewMarked] = await Promise.all([
    watermarkBuffer(thumbnailRaw, settings),
    watermarkBuffer(previewRaw, settings),
  ]);
  const thumbnailBuffer = await encodeForPhoto(thumbnailMarked, photo);
  const previewBuffer = await encodeForPhoto(previewMarked, photo);
  const contentType = contentTypeFor(photo);

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
    if (!photos.length) {
      return res.status(400).json({
        error: 'Esta galería no tiene fotos para marcar.',
        done: 0,
        failed: 0,
      });
    }

    let done = 0;
    let failed = 0;
    let lastError = '';
    for (const photo of photos) {
      try {
        await applyToPhoto(photo, settings);
        done += 1;
      } catch (err) {
        console.error('reprocess photo error:', err);
        failed += 1;
        lastError = `${photo.file_name || photo.id}: ${err.message || 'error desconocido'}`;
      }
    }

    if (done === 0) {
      return res.status(500).json({
        error: `No se pudo aplicar la marca de agua a ninguna foto. ${lastError}`.trim(),
        done,
        failed,
      });
    }

    const extra = failed ? ` ${failed} fallaron. ${lastError}` : '';
    res.json({
      message: `Marca de agua aplicada a ${done} foto(s).${extra}`.trim(),
      done,
      failed,
    });
  } catch (err) {
    console.error('reprocess gallery error:', err);
    res.status(500).json({ error: err.message || 'Error al reaplicar la marca de agua.' });
  }
}

module.exports = {
  getSettings,
  saveSettings,
  preview,
  reprocessGallery,
  settingsForAdmin,
};
