/**
 * Framework-free save coordinator for the cloud CMS save path.
 *
 * Guarantees (each one is covered by scripts/save-coordinator.test.ts):
 *  - single flight: never two PUTs at once (a second request waits and re-runs);
 *  - always saves the LATEST data (read through getData at send time, so edits
 *    typed while a save or a retry back-off is running are never lost);
 *  - the returned outcome is the real result of the save, not a stale UI state;
 *  - after a conflict, nothing is sent until the user explicitly resolves it, and
 *    the base version is NOT advanced silently (that would let the next
 *    auto-save overwrite the other writer's changes).
 */
import type { SaveResult } from './api';

export type SaveOutcome =
  | { status: 'saved'; updatedAt: string | null; message?: string }
  | { status: 'conflict'; message: string; remoteUpdatedAt: string | null }
  | { status: 'unauthorized'; message: string }
  | { status: 'error'; message: string; code: string }
  | { status: 'skipped'; message: string };

export const CONFLICT_MESSAGE =
  'محتوا از زمان خواندن شما تغییر کرده است. لطفاً یک نسخه را انتخاب کنید.';

export interface SaveCoordinatorDeps {
  /** Latest content (read at send time). */
  getData: () => unknown;
  /** Latest server version we know about. */
  getBase: () => string | null;
  setBase: (v: string | null) => void;
  save: (data: unknown, base: string | null) => Promise<SaveResult>;
  /** True when this JSON is already what the cloud has. */
  isSynced: (json: string) => boolean;
  /** False when saving must not happen (logged out, not in cloud mode, unmounted). */
  isActive: () => boolean;
  onSaving: () => void;
  /** Called once per real attempt result (never for 'skipped'). */
  onOutcome: (outcome: SaveOutcome, json: string, sent: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: number[];
}

export const createSaveCoordinator = (deps: SaveCoordinatorDeps) => {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const backoff = deps.backoffMs ?? [2000, 5000, 15000, 30000, 60000];

  let inFlight: Promise<SaveOutcome> | null = null;
  let rerun = false;
  let conflict: { remoteUpdatedAt: string | null } | null = null;

  const skipped = (message: string): SaveOutcome => ({ status: 'skipped', message });

  const attempt = async (): Promise<SaveOutcome> => {
    let tries = 0;
    let announced = false;
    for (;;) {
      if (!deps.isActive()) return skipped('ذخیره ابری فقط در حالت ابری و هنگام ورود ادمین ممکن است.');
      const data = deps.getData(); // re-read on every try: edits during back-off must be sent
      const json = JSON.stringify(data);
      if (deps.isSynced(json)) return skipped('تغییراتی برای ذخیره‌سازی وجود ندارد.');
      if (!announced) { deps.onSaving(); announced = true; }

      let res: SaveResult;
      try {
        res = await deps.save(data, deps.getBase());
      } catch {
        res = { ok: false, code: 'network', error: 'اتصال به سرور برقرار نشد.' };
      }

      let outcome: SaveOutcome | null = null;
      if (res.ok) {
        outcome = { status: 'saved', updatedAt: res.updatedAt, message: 'با موفقیت در ابری ذخیره شد.' };
      } else {
        // The project does not enable strict null checks, so narrow the failure variant explicitly.
        const fail = res as Extract<SaveResult, { ok: false }>;
        if (fail.code === 'unauthorized') {
          outcome = { status: 'unauthorized', message: fail.error };
        } else if (fail.code === 'conflict') {
          conflict = { remoteUpdatedAt: fail.updatedAt ?? null };
          outcome = { status: 'conflict', message: CONFLICT_MESSAGE, remoteUpdatedAt: conflict.remoteUpdatedAt };
        } else if (fail.code === 'client' || tries >= backoff.length) {
          outcome = { status: 'error', message: fail.error, code: fail.code };
        }
      }
      if (outcome) {
        deps.onOutcome(outcome, json, data);
        return outcome;
      }
      await sleep(backoff[tries++]); // network / server: retry with back-off
    }
  };

  const request = (reason: 'auto' | 'manual'): Promise<SaveOutcome> => {
    if (conflict) {
      // Paused until the user resolves it. Do NOT hit the server and do NOT advance the base.
      void reason;
      return Promise.resolve<SaveOutcome>({ status: 'conflict', message: CONFLICT_MESSAGE, remoteUpdatedAt: conflict.remoteUpdatedAt });
    }
    if (inFlight) {
      rerun = true; // pick up whatever changed meanwhile, with the latest data
      return inFlight;
    }
    const p = (async () => {
      try {
        let out: SaveOutcome;
        do {
          rerun = false;
          out = await attempt();
        } while (rerun && out.status === 'saved');
        return out;
      } finally {
        inFlight = null;
      }
    })();
    inFlight = p;
    return p;
  };

  return {
    request,
    hasConflict: () => conflict !== null,
    /** "Keep my version": adopt the server's current version as base, then save explicitly. */
    keepMine: (): Promise<SaveOutcome> => {
      if (conflict) {
        deps.setBase(conflict.remoteUpdatedAt);
        conflict = null;
      }
      return request('manual');
    },
    /** Call after the cloud version has been adopted locally ("take cloud"). */
    clearConflict: () => { conflict = null; },
  };
};
