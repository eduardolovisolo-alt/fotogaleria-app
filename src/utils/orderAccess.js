const crypto = require('crypto');

const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const UNLOCK_MAX_FAILS = 8;
const unlockAttempts = new Map();

function generateDownloadToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateAccessPin() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function normalizePin(value) {
  return String(value || '').replace(/\D/g, '');
}

function pinsMatch(stored, provided) {
  const left = normalizePin(stored);
  const right = normalizePin(provided);
  if (left.length !== 6 || right.length !== 6) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function canDownloadStatus(status) {
  return status === 'paid' || status === 'shipped';
}

function orderDownloadPath(token) {
  return `/pedido.html?c=${encodeURIComponent(token)}`;
}

function orderDownloadUrl(baseUrl, token) {
  if (!token) return '';
  return `${String(baseUrl || '').replace(/\/$/, '')}${orderDownloadPath(token)}`;
}

function contentDisposition(fileName) {
  const raw = String(fileName || 'foto.jpg').replace(/[/\\]/g, '_');
  const ascii = raw.replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n]/g, '_') || 'foto.jpg';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(raw)}`;
}

function unlockRateKey(ip, orderId) {
  return `${ip || 'unknown'}:${orderId || 0}`;
}

function isUnlockBlocked(ip, orderId) {
  const key = unlockRateKey(ip, orderId);
  const rec = unlockAttempts.get(key);
  if (!rec) return false;
  if (rec.blockedUntil && rec.blockedUntil > Date.now()) return true;
  if (rec.blockedUntil && rec.blockedUntil <= Date.now()) {
    unlockAttempts.delete(key);
    return false;
  }
  return false;
}

function registerUnlockFailure(ip, orderId) {
  const key = unlockRateKey(ip, orderId);
  const rec = unlockAttempts.get(key) || { fails: 0, blockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= UNLOCK_MAX_FAILS) rec.blockedUntil = Date.now() + UNLOCK_WINDOW_MS;
  unlockAttempts.set(key, rec);
}

function clearUnlockFailures(ip, orderId) {
  unlockAttempts.delete(unlockRateKey(ip, orderId));
}

function publicOrderView(order, gallery = {}) {
  return {
    id: order.id,
    status: order.status,
    photoCount: Number(order.photo_count) || 0,
    totalAmount: Number(order.total_amount) || 0,
    discountPercent: Number(order.discount_percent) || 0,
    clientName: order.client_name,
    galleryName: gallery.name || order.gallery_name || '',
    gallerySlug: gallery.slug || order.gallery_slug || '',
    accessPin: order.access_pin,
    fullGallery: Number(order.full_gallery) === 1,
    createdAt: order.created_at,
  };
}

module.exports = {
  generateDownloadToken,
  generateAccessPin,
  normalizePin,
  pinsMatch,
  canDownloadStatus,
  orderDownloadPath,
  orderDownloadUrl,
  contentDisposition,
  isUnlockBlocked,
  registerUnlockFailure,
  clearUnlockFailures,
  publicOrderView,
};
