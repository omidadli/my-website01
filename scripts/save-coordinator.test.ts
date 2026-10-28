import assert from 'node:assert/strict';
import { createSaveCoordinator, type SaveOutcome } from '../src/services/saveCoordinator.ts';
import type { SaveResult } from '../src/services/api.ts';

type Call = { data: any; base: string | null; resolve: (r: SaveResult) => void };

function harness(opts: { backoffMs?: number[] } = {}) {
  const st = { data: { v: 1 } as any, base: 'T0' as string | null, synced: '' as string, active: true };
  const calls: Call[] = [];
  const outcomes: SaveOutcome[] = [];
  let saving = 0;
  const c = createSaveCoordinator({
    getData: () => st.data,
    getBase: () => st.base,
    setBase: (v) => { st.base = v; },
    save: (data, base) => new Promise<SaveResult>((resolve) => calls.push({ data: JSON.parse(JSON.stringify(data)), base, resolve })),
    isSynced: (json) => json === st.synced,
    isActive: () => st.active,
    onSaving: () => { saving++; },
    onOutcome: (o, json) => {
      outcomes.push(o);
      if (o.status === 'saved') { st.synced = json; st.base = o.updatedAt; }
    },
    sleep: async () => {},
    backoffMs: opts.backoffMs ?? [1, 1, 1],
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { st, calls, outcomes, c, tick, saving: () => saving };
}
const ok = (updatedAt: string): SaveResult => ({ ok: true, updatedAt });

async function main() {
  // 1) single flight + edits made during a save are saved afterwards with the LATEST data
  {
    const h = harness();
    const p1 = h.c.request('auto');
    await h.tick();
    assert.equal(h.calls.length, 1);
    h.st.data = { v: 2 };                 // user keeps typing while the first PUT is in flight
    const p2 = h.c.request('auto');       // debounce fires again
    await h.tick();
    assert.equal(h.calls.length, 1, 'no second concurrent PUT');
    h.calls[0].resolve(ok('T1'));
    await h.tick();
    assert.equal(h.calls.length, 2, 'a re-run is sent after the first finishes');
    assert.deepEqual(h.calls[1].data, { v: 2 }, 're-run carries the newest data, not the stale closure');
    assert.equal(h.calls[1].base, 'T1', 're-run uses the new base');
    h.calls[1].resolve(ok('T2'));
    const [o1, o2] = await Promise.all([p1, p2]);
    assert.equal(o1.status, 'saved'); assert.equal(o2.status, 'saved');
    assert.equal(h.st.synced, JSON.stringify({ v: 2 }));
  }

  // 2) outcome is the REAL result (conflict is never reported as saved)
  {
    const h = harness();
    const p = h.c.request('manual');
    await h.tick();
    h.calls[0].resolve({ ok: false, code: 'conflict', error: 'x', updatedAt: 'T9' });
    const o = await p;
    assert.equal(o.status, 'conflict');
    assert.equal(h.st.base, 'T0', 'base is NOT advanced silently on conflict');
  }

  // 3) after a conflict, auto-saves are paused (they must not overwrite the other writer)
  {
    const h = harness();
    const p = h.c.request('auto'); await h.tick();
    h.calls[0].resolve({ ok: false, code: 'conflict', error: 'x', updatedAt: 'T9' });
    await p;
    h.st.data = { v: 5 };
    const o = await h.c.request('auto');
    assert.equal(o.status, 'conflict');
    assert.equal(h.calls.length, 1, 'no PUT is sent while a conflict is unresolved');
    // keep mine: uses the server's version as base, saves, and then works again
    const k = h.c.keepMine(); await h.tick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].base, 'T9');
    assert.deepEqual(h.calls[1].data, { v: 5 });
    h.calls[1].resolve(ok('T10'));
    assert.equal((await k).status, 'saved');
    assert.equal(h.c.hasConflict(), false);
  }

  // 4) take cloud clears the pause
  {
    const h = harness();
    const p = h.c.request('auto'); await h.tick();
    h.calls[0].resolve({ ok: false, code: 'conflict', error: 'x', updatedAt: 'T9' });
    await p;
    h.c.clearConflict();
    h.st.data = { v: 7 };
    const p2 = h.c.request('auto'); await h.tick();
    assert.equal(h.calls.length, 2, 'saving works again after resolving');
    h.calls[1].resolve(ok('T11')); await p2;
  }

  // 5) retries with back-off on network/server errors, sending the latest data each time
  {
    const h = harness({ backoffMs: [1, 1] });
    const p = h.c.request('auto'); await h.tick();
    h.st.data = { v: 3 };
    h.calls[0].resolve({ ok: false, code: 'network', error: 'down' }); await h.tick();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls[1].data, { v: 3 }, 'edit made during back-off is sent on retry');
    h.calls[1].resolve({ ok: false, code: 'server', error: '500' }); await h.tick();
    h.calls[2].resolve({ ok: false, code: 'server', error: '500' });
    const o = await p;
    assert.equal(o.status, 'error');
    assert.equal(h.calls.length, 3, 'gives up after the back-off list is exhausted');
  }

  // 6) no retry on 4xx; 401 is reported as unauthorized
  {
    const h = harness();
    const p = h.c.request('auto'); await h.tick();
    h.calls[0].resolve({ ok: false, code: 'client', error: 'too big' });
    assert.equal((await p).status, 'error');
    assert.equal(h.calls.length, 1);
    const h2 = harness();
    const p2 = h2.c.request('manual'); await h2.tick();
    h2.calls[0].resolve({ ok: false, code: 'unauthorized', error: 'expired', unauthorized: true });
    assert.equal((await p2).status, 'unauthorized');
  }

  // 7) nothing to save / inactive => skipped and no PUT
  {
    const h = harness();
    h.st.synced = JSON.stringify(h.st.data);
    assert.equal((await h.c.request('manual')).status, 'skipped');
    h.st.synced = ''; h.st.active = false;
    assert.equal((await h.c.request('manual')).status, 'skipped');
    assert.equal(h.calls.length, 0);
  }

  console.log('save-coordinator.test.ts: 7 scenarios passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
