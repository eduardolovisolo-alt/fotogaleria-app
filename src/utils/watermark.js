const sharp = require('sharp');

const WATERMARK_TEXT = process.env.WATERMARK_TEXT || 'FOTOGALERÍA PRO';

function buildWatermarkSvg(width, height, text) {
  const fontSize = Math.max(16, Math.round(width / 15));
  const stepX = fontSize * (text.length * 0.6 + 4);
  const stepY = fontSize * 5;
  let items = '';

  for (let y = -height * 0.5; y < height * 1.5; y += stepY) {
    for (let x = -width * 0.5; x < width * 1.5; x += stepX) {
      items += `<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})">${text}</text>`;
    }
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text {
          fill: rgba(255,255,255,0.32);
          font-size: ${fontSize}px;
          font-family: 'Segoe UI', Arial, sans-serif;
          font-weight: 700;
        }
      </style>
      ${items}
    </svg>`;
}

async function watermarkBuffer(buffer, text = WATERMARK_TEXT) {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const svg = buildWatermarkSvg(meta.width, meta.height, text);
  return image.composite([{ input: Buffer.from(svg) }]).toBuffer();
}

module.exports = { watermarkBuffer };
