import { Env, requireAuth, json, getClientIp, ensureCoreTablesSafe } from './_shared';
import {
  TOOLS,
  getTool,
  buildToolSystemPrompt,
  resolveBehavior,
  callAiProvider,
  callAiProviderWithFailover,
  testSingleKey,
  localToolAnswer,
  normalizePhone,
  isValidIranMobile,
  genCode,
  normalizeCode,
  signAccessToken,
  verifyAccessToken,
  scopeCovers,
  maskKey,
  type AiSettings,
  type ToolApiKeyEntry,
} from '../../lib/tools';
import { getPlan, resolveFreeTrial, INITIAL_FREE_COINS, COINS_PER_MESSAGE, calculateRemainingCoins } from '../../lib/toolPlans';

/**
 * Paid AI TOOLS backend (محصولات هوشمند).
 *
 * POST /api/tools  { action, ... }
 *   - unlock  { phone, code, productId, deviceId }  → signed session token (public)
 *   - session { token, productId }                  → re-validate a stored token (public)
 *   - chat    { token, productId, messages }        → AI reply (public, gated + rate-limited)
 *   - grant   { phone, productId, days, maxDevices, note }  → create/refresh access (ADMIN)
 *   - revoke  { id }                                → revoke a grant (ADMIN)
 *   - resetDevices { id }                           → clear bound devices (ADMIN)
 * GET /api/tools  → list all grants (ADMIN)
 *
 * Security model (anti-sharing):
 *   Access is granted PER PHONE NUMBER by the admin, together with a secret
 *   access code. A grant is bound to at most `max_devices` devices — the first
 *   devices that unlock consume the slots; further devices are refused. Session
 *   tokens are HMAC-signed and short-lived, and every chat re-checks that the
 *   grant is still active, unexpired, and that the device is still authorized.
 */

const nowIso = () => new Date().toISOString();

interface GrantRow {
  id: string;
  phone: string;
  product_id: string;
  code: string;
  status: string;
  max_devices: number;
  message_quota: number;
  devices: string;
  note: string;
  created_at: string;
  expires_at: string;
}

/** Messages a phone has used against a product since a given ISO time. */
const usageSince = async (env: Env, phone: string, productId: string, sinceIso: string): Promise<number> => {
  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM tool_messages WHERE phone = ?1 AND product_id = ?2 AND created_at >= ?3`).bind(phone, productId, sinceIso).first<{ c: number }>();
    return row?.c || 0;
  } catch {
    return 0;
  }
};

const TOOL_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tool_access (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    product_id TEXT NOT NULL DEFAULT 'all',
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    max_devices INTEGER NOT NULL DEFAULT 1,
    message_quota INTEGER NOT NULL DEFAULT 0,
    devices TEXT NOT NULL DEFAULT '[]',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tool_access_phone ON tool_access (phone, product_id)`,
  // Device-based free-trial counters (gamification).
  `CREATE TABLE IF NOT EXISTS tool_trials (
    device_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (device_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tool_messages (
    id TEXT PRIMARY KEY,
    phone TEXT DEFAULT '',
    product_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ip TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tool_messages_phone_time ON tool_messages (phone, created_at)`,
  // Per-tool AI connection settings. API KEYS are stored ONLY here (admin-only,
  // never returned to the public) — never in the public content blob.
  `CREATE TABLE IF NOT EXISTS tool_settings (
    product_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'gemini',
    base_url TEXT DEFAULT '',
    model TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
];

// Columns added after the tables first shipped. ALTER fails when the column already
// exists, so each runs on its own (outside the batch) and the error is ignored.
const TOOL_TABLE_MIGRATIONS = [
  `ALTER TABLE tool_access ADD COLUMN message_quota INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tool_messages ADD COLUMN ip TEXT DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_tool_messages_ip_time ON tool_messages (ip, created_at)`,
  `ALTER TABLE tool_settings ADD COLUMN keys_json TEXT DEFAULT ''`,
];

let toolTablesReady: Promise<void> | null = null;

/**
 * Creates/migrates the paid-tools tables. Memoised per isolate so the DDL runs once,
 * not on every chat message; a failure resets the memo so the next request retries.
 * Also bootstraps the core tables (login_attempts is shared with the unlock guard).
 */
const ensureTables = (env: Env): Promise<void> => {
  if (!toolTablesReady) {
    toolTablesReady = (async () => {
      await ensureCoreTablesSafe(env);
      await env.DB.batch(TOOL_TABLE_STATEMENTS.map((sql) => env.DB.prepare(sql)));
      for (const sql of TOOL_TABLE_MIGRATIONS) {
        try { await env.DB.prepare(sql).run(); } catch { /* column/index already exists */ }
      }
    })().catch(() => {
      toolTablesReady = null; // non-fatal: the caller's own error handling applies
    });
  }
  return toolTablesReady;
};

interface SettingsRow {
  product_id: string;
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  updated_at: string;
  keys_json?: string;
}

/** Retrieve the 3 configured API keys for a product, with graceful fallback. */
const getProductKeys = async (env: Env, productId: string): Promise<ToolApiKeyEntry[]> => {
  let row: SettingsRow | null = null;
  try {
    row = await env.DB.prepare(`SELECT * FROM tool_settings WHERE product_id = ?1`).bind(productId).first<SettingsRow>();
  } catch { /* ignore */ }

  const defaults: ToolApiKeyEntry[] = [
    { id: 'key-1', label: 'کلید اصلی (Primary)', provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: '', apiKey: '', enabled: true },
    { id: 'key-2', label: 'کلید پشتیبان اول (Backup 1)', provider: 'gemini', model: 'gemini-flash-latest', baseUrl: '', apiKey: '', enabled: true },
    { id: 'key-3', label: 'کلید پشتیبان دوم (Backup 2)', provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', apiKey: '', enabled: true },
  ];

  if (row?.keys_json) {
    try {
      const parsed = JSON.parse(row.keys_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const res: ToolApiKeyEntry[] = [];
        for (let i = 0; i < 3; i++) {
          const item = parsed.find((k: any) => k.id === `key-${i + 1}`) || parsed[i];
          res.push({
            id: `key-${i + 1}`,
            label: item?.label || defaults[i].label,
            provider: item?.provider === 'openai' ? 'openai' : 'gemini',
            baseUrl: String(item?.baseUrl || defaults[i].baseUrl || '').trim(),
            model: String(item?.model || defaults[i].model || '').trim(),
            apiKey: String(item?.apiKey || '').trim(),
            enabled: item?.enabled !== false,
          });
        }
        return res;
      }
    } catch { /* parse failure — fallback to legacy columns */ }
  }

  if (row && (row.api_key || row.provider || row.model)) {
    return [
      {
        id: 'key-1',
        label: 'کلید اصلی (Primary)',
        provider: row.provider === 'openai' ? 'openai' : 'gemini',
        baseUrl: row.base_url || '',
        model: row.model || (row.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'),
        apiKey: row.api_key || '',
        enabled: true,
      },
      defaults[1],
      defaults[2],
    ];
  }
  return defaults;
};

/** Resolve the effective AI settings for a tool: per-tool row, else env fallback. */
const resolveSettings = async (env: Env, productId: string): Promise<AiSettings> => {
  let row: SettingsRow | null = null;
  try {
    row = await env.DB.prepare(`SELECT * FROM tool_settings WHERE product_id = ?1`).bind(productId).first<SettingsRow>();
  } catch { /* ignore */ }
  const envKey = (env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '').trim();
  if (row && (row.api_key || '').trim()) {
    return { provider: (row.provider as any) || 'gemini', baseUrl: row.base_url || '', model: row.model || '', apiKey: row.api_key };
  }
  // Fall back to the shared Gemini secret, but honour a per-tool model override.
  return { provider: 'gemini', baseUrl: '', model: row?.model || '', apiKey: envKey };
};

const parseDevices = (s: string): string[] => {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const publicTool = (id: string, data?: any) => {
  const t = getTool(id);
  if (!t) return null;
  const b = resolveBehavior(t, data);
  return { id: t.id, name: t.name, welcome: b.welcome, suggestions: b.suggestions, placeholder: b.placeholder };
};

const loadContent = async (env: Env): Promise<any> => {
  try {
    const row = await env.DB.prepare(`SELECT data FROM content WHERE id = 1`).first<{ data: string }>();
    return row ? JSON.parse(row.data) : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// GET — admin list of grants
// ---------------------------------------------------------------------------
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ ok: false, error: 'فقط ادمین.' }, { status: 401 });
  await ensureTables(env);

  // GET /api/tools?view=messages → recent tool usage log (monitoring).
  const url = new URL(request.url);
  if (url.searchParams.get('view') === 'messages') {
    try {
      const rows = await env.DB.prepare(`SELECT id, phone, product_id, question, answer, created_at FROM tool_messages ORDER BY created_at DESC LIMIT 200`).all();
      return json({ ok: true, items: rows.results || [] });
    } catch {
      return json({ ok: true, items: [] });
    }
  }

  // GET /api/tools?view=settings → per-tool AI connection status (key is MASKED, never raw).
  if (url.searchParams.get('view') === 'settings') {
    let rows: SettingsRow[] = [];
    try {
      const r = await env.DB.prepare(`SELECT * FROM tool_settings`).all<SettingsRow>();
      rows = r.results || [];
    } catch { /* ignore */ }
    const envKey = (env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '').trim();
    const items = await Promise.all(TOOLS.map(async (t) => {
      const row = rows.find((x) => x.product_id === t.id);
      const keys = await getProductKeys(env, t.id);
      const publicKeys = keys.map((k) => ({
        id: k.id,
        label: k.label || '',
        provider: k.provider,
        baseUrl: k.baseUrl || '',
        model: k.model || '',
        hasKey: !!(k.apiKey || '').trim(),
        keyMask: maskKey(k.apiKey || ''),
        enabled: k.enabled !== false,
      }));
      const hasAnyKey = publicKeys.some((k) => k.hasKey && k.enabled);
      return {
        productId: t.id,
        name: t.name,
        provider: keys[0]?.provider || 'gemini',
        baseUrl: keys[0]?.baseUrl || '',
        model: keys[0]?.model || '',
        hasKey: hasAnyKey,
        keyMask: publicKeys[0]?.keyMask || '',
        usingEnvFallback: !hasAnyKey && !!envKey,
        keys: publicKeys,
      };
    }));
    return json({ ok: true, items, envKeyPresent: !!envKey });
  }

  try {
    const rows = await env.DB.prepare(`SELECT * FROM tool_access ORDER BY created_at DESC LIMIT 500`).all<GrantRow>();
    const items = (rows.results || []).map((r) => ({
      id: r.id,
      phone: r.phone,
      productId: r.product_id,
      code: r.code,
      status: r.status,
      maxDevices: r.max_devices,
      messageQuota: r.message_quota || 0,
      devicesUsed: parseDevices(r.devices).length,
      note: r.note,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
    return json({ ok: true, items });
  } catch {
    return json({ ok: true, items: [] });
  }
};

// ---------------------------------------------------------------------------
// POST — dispatch by action
// ---------------------------------------------------------------------------
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureTables(env);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
  }
  const action = String(body?.action || '');
  const secret = env.AUTH_SECRET || '';

  // ---- ADMIN actions ----
  if (action === 'grant' || action === 'revoke' || action === 'resetDevices' || action === 'setKey' || action === 'setProductKeys' || action === 'testKey' || action === 'clearKey') {
    const user = await requireAuth(request, env);
    if (!user) return json({ ok: false, error: 'فقط ادمین.' }, { status: 401 });

    if (action === 'testKey') {
      const productId = String(body.productId || '');
      const keyIndex = parseInt(String(body.keyIndex ?? '0'), 10);
      const existingKeys = await getProductKeys(env, productId);
      const currentKey = existingKeys[keyIndex] || existingKeys[0];
      const provider = body.provider === 'openai' ? 'openai' : (body.provider === 'gemini' ? 'gemini' : (currentKey?.provider || 'gemini'));
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : currentKey?.baseUrl;
      const model = typeof body.model === 'string' ? body.model.trim() : currentKey?.model;
      const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) ? body.apiKey.trim() : (currentKey?.apiKey || '');

      if (!apiKey) {
        return json({ ok: false, error: 'کلید API برای این اسلات تنظیم نشده است.' }, { status: 400 });
      }
      const result = await testSingleKey({ provider, apiKey, baseUrl, model });
      return json(result);
    }

    if (action === 'setProductKeys') {
      const productId = String(body.productId || '');
      if (!getTool(productId)) return json({ ok: false, error: 'محصول نامعتبر است.' }, { status: 400 });
      const incomingKeys: any[] = Array.isArray(body.keys) ? body.keys : [];
      const existingKeys = await getProductKeys(env, productId);
      const nextKeys: ToolApiKeyEntry[] = [];
      for (let i = 0; i < 3; i++) {
        const inc: any = incomingKeys.find((k: any) => k.id === `key-${i + 1}`) || incomingKeys[i] || {};
        const ext: Partial<ToolApiKeyEntry> = existingKeys[i] || {};
        const newKey = typeof inc.apiKey === 'string' ? inc.apiKey.trim() : '';
        const apiKey = inc.clearKey ? '' : (newKey || ext.apiKey || '');
        nextKeys.push({
          id: `key-${i + 1}`,
          label: String(inc.label || ext.label || (i === 0 ? 'کلید اصلی (Primary)' : `کلید پشتیبان ${i}`)),
          provider: inc.provider === 'openai' ? 'openai' : 'gemini',
          baseUrl: String(inc.baseUrl ?? ext.baseUrl ?? '').trim().slice(0, 200),
          model: String(inc.model ?? ext.model ?? '').trim().slice(0, 80),
          apiKey,
          enabled: inc.enabled !== false,
        });
      }
      const keysJson = JSON.stringify(nextKeys);
      await env.DB.prepare(
        `INSERT INTO tool_settings (product_id, provider, base_url, model, api_key, updated_at, keys_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(product_id) DO UPDATE SET
           provider=?2, base_url=?3, model=?4, api_key=?5, updated_at=?6, keys_json=?7`
      ).bind(productId, nextKeys[0].provider, nextKeys[0].baseUrl, nextKeys[0].model, nextKeys[0].apiKey, nowIso(), keysJson).run();

      return json({
        ok: true,
        keys: nextKeys.map((k) => ({
          id: k.id,
          label: k.label || '',
          provider: k.provider,
          baseUrl: k.baseUrl || '',
          model: k.model || '',
          hasKey: !!k.apiKey,
          keyMask: maskKey(k.apiKey || ''),
          enabled: k.enabled,
        })),
      });
    }

    if (action === 'setKey') {
      const productId = String(body.productId || '');
      if (!getTool(productId)) return json({ ok: false, error: 'محصول نامعتبر است.' }, { status: 400 });
      const keyIndex = Math.max(0, Math.min(2, parseInt(String(body.keyIndex ?? '0'), 10)));
      const existingKeys = await getProductKeys(env, productId);
      const provider = body.provider === 'openai' ? 'openai' : 'gemini';
      const baseUrl = String(body.baseUrl || '').trim().slice(0, 200);
      const model = String(body.model || '').trim().slice(0, 80);
      const newKey = String(body.apiKey || '').trim();
      const target = existingKeys[keyIndex];
      const apiKey = newKey || target.apiKey || '';
      target.provider = provider;
      target.baseUrl = baseUrl;
      target.model = model;
      target.apiKey = apiKey;
      if (typeof body.enabled === 'boolean') target.enabled = body.enabled;
      if (body.label) target.label = String(body.label);

      const keysJson = JSON.stringify(existingKeys);
      await env.DB.prepare(
        `INSERT INTO tool_settings (product_id, provider, base_url, model, api_key, updated_at, keys_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(product_id) DO UPDATE SET
           provider=?2, base_url=?3, model=?4, api_key=?5, updated_at=?6, keys_json=?7`
      ).bind(productId, existingKeys[0].provider, existingKeys[0].baseUrl, existingKeys[0].model, existingKeys[0].apiKey, nowIso(), keysJson).run();

      return json({ ok: true, hasKey: !!apiKey, keyMask: maskKey(apiKey) });
    }

    if (action === 'clearKey') {
      const productId = String(body.productId || '');
      const keyIndex = body.keyIndex !== undefined ? parseInt(String(body.keyIndex), 10) : -1;
      if (keyIndex >= 0 && keyIndex < 3) {
        const existingKeys = await getProductKeys(env, productId);
        existingKeys[keyIndex].apiKey = '';
        const keysJson = JSON.stringify(existingKeys);
        await env.DB.prepare(
          `INSERT INTO tool_settings (product_id, provider, base_url, model, api_key, updated_at, keys_json)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(product_id) DO UPDATE SET
             provider=?2, base_url=?3, model=?4, api_key=?5, updated_at=?6, keys_json=?7`
        ).bind(productId, existingKeys[0].provider, existingKeys[0].baseUrl, existingKeys[0].model, existingKeys[0].apiKey, nowIso(), keysJson).run();
        return json({ ok: true });
      }
      await env.DB.prepare(`DELETE FROM tool_settings WHERE product_id = ?1`).bind(productId).run();
      return json({ ok: true });
    }

    if (action === 'grant') {
      const phone = normalizePhone(String(body.phone || ''));
      if (!isValidIranMobile(phone)) return json({ ok: false, error: 'شماره موبایل معتبر نیست (مثال: 09xxxxxxxxx).' }, { status: 400 });
      const productId = String(body.productId || 'all');
      if (productId !== 'all' && !getTool(productId)) return json({ ok: false, error: 'محصول نامعتبر است.' }, { status: 400 });
      // A plan (basic|pro|vip) prefills duration/quota/devices; explicit fields override it.
      const plan = productId !== 'all' ? getPlan(productId, String(body.planId || '')) : undefined;
      const days = Math.max(1, Math.min(3650, parseInt(String(body.days ?? plan?.durationDays ?? 30), 10) || 30));
      const maxDevices = Math.max(1, Math.min(20, parseInt(String(body.maxDevices ?? plan?.maxDevices ?? 1), 10) || 1));
      const messageQuota = Math.max(0, parseInt(String(body.messageQuota ?? plan?.messageQuota ?? 0), 10) || 0);
      const note = String(body.note || '').slice(0, 200);
      const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();

      // One active grant per (phone, product). If it exists, refresh it (keep code unless asked).
      const existing = await env.DB.prepare(`SELECT * FROM tool_access WHERE phone = ?1 AND product_id = ?2`).bind(phone, productId).first<GrantRow>();
      const code = existing && !body.newCode ? existing.code : genCode();
      if (existing) {
        await env.DB.prepare(
          `UPDATE tool_access SET code = ?1, status = 'active', max_devices = ?2, message_quota = ?3, note = ?4, expires_at = ?5, created_at = ?6, devices = CASE WHEN ?7 = 1 THEN '[]' ELSE devices END WHERE id = ?8`
        ).bind(code, maxDevices, messageQuota, note, expiresAt, nowIso(), body.newCode ? 1 : 0, existing.id).run();
        return json({ ok: true, id: existing.id, phone, productId, code, maxDevices, messageQuota, expiresAt, refreshed: true });
      }
      const id = `ta-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      await env.DB.prepare(
        `INSERT INTO tool_access (id, phone, product_id, code, status, max_devices, message_quota, devices, note, created_at, expires_at) VALUES (?1,?2,?3,?4,'active',?5,?6,'[]',?7,?8,?9)`
      ).bind(id, phone, productId, code, maxDevices, messageQuota, note, nowIso(), expiresAt).run();
      return json({ ok: true, id, phone, productId, code, maxDevices, messageQuota, expiresAt });
    }

    if (action === 'revoke') {
      const id = String(body.id || '');
      await env.DB.prepare(`UPDATE tool_access SET status = 'revoked' WHERE id = ?1`).bind(id).run();
      return json({ ok: true });
    }

    if (action === 'resetDevices') {
      const id = String(body.id || '');
      await env.DB.prepare(`UPDATE tool_access SET devices = '[]' WHERE id = ?1`).bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- PUBLIC: unlock ----
  if (action === 'unlock') {
    if (!secret) return json({ ok: false, error: 'سرویس دسترسی هنوز پیکربندی نشده است.' }, { status: 503 });
    const phone = normalizePhone(String(body.phone || ''));
    const code = normalizeCode(String(body.code || ''));
    const productId = String(body.productId || '');
    const deviceId = String(body.deviceId || '').slice(0, 80);
    if (!isValidIranMobile(phone)) return json({ ok: false, error: 'شماره موبایل معتبر نیست.' }, { status: 400 });
    if (!code) return json({ ok: false, error: 'کد دسترسی را وارد کنید.' }, { status: 400 });
    if (!deviceId) return json({ ok: false, error: 'شناسه دستگاه نامعتبر است.' }, { status: 400 });
    if (!getTool(productId)) return json({ ok: false, error: 'محصول نامعتبر است.' }, { status: 400 });

    // Brute-force guard: access codes are short, so cap failed unlocks.
    // Two counters (re-using the login_attempts table with namespaced keys):
    //  - per IP+phone (tight): stops guessing the code of one customer;
    //  - per IP (loose): stops spraying many phone/code pairs from one address, while
    //    staying tolerant of carrier-grade NAT where many real users share one IP.
    const ip = getClientIp(request);
    const UNLOCK_WINDOW_MIN = 15;
    const guards: Array<{ key: string; max: number }> = [
      { key: `unlock:${ip}:${phone}`, max: 10 },
      { key: `unlock:${ip}`, max: 60 },
    ];
    try {
      const since = new Date(Date.now() - UNLOCK_WINDOW_MIN * 60_000).toISOString();
      const rows = await env.DB.prepare(`SELECT ip AS key, COUNT(*) AS c FROM login_attempts WHERE ip IN (?1, ?2) AND success = 0 AND attempted_at > ?3 GROUP BY ip`)
        .bind(guards[0].key, guards[1].key, since).all<{ key: string; c: number }>();
      const counts = new Map((rows.results || []).map((r) => [r.key, Number(r.c) || 0]));
      if (guards.some((g) => (counts.get(g.key) || 0) >= g.max)) {
        return json({ ok: false, error: `تلاش‌های ناموفق زیاد بود. ${UNLOCK_WINDOW_MIN} دقیقه دیگر دوباره امتحان کن.` }, { status: 429 });
      }
    } catch { /* table missing — fail open */ }
    const recordUnlock = async (success: boolean) => {
      try {
        if (success) {
          // A correct code clears the per-phone failure history (typos before success are forgiven).
          await env.DB.prepare(`DELETE FROM login_attempts WHERE ip = ?1`).bind(guards[0].key).run();
        } else {
          const at = nowIso();
          await env.DB.batch(guards.map((g) => env.DB.prepare(`INSERT INTO login_attempts (ip, attempted_at, success) VALUES (?1, ?2, 0)`).bind(g.key, at)));
        }
      } catch { /* non-fatal */ }
    };

    // Match a grant covering this product for this phone+code.
    const rows = await env.DB.prepare(`SELECT * FROM tool_access WHERE phone = ?1 AND code = ?2 AND status = 'active'`).bind(phone, code).all<GrantRow>();
    const grant = (rows.results || []).find((r) => scopeCovers(r.product_id, productId));
    if (!grant) {
      await recordUnlock(false);
      return json({ ok: false, error: 'شماره یا کد دسترسی درست نیست. اگر خرید کرده‌ای، از پشتیبانی کمک بگیر.' }, { status: 403 });
    }
    await recordUnlock(true);
    if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: 'دسترسی شما منقضی شده است. برای تمدید پیام بده.' }, { status: 403 });
    }

    const devices = parseDevices(grant.devices);
    if (!devices.includes(deviceId)) {
      if (devices.length >= grant.max_devices) {
        return json({ ok: false, error: `این دسترسی روی حداکثر تعداد مجازِ دستگاه (${grant.max_devices}) فعال شده است. برای استفاده روی دستگاه جدید با پشتیبانی هماهنگ کن.` }, { status: 403 });
      }
      devices.push(deviceId);
      await env.DB.prepare(`UPDATE tool_access SET devices = ?1 WHERE id = ?2`).bind(JSON.stringify(devices), grant.id).run();
    }

    const exp = grant.expires_at ? Math.min(new Date(grant.expires_at).getTime(), Date.now() + 30 * 86400_000) : Date.now() + 30 * 86400_000;
    const token = await signAccessToken({ phone, scope: grant.product_id, did: deviceId, gid: grant.id, exp }, secret);
    const data = await loadContent(env);
    return json({ ok: true, token, expiresAt: new Date(exp).toISOString(), tool: publicTool(productId, data) });
  }

  // ---- PUBLIC: session re-validate ----
  if (action === 'session') {
    if (!secret) return json({ ok: false, error: 'سرویس در دسترس نیست.' }, { status: 503 });
    const productId = String(body.productId || '');
    const deviceId = String(body.deviceId || '');
    const payload = await verifyAccessToken(String(body.token || ''), secret);
    if (!payload || !scopeCovers(payload.scope, productId) || (deviceId && payload.did !== deviceId)) {
      return json({ ok: false, error: 'نشست نامعتبر است.' }, { status: 401 });
    }
    const grant = await env.DB.prepare(`SELECT * FROM tool_access WHERE id = ?1`).bind(payload.gid).first<GrantRow>();
    if (!grant || grant.status !== 'active' || !parseDevices(grant.devices).includes(payload.did)) {
      return json({ ok: false, error: 'دسترسی لغو شده است.' }, { status: 403 });
    }
    const data = await loadContent(env);
    return json({ ok: true, tool: publicTool(productId, data) });
  }

  // ---- PUBLIC: chat (paid via token, or free-trial via device) ----
  if (action === 'chat') {
    if (!secret) return json({ ok: false, error: 'سرویس در دسترس نیست.' }, { status: 503 });
    const productId = String(body.productId || '');
    const deviceId = String(body.deviceId || '').slice(0, 80);
    const tool = getTool(productId);
    if (!tool) return json({ ok: false, error: 'محصول نامعتبر است.' }, { status: 400 });

    const messages: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
    const question = String(messages[messages.length - 1]?.content || '').trim().slice(0, 2000);
    if (!question) return json({ ok: false, error: 'پیام خالی است.' }, { status: 400 });

    const data = await loadContent(env);
    const payload = await verifyAccessToken(String(body.token || ''), secret);
    const paid = !!(payload && scopeCovers(payload.scope, productId) && (!deviceId || payload.did === deviceId));

    // ---- Trial gate (no valid paid token) ----
    const ip = getClientIp(request);
    let trialInfo: { used: number; remaining: number; limit: number } | undefined;
    let coinInfo: { balance: number; cost: number; initial: number } | undefined;
    if (!paid) {
      if (!deviceId) {
        return json({ ok: false, error: 'برای استفاده از این ابزار، یکی از پلن‌ها را فعال کن.', code: 'locked' }, { status: 401 });
      }
      // Device ids are client-generated, so also cap free messages per IP per hour —
      // otherwise rotating the device id would mean unlimited free AI calls (real cost).
      try {
        const since = new Date(Date.now() - 3600_000).toISOString();
        const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM tool_messages WHERE ip = ?1 AND phone LIKE 'trial:%' AND created_at > ?2`).bind(ip, since).first<{ c: number }>();
        if ((row?.c || 0) >= 30) {
          return json({ ok: false, error: 'سقف پیام‌های رایگان این ساعت پر شد. برای ادامه‌ی بدون محدودیت، یکی از پلن‌ها را فعال کن.', code: 'trial_ended', trial: { used: 3, remaining: 0, limit: 3 }, coins: { balance: 0, cost: COINS_PER_MESSAGE, initial: INITIAL_FREE_COINS } }, { status: 429 });
        }
      } catch { /* column missing — continue */ }
      let used = 0;
      try {
        const row = await env.DB.prepare(`SELECT count FROM tool_trials WHERE device_id = ?1 AND product_id = ?2`).bind(deviceId, productId).first<{ count: number }>();
        used = row?.count || 0;
      } catch { /* table missing */ }

      const currentCoins = calculateRemainingCoins(used);
      if (currentCoins < COINS_PER_MESSAGE) {
        return json({
          ok: false,
          error: `سکه طلایی هدیه شما (${currentCoins} سکه) برای این پیام کافی نیست (هزینه هر تحلیل هوشمند: ${COINS_PER_MESSAGE} سکه). برای ادامه مشاوره و باز کردن تمام ظرفیت، پلن پیشنهادی را فعال کنید.`,
          code: 'trial_ended',
          trial: { used, remaining: 0, limit: 3 },
          coins: { balance: currentCoins, cost: COINS_PER_MESSAGE, initial: INITIAL_FREE_COINS },
        }, { status: 402 });
      }

      const nextCoins = Math.max(0, currentCoins - COINS_PER_MESSAGE);
      coinInfo = { balance: nextCoins, cost: COINS_PER_MESSAGE, initial: INITIAL_FREE_COINS };
      trialInfo = { used: used + 1, remaining: Math.floor(nextCoins / COINS_PER_MESSAGE), limit: Math.floor(INITIAL_FREE_COINS / COINS_PER_MESSAGE) };
    } else {
      // ---- Paid: validate grant + quota ----
      const grant = await env.DB.prepare(`SELECT * FROM tool_access WHERE id = ?1`).bind(payload!.gid).first<GrantRow>();
      if (!grant || grant.status !== 'active' || !parseDevices(grant.devices).includes(payload!.did)) {
        return json({ ok: false, error: 'دسترسی شما فعال نیست. با پشتیبانی هماهنگ کن.', code: 'locked' }, { status: 403 });
      }
      if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
        return json({ ok: false, error: 'دسترسی شما منقضی شده است.', code: 'expired' }, { status: 403 });
      }
      // Per-plan message quota (0 = unlimited), counted within the current plan window.
      if (grant.message_quota && grant.message_quota > 0) {
        const used = await usageSince(env, payload!.phone, productId, grant.created_at);
        if (used >= grant.message_quota) {
          return json({ ok: false, error: 'سهمیه‌ی پیام این پلن تمام شد. برای ادامه، پلن را ارتقا بده یا تمدید کن.', code: 'quota', quota: { limit: grant.message_quota, used, remaining: 0 } }, { status: 402 });
        }
      }
      // Rate limit: 60 messages/hour per phone.
      try {
        const since = new Date(Date.now() - 3600_000).toISOString();
        const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM tool_messages WHERE phone = ?1 AND created_at > ?2`).bind(payload!.phone, since).first<{ c: number }>();
        if ((row?.c || 0) >= 60) return json({ ok: false, error: 'تعداد پیام‌های این ساعت زیاد شد؛ کمی بعد ادامه بده.' }, { status: 429 });
      } catch { /* table missing */ }
    }

    const behavior = resolveBehavior(tool, data);
    const systemPrompt = buildToolSystemPrompt(tool, data);
    const productKeys = await getProductKeys(env, productId);
    const envKey = (env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '').trim();
    const history = messages.slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'model')
      .map((m) => ({ role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model', content: String(m.content || '') }));

    let answer = '';
    let mode: 'ai' | 'local' = 'local';
    const aiResult = await callAiProviderWithFailover({
      systemPrompt,
      history,
      question,
      temperature: behavior.temperature,
      keys: productKeys,
      preferredModel: behavior.model,
      envFallbackKey: envKey,
    });
    if (aiResult.text) { answer = aiResult.text; mode = 'ai'; }
    if (!answer) answer = localToolAnswer(tool, question);

    // Persist: trial counter + message log.
    if (!paid && deviceId) {
      try {
        await env.DB.prepare(
          `INSERT INTO tool_trials (device_id, product_id, count, updated_at) VALUES (?1,?2,1,?3)
           ON CONFLICT(device_id, product_id) DO UPDATE SET count = count + 1, updated_at = ?3`
        ).bind(deviceId, productId, nowIso()).run();
      } catch { /* non-fatal */ }
    }
    try {
      const id = `tm-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      const who = paid ? payload!.phone : `trial:${deviceId}`.slice(0, 60);
      try {
        await env.DB.prepare(`INSERT INTO tool_messages (id, phone, product_id, question, answer, created_at, ip) VALUES (?1,?2,?3,?4,?5,?6,?7)`)
          .bind(id, who, productId, question.slice(0, 2000), answer.slice(0, 6000), nowIso(), ip).run();
      } catch {
        // pre-migration table without the ip column
        await env.DB.prepare(`INSERT INTO tool_messages (id, phone, product_id, question, answer, created_at) VALUES (?1,?2,?3,?4,?5,?6)`)
          .bind(id, who, productId, question.slice(0, 2000), answer.slice(0, 6000), nowIso()).run();
      }
    } catch { /* non-fatal */ }

    // Quota info for the paid UI progress meter.
    let quotaInfo: { limit: number; used: number; remaining: number } | undefined;
    if (paid && payload) {
      const grant = await env.DB.prepare(`SELECT message_quota, created_at FROM tool_access WHERE id = ?1`).bind(payload.gid).first<{ message_quota: number; created_at: string }>();
      if (grant?.message_quota && grant.message_quota > 0) {
        const used = await usageSince(env, payload.phone, productId, grant.created_at);
        quotaInfo = { limit: grant.message_quota, used, remaining: Math.max(0, grant.message_quota - used) };
      }
    }

    return json({ ok: true, answer, mode, trial: trialInfo, coins: coinInfo, quota: quotaInfo });
  }

  return json({ ok: false, error: 'اکشن نامعتبر است.' }, { status: 400 });
};
