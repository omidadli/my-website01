/**
 * lib/aiKeys.ts — «مدیریت کلیدهای API» و چرخش خودکار (Auto-Rotation).
 *
 * این فایل مغزِ چند-کلیدیِ سایت است و SINGLE SOURCE OF TRUTH برای:
 *   - بخش‌های سایت که کلید API می‌خواهند (AI_SECTIONS): دستیار هوشمند سایت،
 *     تولید اسلاگ سئو و هر ۴ محصول هوشمند.
 *   - مدل ۵ اسلاتِ کلید برای هر بخش (KEYS_PER_SECTION = 5).
 *   - وضعیت/سلامت هر کلید (KeyRuntimeState): موفق، خطا، لیمیت‌خورده + کول‌داون.
 *   - انتخاب ترتیب کلیدها (planKeyOrder): اول کلیدِ همین گفتگو (Sticky)، بعد
 *     کلیدهای سالمِ بعدی؛ کلیدهای کول‌داون‌دار فقط وقتی همه لیمیت خورده باشند.
 *   - حافظهٔ گفتگو (Continuity): مرورِ چت‌های قبلی و ادامهٔ طبیعیِ همان گفتگو
 *     وقتی که پاسخ‌دهی روی کلید/سرویس دیگری می‌افتد.
 *   - اجرای واقعیِ درخواست روی Gemini / OpenAI-سازگار (callProviderKey).
 *
 * هیچ وابستگی‌ای به Node/D1/مرورگر ندارد تا هم در Cloudflare Workers، هم در
 * dev-server (vite-dev-api.ts) و هم در تست‌ها قابل استفاده باشد.
 */

// ---------------------------------------------------------------------------
// 1. انواع پایه
// ---------------------------------------------------------------------------

export type AiProvider = 'gemini' | 'openai';

/** یک اسلاتِ کلید API. `apiKey` فقط سمت سرور ذخیره/خوانده می‌شود و در پاسخ‌های عمومی ماسک می‌شود. */
export interface AiKeyEntry {
  /** 'key-1' … 'key-5' — شناسه‌ی ثابتِ اسلات (نه شماره‌ی ترتیب اجرا) */
  id: string;
  /** 1-based slot number */
  slot: number;
  label: string;
  provider: AiProvider;
  /** برای پروکسی‌های سازگار با OpenAI (OpenAI, OpenRouter, …) */
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

/** سلامت یک کلید برای نمایش در پنل ادمین. */
export type AiKeyHealth = 'unused' | 'healthy' | 'rate_limited' | 'invalid' | 'error';

/** ریزِ خطای دریافتی از سرویس هوش مصنوعی. */
export type AiErrorCode =
  | 'rate_limit'
  | 'quota'
  | 'auth'
  | 'blocked'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'empty'
  | 'unknown';

/** وضعیت ران‌تایم هر کلید (در جدول ai_key_state ذخیره می‌شود). */
export interface AiKeyState {
  keyId: string;
  status: AiKeyHealth;
  /** ms epoch؛ تا این زمان کلید در حالت کول‌داون است و اولویت آخر می‌شود */
  cooldownUntil: number;
  lastError: string;
  lastStatusCode: number;
  /** ms epoch آخرین استفاده */
  lastUsedAt: number;
  lastLatencyMs: number;
  successCount: number;
  failCount: number;
  rateLimitCount: number;
  /** چند بار این کلید مجبور شده جای خود را به کلیدِ بعدی بدهد */
  rotationCount: number;
}

export interface AiAttempt {
  keyId: string;
  slot: number;
  label: string;
  provider: AiProvider;
  model: string;
  ok: boolean;
  code?: AiErrorCode;
  status?: number;
  latencyMs: number;
  error?: string;
  /** true اگر این کلید به‌خاطر کول‌داون نادیده گرفته شده باشد */
  skippedCooldown?: boolean;
  /** true اگر کلید از کول‌داون بیرون کشیده شد چون هیچ کلید سالمی نمانده بود */
  forcedFromCooldown?: boolean;
  /** true اگر پاسخ‌دهی از کلیدِ همیشگیِ این گفتگو به این کلید منتقل شده باشد */
  handoff?: boolean;
}

export interface FailoverOutcome {
  /** متن پاسخ یا null اگر هیچ کلیدی جواب نداد */
  text: string | null;
  /** کلیدی که در نهایت پاسخ داد */
  usedKey?: AiKeyEntry;
  usedKeyId?: string;
  usedKeyLabel?: string;
  usedProvider?: AiProvider;
  usedSlot?: number;
  /** همه‌ی تلاش‌ها به ترتیب */
  attempts: AiAttempt[];
  /** true وقتی پاسخ از کلیدِ متفاوتی با کلیدِ شروع برگشته باشد */
  switched: boolean;
  /** وضعیت به‌روزشده‌ی همه‌ی کلیدهای این بخش */
  states: Record<string, AiKeyState>;
  /** پیام آخرین خطا (برای لاگ/ادمین) */
  lastError?: string;
  /** true وقتی همه‌ی کلیدها کول‌داون بودند */
  allCooling: boolean;
  /** زمان پایان چرخش (ms) — برای لاگ */
  elapsedMs: number;
}

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

export interface AiCallResult {
  text: string | null;
  code?: AiErrorCode;
  status?: number;
  message?: string;
  model?: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// 2. بخش‌های سایت که کلید API می‌خواهند + ۵ اسلات برای هرکدام
// ---------------------------------------------------------------------------

/** تعداد اسلات‌های کلید برای هر بخش (خواستهٔ کارفرما: ۵ کلید در هر بخش). */
export const KEYS_PER_SECTION = 5;

export interface AiSectionDef {
  id: string;
  /** نام فارسی برای پنل ادمین */
  name: string;
  /** توضیح این‌که این کلید کجای سایت مصرف می‌شود */
  description: string;
  kind: 'site' | 'product';
  /** نام سکرت محیطی که وقتی هیچ کلیدی ثبت نشده باشد استفاده می‌شود */
  envFallback: string;
  /** مدل پیشنهادی هر اسلات برای هر سرویس‌دهنده */
  models: { gemini: string; openai: string };
  /** baseUrl پیش‌فرض برای پروکسی‌های OpenAI */
  openaiBaseUrl: string;
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];

export const AI_SECTIONS: AiSectionDef[] = [
  {
    id: 'site-assistant',
    name: 'دستیار هوشمند سایت (چت ماسکوت)',
    description: 'پاسخ‌دهی به بازدیدکننده‌ها در ویجت چت، با RAG روی مقالات و داده‌ی سایت. اگر همه‌ی کلیدها لیمیت بخورند، پاسخ از موتور محلیِ سایت داده می‌شود.',
    kind: 'site',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: GEMINI_MODELS[0], openai: OPENAI_MODELS[0] },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'seo-slug',
    name: 'تولید اسلاگ سئو (پنل ادمین)',
    description: 'تبدیل عنوان فارسی مقاله/برگه به اسلاگ انگلیسیِ سئو-پسند. ورودیِ کم‌حجم است و مصرف کلیدش ناچیز.',
    kind: 'site',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: 'gemini-2.5-flash-lite', openai: 'gpt-4o-mini' },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'business-therapist',
    name: 'محصول ۱ — تراپیست بیزینسی و منتور مارکتینگ',
    description: 'چتِ محصول «تراپیست بیزینسی»؛ پاسخ‌های مشاوره‌ای داده‌محور با پرامپت اختصاصی همین محصول.',
    kind: 'product',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: GEMINI_MODELS[0], openai: OPENAI_MODELS[0] },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'growth-path',
    name: 'محصول ۲ — مسیرساز توسعه فردی',
    description: 'چتِ محصول «مسیرساز»؛ خروجی ساختارمند (فازبندی + چک‌لیست) طبق پرامپت همین محصول.',
    kind: 'product',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: GEMINI_MODELS[0], openai: OPENAI_MODELS[0] },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'problem-solver',
    name: 'محصول ۳ — راه‌حل‌یاب',
    description: 'چتِ محصول «راه‌حل‌یاب»؛ اول کشف مسئله با سوال، بعد چند راه‌حل + پیشنهاد نهایی.',
    kind: 'product',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: GEMINI_MODELS[0], openai: OPENAI_MODELS[0] },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'mock-customer',
    name: 'محصول ۴ — مشتری فرضی',
    description: 'چتِ محصول «مشتری فرضی»؛ ایفای نقشِ خریدار و در ادامه بازخورد مربی فروش.',
    kind: 'product',
    envFallback: 'GEMINI_API_KEY',
    models: { gemini: GEMINI_MODELS[0], openai: OPENAI_MODELS[0] },
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
];

export const AI_SECTION_IDS = AI_SECTIONS.map((s) => s.id);
export const PRODUCT_SECTION_IDS = AI_SECTIONS.filter((s) => s.kind === 'product').map((s) => s.id);
export const SITE_SECTION_IDS = AI_SECTIONS.filter((s) => s.kind === 'site').map((s) => s.id);
export const SITE_ASSISTANT_SECTION = 'site-assistant';
export const SEO_SLUG_SECTION = 'seo-slug';

export const getAiSection = (id: string): AiSectionDef | undefined => AI_SECTIONS.find((s) => s.id === id);
export const isAiSectionId = (id: string): boolean => AI_SECTION_IDS.includes(id);
export const sectionLabel = (id: string): string => getAiSection(id)?.name || id;

// ---------------------------------------------------------------------------
// 3. اسلات‌ها: پیش‌فرض‌ها، ادغام و ماسک کردن
// ---------------------------------------------------------------------------

const SLOT_LABELS = [
  'کلید ۱ — اصلی (Primary)',
  'کلید ۲ — پشتیبان اول',
  'کلید ۳ — پشتیبان دوم',
  'کلید ۴ — پشتیبان سوم',
  'کلید ۵ — پشتیبان چهارم',
];

const clamp = (s: unknown, max: number): string => String(s ?? '').trim().slice(0, max);
const providerOf = (p: unknown): AiProvider => (p === 'openai' ? 'openai' : 'gemini');

export const maskedKey = (k: string): string => {
  const s = (k || '').trim();
  if (!s) return '';
  return s.length <= 8 ? '••••••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`;
};

/** مقدارِ ماسک‌شده‌ای که از پنل ادمین برگشته را «بدون تغییر» در نظر بگیر. */
export const looksMasked = (s: string): boolean => /•/.test(s || '');

/**
 * ۵ اسلاتِ پیش‌فرض برای یک بخش.
 * اسلات‌ها به‌ترتیبِ اولویت اجرا هستند: key-1 اول، key-5 آخر.
 * اسلات‌های ۲ تا ۵ به‌صورت پیش‌فرض «سالم، فعال و خالی» هستند؛ به‌محض این‌که
 * ادمین کلیدشان را پر کند، خودکار وارد چرخه‌ی جایگزینی می‌شوند.
 */
export const createDefaultSectionKeys = (sectionId: string): AiKeyEntry[] => {
  const section = getAiSection(sectionId);
  const geminiModel = section?.models.gemini || GEMINI_MODELS[0];
  const openaiModel = section?.models.openai || OPENAI_MODELS[0];
  const openaiBaseUrl = section?.openaiBaseUrl || 'https://api.openai.com/v1';
  return Array.from({ length: KEYS_PER_SECTION }, (_, i) => {
    const slot = i + 1;
    // اسلات ۳ به بعد پیش‌فرض روی مسیر OpenAI-سازگار است تا اگر کلیدهای Gemini
    // همه لیمیت خوردند، سرویس‌دهنده‌ی دیگری هم در دسترس باشد (تنوع سرویس‌دهنده).
    const useOpenaiDefault = slot >= 3;
    return {
      id: `key-${slot}`,
      slot,
      label: SLOT_LABELS[i],
      provider: useOpenaiDefault ? 'openai' : 'gemini',
      baseUrl: useOpenaiDefault ? openaiBaseUrl : '',
      model: useOpenaiDefault ? openaiModel : geminiModel,
      apiKey: '',
      enabled: true,
    } satisfies AiKeyEntry;
  });
};

/** فقط فیلدهای نمایشیِ یک کلید (بدون خودِ کلید). */
export interface PublicKeyInfo {
  id: string;
  slot: number;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyMask: string;
  enabled: boolean;
}

export const publicKeyInfo = (k: AiKeyEntry): PublicKeyInfo => ({
  id: k.id,
  slot: k.slot,
  label: k.label,
  provider: k.provider,
  baseUrl: k.baseUrl,
  model: k.model,
  hasKey: !!(k.apiKey || '').trim(),
  keyMask: maskedKey(k.apiKey || ''),
  enabled: k.enabled !== false,
});

/** یک اسلات خالی با مقادیر پیش‌فرضِ همان شماره در همان بخش. */
const blankSlot = (sectionId: string, slot: number): AiKeyEntry => {
  const defaults = createDefaultSectionKeys(sectionId);
  const base = defaults.find((k) => k.slot === slot) || defaults[0];
  return { ...base, slot, id: `key-${slot}`, apiKey: '' };
};

/**
 * ادغامِ کلیدهای ثبت‌شده با ورودیِ پنل ادمین — همیشه با خروجیِ دقیقاً ۵ اسلات.
 * قواعد امنیتی/کاربردی:
 *   - فیلد `apiKey` خالی یا ماسک‌شده = «بدون تغییر» (کلید ذخیره‌شده حفظ می‌شود).
 *   - `clearKey: true` = پاک کردن عمدیِ کلیدِ آن اسلات.
 *   - provider/baseUrl/model/label/enabled همیشه از ورودی به‌روز می‌شوند.
 */
export const mergeSectionKeys = (
  sectionId: string,
  incoming: Array<Partial<AiKeyEntry> & { clearKey?: boolean }> = [],
  existing: AiKeyEntry[] = []
): AiKeyEntry[] => {
  // Match by id, and only fall back to the array position when the entry has no
  // id at all — otherwise a short stored list would leak one key into other slots.
  const pick = <T extends { id?: string }>(list: T[], id: string, slot: number): T | undefined => {
    const byId = list.find((k) => k && k.id === id);
    if (byId) return byId;
    const pos = list[slot - 1];
    return pos && !pos.id ? pos : undefined;
  };
  const out: AiKeyEntry[] = [];
  for (let slot = 1; slot <= KEYS_PER_SECTION; slot++) {
    const id = `key-${slot}`;
    const inc = pick(incoming, id, slot) || {};
    const ext = pick(existing, id, slot) || blankSlot(sectionId, slot);
    const incomingKey = typeof inc.apiKey === 'string' ? inc.apiKey.trim() : '';
    const apiKey = inc.clearKey ? '' : incomingKey && !looksMasked(incomingKey) ? incomingKey : (ext.apiKey || '');
    const prevProvider = providerOf(ext.provider);
    const provider = providerOf(inc.provider ?? ext.provider);
    // Switching provider without naming a model → use that provider's default
    // model (and drop an OpenAI-only base URL) instead of keeping a stale model.
    const providerChanged = inc.provider !== undefined && provider !== prevProvider;
    const providerDefaultModel = createDefaultSectionKeys(sectionId).find((k) => k.provider === provider)?.model || '';
    const model =
      providerChanged && (inc.model === undefined || clamp(inc.model, 80) === clamp(ext.model, 80))
        ? providerDefaultModel || clamp(inc.model ?? ext.model, 80)
        : clamp(inc.model ?? ext.model, 80);
    out.push({
      id,
      slot,
      label: clamp(inc.label ?? ext.label, 60) || SLOT_LABELS[slot - 1],
      provider,
      baseUrl: provider === 'gemini' && inc.baseUrl === undefined ? '' : clamp(inc.baseUrl ?? ext.baseUrl, 200),
      model,
      apiKey,
      enabled: inc.enabled === undefined ? ext.enabled !== false : inc.enabled !== false,
    });
  }
  return out;
};

/** کلیدهای یک بخش را از JSON ذخیره‌شده (D1 / فایل dev) می‌سازد — همیشه ۵ اسلات. */
export const normalizeStoredKeys = (sectionId: string, raw: unknown): AiKeyEntry[] => {
  let parsed: any[] = [];
  if (Array.isArray(raw)) parsed = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) parsed = j;
    } catch {
      parsed = [];
    }
  }
  const incoming = parsed.map((k: any, i: number) => ({
    id: typeof k?.id === 'string' && k.id ? k.id : `key-${i + 1}`,
    label: k?.label,
    provider: k?.provider,
    baseUrl: k?.baseUrl,
    model: k?.model,
    apiKey: typeof k?.apiKey === 'string' ? k.apiKey : '',
    enabled: k?.enabled !== false,
  }));
  // keepKey: مقادیرِ ذخیره‌شده «کلیدِ فعلی» هستند؛ پس ادغام با لیست خالی آن‌ها را حفظ می‌کند.
  return mergeSectionKeys(sectionId, incoming, []);
};

/** آیا این مدل همان مدلِ پیش‌فرضِ همین بخش است؟ (برای تصمیم‌گیری مدلِ CMS) */
export const isDefaultSectionModel = (sectionId: string, model: string): boolean => {
  const m = (model || '').trim();
  if (!m) return true;
  if (createDefaultSectionKeys(sectionId).some((k) => k.model === m)) return true;
  return GEMINI_MODELS.includes(m) || GEMINI_FALLBACKS.includes(m) || OPENAI_MODELS.includes(m);
};

// ---------------------------------------------------------------------------
// 4. سلامت کلید: کدِ خطا، کول‌داون و وضعیت
// ---------------------------------------------------------------------------

export const COOLDOWN_MS: Record<AiErrorCode, number> = {
  rate_limit: 15 * 60_000, // ۱۵ دقیقه — سقف درخواست در دقیقه/ساعت
  quota: 6 * 3600_000, // ۶ ساعت — سقف روزانه/اعتبار تمام‌شده
  auth: 24 * 3600_000, // ۲۴ ساعت — کلید نامعتبر است و دستی باید عوض شود
  blocked: 0,
  bad_request: 0,
  server: 2 * 60_000,
  network: 60_000,
  timeout: 60_000,
  empty: 5 * 60_000,
  unknown: 5 * 60_000,
};

/** کدهای OpenRouter/OpenAI/Gemini را به یک زبان مشترک ترجمه می‌کند. */
export const classifyAiError = (input: { status?: number; code?: string; message?: string }): AiErrorCode => {
  const status = Number(input.status || 0);
  const text = `${input.code || ''} ${input.message || ''}`.toLowerCase();
  // Billing/quota-exhausted errors will not recover by waiting a few minutes.
  if (/insufficient_quota|exceeded your current quota|billing|out of credits|payment required|credit balance/.test(text)) return 'quota';
  if (/per day|daily limit|daily quota|free ?tier/.test(text) && (status === 429 || /quota|limit/.test(text))) return 'quota';
  if (/resource_exhausted|rate.?limit|too many requests|quota|exceeded|limit/.test(text) || status === 429) return 'rate_limit';
  if (status === 401 || status === 403 || /api[_ -]?key not valid|invalid[_ -]?api[_ -]?key|unauthenticated|permission_denied|incorrect api key/.test(text)) {
    return 'auth';
  }
  if (/safety|blocked|prohibited|recitation/.test(text)) return 'blocked';
  if (status === 400 || status === 404 || status === 422 || /invalid[_ -]?argument|bad request|not found/.test(text)) return 'bad_request';
  if (status >= 500) return 'server';
  if (/abort|timeout|timed out|etimedout|deadline/.test(text)) return 'timeout';
  if (/fetch failed|network|econnrefused|enotfound|socket|dns/.test(text)) return 'network';
  return 'unknown';
};

/** خطای «کلید بعدی را امتحان کن». خطای پرامپت/فیلترِ محتوا با کلید بعدی فرقی نمی‌کند. */
export const shouldRotateKey = (code?: AiErrorCode): boolean =>
  code === 'rate_limit' || code === 'quota' || code === 'auth' || code === 'server' || code === 'network' || code === 'timeout' || code === 'empty' || code === 'unknown' || code === undefined;

export const emptyKeyState = (keyId: string): AiKeyState => ({
  keyId,
  status: 'unused',
  cooldownUntil: 0,
  lastError: '',
  lastStatusCode: 0,
  lastUsedAt: 0,
  lastLatencyMs: 0,
  successCount: 0,
  failCount: 0,
  rateLimitCount: 0,
  rotationCount: 0,
});

export const isCoolingDown = (state: AiKeyState | undefined, now = Date.now()): boolean =>
  !!state && state.cooldownUntil > now;

export const cooldownRemainingMs = (state: AiKeyState | undefined, now = Date.now()): number =>
  state && state.cooldownUntil > now ? state.cooldownUntil - now : 0;

const healthForCode = (code: AiErrorCode): AiKeyHealth => {
  if (code === 'rate_limit' || code === 'quota') return 'rate_limited';
  if (code === 'auth' || code === 'bad_request') return 'invalid';
  if (code === 'blocked') return 'unused';
  return 'error';
};

/** اثرِ یک تلاش را روی وضعیت کلید اعمال می‌کند (خالص — بدون I/O). */
export const applyAttemptToState = (
  state: AiKeyState | undefined,
  keyId: string,
  attempt: Pick<AiAttempt, 'ok' | 'code' | 'status' | 'latencyMs' | 'error'>,
  now = Date.now()
): AiKeyState => {
  const prev = { ...emptyKeyState(keyId), ...(state || {}) };
  const latency = Math.max(0, Math.round(attempt.latencyMs || 0));
  if (attempt.ok) {
    return {
      ...prev,
      keyId,
      status: 'healthy',
      cooldownUntil: 0,
      lastError: '',
      lastStatusCode: attempt.status || 200,
      lastUsedAt: now,
      lastLatencyMs: latency,
      successCount: prev.successCount + 1,
    };
  }
  const code = attempt.code || 'unknown';
  const cooldown = COOLDOWN_MS[code] || 0;
  return {
    ...prev,
    keyId,
    status: healthForCode(code),
    cooldownUntil: cooldown > 0 ? now + cooldown : 0,
    lastError: attempt.error || code,
    lastStatusCode: attempt.status || 0,
    lastUsedAt: now,
    lastLatencyMs: latency,
    failCount: prev.failCount + 1,
    rateLimitCount: prev.rateLimitCount + (code === 'rate_limit' || code === 'quota' ? 1 : 0),
  };
};

export const HEALTH_LABEL_FA: Record<AiKeyHealth, string> = {
  unused: 'استفاده‌نشده',
  healthy: 'سالم',
  rate_limited: 'لیمیت‌خورده',
  invalid: 'نامعتبر',
  error: 'خطا',
};

export const cooldownLabelFa = (ms: number): string => {
  if (ms <= 0) return '';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} دقیقه`;
  const h = Math.round(m / 60);
  return `${h} ساعت`;
};

// ---------------------------------------------------------------------------
// 5. ترتیب اجرای کلیدها (Sticky + اولویت اسلات + کول‌داون)
// ---------------------------------------------------------------------------

/**
 * ترتیب نهاییِ امتحان‌کردن کلیدها:
 *   ۱. کلیدِ «همین گفتگو» (sticky) اگر فعال، پر و در کول‌داون نباشد — تا چت روی
 *      همان کلید ادامه پیدا کند و لازم نشود بی‌دلیل جابه‌جا شود.
 *   ۲. بقیه‌ی اسلات‌ها به ترتیب (۱ تا ۵) که فعال، پر و در کول‌داون نباشند.
 *   ۳. کلیدهای کول‌داون‌دار، به‌ترتیبِ نزدیک‌ترین زمان آزادشدن — چون اگر همه
 *      لیمیت خورده باشند، بهتر است شانس را روی همان‌ها هم امتحان کنیم.
 * کلیدهای غیرفعال یا بدون `apiKey` هرگز امتحان نمی‌شوند.
 */
export const planKeyOrder = (args: {
  keys: AiKeyEntry[];
  states?: Record<string, AiKeyState>;
  stickyKeyId?: string;
  now?: number;
}): { ordered: AiKeyEntry[]; skipped: AiKeyEntry[]; allCooling: boolean } => {
  const { keys, states = {}, stickyKeyId, now = Date.now() } = args;
  const usable = (keys || []).filter((k) => k && k.enabled !== false && (k.apiKey || '').trim());
  const healthy: AiKeyEntry[] = [];
  const cooling: AiKeyEntry[] = [];
  for (const k of usable) {
    if (isCoolingDown(states[k.id], now)) cooling.push(k);
    else healthy.push(k);
  }
  healthy.sort((a, b) => a.slot - b.slot);
  cooling.sort((a, b) => (states[a.id]?.cooldownUntil || 0) - (states[b.id]?.cooldownUntil || 0));

  const sticky = stickyKeyId ? healthy.find((k) => k.id === stickyKeyId) : undefined;
  const ordered = sticky ? [sticky, ...healthy.filter((k) => k.id !== sticky.id), ...cooling] : [...healthy, ...cooling];
  const skipped = (keys || []).filter((k) => !k.enabled || !(k.apiKey || '').trim());
  return { ordered, skipped, allCooling: healthy.length === 0 && cooling.length > 0 };
};

// ---------------------------------------------------------------------------
// 6. حافظه‌ی گفتگو و ادامه‌ی طبیعی پس از جابه‌جایی کلید (Continuity)
// ---------------------------------------------------------------------------

/** حداکثر تعداد پیام‌هایی که به مدل فرستاده می‌شود (کاربر + دستیار). */
export const HISTORY_LIMIT = 24;
/** حداکثر پیام‌هایی که از حافظه‌ی سرور (چت‌های قبلی) بازیابی می‌شود. */
export const MEMORY_LIMIT = 40;

export const HANDOFF_INSTRUCTION = `[یادداشت داخلی سیستم — هرگز به کاربر نشان نده]
این گفت‌وگو از قبل در جریان است و همین حالا ادامه‌اش پرسیده می‌شود. پیش از پاسخ:
۱) مکالمه‌ی قبلی (و «حافظه‌ی گفتگو»یی که در ادامه می‌آید) را مرور کن: موضوع اصلی، هدف کاربر، داده‌هایی که داده، تصمیم‌ها و چیزهایی که قبلاً پیشنهاد کرده‌ای.
۲) دقیقاً همان لحن، همان فارسی و همان خط‌مشی را ادامه بده؛ از صفر شروع نکن، خودت را معرفی نکن و سوال‌های تکراری نپرس.
۳) اگر قولی داده‌ای (چک‌لیست، مرحله‌ی بعد، عدد، سوال)، همان را ادامه بده و به آن ارجاع بده.
۴) هرگز به تغییرِ سرویس، مدل، کلید یا زیرساختِ پاسخ‌دهی اشاره نکن؛ برای کاربر تو یک دستیارِ واحد و پیوسته هستی.`;

/** پیام‌ها را نرمال می‌کند: نقش‌های معتبر، متن تمیز، بدون پیام خالی. */
export const sanitizeTurns = (turns: Array<{ role?: string; content?: unknown }> | undefined, limit = HISTORY_LIMIT): ChatTurn[] =>
  (turns || [])
    .map((m) => ({
      role: (m?.role === 'model' || m?.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      content: String(m?.content ?? '').trim(),
    }))
    .filter((m) => m.content.length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-limit);

const sameTurn = (a: ChatTurn, b: ChatTurn): boolean => a.role === b.role && a.content.trim() === b.content.trim();

/**
 * حافظه‌ی سرور (چت‌های قبلی) را با تاریخچه‌ی ارسالیِ کلاینت ادغام می‌کند تا
 * «مرور چت‌های قبلی» حتی وقتی کلاینت فقط چند پیام آخر را می‌فرستد هم اتفاق بیفتد.
 * اگر تاریخچه‌ی کلاینت دنباله‌ی حافظه‌ی سرور باشد، همان حافظه‌ی کامل‌تر برنده است.
 */
export const mergeConversationHistory = (
  clientTurns: ChatTurn[],
  rememberedTurns: ChatTurn[],
  limit = HISTORY_LIMIT
): { history: ChatTurn[]; recap: ChatTurn[]; usedMemory: boolean } => {
  const client = sanitizeTurns(clientTurns, limit);
  const memory = sanitizeTurns(rememberedTurns, MEMORY_LIMIT);
  if (memory.length === 0) return { history: client, recap: [], usedMemory: false };
  if (client.length === 0) return { history: memory.slice(-limit), recap: memory.slice(-limit), usedMemory: true };

  // بزرگ‌ترین هم‌پوشانیِ ممکن بین کلاینت و دنباله‌ی حافظه را پیدا کن.
  let overlap = 0;
  for (let k = Math.min(memory.length, client.length); k > 0; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (!sameTurn(client[i], memory[memory.length - k + i])) {
        ok = false;
        break;
      }
    }
    if (ok) {
      overlap = k;
      break;
    }
  }
  if (overlap === client.length) {
    // کلاینت زیرمجموعه‌ی حافظه است → حافظه‌ی کامل‌تر را بفرست.
    return { history: memory.slice(-limit), recap: memory.slice(-limit), usedMemory: true };
  }
  if (overlap > 0) {
    const merged = [...memory, ...client.slice(overlap)].slice(-limit);
    return { history: merged, recap: memory.slice(-limit), usedMemory: true };
  }
  const merged = [...memory, ...client].slice(-limit);
  return { history: merged, recap: memory.slice(-limit), usedMemory: true };
};

/** خلاصه‌ی خوانا از چت‌های قبلی که به‌عنوان «حافظه» به سیستم‌پرامپت تزریق می‌شود. */
export const buildMemoryRecap = (turns: ChatTurn[], maxTurns = 20): string => {
  const list = sanitizeTurns(turns, maxTurns);
  if (list.length === 0) return '';
  const lines = list.map((t) => `${t.role === 'user' ? 'کاربر' : 'دستیار'}: ${t.content.replace(/\s+/g, ' ').slice(0, 400)}`);
  return `[حافظه‌ی گفتگو — چت‌های قبلیِ همین کاربر (تازه‌ترین‌ها آخر)]\n${lines.join('\n')}\n[پایان حافظه]`;
};

/**
 * سیستم‌پرامپت نهایی: پرامپت اصلیِ بخش + (در صورت وجود) حافظه‌ی چت‌های قبلی +
 * دستورِ پیوستگی هنگام جابه‌جایی کلید.
 */
export const buildContinuitySystemPrompt = (args: {
  systemPrompt: string;
  /** چت‌های قبلیِ بازیابی‌شده از حافظه‌ی سرور */
  recap?: ChatTurn[];
  /** تاریخچه‌ای که همراه همین درخواست به مدل می‌رود */
  history?: ChatTurn[];
  /** true = پاسخ‌دهی از کلیدِ دیگری غیر از کلیدِ همیشگیِ این گفتگو ادامه می‌یابد */
  handoff?: boolean;
  /** تعداد تلاش‌های ناموفقِ قبلی در همین درخواست */
  failoverCount?: number;
}): string => {
  const { systemPrompt, recap = [], history = [], handoff = false, failoverCount = 0 } = args;
  const parts = [systemPrompt.trim()];
  const hasHistory = recap.length > 0 || history.length > 0;
  if (recap.length > 0) parts.push(buildMemoryRecap(recap));
  if (hasHistory && handoff) {
    parts.push(
      `${HANDOFF_INSTRUCTION}\n(این نوبت پس از ${failoverCount || 1} تلاش ناموفق با کلید پشتیبان انجام می‌شود؛ تاریخچه و حافظه‌ی بالا مرجعِ توست.)`
    );
  } else if (hasHistory) {
    parts.push(
      '[یادداشت داخلی سیستم] ادامه‌ی همین گفت‌وگو را پاسخ می‌دهی؛ لحن و مسیر قبلی را حفظ کن و از ابتدا شروع نکن. به تاریخچه یا حافظه اشاره‌ی مستقیم نکن.'
    );
  }
  return parts.filter(Boolean).join('\n\n');
};

// ---------------------------------------------------------------------------
// 7. فراخوانی سرویس‌دهنده (Gemini / OpenAI-سازگار)
// ---------------------------------------------------------------------------

export interface ProviderCallArgs {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  systemPrompt: string;
  history: ChatTurn[];
  question: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** مهلت درخواست به میلی‌ثانیه */
  timeoutMs?: number;
}

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];

const extractGeminiText = (j: any): string => {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const first = parts.find((p: any) => p?.text && !p?.thought) || parts.find((p: any) => p?.text) || parts[0];
  return String(first?.text || '').trim();
};

const timeoutSignal = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function' ? (AbortSignal as any).timeout(ms) : undefined;

/**
 * یک درخواست به سرویس‌دهنده با یک کلید مشخص.
 * هیچ‌وقت throw نمی‌کند؛ خطا را به `code` استاندارد ترجمه می‌کند تا موتور چرخش
 * بتواند تصمیم بگیرد سراغ کلید بعدی برود یا نه.
 */
export const callProviderKey = async (args: ProviderCallArgs): Promise<AiCallResult> => {
  const key = (args.apiKey || '').trim();
  if (!key) return { text: null, code: 'auth', message: 'کلید API خالی است.' };
  const started = Date.now();
  const temperature = typeof args.temperature === 'number' ? args.temperature : 0.6;
  const maxTokens = Math.max(64, Math.min(4096, args.maxOutputTokens || 900));
  const timeoutMs = args.timeoutMs || 30000;

  try {
    if (args.provider === 'openai') {
      const base = (args.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const model = (args.model || 'gpt-4o-mini').trim();
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: timeoutSignal(timeoutMs),
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: args.systemPrompt },
            ...args.history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })),
            { role: 'user', content: args.question },
          ],
        }),
      });
      const latencyMs = Date.now() - started;
      if (res.ok) {
        const j: any = await res.json().catch(() => null);
        const text = String(j?.choices?.[0]?.message?.content || '').trim();
        if (text) return { text, model, status: res.status, latencyMs };
        return { text: null, code: 'empty', status: res.status, model, latencyMs, message: 'پاسخ خالی از سرویس OpenAI.' };
      }
      const bodyText = await res.text().catch(() => '');
      return {
        text: null,
        status: res.status,
        code: classifyAiError({ status: res.status, message: bodyText }),
        model,
        latencyMs,
        message: bodyText.slice(0, 240) || res.statusText,
      };
    }

    // ---- Gemini (پیش‌فرض) ----
    const models = [args.model, ...DEFAULT_GEMINI_MODELS].filter((m, i, a) => m && a.indexOf(m) === i) as string[];
    let last: AiCallResult = { text: null, code: 'empty', message: 'پاسخی از Gemini دریافت نشد.' };
    for (const model of models) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: timeoutSignal(timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.systemPrompt }] },
          contents: [
            ...args.history.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: args.question }] },
          ],
          generationConfig: { temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
      });
      const latencyMs = Date.now() - started;
      if (res.ok) {
        const j: any = await res.json().catch(() => null);
        const text = extractGeminiText(j);
        if (text) return { text, model, status: res.status, latencyMs };
        const finish = String(j?.candidates?.[0]?.finishReason || '');
        last = {
          text: null,
          code: finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'blocked' : 'empty',
          status: res.status,
          model,
          latencyMs,
          message: finish ? `پاسخ مسدود/خالی (${finish})` : 'پاسخ خالی از Gemini.',
        };
        // خطای «خالی/مسدود» با مدل بعدی هم شانس دارد؛ ادامه بده.
        continue;
      }
      const bodyText = await res.text().catch(() => '');
      const code = classifyAiError({ status: res.status, message: bodyText });
      last = { text: null, code, status: res.status, model, latencyMs, message: bodyText.slice(0, 240) || res.statusText };
      // اگر مدل پیدا نشد (404) یا کلید مشکل دارد، مدل بعدی را امتحان کن.
      if (code === 'rate_limit' || code === 'quota' || code === 'auth') return last;
    }
    return last;
  } catch (err: any) {
    const message = String(err?.message || err || 'خطای شبکه');
    const code = classifyAiError({ message });
    return { text: null, code, message, latencyMs: Date.now() - started };
  }
};

export interface KeyTestResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  reply?: string;
  error?: string;
}

/** تستِ زندهٔ یک کلید (برای دکمه‌ی «تست» در پنل ادمین). */
export const testProviderKey = async (config: {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<KeyTestResult> => {
  const provider: AiProvider = config.provider === 'openai' ? 'openai' : 'gemini';
  const model = (config.model || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash')).trim();
  const started = Date.now();
  const res = await callProviderKey({
    provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model,
    systemPrompt: 'You are a connectivity probe. Reply with the single word OK.',
    history: [],
    question: 'Reply with the word "OK".',
    temperature: 0.1,
    maxOutputTokens: 25,
    timeoutMs: config.timeoutMs || 15000,
  });
  const latencyMs = Math.max(1, Date.now() - started);
  if (res.text) return { ok: true, latencyMs, model: res.model || model, reply: res.text.slice(0, 120) };
  return { ok: false, latencyMs, model: res.model || model, error: res.message || res.code || 'خطای نامشخص' };
};

// ---------------------------------------------------------------------------
// 8. موتور چرخش کلیدها (Auto-Failover)
// ---------------------------------------------------------------------------

export interface FailoverAttemptContext {
  key: AiKeyEntry;
  /** موقعیت در ترتیب اجرا (۰ = اولین کلید) */
  index: number;
  /** true اگر حداقل یک کلید قبل از این یکی شکست خورده باشد */
  isFailover: boolean;
  /** true اگر کلیدِ انتخابیِ این گفتگو ≠ این کلید (پس باید پیوستگی را حفظ کند) */
  isHandoff: boolean;
  /** کلید قبلی که شکست خورد */
  previousKeyId?: string;
  /** true اگر این کلید از کول‌داون بیرون کشیده شده باشد */
  forcedFromCooldown: boolean;
  /** تاریخچه‌ای که باید به مدل برود (ادغام‌شده با حافظه) */
  history: ChatTurn[];
}

export interface FailoverArgs {
  sectionId: string;
  keys: AiKeyEntry[];
  /** وضعیت قبلیِ کلیدها (از D1/فایل) */
  states?: Record<string, AiKeyState>;
  /** کلیدِ همیشگیِ این گفتگو (نشست) تا اول همان امتحان شود */
  stickyKeyId?: string;
  /** فراخوانی سرویس با یک کلید مشخص — پرامپت را خودِ فراخوان می‌سازد تا دستور پیوستگی را هم بگذارد */
  call: (ctx: FailoverAttemptContext) => Promise<AiCallResult>;
  /** حافظه‌ی ادغام‌شده‌ی این درخواست */
  history?: ChatTurn[];
  now?: number;
  /** ذخیره‌ی وضعیت بعد از هر تلاش (پنل ادمین همیشه تازه باشد) */
  persist?: (states: AiKeyState[]) => Promise<void> | void;
  /** حداکثر تعداد تلاش (پیش‌فرض: تعداد کلیدهای قابل استفاده) */
  maxAttempts?: number;
}

/**
 * کلیدها را به ترتیب امتحان می‌کند تا یکی جواب بدهد:
 *   - کلیدِ جاریِ گفتگو → کلیدهای سالم بعدی → (در نهایت) کلیدهای کول‌داون‌دار.
 *   - هر خطای «لیمیت/اعتبار/شبکه» باعث رفتن به کلید بعدی می‌شود و کلید خطادار
 *     برای مدتی کول‌داون می‌خورد.
 *   - در جابه‌جایی، فلگ `isHandoff` بالا می‌رود تا فراخوان، دستور «ادامه‌ی طبیعیِ
 *     همان گفتگو» را به سیستم‌پرامپت اضافه کند.
 */
export const runKeyFailover = async (args: FailoverArgs): Promise<FailoverOutcome> => {
  const startedAt = Date.now();
  const now = args.now ?? startedAt;
  const states: Record<string, AiKeyState> = { ...(args.states || {}) };
  const { ordered, allCooling } = planKeyOrder({ keys: args.keys, states, stickyKeyId: args.stickyKeyId, now });
  const attempts: AiAttempt[] = [];
  const persistSafe = async () => {
    if (!args.persist) return;
    try {
      await args.persist(Object.values(states));
    } catch {
      /* ذخیره‌ی وضعیت هرگز نباید پاسخ کاربر را خراب کند */
    }
  };

  const primaryId = args.stickyKeyId && ordered.some((k) => k.id === args.stickyKeyId) ? args.stickyKeyId : ordered[0]?.id;
  const maxAttempts = Math.max(1, args.maxAttempts ?? ordered.length);
  let previousKeyId: string | undefined;
  let lastError: string | undefined;
  let switched = false;

  for (let i = 0; i < ordered.length && attempts.length < maxAttempts; i++) {
    const key = ordered[i];
    const cooling = isCoolingDown(states[key.id], startedAt);
    const handoff = !!previousKeyId && key.id !== primaryId;
    if (handoff) switched = true;
    const ctx: FailoverAttemptContext = {
      key,
      index: i,
      isFailover: i > 0,
      isHandoff: handoff,
      previousKeyId,
      forcedFromCooldown: cooling,
      history: args.history || [],
    };

    let result: AiCallResult;
    try {
      result = await args.call(ctx);
    } catch (err: any) {
      const message = String(err?.message || err || 'خطای نامشخص');
      result = { text: null, code: classifyAiError({ message }), message };
    }

    const attempt: AiAttempt = {
      keyId: key.id,
      slot: key.slot,
      label: key.label,
      provider: key.provider,
      model: key.model,
      ok: !!result.text,
      code: result.text ? undefined : result.code || 'unknown',
      status: result.status,
      latencyMs: Math.max(0, Math.round(result.latencyMs || 0)),
      error: result.text ? undefined : result.message,
      forcedFromCooldown: cooling || undefined,
      handoff: handoff || undefined,
    };
    attempts.push(attempt);
    states[key.id] = applyAttemptToState(states[key.id], key.id, attempt, Date.now());
    if (!attempt.ok && previousKeyId) states[key.id] = { ...states[key.id], rotationCount: (states[key.id]?.rotationCount || 0) + 1 };
    await persistSafe();

    if (result.text) {
      return {
        text: result.text,
        usedKey: key,
        usedKeyId: key.id,
        usedKeyLabel: key.label || `کلید ${key.slot}`,
        usedProvider: key.provider,
        usedSlot: key.slot,
        attempts,
        switched,
        states,
        allCooling,
        elapsedMs: Date.now() - startedAt,
      };
    }

    lastError = attempt.error || attempt.code;
    previousKeyId = key.id;
    if (!shouldRotateKey(attempt.code)) break;
  }

  return {
    text: null,
    attempts,
    switched,
    states,
    lastError,
    allCooling,
    elapsedMs: Date.now() - startedAt,
  };
};

// ---------------------------------------------------------------------------
// 9. کمکی‌های ساخت کلید محیطی (Env fallback)
// ---------------------------------------------------------------------------

/**
 * کلیدِ محیطی (مثل GEMINI_API_KEY) را به‌شکل یک اسلات مجازی برمی‌گرداند تا در
 * همان موتور چرخش شرکت کند؛ همیشه آخرین گزینه است و در D1 ذخیره نمی‌شود.
 */
export const envFallbackKey = (apiKey: string | undefined, opts?: { id?: string; label?: string; model?: string }): AiKeyEntry | null => {
  const key = (apiKey || '').trim();
  if (!key) return null;
  return {
    id: opts?.id || 'env-fallback',
    slot: KEYS_PER_SECTION + 1,
    label: opts?.label || 'کلید پیش‌فرض محیطی (GEMINI_API_KEY)',
    provider: 'gemini',
    baseUrl: '',
    model: opts?.model || GEMINI_FALLBACKS[0],
    apiKey: key,
    enabled: true,
  };
};

/** خلاصه‌ی وضعیت یک بخش برای پنل ادمین. */
export interface SectionStatus {
  sectionId: string;
  name: string;
  description: string;
  kind: 'site' | 'product';
  envFallback: string;
  envKeyPresent: boolean;
  keys: Array<PublicKeyInfo & { health: AiKeyHealth; cooldownUntilMs: number; cooldownRemainingMs: number; cooldownLabel: string; stats: Omit<AiKeyState, 'keyId' | 'cooldownUntil' | 'lastUsedAt'> & { lastUsedAt: number } }>;
  activeKeyId: string;
  healthyCount: number;
  configuredCount: number;
  readyCount: number;
  totalKeys: number;
}

export const buildSectionStatus = (input: {
  sectionId: string;
  keys: AiKeyEntry[];
  states?: Record<string, AiKeyState>;
  envKeyPresent?: boolean;
  now?: number;
}): SectionStatus => {
  const now = input.now ?? Date.now();
  const section = getAiSection(input.sectionId);
  const states = input.states || {};
  const keys = input.keys.map((k) => {
    const st = states[k.id] || emptyKeyState(k.id);
    const remaining = cooldownRemainingMs(st, now);
    return {
      ...publicKeyInfo(k),
      health: st.status,
      cooldownUntilMs: st.cooldownUntil,
      cooldownRemainingMs: remaining,
      cooldownLabel: cooldownLabelFa(remaining),
      stats: {
        status: st.status,
        lastError: st.lastError,
        lastStatusCode: st.lastStatusCode,
        lastUsedAt: st.lastUsedAt,
        lastLatencyMs: st.lastLatencyMs,
        successCount: st.successCount,
        failCount: st.failCount,
        rateLimitCount: st.rateLimitCount,
        rotationCount: st.rotationCount,
      },
    };
  });
  const ready = keys.filter((k) => k.hasKey && k.enabled);
  const healthyNow = ready.filter((k) => k.cooldownRemainingMs === 0);
  return {
    sectionId: input.sectionId,
    name: section?.name || input.sectionId,
    description: section?.description || '',
    kind: section?.kind || 'product',
    envFallback: section?.envFallback || 'GEMINI_API_KEY',
    envKeyPresent: !!input.envKeyPresent,
    keys,
    activeKeyId: healthyNow[0]?.id || ready[0]?.id || '',
    healthyCount: healthyNow.length,
    configuredCount: ready.length,
    readyCount: ready.length > 0 || !!input.envKeyPresent ? 1 : 0,
    totalKeys: keys.length,
  };
};
