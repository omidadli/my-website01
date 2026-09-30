// A dead/expired domain used to surface as a bare "fetch failed" in CI (Export/Sync workflows),
// which hid the real cause for days. The client must name the cause and the host.
import assert from 'node:assert/strict';
import { SiteClient } from './site-client.mjs';

const client = new SiteClient({ baseUrl: 'https://this-host-does-not-exist.invalid', username: 'u', password: 'p' });
let error;
try {
  await client._req('/api/content', { auth: false });
} catch (e) {
  error = e;
}
assert.ok(error, 'an unreachable host must reject');
assert.equal(error.code, 'network');
assert.match(error.message, /GET https:\/\/this-host-does-not-exist\.invalid\/api\/content/, 'names the URL it could not reach');
assert.match(error.message, /network error \((ENOTFOUND|EAI_AGAIN|ECONNREFUSED|[A-Z_]+)\)/, 'names the low-level cause, not just "fetch failed"');
assert.doesNotMatch(error.message, /^fetch failed$/);
if (/ENOTFOUND|EAI_AGAIN/.test(error.message)) {
  assert.match(error.message, /does not resolve/, 'DNS failures come with an actionable hint');
}
console.log('site-client-errors.test.mjs — تمام بررسی‌ها پاس شد ✅');
