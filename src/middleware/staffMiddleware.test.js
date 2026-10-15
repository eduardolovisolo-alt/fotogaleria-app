const assert = require('assert');
const { isApprovedStaff, isPublicPhotographer, panelPath } = require('./staffMiddleware');

assert.strictEqual(isApprovedStaff({ role: 'admin' }), true);
assert.strictEqual(isApprovedStaff({ role: 'photographer', photographer_status: 'approved' }), true);
assert.strictEqual(isApprovedStaff({ role: 'photographer', photographer_status: 'pending' }), false);
assert.strictEqual(isApprovedStaff({ role: 'client' }), false);
assert.strictEqual(isPublicPhotographer({ role: 'admin' }), true);
assert.strictEqual(isPublicPhotographer({ role: 'photographer', photographer_status: 'approved' }), true);
assert.strictEqual(isPublicPhotographer({ role: 'photographer', photographer_status: 'pending' }), false);
assert.strictEqual(panelPath({ role: 'admin' }), 'admin.html');
assert.strictEqual(panelPath({ role: 'photographer', photographer_status: 'approved' }), 'admin.html');
assert.strictEqual(panelPath({ role: 'photographer', photographer_status: 'pending' }), 'dashboard.html');

console.log('staffMiddleware tests ok');
