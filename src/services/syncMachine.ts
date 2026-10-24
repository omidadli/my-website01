/**
 * Pure state machine for cloud sync logic.
 * No React, no DOM — easily testable in Node.
 *
 * States: 'idle' | 'saving' | 'synced' | 'error' | 'conflict'
 * Events: 'save_start' | 'save_success' | 'save_conflict' | 'save_error' |
 *         'save_unauthorized' | 'refresh_start' | 'refresh_success' |
 *         'refresh_error' | 'reset'
 */

export type SyncStatus = 'idle' | 'saving' | 'synced' | 'error' | 'conflict';

export interface SyncContext {
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: string | null;
  hasUnsyncedChanges: boolean;
}

export const initialSyncContext: SyncContext = {
  status: 'idle',
  error: null,
  lastSyncedAt: null,
  hasUnsyncedChanges: false,
};

export type SyncEvent =
  | { type: 'save_start' }
  | { type: 'save_success'; updatedAt: string | null }
  | { type: 'save_conflict'; updatedAt: string | null }
  | { type: 'save_error'; code: string; message: string }
  | { type: 'save_unauthorized'; message: string }
  | { type: 'refresh_start' }
  | { type: 'refresh_success' }
  | { type: 'refresh_error'; message: string }
  | { type: 'reset' };

export const syncReducer = (ctx: SyncContext, event: SyncEvent): SyncContext => {
  switch (event.type) {
    case 'save_start':
      return { ...ctx, status: 'saving', error: null };

    case 'save_success':
      return {
        ...ctx,
        status: 'synced',
        error: null,
        lastSyncedAt: new Date().toISOString(),
        hasUnsyncedChanges: false,
      };

    case 'save_conflict':
      return {
        ...ctx,
        status: 'conflict',
        error: 'محتوا از زمان خواندن شما تغییر کرده است. لطفاً یک نسخه را انتخاب کنید.',
        hasUnsyncedChanges: true,
      };

    case 'save_error':
      return {
        ...ctx,
        status: 'error',
        error: event.message,
        hasUnsyncedChanges: true,
      };

    case 'save_unauthorized':
      return {
        ...ctx,
        status: 'error',
        error: event.message,
        hasUnsyncedChanges: true,
      };

    case 'refresh_start':
      return { ...ctx, status: 'saving', error: null };

    case 'refresh_success':
      return {
        ...ctx,
        status: 'synced',
        error: null,
        lastSyncedAt: new Date().toISOString(),
        hasUnsyncedChanges: false,
      };

    case 'refresh_error':
      return {
        ...ctx,
        status: 'error',
        error: event.message,
        hasUnsyncedChanges: true,
      };

    case 'reset':
      return initialSyncContext;
  }
};

/**
 * Pure helper: determine if a save result should transition to conflict.
 */
export const isConflictResult = (ok: boolean, code?: string): boolean =>
  !ok && code === 'conflict';

/**
 * Pure helper: determine if a save result should transition to unauthorized.
 */
export const isUnauthorizedResult = (ok: boolean, code?: string): boolean =>
  !ok && code === 'unauthorized';
