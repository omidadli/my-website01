import {
  Env,
  requireAuth,
  json,
  getClientIp,
  ensureCoreTablesSafe,
  loadSectionKeys,
  saveSectionKeys,
  loadKeyStates,
  saveKeyStates,
  resetKeyStates,
  loadAllSectionStatus,
  listKeyEvents,
  runSectionAi,
  derivedSessionId,
} from './_shared';
import {
  getTool,
  buildToolSystemPrompt,
  resolveBehavior,
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
} from '../../lib/tools';
import {
  KEYS_PER_SECTION,
  mergeSectionKeys,
  publicKeyInfo,
  emptyKeyState,
  applyAttemptToState,
  classifyAiError,
  isAiSectionId,
  AI_SECTIONS,
  type ChatTurn,
} from '../../lib/aiKeys';
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
];

// Columns added after the tables first shipped. ALTER fails when the column already
// exists, so each runs on its own (outside the batch) and the error is ignored.
const TOOL_TABLE_MIGRATIONS = [
  `ALTER TABLE tool_access ADD COLUMN message_quota INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tool_messages ADD COLUMN ip TEXT DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_tool_messages_ip_time ON tool_messages (ip, created_at)`,
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

/** Resolve the requested section: any product id, or 'site-assistant' / 'seo-slug'. */
const sectionIdOf = (body: any): string => {
  const raw = String(body?.sectionId || body?.productId || '').trim();
  if (raw && isAiSectionId(raw)) return raw;
  if (raw && getTool(raw)) return raw;
  return '';
};

/** 1-based slot index coming from the admin UI (0-based arrays on the client). */
const clampSlot = (raw: unknown): number => {
  const n = parseInt(String(raw ?? '0'), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(KEYS_PER_SECTION, (n >= 1 ? n : n + 1)));
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

  // GET /api/tools?view=settings → status of every AI section: 5 key slots each,
  // masked keys, live health (healthy / rate-limited + cooldown) and stats.
  const view = url.searchParams.get('view');
  if (view === 'settings' || view === 'keys') {
    const envKey = (env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '').trim();
    const sections = await loadAllSectionStatus(env);
    // Legacy shape (one row per product) so older clients keep working.
    const items = sections
      .filter((s) => s.kind === 'product')
      .map((s) => ({
        productId: s.sectionId,
        name: s.name,
        provider: s.keys[0]?.provider || 'gemini',
        baseUrl: s.keys[0]?.baseUrl || '',
        model: s.keys[0]?.model || '',
        hasKey: s.configuredCount > 0,
        keyMask: s.keys.find((k) => k.hasKey)?.keyMask || '',
        usingEnvFallback: s.configuredCount === 0 && !!envKey,
        keys: s.keys.map((k) => ({
          id: k.id,
          label: k.label,
          provider: k.provider,
          baseUrl: k.baseUrl,
          model: k.model,
          hasKey: k.hasKey,
          keyMask: k.keyMask,
          enabled: k.enabled,
        })),
      }));
    return json({
      ok: true,
      sections,
      items,
      envKeyPresent: !!envKey,
      keysPerSection: KEYS_PER_SECTION,
      sectionsMeta: AI_SECTIONS,
    });
  }

  // GET /api/tools?view=keyEvents → audit trail of limit hits / key hand-offs.
  if (view === 'keyEvents') {
    const items = await listKeyEvents(env, parseInt(url.searchParams.get('limit') || '60', 10));
    return json({ ok: true, items });
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
  if (
    action === 'grant' || action === 'revoke' || action === 'resetDevices' ||
    action === 'setKey' || action === 'setProductKeys' || action === 'setSectionKeys' ||
    action === 'testKey' || action === 'testAllKeys' || action === 'resetKeyState' || action === 'clearKey'
  ) {
    const user = await requireAuth(request, env);
    if (!user) return json({ ok: false, error: 'فقط ادمین.' }, { status: 401 });

    if (action === 'testKey') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const existingKeys = await loadSectionKeys(env, sectionId);
      const slot = clampSlot(body.keyIndex);
      const currentKey = existingKeys[slot - 1] || existingKeys[0];
      const provider = body.provider === 'openai' ? 'openai' : (body.provider === 'gemini' ? 'gemini' : (currentKey?.provider || 'gemini'));
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : currentKey?.baseUrl;
      const model = typeof body.model === 'string' ? body.model.trim() : currentKey?.model;
      const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) ? body.apiKey.trim() : (currentKey?.apiKey || '');

      if (!apiKey) return json({ ok: false, error: 'کلید API برای این اسلات تنظیم نشده است.' }, { status: 400 });
      const result = await testSingleKey({ provider, apiKey, baseUrl, model });
      return json(result);
    }

    // تستِ زندهٔ همه‌ی ۵ اسلات یک بخش (پنل ادمین → «تست همه»)
    if (action === 'testAllKeys') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const keys = await loadSectionKeys(env, sectionId);
      const states = await loadKeyStates(env, sectionId);
      const results: any[] = [];
      for (const k of keys) {
        if (!(k.apiKey || '').trim()) {
          results.push({ id: k.id, slot: k.slot, label: k.label, hasKey: false, ok: false, error: 'کلید ثبت نشده است.' });
          continue;
        }
        const r = await testSingleKey({ provider: k.provider, apiKey: k.apiKey, baseUrl: k.baseUrl, model: k.model });
        const prev = states[k.id] || emptyKeyState(k.id);
        const now = Date.now();
        states[k.id] = r.ok
          ? { ...prev, keyId: k.id, status: 'healthy', cooldownUntil: 0, lastError: '', lastStatusCode: 200, lastUsedAt: now, lastLatencyMs: r.latencyMs, successCount: prev.successCount + 1 }
          : applyAttemptToState(prev, k.id, { ok: false, code: classifyAiError({ message: r.error }), status: 0, latencyMs: r.latencyMs, error: r.error }, now);
        results.push({ id: k.id, slot: k.slot, label: k.label, hasKey: true, provider: k.provider, model: r.model || k.model, ok: r.ok, latencyMs: r.latencyMs, reply: r.reply, error: r.error });
      }
      await saveKeyStates(env, sectionId, Object.values(states));
      return json({ ok: true, sectionId, results, passed: results.filter((r) => r.ok).length, total: results.length });
    }

    // صفر کردن وضعیت/کول‌داون کلیدها (یک اسلات یا کل بخش)
    if (action === 'resetKeyState') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const slot = body.keyIndex === undefined || body.keyIndex === null || body.keyIndex === '' ? 0 : clampSlot(body.keyIndex);
      await resetKeyStates(env, sectionId, slot ? `key-${slot}` : undefined);
      return json({ ok: true });
    }

    // ذخیرهٔ هر ۵ اسلاتِ یک بخش (محصول یا بخش‌های سایت)
    if (action === 'setProductKeys' || action === 'setSectionKeys') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const incomingKeys: any[] = Array.isArray(body.keys) ? body.keys : [];
      const existingKeys = await loadSectionKeys(env, sectionId);
      const nextKeys = mergeSectionKeys(sectionId, incomingKeys, existingKeys);
      await saveSectionKeys(env, sectionId, nextKeys);
      return json({ ok: true, sectionId, keys: nextKeys.map(publicKeyInfo) });
    }

    if (action === 'setKey') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const slot = clampSlot(body.keyIndex);
      const existingKeys = await loadSectionKeys(env, sectionId);
      const patch = [{ id: `key-${slot}`, provider: body.provider, baseUrl: body.baseUrl, model: body.model, apiKey: body.apiKey, label: body.label, enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined }];
      const nextKeys = mergeSectionKeys(sectionId, patch, existingKeys);
      await saveSectionKeys(env, sectionId, nextKeys);
      const saved = nextKeys[slot - 1];
      return json({ ok: true, hasKey: !!saved.apiKey, keyMask: maskKey(saved.apiKey || ''), slot });
    }

    if (action === 'clearKey') {
      const sectionId = sectionIdOf(body);
      if (!sectionId) return json({ ok: false, error: 'بخش نامعتبر است.' }, { status: 400 });
      const hasSlot = body.keyIndex !== undefined && body.keyIndex !== null && body.keyIndex !== '';
      const existingKeys = await loadSectionKeys(env, sectionId);
      if (hasSlot) {
        const slot = clampSlot(body.keyIndex);
        const nextKeys = mergeSectionKeys(sectionId, [{ id: `key-${slot}`, clearKey: true }], existingKeys);
        await saveSectionKeys(env, sectionId, nextKeys);
        return json({ ok: true, slot });
      }
      // بدون شماره اسلات = پاک کردن همه‌ی کلیدهای این بخش (سازگار با نسخه‌ی قبل)
      const cleared = mergeSectionKeys(sectionId, existingKeys.map((k) => ({ id: k.id, clearKey: true })), existingKeys);
      await saveSectionKeys(env, sectionId, cleared);
      await resetKeyStates(env, sectionId);
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
    const history: ChatTurn[] = messages
      .slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'model')
      .map((m) => ({ role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model', content: String(m.content || '') }));

    // The conversation id: sent by the client (localStorage) so the AI can
    // review the previous chats; otherwise derived from phone/device/ip.
    const sessionId = String(body?.sessionId || '').trim().slice(0, 120) ||
      derivedSessionId(productId, paid && payload ? `phone:${payload.phone}` : `device:${deviceId || ip}`);

    // 5 configured keys → sticky key first → next healthy key on limit/error.
    // Memory + history are reviewed before answering, so a key switch never
    // breaks the flow of the conversation (see lib/aiKeys.ts → continuity).
    const aiResult = await runSectionAi(env, {
      sectionId: productId,
      systemPrompt,
      history,
      question,
      temperature: behavior.temperature,
      sessionId,
      preferredModel: behavior.model,
      maxOutputTokens: 900,
      // zero-cost deterministic answer (also stored in the chat memory) when
      // no key could reply — the flow is always demonstrable
      fallback: () => localToolAnswer(tool, question),
    });

    const answer = aiResult.text || localToolAnswer(tool, question);
    const mode: 'ai' | 'local' = aiResult.usedFallback || !aiResult.text ? 'local' : 'ai';

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

    return json({
      ok: true,
      answer,
      mode,
      trial: trialInfo,
      coins: coinInfo,
      quota: quotaInfo,
      // monitoring only: which of the 5 keys answered (no secrets)
      key: {
        slot: aiResult.usedSlot,
        label: aiResult.usedKeyLabel,
        provider: aiResult.usedProvider,
        switched: aiResult.switched,
        recalled: aiResult.recalledCount,
        attempts: aiResult.attempts.length,
      },
    });
  }

  return json({ ok: false, error: 'اکشن نامعتبر است.' }, { status: 400 });
};
