/**
 * Pure helpers for the admin → server content sync (no React, no DOM — unit-tested in
 * scripts/cloud-sync.test.ts). The stateful part lives in ContentContext.
 */

/* ------------------------------------------------------------------ */
/* Save status shown in the admin UI                                   */
/* ------------------------------------------------------------------ */

/**
 * - `idle`    nothing pending, nothing saved yet in this session
 * - `saving`  a PUT /api/content is in flight
 * - `saved`   the server confirmed the latest edit (`at` = when)
 * - `error`   the server rejected / could not be reached; `message` says why. Edits are kept
 *             in the tab and retried (transient errors) — they are NOT live on the site yet.
 * - `offline` this tab never reached the content API: every edit stays in this browser only.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export interface SaveState {
  status: SaveStatus;
  /** Human-readable (Persian) reason for `error` / `offline`. */
  message?: string;
  /** Epoch ms of the last confirmed save. */
  at?: number;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** The content changed elsewhere; the latest version was reloaded and this edit was dropped. */
  conflict?: boolean;
  /** The admin session is no longer valid. */
  unauthorized?: boolean;
}

/** Which backend answered the boot probe. `dev` = the local Vite emulator, NOT the live site. */
export type Backend = 'cloudflare' | 'dev' | 'none';

/* ------------------------------------------------------------------ */
/* Payload shaping                                                     */
/* ------------------------------------------------------------------ */

/**
 * What the server stores. Restore-point bodies (`VERSION_HISTORY[].data`) are full copies of
 * the whole site (~1 MB each with the article batches) and stay in the admin's browser:
 * pushing them made the body cross the API's 1.9 MB limit after a single "create snapshot"
 * click — every later save was then answered 413 and nothing reached the site.
 */
export const toCloudPayload = <T extends Record<string, any>>(state: T): T => ({ ...state, VERSION_HISTORY: [] });

/**
 * A restore point holds the editable content only. The previous implementation copied the whole
 * state including `VERSION_HISTORY`, so each snapshot embedded every earlier snapshot and the
 * state doubled in size with every click.
 */
export const leanSnapshotData = <T extends Record<string, any>>(state: T): Omit<T, 'VERSION_HISTORY' | 'AUDIT_LOGS' | 'BLOG_COMMENTS'> => {
  const { VERSION_HISTORY: _history, AUDIT_LOGS: _logs, BLOG_COMMENTS: _comments, ...rest } = state;
  return rest;
};

/**
 * Newest-first list, capped by count AND by serialized size so restore points cannot bloat
 * memory / localStorage. The newest entry is always kept.
 */
export const trimSnapshotHistory = <T>(history: readonly T[], maxCount: number, budgetChars: number): T[] => {
  const kept: T[] = [];
  let used = 0;
  for (const snap of history.slice(0, maxCount)) {
    const size = JSON.stringify(snap).length;
    if (kept.length > 0 && used + size > budgetChars) break;
    kept.push(snap);
    used += size;
  }
  return kept;
};

/**
 * Sanitize a restore-point list read from localStorage. Browsers of admins who clicked
 * "create snapshot" with the previous build hold snapshots that embed every earlier snapshot
 * (several MB); strip that nesting and apply the size cap once at boot.
 */
export const normalizeSnapshotHistory = <T extends { data?: unknown }>(
  history: readonly T[] | null | undefined,
  maxCount: number,
  budgetChars: number,
): T[] => {
  if (!Array.isArray(history)) return [];
  const lean = history.map((snap) =>
    snap && snap.data && typeof snap.data === 'object'
      ? { ...snap, data: leanSnapshotData(snap.data as Record<string, any>) }
      : snap,
  );
  return trimSnapshotHistory(lean, maxCount, budgetChars);
};

/* ------------------------------------------------------------------ */
/* Retry policy                                                        */
/* ------------------------------------------------------------------ */

const RETRY_DELAYS_MS = [4_000, 10_000, 30_000, 60_000];

/** Delay before automatic retry number `attempt` (0-based) of a transient save failure. */
export const retryDelayMs = (attempt: number): number =>
  RETRY_DELAYS_MS[Math.min(Math.max(0, attempt), RETRY_DELAYS_MS.length - 1)];

/* ------------------------------------------------------------------ */
/* Login seeding                                                       */
/* ------------------------------------------------------------------ */

/** Outcome of pulling the latest content right after a login. */
export type AdoptOutcome = 'adopted' | 'empty' | 'error';

/**
 * Only an *explicitly empty* server (`{ ok: true, data: null }`) may be seeded from this tab's
 * state. A failed read (`null`) must never be treated as "empty": this tab would then overwrite
 * the live content with a possibly stale copy that has drafts and private sections stripped.
 */
export const classifyRemote = (remote: { data: unknown } | null | undefined): AdoptOutcome => {
  if (remote === null || remote === undefined) return 'error';
  return remote.data ? 'adopted' : 'empty';
};
