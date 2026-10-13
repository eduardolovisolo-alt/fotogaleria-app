const assert = require('assert');
const {
  DEFAULT_WHATSAPP_NUMBER,
  toWhatsAppNumber,
  isValidWhatsAppNumber,
  formatWhatsAppDisplay,
} = require('./whatsapp');

assert.strictEqual(toWhatsAppNumber('11 3010 8299'), '5491130108299');
assert.strictEqual(toWhatsAppNumber('1130108299'), '5491130108299');
assert.strictEqual(toWhatsAppNumber('+54 9 11 3010-8299'), '5491130108299');
assert.strictEqual(toWhatsAppNumber('5491130108299'), '5491130108299');
assert.strictEqual(toWhatsAppNumber('011 3010 8299'), '5491130108299');
assert.strictEqual(toWhatsAppNumber('54 9 11 2404-3503'), '5491124043503');
assert.strictEqual(toWhatsAppNumber('1124043503'), '5491124043503');
assert.strictEqual(toWhatsAppNumber(''), null);
assert.strictEqual(toWhatsAppNumber('123'), null);

assert.strictEqual(isValidWhatsAppNumber('11 3010 8299'), true);
assert.strictEqual(isValidWhatsAppNumber('54 9 11 2404-3503'), true);
assert.strictEqual(isValidWhatsAppNumber('abc'), false);
assert.strictEqual(isValidWhatsAppNumber('12'), false);

assert.strictEqual(formatWhatsAppDisplay('5491130108299'), '11 3010 8299');
assert.strictEqual(formatWhatsAppDisplay('11 3010 8299'), '11 3010 8299');
assert.strictEqual(formatWhatsAppDisplay('54 9 11 2404-3503'), '11 2404 3503');
assert.strictEqual(DEFAULT_WHATSAPP_NUMBER, '5491124043503');

console.log('whatsapp tests ok');
