import assert from 'node:assert/strict';
import { api, probe, getBackend, probeConfig } from '../src/services/api';

// Keep the retry waits tiny so the suite stays fast.
probeConfig.retryDelaysMs = [0, 1, 1];

type Reply = { status?: number; type?: string; body?: unknown; headers?: Record<string, string>; throws?: boolean };
let calls: Array<{ url: string; method: string }> = [];
const stub = (replies: Reply[]) => {
  calls = [];
  let i = 0;
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r.throws) throw new TypeError('fetch failed');
    const isJson = (r.type || 'application/json').includes('json');
    return new Response(isJson ? JSON.stringify(r.body ?? { ok: true, data: null, updatedAt: null }) : String(r.body ?? '<html></html>'), {
      status: r.status ?? 200,
      headers: { 'Content-Type': r.type || 'application/json; charset=utf-8', ...(r.headers || {}) },
    });
  };
};

// 1) healthy API: answers once, hands its body to the first getContent() (one round-trip at boot)
stub([{ body: { ok: true, data: { A: 1 }, updatedAt: 't1' } }]);
assert.equal(await probe(true), true);
assert.equal(getBackend(), 'cloudflare');
assert.deepEqual(await api.getContent(), { data: { A: 1 }, updatedAt: 't1' });
assert.equal(calls.length, 1, 'probe + first getContent share one request');
assert.equal(await probe(), true, 'answer is cached…');
assert.equal(calls.length, 1, '…without asking again');

// 2) the local Vite emulator identifies itself
stub([{ headers: { 'X-CMS-Backend': 'dev-emulator' } }]);
assert.equal(await probe(true), true);
assert.equal(getBackend(), 'dev', 'the admin UI can say "this is not the live site"');

// 3) a transient network error must NOT demote the session to browser-only mode
stub([{ throws: true }, { throws: true }, { body: { ok: true, data: null, updatedAt: null } }]);
assert.equal(await probe(true), true);
assert.equal(calls.length, 3, 'retried until the API answered');

// 4) an edge/gateway 5xx HTML page is transient too
stub([{ status: 502, type: 'text/html', body: '<html>Bad gateway</html>' }, { status: 503, type: 'text/html' }, { body: { ok: true, data: null, updatedAt: null } }]);
assert.equal(await probe(true), true);
assert.equal(calls.length, 3);

// 5) Functions really missing (SPA fallback = 200 HTML): definitive, no pointless retries
stub([{ status: 200, type: 'text/html', body: '<!doctype html><title>SPA</title>' }]);
assert.equal(await probe(true), false);
assert.equal(calls.length, 1);
assert.equal(getBackend(), 'none');

// 6) still down after every attempt → local mode, and the session says so
stub([{ throws: true }]);
assert.equal(await probe(true), false);
assert.equal(calls.length, probeConfig.retryDelaysMs.length);

// 7) concurrent probes (React StrictMode double-mount, assistant panel) share one request
stub([{ body: { ok: true, data: null, updatedAt: null } }]);
const [a, b] = await Promise.all([probe(true), probe(true)]);
assert.ok(a && b);
assert.equal(calls.length, 1, 'de-duplicated');

// 8) saveContent: every failure is classified so the UI can tell the truth
stub([{ body: { ok: true, updatedAt: 't2' } }]);
assert.deepEqual(await api.saveContent({ A: 1 }, 't1'), { ok: true, status: 200, updatedAt: 't2' });
assert.equal(calls[0].method, 'PUT');

stub([{ status: 401, body: { ok: false, error: 'unauthorized' } }]);
const expired = await api.saveContent({}, 't1');
assert.equal(expired.ok, false);
assert.equal(expired.unauthorized, true, 'expired session is detected');
assert.ok(!expired.transient, 'and is not retried blindly');

stub([{ status: 409, body: { ok: false, code: 'conflict', updatedAt: 't9' } }]);
const conflict = await api.saveContent({}, 't1');
assert.equal(conflict.conflict, true);
assert.equal(conflict.updatedAt, 't9');

stub([{ status: 413, body: { ok: false, error: 'too large' } }]);
const tooBig = await api.saveContent({}, 't1');
assert.equal(tooBig.ok, false);
assert.equal(tooBig.error, 'too large', 'the server message is shown verbatim');
assert.ok(!tooBig.transient && !tooBig.unauthorized, 'retrying a 413 never helps');

stub([{ status: 502, type: 'text/html', body: 'Bad gateway' }]);
const gateway = await api.saveContent({}, 't1');
assert.equal(gateway.transient, true, '5xx is retried');
assert.match(gateway.error || '', /502/);

stub([{ throws: true }]);
const offline = await api.saveContent({}, 't1');
assert.equal(offline.transient, true);
assert.match(offline.error || '', /اتصال/);

console.log('api-client.test.ts — تمام بررسی‌ها پاس شد ✅');
