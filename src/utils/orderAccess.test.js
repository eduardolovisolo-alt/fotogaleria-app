const assert = require('assert');
const {
  generateDownloadToken,
  generateAccessPin,
  normalizePin,
  pinsMatch,
  canDownloadStatus,
  orderDownloadPath,
  orderDownloadUrl,
  contentDisposition,
  publicOrderView,
  isUnlockBlocked,
  registerUnlockFailure,
  clearUnlockFailures,
} = require('./orderAccess');

const token = generateDownloadToken();
assert.ok(token.length >= 32, 'token suficientemente largo');
assert.doesNotMatch(token, /[/+=]/, 'token en base64url');

const pin = generateAccessPin();
assert.match(pin, /^\d{6}$/);
assert.strictEqual(pinsMatch(pin, pin), true);
assert.strictEqual(pinsMatch(pin, '000000') && pin !== '000000' ? false : pinsMatch('482913', '482913'), true);
assert.strictEqual(pinsMatch('123456', '654321'), false);
assert.strictEqual(pinsMatch('12345', '12345'), false);
assert.strictEqual(normalizePin('12 34-56'), '123456');

assert.strictEqual(canDownloadStatus('pending'), false);
assert.strictEqual(canDownloadStatus('cancelled'), false);
assert.strictEqual(canDownloadStatus('paid'), true);
assert.strictEqual(canDownloadStatus('shipped'), true);

assert.strictEqual(orderDownloadPath('abc'), '/pedido.html?c=abc');
assert.strictEqual(
  orderDownloadUrl('https://fotos.example.com/', 'tok-en'),
  'https://fotos.example.com/pedido.html?c=tok-en'
);

const disp = contentDisposition('vacaciones/día 1.jpg');
assert.match(disp, /^attachment;/);
assert.match(disp, /filename=/);
assert.doesNotMatch(disp, /\//);

const view = publicOrderView(
  {
    id: 9,
    status: 'pending',
    photo_count: 4,
    total_amount: '1200.00',
    discount_percent: '10.00',
    client_name: 'Ana',
    access_pin: '111222',
    full_gallery: 1,
    created_at: '2026-09-20',
  },
  { name: 'Casamiento', slug: 'casamiento' }
);
assert.strictEqual(view.fullGallery, true);
assert.strictEqual(view.galleryName, 'Casamiento');
assert.ok(!('download_token' in view));

clearUnlockFailures('1.1.1.1', 3);
assert.strictEqual(isUnlockBlocked('1.1.1.1', 3), false);
for (let i = 0; i < 8; i += 1) registerUnlockFailure('1.1.1.1', 3);
assert.strictEqual(isUnlockBlocked('1.1.1.1', 3), true);
clearUnlockFailures('1.1.1.1', 3);
assert.strictEqual(isUnlockBlocked('1.1.1.1', 3), false);

console.log('orderAccess tests ok');
