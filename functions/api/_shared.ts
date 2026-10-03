/* Shared helpers for the CMS API (Cloudflare Pages Functions).
 * Security model:
 *  - Admin credentials live ONLY in Cloudflare secrets (ADMIN_USERNAME / ADMIN_PASSWORD) — never in the repo.
 *  - Sessions are stateless HMAC-SHA256 signed tokens (AUTH_SECRET) with expiry.
 *  - Login is rate-limited per IP via the D1 `login_attempts` table.
 *  - Mutating endpoints require `Authorization: Bearer <token>`.
 */

import {
  AI_SECTIONS,
  KEYS_PER_SECTION,
  normalizeStoredKeys,
  buildSectionStatus,
  sanitizeTurns,
  type AiAttempt,
  type AiKeyEntry,
  type AiKeyState,
  type AiKeyHealth,
  type ChatTurn,
  type SectionStatus,
} from '../../lib/aiKeys';
import { runSectionAiWithStore, type AiKeyStore, type RunSectionAiArgs, type RunSectionAiResult } from '../../lib/aiSection';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;
  GEMINI_API_KEY?: string;
  /** optional extra env fallbacks (5 key slots per section live in the admin panel) */
  OPENAI_API_KEY?: string;
}

export interface Ctx {
  env: Env;
  request: Request;
}

const encoder = new TextEncoder();

export const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const b64urlDecode = (s: string): string => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
};

const getHmacKey = async (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const createToken = async (username: string, secret: string, ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<{ token: string; expiresAt: number }> => {
  const exp = Date.now() + ttlMs;
  const payload = b64url(encoder.encode(JSON.stringify({ sub: username, exp })));
  const key = await getHmacKey(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return { token: `${payload}.${sig}`, expiresAt: exp };
};

export const verifyToken = async (token: string | null, secret: string): Promise<string | null> => {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const key = await getHmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, Uint8Array.from(b64urlDecode(sig), (c) => c.charCodeAt(0)), encoder.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(b64urlDecode(payload));
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return String(data.sub || '');
  } catch {
    return null;
  }
};

export const getBearer = (request: Request): string | null => {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

export const requireAuth = async (request: Request, env: Env): Promise<string | null> => {
  if (!env.AUTH_SECRET) return null;
  return verifyToken(getBearer(request), env.AUTH_SECRET);
};

/** Constant-time-ish string comparison (compare HMAC digests to avoid leaking length/char timing). */
export const safeEqual = async (a: string, b: string, secret: string): Promise<boolean> => {
  const key = await getHmacKey(secret || 'fallback-compare-key');
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
  ]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
};

/* ---------------- User account helpers (public site auth) ---------------- */

const USER_SESSION_COOKIE = 'nd_session';
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const hashPassword = async (password: string, salt: string, secret: string): Promise<string> => {
  // PBKDF2-SHA256 with 120k iterations + site HMAC-secret peppering; output hex.
  const enc = new TextEncoder();
  const saltBuf = enc.encode(salt + ':' + secret);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const randomHex = (bytes = 32): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const normalizeLoginId = (raw: string): { id: string; type: 'email' | 'phone' } => {
  const v = String(raw || '').trim();
  // Looks like an Iran mobile (09xx… or +989xx…)
  const digits = v.replace(/[^\d+]/g, '');
  if (/^(\+98|0)?9\d{9}$/.test(digits)) {
    const normalized = digits.replace(/^\+98/, '0');
    return { id: normalized, type: 'phone' };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    return { id: v.toLowerCase(), type: 'email' };
  }
  return { id: v.toLowerCase(), type: /@/.test(v) ? 'email' : 'phone' };
};

export const newId = (): string => `${Date.now().toString(36)}-${randomHex(6)}`;

/** Read the session cookie and return the user row or null. Cleans up expired sessions best-effort. */
export const requireUser = async (request: Request, env: Env): Promise<Record<string, any> | null> => {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${USER_SESSION_COOKIE}=`));
  const token = match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
  if (!token) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.*, s.expires_at AS sess_expires FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?1`
    ).bind(token).first<Record<string, any>>();
    if (!row) return null;
    if (new Date(String(row.sess_expires)).getTime() < Date.now()) {
      await env.DB.prepare(`DELETE FROM user_sessions WHERE token = ?1`).bind(token).run().catch(() => {});
      return null;
    }
    return row;
  } catch {
    return null;
  }
};

export interface SessionCookieOptions {
  token: string;
  expiresAt: number;
  /** Omit to delete the cookie. */
  delete?: boolean;
}

export const sessionCookie = ({ token, expiresAt, delete: del }: SessionCookieOptions): string => {
  const name = USER_SESSION_COOKIE;
  const val = encodeURIComponent(token);
  const expires = new Date(del ? 0 : expiresAt).toUTCString();
  const maxAge = del ? 0 : Math.floor(USER_SESSION_TTL_MS / 1000);
  // SameSite=Lax so it works across top-level navigations; Secure auto-enabled on https in production.
  return `${name}=${val}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}; Max-Age=${maxAge}`;
};

export const publicUserShape = (row: Record<string, any>) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email || '',
  phone: row.phone || '',
  avatarUrl: row.avatar_url || '',
  bio: row.bio || '',
  joinedAt: row.created_at,
});

export { USER_SESSION_COOKIE, USER_SESSION_TTL_MS };

export const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(init.headers || {}),
    },
  });

export const unauthorized = (msg = 'احراز هویت ناموفق است.') => json({ ok: false, error: msg }, { status: 401 });

export const getClientIp = (request: Request): string =>
  request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

/**
 * Core D1 tables (mirror of schema.sql). Created lazily on first use so a brand-new
 * database works without a manual `wrangler d1 execute … --file=schema.sql` step.
 * Memoised per isolate: the CREATE statements run once, not on every request.
 * (The paid-tools tables are handled by tools.ts → ensureTables.)
 */
const CORE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    key TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    alt TEXT DEFAULT '',
    size_kb INTEGER DEFAULT 0,
    content_type TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip, attempted_at)`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    reply TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id)`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'contact',
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    website TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    service TEXT DEFAULT '',
    details TEXT NOT NULL,
    booking_date TEXT DEFAULT '',
    booking_time TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    ip TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_ip_time ON leads (ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_kb INTEGER DEFAULT 0,
    data_b64 TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    ip TEXT DEFAULT '',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    mode TEXT DEFAULT 'local',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_ip_time ON chat_messages (ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    login_id TEXT NOT NULL UNIQUE,
    login_type TEXT NOT NULL DEFAULT 'email',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    last_login_at TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_login ON users (login_id)`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ip TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS user_saved_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    notes TEXT DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    saved_at TEXT NOT NULL,
    read_at TEXT DEFAULT '',
    UNIQUE(user_id, post_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_user ON user_saved_articles (user_id, saved_at)`,
  `CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    plan_id TEXT NOT NULL DEFAULT '',
    plan_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    price TEXT DEFAULT '',
    features TEXT NOT NULL DEFAULT '[]',
    auto_renew INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subs_user ON user_subscriptions (user_id, start_date)`,
  `CREATE TABLE IF NOT EXISTS user_consultations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    service_id TEXT DEFAULT '',
    service_name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    admin_notes TEXT DEFAULT '',
    scheduled_date TEXT DEFAULT '',
    scheduled_time TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cons_user ON user_consultations (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    related_id TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_act_user_time ON user_activities (user_id, created_at)`,
  // ---- AI key management (5 slots per section) --------------------------------
  // Per-section API keys (site-assistant, seo-slug, and the 4 paid products).
  // Keys are admin-only and never returned in full (masked only).
  `CREATE TABLE IF NOT EXISTS ai_section_keys (
    section_id TEXT PRIMARY KEY,
    keys_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`,
  // Health of every slot: healthy / rate_limited / invalid / error + cooldown.
  `CREATE TABLE IF NOT EXISTS ai_key_state (
    section_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    cooldown_until TEXT DEFAULT '',
    last_error TEXT DEFAULT '',
    last_status INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT DEFAULT '',
    last_latency_ms INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    rate_limit_count INTEGER NOT NULL DEFAULT 0,
    rotation_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (section_id, key_id)
  )`,
  // Which key is currently answering a given conversation (sticky key).
  `CREATE TABLE IF NOT EXISTS ai_chat_session (
    session_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    sticky_key_id TEXT DEFAULT '',
    turns INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  // Server-side chat memory: lets the AI review earlier messages of the same
  // conversation (even after a key switch) and continue naturally.
  `CREATE TABLE IF NOT EXISTS ai_chat_memory (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_memory_session ON ai_chat_memory (session_id, created_at)`,
  // Audit trail of key attempts (limit hits, rotation, recovery) for the admin panel.
  `CREATE TABLE IF NOT EXISTS ai_key_events (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    code TEXT DEFAULT '',
    status INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_key_events_time ON ai_key_events (created_at)`,
  // Legacy per-tool settings table (kept for migration of pre-5-slot installs).
  `CREATE TABLE IF NOT EXISTS tool_settings (
    product_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'gemini',
    base_url TEXT DEFAULT '',
    model TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
];

// Columns added after a table first shipped (ALTER fails when it already exists).
const CORE_TABLE_MIGRATIONS = [
  `ALTER TABLE comments ADD COLUMN created_at TEXT DEFAULT ''`,
  `ALTER TABLE tool_settings ADD COLUMN keys_json TEXT DEFAULT ''`,
  `ALTER TABLE chat_messages ADD COLUMN key_slot INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE chat_messages ADD COLUMN session_id TEXT DEFAULT ''`,
];

let coreTablesReady: Promise<void> | null = null;

export const ensureCoreTables = (env: Env): Promise<void> => {
  if (!coreTablesReady) {
    coreTablesReady = (async () => {
      await env.DB.batch(CORE_TABLE_STATEMENTS.map((sql) => env.DB.prepare(sql)));
      for (const sql of CORE_TABLE_MIGRATIONS) {
        try {
          await env.DB.prepare(sql).run();
        } catch {
          /* column already exists */
        }
      }
    })().catch((e) => {
      coreTablesReady = null; // allow a retry on the next request
      throw e;
    });
  }
  return coreTablesReady;
};

/** Best-effort variant for hot paths: never throws, never blocks the response on failure. */
export const ensureCoreTablesSafe = async (env: Env): Promise<void> => {
  try {
    await ensureCoreTables(env);
  } catch {
    /* D1 unavailable — the caller's own error handling applies */
  }
};

// The whole CMS state is one D1 row and D1 caps a row/string at 2,000,000 bytes
// (https://developers.cloudflare.com/d1/platform/limits/). Reject earlier with a
// clear message instead of letting the INSERT fail with an opaque 500.
export const MAX_CONTENT_BYTES = 1_900_000;
export const CONTENT_TOO_LARGE_MESSAGE =
  'حجم محتوا بیش از حد مجاز (حدود ۱.۹ مگابایت) است. تصاویر را به‌جای درج مستقیم (base64) از «کتابخانهٔ رسانه» آپلود کنید و متن‌های خیلی بلند را کوتاه کنید.';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB per media file
export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'application/pdf'];

/* =========================================================================
 * AI key management — 5 slots per section, health, auto-rotation & memory.
 * Shared by the site assistant (chat.ts), the SEO slug generator (slug.ts) and
 * the 4 paid products (tools.ts). The pure logic lives in lib/aiKeys.ts; this
 * block is the D1 persistence + the high-level "run this section" helper.
 * ========================================================================= */

const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${randomHex(4)}`;

const toMs = (iso: string | null | undefined): number => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
};
const toIso = (ms: number): string => (ms > 0 ? new Date(ms).toISOString() : '');

/** Read the (up to) 5 keys of one section; migrates legacy per-tool settings on first read. */
export const loadSectionKeys = async (env: Env, sectionId: string): Promise<AiKeyEntry[]> => {
  let raw = '';
  try {
    const row = await env.DB.prepare(`SELECT keys_json FROM ai_section_keys WHERE section_id = ?1`).bind(sectionId).first<{ keys_json: string }>();
    raw = row?.keys_json || '';
  } catch {
    /* table missing — fall through to legacy */
  }
  if (raw) return normalizeStoredKeys(sectionId, raw);

  // Legacy installs kept one/four keys per PRODUCT in tool_settings.
  if (AI_SECTIONS.some((s) => s.id === sectionId && s.kind === 'product')) {
    try {
      const legacy = await env.DB.prepare(`SELECT * FROM tool_settings WHERE product_id = ?1`).bind(sectionId).first<any>();
      const legacyJson = legacy?.keys_json || '';
      const legacySingle = legacy && (legacy.api_key || legacy.provider || legacy.model)
        ? [{ id: 'key-1', label: 'کلید اصلی (Primary)', provider: legacy.provider, baseUrl: legacy.base_url, model: legacy.model, apiKey: legacy.api_key }]
        : [];
      const merged = normalizeStoredKeys(sectionId, legacyJson || legacySingle);
      if (legacyJson || legacySingle.length) await saveSectionKeys(env, sectionId, merged).catch(() => {});
      return merged;
    } catch {
      /* ignore */
    }
  }
  return normalizeStoredKeys(sectionId, []);
};

/** Store the 5 keys of a section (only apiKey lives here — never in the CMS blob). */
export const saveSectionKeys = async (env: Env, sectionId: string, keys: AiKeyEntry[]): Promise<void> => {
  const keysJson = JSON.stringify((keys || []).slice(0, KEYS_PER_SECTION));
  await env.DB.prepare(
    `INSERT INTO ai_section_keys (section_id, keys_json, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(section_id) DO UPDATE SET keys_json = excluded.keys_json, updated_at = excluded.updated_at`
  )
    .bind(sectionId, keysJson, new Date().toISOString())
    .run();
};

/** Health/cooldown of every slot of a section. */
export const loadKeyStates = async (env: Env, sectionId: string): Promise<Record<string, AiKeyState>> => {
  const out: Record<string, AiKeyState> = {};
  try {
    const rows = await env.DB.prepare(`SELECT * FROM ai_key_state WHERE section_id = ?1`).bind(sectionId).all<any>();
    for (const r of rows.results || []) {
      out[r.key_id] = {
        keyId: String(r.key_id),
        status: (r.status || 'unused') as AiKeyHealth,
        cooldownUntil: toMs(r.cooldown_until),
        lastError: String(r.last_error || ''),
        lastStatusCode: Number(r.last_status || 0),
        lastUsedAt: toMs(r.last_used_at),
        lastLatencyMs: Number(r.last_latency_ms || 0),
        successCount: Number(r.success_count || 0),
        failCount: Number(r.fail_count || 0),
        rateLimitCount: Number(r.rate_limit_count || 0),
        rotationCount: Number(r.rotation_count || 0),
      };
    }
  } catch {
    /* table missing — fresh state */
  }
  return out;
};

/** Persist key health (called after every attempt so the admin panel is always fresh). */
export const saveKeyStates = async (env: Env, sectionId: string, states: AiKeyState[]): Promise<void> => {
  const list = (states || []).slice(0, KEYS_PER_SECTION + 1);
  if (!list.length) return;
  const now = new Date().toISOString();
  const stmts = list.map((s) =>
    env.DB.prepare(
      `INSERT INTO ai_key_state (section_id, key_id, status, cooldown_until, last_error, last_status, last_used_at, last_latency_ms, success_count, fail_count, rate_limit_count, rotation_count, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
       ON CONFLICT(section_id, key_id) DO UPDATE SET
         status = excluded.status, cooldown_until = excluded.cooldown_until, last_error = excluded.last_error,
         last_status = excluded.last_status, last_used_at = excluded.last_used_at, last_latency_ms = excluded.last_latency_ms,
         success_count = excluded.success_count, fail_count = excluded.fail_count,
         rate_limit_count = excluded.rate_limit_count, rotation_count = excluded.rotation_count, updated_at = excluded.updated_at`
    ).bind(
      sectionId,
      s.keyId,
      s.status,
      toIso(s.cooldownUntil),
      String(s.lastError || '').slice(0, 400),
      s.lastStatusCode || 0,
      toIso(s.lastUsedAt),
      s.lastLatencyMs || 0,
      s.successCount || 0,
      s.failCount || 0,
      s.rateLimitCount || 0,
      s.rotationCount || 0,
      now
    )
  );
  await env.DB.batch(stmts);
};

/** Audit trail: failed attempts + key hand-offs (admin «رویدادهای کلیدها»). */
export const logKeyEvents = async (env: Env, sectionId: string, attempts: AiAttempt[]): Promise<void> => {
  const interesting = (attempts || []).filter((a) => !a.ok || a.handoff);
  if (!interesting.length) return;
  const now = new Date().toISOString();
  const stmts = interesting.map((a) =>
    env.DB.prepare(`INSERT INTO ai_key_events (id, section_id, key_id, code, status, message, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(
      makeId('ake'),
      sectionId,
      a.keyId,
      a.ok ? 'handoff' : a.code || 'unknown',
      a.status || 0,
      String(a.error || (a.handoff ? 'ادامه‌ی گفتگو روی کلید پشتیبان' : '')).slice(0, 300),
      now
    )
  );
  await env.DB.batch(stmts);
};

export const listKeyEvents = async (env: Env, limit = 60): Promise<any[]> => {
  try {
    const rows = await env.DB.prepare(`SELECT * FROM ai_key_events ORDER BY created_at DESC LIMIT ?1`).bind(Math.max(1, Math.min(200, limit))).all();
    return rows.results || [];
  } catch {
    return [];
  }
};

/** Append conversation turns to the server-side memory (+ remember the sticky key). */
export const rememberChatTurns = async (env: Env, args: { sessionId: string; sectionId: string; turns: ChatTurn[]; stickyKeyId?: string }): Promise<void> => {
  const sessionId = String(args.sessionId || '').slice(0, 120);
  if (!sessionId) return;
  const now = new Date().toISOString();
  const turns = sanitizeTurns(args.turns, 8);
  const stmts = turns.map((t) =>
    env.DB.prepare(`INSERT INTO ai_chat_memory (id, session_id, section_id, role, content, created_at) VALUES (?1,?2,?3,?4,?5,?6)`).bind(
      makeId('aim'),
      sessionId,
      args.sectionId,
      t.role,
      t.content.slice(0, 2000),
      now
    )
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO ai_chat_session (session_id, section_id, sticky_key_id, turns, updated_at) VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(session_id) DO UPDATE SET section_id = excluded.section_id, sticky_key_id = excluded.sticky_key_id, turns = ai_chat_session.turns + 1, updated_at = excluded.updated_at`
    ).bind(sessionId, args.sectionId, args.stickyKeyId || '', turns.length, now)
  );
  // keep the memory bounded (80 newest turns per conversation)
  stmts.push(
    env.DB.prepare(
      `DELETE FROM ai_chat_memory WHERE session_id = ?1 AND id NOT IN (
         SELECT id FROM ai_chat_memory WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 80
       )`
    ).bind(sessionId)
  );
  await env.DB.batch(stmts);
};

/** The earlier turns of this conversation (used as the AI's "memory" before answering). */
export const recallChatTurns = async (env: Env, args: { sessionId: string; limit?: number }): Promise<ChatTurn[]> => {
  const sessionId = String(args.sessionId || '').slice(0, 120);
  if (!sessionId) return [];
  const limit = Math.max(2, Math.min(80, args.limit || 40));
  try {
    const rows = await env.DB.prepare(`SELECT role, content FROM ai_chat_memory WHERE session_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2`)
      .bind(sessionId, limit)
      .all<{ role: string; content: string }>();
    return sanitizeTurns((rows.results || []).reverse().map((r) => ({ role: r.role, content: r.content })), limit);
  } catch {
    return [];
  }
};

/** Which key last answered this conversation (so we do not switch needlessly). */
export const sessionStickyKey = async (env: Env, sessionId: string): Promise<string> => {
  try {
    const row = await env.DB.prepare(`SELECT sticky_key_id FROM ai_chat_session WHERE session_id = ?1`).bind(sessionId).first<{ sticky_key_id: string }>();
    return String(row?.sticky_key_id || '');
  } catch {
    return '';
  }
};

/** Reset the health/cooldown of one key (or the whole section) — admin action. */
export const resetKeyStates = async (env: Env, sectionId: string, keyId?: string): Promise<void> => {
  if (keyId) {
    await env.DB.prepare(`DELETE FROM ai_key_state WHERE section_id = ?1 AND key_id = ?2`).bind(sectionId, keyId).run();
    return;
  }
  await env.DB.prepare(`DELETE FROM ai_key_state WHERE section_id = ?1`).bind(sectionId).run();
};

/** Status of every AI section (admin panel «کلیدهای API»). */
export const loadAllSectionStatus = async (env: Env): Promise<SectionStatus[]> => {
  const envKeyPresent = !!(env.GEMINI_API_KEY || '').trim();
  const items: SectionStatus[] = [];
  for (const section of AI_SECTIONS) {
    const [keys, states] = await Promise.all([loadSectionKeys(env, section.id), loadKeyStates(env, section.id)]);
    items.push(buildSectionStatus({ sectionId: section.id, keys, states, envKeyPresent }));
  }
  return items;
};

/** The D1-backed store used in production (Cloudflare Pages Functions). */
export const d1KeyStore = (env: Env): AiKeyStore => ({
  loadKeys: (sectionId) => loadSectionKeys(env, sectionId),
  loadStates: (sectionId) => loadKeyStates(env, sectionId),
  saveStates: (sectionId, states) => saveKeyStates(env, sectionId, states),
  saveKeys: (sectionId, keys) => saveSectionKeys(env, sectionId, keys),
  recall: (sessionId) => recallChatTurns(env, { sessionId }),
  stickyKey: (sessionId) => sessionStickyKey(env, sessionId),
  remember: (args) => rememberChatTurns(env, args),
  logEvents: (sectionId, attempts) => logKeyEvents(env, sectionId, attempts),
  envFallbackKey: (env.GEMINI_API_KEY || '').trim(),
});

/** Runs one AI section end-to-end (5-key rotation + conversation memory). */
export const runSectionAi = async (env: Env, args: RunSectionAiArgs): Promise<RunSectionAiResult> => {
  await ensureCoreTablesSafe(env);
  return runSectionAiWithStore(d1KeyStore(env), args);
};

export { derivedSessionId } from '../../lib/aiSection';
export type { RunSectionAiArgs, RunSectionAiResult } from '../../lib/aiSection';
