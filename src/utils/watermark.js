const sharp = require('sharp');

const DEFAULTS = {
  text: 'FotoGalería Pro',
  pattern: 'diagonal',
  texture: 'soft',
  design: 'text',
};

function normalizeSettings(settings = {}) {
  const pattern = ['tile', 'diagonal', 'center', 'corners'].includes(settings.pattern)
    ? settings.pattern
    : DEFAULTS.pattern;
  const texture = ['soft', 'strong', 'outline'].includes(settings.texture)
    ? settings.texture
    : DEFAULTS.texture;
  const design = ['text', 'logo', 'both'].includes(settings.design)
    ? settings.design
    : DEFAULTS.design;
  const text = String(settings.text || DEFAULTS.text).slice(0, 48);
  return { text, pattern, texture, design, logoBuffer: settings.logoBuffer || null };
}

function opacityFor(texture) {
  if (texture === 'strong') return 0.42;
  if (texture === 'outline') return 0.55;
  return 0.26;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function buildStamp({ text, design, texture, logoBuffer, size = 420 }) {
  const layers = [];
  const useLogo = (design === 'logo' || design === 'both') && logoBuffer;
  const useText = design === 'text' || design === 'both' || !useLogo;

  if (useLogo) {
    const logo = await sharp(logoBuffer)
      .resize({ width: Math.round(size * 0.42), withoutEnlargement: true })
      .png()
      .toBuffer();
    layers.push({
      input: logo,
      gravity: useText ? 'north' : 'center',
      top: useText ? 36 : undefined,
    });
  }

  if (useText) {
    const fill = texture === 'outline' ? '#ffffff' : '#f2f0ea';
    const stroke = texture === 'outline' ? 'stroke:#1a1a1a;stroke-width:3px;' : '';
    const svg = Buffer.from(`
      <svg width="${size}" height="${Math.round(size * 0.38)}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle"
          font-family="DejaVu Sans, Arial, sans-serif" font-size="34" font-weight="700"
          fill="${fill}" fill-opacity="0.95" letter-spacing="2"
          style="${stroke}">${escapeXml(text)}</text>
      </svg>
    `);
    layers.push({ input: svg, gravity: useLogo ? 'south' : 'center' });
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite(layers)
    .toBuffer();
}

async function placeCorners(width, height, stamp, opacity) {
  const faded = await sharp(stamp).ensureAlpha(opacity).png().toBuffer();
  const meta = await sharp(faded).metadata();
  const pad = 18;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite([
      { input: faded, left: pad, top: pad },
      { input: faded, left: Math.max(pad, width - meta.width - pad), top: pad },
      { input: faded, left: pad, top: Math.max(pad, height - meta.height - pad) },
      { input: faded, left: Math.max(pad, width - meta.width - pad), top: Math.max(pad, height - meta.height - pad) },
    ])
    .toBuffer();
}

async function buildOverlay(width, height, settings) {
  const opacity = opacityFor(settings.texture);
  const stampSize = Math.max(180, Math.round(Math.min(width, height) * (settings.pattern === 'center' ? 0.55 : 0.38)));
  let stamp = await buildStamp({ ...settings, size: stampSize });

  if (settings.pattern === 'diagonal') {
    stamp = await sharp(stamp)
      .rotate(32, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  stamp = await sharp(stamp).ensureAlpha(opacity).png().toBuffer();

  if (settings.pattern === 'center') {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .composite([{ input: stamp, gravity: 'center' }])
      .toBuffer();
  }

  if (settings.pattern === 'corners') {
    return placeCorners(width, height, stamp, 1);
  }

  const stampMeta = await sharp(stamp).metadata();
  if (stampMeta.width > width || stampMeta.height > height) {
    const scale = Math.min(width / stampMeta.width, height / stampMeta.height) * 0.85;
    stamp = await sharp(stamp)
      .resize(Math.max(1, Math.round(stampMeta.width * scale)), Math.max(1, Math.round(stampMeta.height * scale)))
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite([{ input: stamp, tile: true }])
    .toBuffer();
}

async function watermarkBuffer(buffer, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const base = sharp(buffer);
  const meta = await base.metadata();
  const overlay = await buildOverlay(meta.width, meta.height, settings);
  const blend = settings.texture === 'soft' ? 'overlay' : 'over';
  return sharp(buffer)
    .composite([{ input: overlay, blend }])
    .toBuffer();
}

async function previewWatermark(rawSettings) {
  const sample = await sharp({
    create: {
      width: 720,
      height: 480,
      channels: 3,
      background: { r: 42, g: 42, b: 46 },
    },
  })
    .jpeg()
    .toBuffer();
  return watermarkBuffer(sample, rawSettings);
}

module.exports = {
  DEFAULTS,
  normalizeSettings,
  watermarkBuffer,
  previewWatermark,
};
