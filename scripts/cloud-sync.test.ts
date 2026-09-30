import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifyRemote,
  leanSnapshotData,
  normalizeSnapshotHistory,
  retryDelayMs,
  toCloudPayload,
  trimSnapshotHistory,
} from '../src/utils/cloudSync';
import * as initialData from '../src/data/contentCore';

// The live API refuses bodies above this (functions/api/_shared.ts → MAX_CONTENT_BYTES).
const API_LIMIT = 1_900_000;
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

// --- toCloudPayload: restore points never travel to the server -------------------------------
{
  const state = { A: 1, VERSION_HISTORY: [{ id: 's1', data: { big: 'x'.repeat(1000) } }], AUDIT_LOGS: [{ id: 'l' }] };
  const payload = toCloudPayload(state);
  assert.deepEqual(payload.VERSION_HISTORY, [], 'snapshot bodies stay in the browser');
  assert.equal(payload.A, 1);
  assert.deepEqual(payload.AUDIT_LOGS, state.AUDIT_LOGS, 'everything else is sent unchanged');
  assert.equal(state.VERSION_HISTORY.length, 1, 'the input state is never mutated');
}

// --- leanSnapshotData: a restore point must not embed other restore points -------------------
{
  const lean = leanSnapshotData({ PERSONAL_INFO: { name: 'x' }, VERSION_HISTORY: [1], AUDIT_LOGS: [2], BLOG_COMMENTS: [3] });
  assert.deepEqual(lean, { PERSONAL_INFO: { name: 'x' } });
}

// --- trimSnapshotHistory: capped by count and by size, newest always kept ---------------------
{
  const snap = (id: string, size: number) => ({ id, data: 'y'.repeat(size) });
  const list = [snap('new', 400), snap('mid', 400), snap('old', 400)];
  assert.deepEqual(trimSnapshotHistory(list, 20, 10_000).map((s) => s.id), ['new', 'mid', 'old']);
  assert.deepEqual(trimSnapshotHistory(list, 2, 10_000).map((s) => s.id), ['new', 'mid'], 'count cap');
  assert.deepEqual(trimSnapshotHistory(list, 20, 900).map((s) => s.id), ['new', 'mid'], 'size cap drops the oldest first');
  assert.deepEqual(trimSnapshotHistory([snap('huge', 5000)], 20, 100).map((s) => s.id), ['huge'], 'the newest survives even over budget');
}

// --- normalizeSnapshotHistory: heals history written by the previous (nesting) build ----------
{
  const inner = { id: 'old', label: 'old', timestamp: 't', data: { A: 'x'.repeat(100) } };
  const legacy = [
    // legacy snapshot: its data embeds the history that existed back then
    { id: 'legacy', label: 'l', timestamp: 't', data: { A: 'y'.repeat(100), VERSION_HISTORY: [inner, inner, inner], AUDIT_LOGS: [{ id: 1 }], BLOG_COMMENTS: [{ id: 2 }] } },
  ];
  const fixed = normalizeSnapshotHistory(legacy, 20, 10_000);
  assert.equal(fixed.length, 1);
  assert.deepEqual(Object.keys((fixed[0] as any).data), ['A'], 'nested history / logs / comments flattened away');
  assert.ok(JSON.stringify(fixed).length < JSON.stringify(legacy).length / 2, 'and it got much smaller');
  assert.deepEqual(normalizeSnapshotHistory(undefined, 20, 1000), [], 'missing history → empty list');
  assert.deepEqual(normalizeSnapshotHistory('nope' as any, 20, 1000), [], 'garbage → empty list');
  assert.equal(normalizeSnapshotHistory(fixed, 20, 10_000).length, 1, 'idempotent');
}

// --- retry policy grows, then plateaus ---------------------------------------------------------
assert.ok(retryDelayMs(0) < retryDelayMs(1) && retryDelayMs(1) < retryDelayMs(2));
assert.equal(retryDelayMs(99), retryDelayMs(3), 'delay plateaus');
assert.equal(retryDelayMs(-5), retryDelayMs(0));

// --- classifyRemote: an unreadable server is not an empty one ---------------------------------
assert.equal(classifyRemote(null), 'error', 'failed read');
assert.equal(classifyRemote(undefined), 'error');
assert.equal(classifyRemote({ data: null }), 'empty', 'server answered: no content yet');
assert.equal(classifyRemote({ data: { A: 1 } }), 'adopted');

// --- regression: one "create snapshot" click used to push the save past the API limit ----------
{
  const live = JSON.parse(fs.readFileSync(new URL('../content/site-content.json', import.meta.url), 'utf8'));
  const base: any = { ...live, VERSION_HISTORY: [{ id: 'snap-initial', label: 'x', timestamp: 'x', data: initialData }], AUDIT_LOGS: [] };

  // old behaviour: the snapshot deep-copied the whole state (history included), and it was uploaded
  const oldSnapshot = { id: 'snap-1', label: 'b', timestamp: 'x', data: JSON.parse(JSON.stringify(base)) };
  const oldState = { ...base, VERSION_HISTORY: [oldSnapshot, ...base.VERSION_HISTORY] };
  assert.ok(bytes(oldState) > API_LIMIT, 'sanity: the old payload really exceeded the limit (would be answered 413)');

  // new behaviour: lean snapshots in the browser, nothing of them uploaded, even after many clicks
  let state: any = base;
  for (let i = 0; i < 6; i++) {
    const snap = { id: `snap-${i}`, label: 'b', timestamp: 'x', data: leanSnapshotData(state) };
    state = { ...state, VERSION_HISTORY: trimSnapshotHistory([snap, ...state.VERSION_HISTORY], 20, 3_500_000) };
  }
  assert.ok(state.VERSION_HISTORY.length >= 2, 'restore points still work locally');
  assert.ok(bytes(toCloudPayload(state)) < API_LIMIT, `uploaded payload stays under the limit (${bytes(toCloudPayload(state))} bytes)`);
  assert.ok(bytes(toCloudPayload(state)) <= bytes(live) + 1000, 'the upload does not grow with snapshots');
  // the budget counts characters (what localStorage / memory care about), not UTF-8 bytes
  const historyChars = JSON.stringify(state.VERSION_HISTORY).length;
  assert.ok(historyChars <= 3_500_000 || state.VERSION_HISTORY.length === 1, `local history is size-capped (${historyChars} chars, ${state.VERSION_HISTORY.length} entries)`);
}

console.log('cloud-sync.test.ts — تمام بررسی‌ها پاس شد ✅');
