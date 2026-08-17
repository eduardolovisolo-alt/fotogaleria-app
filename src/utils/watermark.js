const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const TILE_PATH = path.join(__dirname, '..', 'assets', 'watermark-tile.png');
const tileBuffer = fs.readFileSync(TILE_PATH);
const TILE_META = sharp(tileBuffer).metadata();

// Usamos un tile PNG pre-renderizado (no texto SVG generado en caliente) porque
// el servidor de producción puede no tener instaladas las fuentes necesarias,
// lo que hacía que el texto se viera como cuadrados vacíos.
async function watermarkBuffer(buffer) {
  const [baseMeta, tileMeta] = await Promise.all([sharp(buffer).metadata(), TILE_META]);

  let tile = tileBuffer;
  // Si la foto es más chica que el tile (miniatura muy pequeña, imagen rara),
  // lo reducimos para que sharp pueda aplicarlo igual sin romper.
  if (tileMeta.width > baseMeta.width || tileMeta.height > baseMeta.height) {
    const scale = Math.min(baseMeta.width / tileMeta.width, baseMeta.height / tileMeta.height, 1) * 0.9;
    tile = await sharp(tileBuffer)
      .resize(Math.max(1, Math.round(tileMeta.width * scale)), Math.max(1, Math.round(tileMeta.height * scale)))
      .toBuffer();
  }

  return sharp(buffer)
    .composite([{ input: tile, tile: true, blend: 'over' }])
    .toBuffer();
}

module.exports = { watermarkBuffer };
