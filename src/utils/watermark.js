const sharp = require('sharp');

const DEFAULTS = {
  text: 'Punto Directo Media',
  pattern: 'diagonal',
  texture: 'strong',
  design: 'text',
};

// Fuente 5x7 sin SVG ni Pango: funciona en Hostinger aunque libvips no tenga SVG.
const GLYPHS = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
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
  if (texture === 'strong') return 0.58;
  if (texture === 'outline') return 0.72;
  return 0.4;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function glyphKey(ch) {
  const upper = String(ch).toUpperCase();
  if (GLYPHS[upper]) return upper;
  const folded = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GLYPHS[folded] ? folded : null;
}

function paintGlyph(data, width, glyph, originX, originY, scale, rgba) {
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (glyph[row][col] !== '1') continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = originX + col * scale + dx;
          const y = originY + row * scale + dy;
          const idx = (y * width + x) * 4;
          data[idx] = rgba[0];
          data[idx + 1] = rgba[1];
          data[idx + 2] = rgba[2];
          data[idx + 3] = rgba[3];
        }
      }
    }
  }
}

async function renderBitmapTextPng(text, maxWidth, maxHeight, texture) {
  const chars = String(text || DEFAULTS.text).split('').map((ch) => glyphKey(ch)).filter(Boolean);
  const safe = chars.length ? chars : ['F', 'G'];
  const gap = 1;
  const units = safe.length * 6 - gap;
  const scale = Math.max(2, Math.min(
    Math.floor((maxWidth - 8) / Math.max(units, 1)),
    Math.floor((maxHeight - 8) / 7)
  ));
  const width = Math.max(8, units * scale + 8);
  const height = Math.max(8, 7 * scale + 8);
  const data = Buffer.alloc(width * height * 4, 0);
  const startX = Math.floor((width - (units * scale)) / 2);
  const startY = Math.floor((height - 7 * scale) / 2);
  const white = [255, 255, 255, 255];
  const ink = texture === 'outline' ? [255, 255, 255, 255] : [242, 240, 234, 255];
  const shadow = [20, 18, 16, 230];

  safe.forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    const x = startX + i * (5 + gap) * scale;
    if (texture === 'outline') {
      [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]].forEach(([ox, oy]) => {
        paintGlyph(data, width, glyph, x + ox, startY + oy, scale, shadow);
      });
    }
    paintGlyph(data, width, glyph, x, startY, scale, texture === 'outline' ? white : ink);
  });

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function renderTextPng(text, width, height, texture) {
  try {
    return await sharp({
      text: {
        text: `<span foreground="white">${escapeXml(text)}</span>`,
        width,
        height,
        rgba: true,
        align: 'centre',
      },
    })
      .png()
      .toBuffer();
  } catch {
    try {
      const fontSize = Math.max(16, Math.round(height * 0.45));
      const svg = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle"
            font-family="sans-serif" font-size="${fontSize}" font-weight="700"
            fill="#ffffff">${escapeXml(text)}</text>
        </svg>
      `);
      return await sharp(svg).png().toBuffer();
    } catch {
      return renderBitmapTextPng(text, width, height, texture);
    }
  }
}

async function applyOpacity(input, opacity) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const factor = Math.max(0.16, Math.min(1, opacity));
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * factor);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function withHalo(textPng) {
  const meta = await sharp(textPng).ensureAlpha().metadata();
  const halo = await sharp(textPng)
    .ensureAlpha()
    .tint({ r: 18, g: 16, b: 14 })
    .png()
    .toBuffer();
  const width = (meta.width || 1) + 8;
  const height = (meta.height || 1) + 8;
  const x = 4;
  const y = 4;
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
      { input: halo, left: x + 2, top: y + 2 },
      { input: halo, left: x - 1, top: y - 1 },
      { input: halo, left: x + 1, top: y - 1 },
      { input: textPng, left: x, top: y },
    ])
    .toBuffer();
}

async function buildStamp({ text, design, texture, logoBuffer, size = 420 }) {
  const useLogo = (design === 'logo' || design === 'both') && logoBuffer;
  const useText = design === 'text' || design === 'both' || !useLogo;
  const layers = [];
  const stampWidth = useText && !useLogo ? Math.round(size * 2.1) : size;
  const stampHeight = useText && !useLogo ? Math.max(72, Math.round(size * 0.46)) : size;

  if (useLogo) {
    const logo = await sharp(logoBuffer)
      .resize({ width: Math.round(size * 0.42), withoutEnlargement: true })
      .png()
      .toBuffer();
    layers.push({
      input: logo,
      gravity: useText ? 'north' : 'center',
      top: useText ? 28 : undefined,
    });
  }

  if (useText) {
    const boxWidth = useLogo ? size : Math.max(160, stampWidth - 16);
    const boxHeight = useLogo ? Math.max(48, Math.round(size * 0.28)) : Math.max(48, stampHeight - 12);
    const textPng = await withHalo(await renderTextPng(text, boxWidth, boxHeight, texture));
    layers.push({ input: textPng, gravity: useLogo ? 'south' : 'center' });
  }

  return sharp({
    create: {
      width: stampWidth,
      height: stampHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite(layers)
    .toBuffer();
}

async function placeCorners(width, height, stamp) {
  const meta = await sharp(stamp).metadata();
  const pad = 16;
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
      { input: stamp, left: pad, top: pad },
      { input: stamp, left: Math.max(pad, width - meta.width - pad), top: pad },
      { input: stamp, left: pad, top: Math.max(pad, height - meta.height - pad) },
      { input: stamp, left: Math.max(pad, width - meta.width - pad), top: Math.max(pad, height - meta.height - pad) },
    ])
    .toBuffer();
}

async function buildOverlay(width, height, settings) {
  const stampSize = Math.max(180, Math.round(Math.min(width, height) * (settings.pattern === 'center' ? 0.52 : 0.4)));
  let stamp = await buildStamp({ ...settings, size: stampSize });

  if (settings.pattern === 'diagonal') {
    stamp = await sharp(stamp)
      .rotate(32, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  stamp = await applyOpacity(stamp, opacityFor(settings.texture));

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
    return placeCorners(width, height, stamp);
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

async function lastResortWatermark(buffer, settings) {
  const meta = await sharp(buffer).rotate().metadata();
  if (!meta.width || !meta.height) {
    throw new Error('La foto no tiene un tamaño válido.');
  }
  const stamp = await renderBitmapTextPng(settings.text, 360, 90, settings.texture);
  const faded = await applyOpacity(stamp, 0.62);
  let tile = faded;
  try {
    tile = await sharp(faded)
      .rotate(30, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    tile = faded;
  }
  return sharp(buffer)
    .rotate()
    .composite([{ input: tile, tile: true, blend: 'over' }])
    .toBuffer();
}

async function watermarkBuffer(buffer, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  try {
    const meta = await sharp(buffer).rotate().metadata();
    if (!meta.width || !meta.height) {
      throw new Error('La foto no tiene un tamaño válido.');
    }
    const overlay = await buildOverlay(meta.width, meta.height, settings);
    return sharp(buffer)
      .rotate()
      .composite([{ input: overlay, blend: 'over' }])
      .toBuffer();
  } catch (err) {
    console.error('watermark primary path failed, using bitmap fallback:', err);
    return lastResortWatermark(buffer, settings);
  }
}

async function previewWatermark(rawSettings) {
  const sample = await sharp({
    create: {
      width: 900,
      height: 560,
      channels: 3,
      background: { r: 86, g: 78, b: 70 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 220,
            height: 220,
            channels: 4,
            background: { r: 196, g: 165, b: 116, alpha: 0.32 },
          },
        }).png().toBuffer(),
        left: 90,
        top: 70,
      },
      {
        input: await sharp({
          create: {
            width: 280,
            height: 280,
            channels: 4,
            background: { r: 138, g: 160, b: 181, alpha: 0.22 },
          },
        }).png().toBuffer(),
        left: 540,
        top: 220,
      },
    ])
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
