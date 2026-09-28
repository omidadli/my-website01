/* Shared helpers for the CMS API (Cloudflare Pages Functions).
 * Security model:
 *  - Admin credentials live ONLY in Cloudflare secrets (ADMIN_USERNAME / ADMIN_PASSWORD) — never in the repo.
 *  - Sessions are stateless HMAC-SHA256 signed tokens (AUTH_SECRET) with expiry.
 *  - Login is rate-limited per IP via the D1 `login_attempts` table.
 *  - Mutating endpoints require `Authorization: Bearer <token>`.
 */

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;
  GEMINI_API_KEY?: string;
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
];

let coreTablesReady: Promise<void> | null = null;

export const ensureCoreTables = (env: Env): Promise<void> => {
  if (!coreTablesReady) {
    coreTablesReady = (async () => {
      await env.DB.batch(CORE_TABLE_STATEMENTS.map((sql) => env.DB.prepare(sql)));
      // Migration 0002 for databases created before `comments.created_at` existed (no-op otherwise).
      try {
        await env.DB.prepare(`ALTER TABLE comments ADD COLUMN created_at TEXT DEFAULT ''`).run();
      } catch {
        /* column already exists */
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
