import assert from 'node:assert/strict';
import {
  syncReducer,
  initialSyncContext,
  isConflictResult,
  isUnauthorizedResult,
  type SyncContext,
  type SyncStatus,
} from '../src/services/syncMachine.ts';

const now = () => new Date().toISOString();

function expectSync(ctx: SyncContext, status: SyncStatus, hasUnsynced: boolean, error?: string) {
  assert.strictEqual(ctx.status, status, `expected status ${status}, got ${ctx.status}`);
  assert.strictEqual(
    ctx.hasUnsyncedChanges,
    hasUnsynced,
    `expected hasUnsyncedChanges ${hasUnsynced}, got ${ctx.hasUnsyncedChanges}`
  );
  if (error !== undefined) {
    assert.strictEqual(ctx.error, error, `expected error "${error}", got "${ctx.error}"`);
  } else {
    assert.strictEqual(ctx.error, null, `expected no error, got "${ctx.error}"`);
  }
}

// 1. conflict result never returns 'saved' and preserves draft
{
  const ctx = syncReducer(initialSyncContext, { type: 'save_conflict', updatedAt: '2026-01-01T00:00:00Z' });
  expectSync(ctx, 'conflict', true, 'محتوا از زمان خواندن شما تغییر کرده است. لطفاً یک نسخه را انتخاب کنید.');
  assert.notStrictEqual(ctx.status, 'synced', 'conflict must not become synced');
}

// 2. success after conflict clears conflict and marks synced
{
  const afterConflict = syncReducer(initialSyncContext, { type: 'save_conflict', updatedAt: '2026-01-01T00:00:00Z' });
  const recovered = syncReducer(afterConflict, { type: 'save_success', updatedAt: '2026-01-01T00:00:01Z' });
  expectSync(recovered, 'synced', false, undefined);
  assert.ok(recovered.lastSyncedAt, 'lastSyncedAt should be set after success');
}

// 3. unauthorized clears token-equivalent and keeps draft (hasUnsyncedChanges=true)
{
  const ctx = syncReducer(initialSyncContext, {
    type: 'save_unauthorized',
    message: 'نشست شما منقضی شده؛ دوباره وارد شوید.',
  });
  expectSync(ctx, 'error', true, 'نشست شما منقضی شده؛ دوباره وارد شوید.');
}

// 4. isConflictResult / isUnauthorizedResult pure helpers
{
  assert.strictEqual(isConflictResult(false, 'conflict'), true);
  assert.strictEqual(isConflictResult(false, 'unauthorized'), false);
  assert.strictEqual(isConflictResult(true, 'conflict'), false);
  assert.strictEqual(isUnauthorizedResult(false, 'unauthorized'), true);
  assert.strictEqual(isUnauthorizedResult(false, 'conflict'), false);
  assert.strictEqual(isUnauthorizedResult(true, 'unauthorized'), false);
}

// 5. save_error transitions to error with hasUnsyncedChanges=true
{
  const ctx = syncReducer(initialSyncContext, {
    type: 'save_error',
    code: 'network',
    message: 'اتصال به سرور برقرار نشد.',
  });
  expectSync(ctx, 'error', true, 'اتصال به سرور برقرار نشد.');
}

// 6. refresh_success clears error and unsynced flag
{
  const dirty = syncReducer(initialSyncContext, { type: 'save_error', code: 'network', message: 'x' });
  assert.strictEqual(dirty.hasUnsyncedChanges, true);
  const refreshed = syncReducer(dirty, { type: 'refresh_success' });
  expectSync(refreshed, 'synced', false, undefined);
}

// 7. reset returns to initial
{
  const dirty = syncReducer(initialSyncContext, { type: 'save_start' });
  const reset = syncReducer(dirty, { type: 'reset' });
  assert.deepStrictEqual(reset, initialSyncContext);
}

// 8. save_start sets status saving and clears error, keeps unsynced flag
{
  const withError = syncReducer(initialSyncContext, {
    type: 'save_error',
    code: 'server',
    message: 'server down',
  });
  assert.strictEqual(withError.status, 'error');
  assert.strictEqual(withError.hasUnsyncedChanges, true);
  const started = syncReducer(withError, { type: 'save_start' });
  expectSync(started, 'saving', true, undefined);
}

console.log('sync-machine: all 8 scenarios passed');
