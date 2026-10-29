/**
 * lib/payment/gateway.ts — Core engine for the personalized Payexa-v2 style
 * Automatic Card-to-Card SMS Payment Gateway (OmidPay).
 *
 * Pure WebCrypto + D1Like implementation: runs identically in Cloudflare Pages
 * Functions (production D1), Vite Dev API (local node:sqlite), and unit tests.
 */

import type { D1Like } from '../telegram/store';
import { ensureBotTables, insertDelivery, updateOrder as updateBotOrder } from '../telegram/store';
import { grantToolAccess } from '../telegram/grant';
import { botPlan, botProduct, botProductPath } from '../telegram/pricing';
import * as tg from '../telegram/tgApi';
import {
  hashUserPassword,
  isValidEmail,
  normalizePhone,
  randomUserSalt,
  validateFullName,
  verifyUserPassword,
} from '../userAuth';
import {
  cleanCardNumber,
  cleanIban,
  detectIranBank,
  formatCardNumber,
  isValidIranBankCard,
  maskCardNumber,
  toLatinDigits,
} from './banks';
import { parseIranianBankSms, type ParsedBankSms } from './smsParser';

export const PAYMENT_TTL_MS = 30 * 60 * 1000; // 30 minutes (Payexa standard)
export const UNIQUE_AMOUNT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours lock window
export const SMS_LATE_GRACE_MS = 5 * 60 * 1000; // 5-min grace for carrier SMS delay
export const DEVICE_ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes since last ping

export interface PaymentEnv {
  DB: D1Like;
  AUTH_SECRET?: string;
  ADMIN_PASSWORD?: string;
  GEMINI_API_KEY?: string;
  SITE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_IDS?: string;
  TELEGRAM_AUTO_APPROVE?: string;
  BOT_CARD_NUMBER?: string;
  BOT_CARD_HOLDER?: string;
  BOT_CARD_BANK?: string;
  TELEGRAM_RECEIPT_GEMINI_API_KEY?: string;
  TELEGRAM_VISION_MODEL?: string;
  /** Set to 'true' to reject new payments when no SMS phone pinged in last 10m */
  PAYMENT_REQUIRE_ONLINE_DEVICE?: string;
}

export interface PaymentCardRow {
  id: string;
  card_number: string;
  holder_name: string;
  iban: string;
  bank_name: string;
  bank_slug: string;
  is_active: number;
  priority: number;
  daily_limit_rial: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentDeviceRow {
  id: string;
  name: string;
  device_serial: string;
  token_hash: string;
  token_mask: string;
  pair_code?: string;
  pair_token?: string;
  pair_expires_at?: string;
  is_active: number;
  last_seen_at: string;
  battery_level: number;
  device_model: string;
  app_version: string;
  sms_count: number;
  matched_count: number;
  created_at: string;
}

export interface PaymentApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_mask: string;
  signing_secret: string;
  allowed_origins: string;
  is_active: number;
  last_used_at: string;
  created_at: string;
}

export interface PaymentOrderRow {
  id: string;
  order_id: string;
  source: string;
  status: string;
  amount_rial: number;
  payable_amount_rial: number;
  card_id: string;
  card_number: string;
  card_holder: string;
  card_bank: string;
  card_bank_slug: string;
  phone: string;
  user_id: string;
  tg_user_id: string;
  product_id: string;
  product_name: string;
  plan_id: string;
  plan_name: string;
  description: string;
  callback_url: string;
  return_url: string;
  metadata_json: string;
  api_key_id: string;
  buyer_secret_hash: string;
  matched_sms_id: string;
  paid_at: string;
  verified_at: string;
  fulfilled_at: string;
  access_code: string;
  access_expires_at: string;
  receipt_ref: string;
  receipt_note: string;
  receipt_image_b64: string;
  receipt_submitted_at: string;
  webhook_delivered_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentErrorShape {
  ok: false;
  httpStatus: number;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

/* ----------------------------- crypto helpers ----------------------------- */

const enc = new TextEncoder();

export const randomHex = (bytes = 16): string => {
  const arr = new Uint8Array(bytes);
  (globalThis as any).crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const sha256Hex = async (input: string): Promise<string> => {
  const buf = await (globalThis as any).crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const key = await (globalThis as any).crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await (globalThis as any).crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Generate Payexa-compatible HMAC header `t=<unix>,v1=<hex>` */
export const buildPayexaSignature = async (secret: string, rawBody: string, unixSec = Math.floor(Date.now() / 1000)): Promise<string> => {
  const v1 = await hmacSha256Hex(secret, `${unixSec}.${rawBody}`);
  return `t=${unixSec},v1=${v1}`;
};

export const verifyPayexaSignature = async (secret: string, rawBody: string, header: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> => {
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const seg of header.split(',')) {
    const idx = seg.indexOf('=');
    if (idx > 0) parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
  }
  const t = Number(parts.t);
  const v1 = parts.v1 || '';
  if (!Number.isFinite(t) || !v1 || Math.abs(nowSec - t) > 300) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
};

/* ----------------------------- DDL bootstrap ----------------------------- */

const PAYMENT_DDL = [
  `CREATE TABLE IF NOT EXISTS payment_cards (
    id TEXT PRIMARY KEY,
    card_number TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    iban TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    bank_slug TEXT DEFAULT 'shetab',
    is_active INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 1,
    daily_limit_rial INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_cards_active ON payment_cards (is_active, priority)`,
  `CREATE TABLE IF NOT EXISTS payment_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    device_serial TEXT DEFAULT '',
    token_hash TEXT NOT NULL UNIQUE,
    token_mask TEXT NOT NULL,
    pair_code TEXT DEFAULT '',
    pair_token TEXT DEFAULT '',
    pair_expires_at TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT DEFAULT '',
    battery_level INTEGER NOT NULL DEFAULT -1,
    device_model TEXT DEFAULT '',
    app_version TEXT DEFAULT '',
    sms_count INTEGER NOT NULL DEFAULT 0,
    matched_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_devices_token ON payment_devices (token_hash)`,
  `CREATE TABLE IF NOT EXISTS payment_api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_mask TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    allowed_origins TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_api_keys_hash ON payment_api_keys (key_hash)`,
  `CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'website',
    status TEXT NOT NULL DEFAULT 'pending',
    amount_rial INTEGER NOT NULL,
    payable_amount_rial INTEGER NOT NULL,
    card_id TEXT DEFAULT '',
    card_number TEXT NOT NULL,
    card_holder TEXT NOT NULL,
    card_bank TEXT DEFAULT '',
    card_bank_slug TEXT DEFAULT 'shetab',
    phone TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    tg_user_id TEXT DEFAULT '',
    product_id TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    plan_id TEXT DEFAULT '',
    plan_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    callback_url TEXT DEFAULT '',
    return_url TEXT DEFAULT '',
    metadata_json TEXT DEFAULT '',
    api_key_id TEXT DEFAULT '',
    buyer_secret_hash TEXT DEFAULT '',
    matched_sms_id TEXT DEFAULT '',
    paid_at TEXT DEFAULT '',
    verified_at TEXT DEFAULT '',
    fulfilled_at TEXT DEFAULT '',
    access_code TEXT DEFAULT '',
    access_expires_at TEXT DEFAULT '',
    receipt_ref TEXT DEFAULT '',
    receipt_note TEXT DEFAULT '',
    receipt_image_b64 TEXT DEFAULT '',
    receipt_submitted_at TEXT DEFAULT '',
    webhook_delivered_at TEXT DEFAULT '',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_orders_status_payable ON payment_orders (status, payable_amount_rial)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id ON payment_orders (order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_orders_phone ON payment_orders (phone, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS payment_sms_logs (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    msg_hash TEXT NOT NULL UNIQUE,
    sender TEXT DEFAULT '',
    body_sanitized TEXT DEFAULT '',
    received_at TEXT NOT NULL,
    parsed_amount_rial INTEGER NOT NULL DEFAULT 0,
    is_deposit INTEGER NOT NULL DEFAULT 0,
    matched_payment_id TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ignored_non_deposit',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_sms_logs_created ON payment_sms_logs (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS phone_verifications (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    phone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    tg_user_id TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified_at TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON phone_verifications (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS payment_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL DEFAULT '',
    login_id TEXT NOT NULL UNIQUE,
    login_type TEXT NOT NULL DEFAULT 'phone',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    phone_verified_at TEXT DEFAULT '',
    tg_user_id TEXT DEFAULT '',
    tg_username TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    last_login_at TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL,
    plan_id TEXT DEFAULT '',
    plan_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    price TEXT DEFAULT '',
    features TEXT DEFAULT '[]',
    auto_renew INTEGER DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    related_id TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
];

const PAYMENT_ALTERS = [
  `ALTER TABLE users ADD COLUMN login_type TEXT DEFAULT 'phone'`,
  `ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN phone_verified_at TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN tg_user_id TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN tg_username TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''`,
  `ALTER TABLE bot_orders ADD COLUMN payment_id TEXT DEFAULT ''`,
  `ALTER TABLE payment_devices ADD COLUMN pair_code TEXT DEFAULT ''`,
  `ALTER TABLE payment_devices ADD COLUMN pair_token TEXT DEFAULT ''`,
  `ALTER TABLE payment_devices ADD COLUMN pair_expires_at TEXT DEFAULT ''`,
];

const initializedDbs = new WeakSet<object>();

export const ensurePaymentTables = async (env: PaymentEnv): Promise<void> => {
  if (env.DB && typeof env.DB === 'object' && initializedDbs.has(env.DB as object)) {
    return;
  }
  await env.DB.batch(PAYMENT_DDL.map((sql) => env.DB.prepare(sql)));
  for (const sql of PAYMENT_ALTERS) {
    try {
      await env.DB.prepare(sql).run();
    } catch {
      /* table or column already exists */
    }
  }
  // Seed card from BOT_CARD_NUMBER env var if admin hasn't added a card yet
  const envCard = cleanCardNumber(String(env.BOT_CARD_NUMBER || ''));
  if (envCard.length === 16) {
    const existing = await env.DB.prepare(`SELECT id FROM payment_cards LIMIT 1`).first<{ id: string }>();
    if (!existing) {
      const bank = detectIranBank(envCard);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO payment_cards (id, card_number, holder_name, iban, bank_name, bank_slug, is_active, priority, daily_limit_rial, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', ?4, ?5, 1, 1, 0, ?6, ?7)`
      )
        .bind('card-env-default', envCard, String(env.BOT_CARD_HOLDER || 'امید عدلی').trim() || 'امید عدلی', bank.name, bank.slug, now, now)
        .run()
        .catch(() => {});
    }
  }
  if (env.DB && typeof env.DB === 'object') {
    initializedDbs.add(env.DB as object);
  }
};

export const getPaymentSettingsMap = async (env: PaymentEnv): Promise<Record<string, string>> => {
  await ensurePaymentTables(env);
  const out: Record<string, string> = {};
  try {
    const rows = (await env.DB.prepare(`SELECT key, value FROM payment_settings`).all<{ key: string; value: string }>()).results || [];
    for (const r of rows) {
      if (r && r.key) out[r.key] = String(r.value || '');
    }
  } catch {
    /* ignore */
  }
  return out;
};

export const setPaymentSettings = async (env: PaymentEnv, entries: Record<string, string>): Promise<void> => {
  await ensurePaymentTables(env);
  const nowIso = new Date().toISOString();
  for (const [k, v] of Object.entries(entries)) {
    await env.DB.prepare(
      `INSERT INTO payment_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
      .bind(k, String(v ?? ''), nowIso)
      .run();
  }
};

/**
 * Resolve any configured Gemini API key for forensic bank receipt OCR:
 *  1) `payment_settings.receipt_gemini_key` (set inside `/sms-bridge` or admin)
 *  2) `env.TELEGRAM_RECEIPT_GEMINI_API_KEY`
 *  3) `env.GEMINI_API_KEY`
 *  4) First enabled Gemini slot in D1 `ai_keys` table (already entered in site AI panel!)
 */
export const resolveReceiptVisionKey = async (env: PaymentEnv, settingsMap?: Record<string, string>): Promise<string> => {
  const s = settingsMap || (await getPaymentSettingsMap(env));
  const explicit =
    String(s.receipt_gemini_key || '').trim() ||
    String(env.TELEGRAM_RECEIPT_GEMINI_API_KEY || '').trim() ||
    String(env.GEMINI_API_KEY || '').trim();
  if (explicit) return explicit;

  try {
    const rows = (
      await env.DB.prepare(`SELECT keys_json FROM ai_keys`).all<{ keys_json: string }>()
    ).results || [];
    for (const row of rows) {
      if (!row?.keys_json) continue;
      const parsed = JSON.parse(row.keys_json);
      const list = Array.isArray(parsed) ? parsed : [];
      for (const slot of list) {
        if (slot && slot.enabled !== false && slot.provider === 'gemini' && typeof slot.apiKey === 'string' && slot.apiKey.trim().length > 15) {
          return slot.apiKey.trim();
        }
      }
    }
  } catch {
    /* ai_keys optional in minimal test schemas */
  }
  return '';
};

/**
 * Hydrate `env` with live dynamic values stored via `/sms-bridge` 1-step setup
 * (`payment_settings` + primary active `payment_cards` + site Gemini key) so
 * Website Checkout, Receipt OCR, and Telegram Bot stay 100% synchronized.
 */
export const hydratePaymentEnv = async <T extends PaymentEnv>(env: T): Promise<T> => {
  await ensurePaymentTables(env);
  const s = await getPaymentSettingsMap(env);
  const card = await env.DB.prepare(
    `SELECT * FROM payment_cards WHERE is_active = 1 ORDER BY priority ASC, created_at ASC LIMIT 1`
  )
    .first<PaymentCardRow>()
    .catch(() => null);
  const visionKey = await resolveReceiptVisionKey(env, s);

  return {
    ...env,
    TELEGRAM_BOT_TOKEN: String(s.telegram_bot_token || env.TELEGRAM_BOT_TOKEN || '').trim(),
    TELEGRAM_WEBHOOK_SECRET: String(s.telegram_webhook_secret || env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
    TELEGRAM_ADMIN_IDS: String(s.telegram_admin_ids || env.TELEGRAM_ADMIN_IDS || '').trim(),
    TELEGRAM_BOT_USERNAME: String(s.telegram_bot_username || env.TELEGRAM_BOT_USERNAME || '').trim(),
    TELEGRAM_RECEIPT_GEMINI_API_KEY: visionKey,
    BOT_CARD_NUMBER: String(card?.card_number || env.BOT_CARD_NUMBER || '').trim(),
    BOT_CARD_HOLDER: String(card?.holder_name || env.BOT_CARD_HOLDER || '').trim(),
    BOT_CARD_BANK: String(card?.bank_name || env.BOT_CARD_BANK || '').trim(),
  };
};

/**
 * Cross-table duplicate tracking reference detector across BOTH `payment_orders`
 * (website/gateway) and `bot_orders` (Telegram) so a single bank transfer
 * reference can NEVER be replayed across channels.
 */
export const isReceiptRefUsedAnywhere = async (
  env: PaymentEnv,
  rawRef: string,
  excludePaymentId = '',
  excludeBotOrderId = ''
): Promise<boolean> => {
  const ref = toLatinDigits(String(rawRef || '')).replace(/\D/g, '');
  if (!ref) return false;
  await ensurePaymentTables(env);

  const gwDup = await env.DB.prepare(
    `SELECT id FROM payment_orders
     WHERE receipt_ref = ?1 AND status IN ('paid', 'needs_review') AND id <> ?2
     LIMIT 1`
  )
    .bind(ref, excludePaymentId)
    .first<{ id: string }>()
    .catch(() => null);
  if (gwDup) return true;

  const botDup = await env.DB.prepare(
    `SELECT id FROM bot_orders
     WHERE ref_code = ?1 AND status NOT IN ('rejected', 'awaiting_payment') AND id <> ?2
     LIMIT 1`
  )
    .bind(ref, excludeBotOrderId)
    .first<{ id: string }>()
    .catch(() => null);
  return Boolean(botDup);
};

export const sweepExpiredPayments = async (env: PaymentEnv, nowMs = Date.now()): Promise<void> => {
  const nowIso = new Date(nowMs).toISOString();
  await env.DB.prepare(
    `UPDATE payment_orders SET status = 'expired', updated_at = ?1 WHERE status = 'pending' AND expires_at <= ?2`
  )
    .bind(nowIso, nowIso)
    .run()
    .catch(() => {});
};

/* --------------------- Unique Payable Amount Engine ---------------------- */

/**
 * Allocate a unique payable amount (in Rial) slightly LESS than `amountRial`:
 *  - Rounded to 10 Rial (= integer Toman) so both Rial and Toman banking apps
 *    accept the exact figure without rounding.
 *  - Never collides with any currently `pending` payment OR any payment created
 *    or paid within the last 2 hours (`UNIQUE_AMOUNT_COOLDOWN_MS`).
 */
export const allocateUniquePayableAmount = async (
  env: PaymentEnv,
  amountRial: number,
  nowMs = Date.now()
): Promise<number> => {
  const baseRial = Math.floor(amountRial / 10) * 10;
  const cooldownSinceIso = new Date(nowMs - UNIQUE_AMOUNT_COOLDOWN_MS).toISOString();

  const rows = await env.DB.prepare(
    `SELECT payable_amount_rial FROM payment_orders
     WHERE status = 'pending' OR created_at >= ?1 OR (paid_at <> '' AND paid_at >= ?2)`
  )
    .bind(cooldownSinceIso, cooldownSinceIso)
    .all<{ payable_amount_rial: number }>();

  const taken = new Set<number>((rows.results || []).map((r) => Number(r.payable_amount_rial)));

  // Tier 1: 1..99 Toman discount (10..990 Rial — exact Payexa 10..1,000 Rial range when possible,
  // or 10..990 Toman = 100..9,900 Rial for larger orders; let's prefer 1..99 Toman = 10..990 Rial first!).
  // Wait: 1 Toman = 10 Rial, so delta = k * 10 Rial for k in 1..99 gives 10..990 Rial (1..99 Toman)!
  // Let's shuffle 1..99 so amounts look non-sequential and unpredictable to spoofers.
  const pickFromRange = (minStep: number, maxStep: number): number | null => {
    const maxAllowedStep = Math.min(maxStep, Math.floor((baseRial - 1000) / 10));
    if (maxAllowedStep < minStep) return null;
    const pool: number[] = [];
    for (let k = minStep; k <= maxAllowedStep; k++) {
      // Avoid multiples of 100 Rial (10 Toman) where possible so buyers notice it's a unique unrounded amount
      const candidate = baseRial - k * 10;
      if (candidate > 0 && !taken.has(candidate)) pool.push(candidate);
    }
    if (!pool.length) return null;
    const nonRound = pool.filter((v) => v % 100 !== 0);
    const list = nonRound.length ? nonRound : pool;
    const rnd = new Uint32Array(1);
    (globalThis as any).crypto.getRandomValues(rnd);
    return list[rnd[0] % list.length];
  };

  return (
    pickFromRange(1, 99) ?? // 10 .. 990 Rial (1 .. 99 Toman less)
    pickFromRange(100, 499) ?? // 1,000 .. 4,990 Rial (100 .. 499 Toman less)
    pickFromRange(500, 1999) ?? // high-concurrency overflow
    Math.max(1000, baseRial - 10)
  );
};

/* ------------------------- Active Card & Device -------------------------- */

export const pickActiveCard = async (env: PaymentEnv): Promise<PaymentCardRow | null> => {
  await ensurePaymentTables(env);
  const row = await env.DB.prepare(
    `SELECT * FROM payment_cards WHERE is_active = 1 ORDER BY priority ASC, created_at ASC LIMIT 1`
  ).first<PaymentCardRow>();
  return row || null;
};

export const getOnlineDeviceSummary = async (env: PaymentEnv, nowMs = Date.now()) => {
  await ensurePaymentTables(env);
  const rows = (
    await env.DB.prepare(`SELECT * FROM payment_devices WHERE is_active = 1 ORDER BY last_seen_at DESC`).all<PaymentDeviceRow>()
  ).results || [];
  const onlineCutoff = nowMs - DEVICE_ONLINE_THRESHOLD_MS;
  const onlineDevices = rows.filter((d) => d.last_seen_at && Date.parse(d.last_seen_at) >= onlineCutoff);
  return {
    totalActive: rows.length,
    onlineCount: onlineDevices.length,
    isOnline: onlineDevices.length > 0,
    latestSeenAt: rows[0]?.last_seen_at || '',
    devices: rows,
  };
};

/* ---------------------------- Create Payment ----------------------------- */

export interface CreatePaymentInput {
  /** Order amount in Rials (minimum 10,000 Rial = 1,000 Toman) */
  amountRial: number;
  orderId: string;
  source?: 'website' | 'telegram' | 'api';
  callbackUrl?: string;
  returnUrl?: string;
  description?: string;
  metadata?: unknown;
  phone?: string;
  userId?: string;
  tgUserId?: string;
  productId?: string;
  productName?: string;
  planId?: string;
  planName?: string;
  apiKeyId?: string;
  originUrl?: string;
  nowMs?: number;
}

export interface CreatePaymentSuccess {
  ok: true;
  httpStatus: number;
  buyerSecret?: string;
  data: {
    payment_id: string;
    payment_url: string;
    telegram_url: string | null;
    order_id: string;
    status: string;
    created: boolean;
    amount: number;
    amount_toman: number;
    payable_amount: number;
    payable_amount_toman: number;
    expires_at: string;
    card: {
      number: string;
      formatted: string;
      holder_name: string;
      bank: string;
      bank_slug: string;
    };
    currency: 'IRR';
    description: string;
    metadata: unknown;
  };
}

const siteOrigin = (env: PaymentEnv, fallbackOrigin = ''): string =>
  String(fallbackOrigin || env.SITE_URL || 'https://omidadli.site').replace(/\/+$/, '');

const formatPaymentData = (
  row: PaymentOrderRow,
  env: PaymentEnv,
  created: boolean,
  originUrl = ''
): CreatePaymentSuccess['data'] => {
  const base = siteOrigin(env, originUrl);
  const botUsername = String(env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  let metadata: unknown = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch {
      metadata = null;
    }
  }
  return {
    payment_id: row.id,
    payment_url: `${base}/pay/${encodeURIComponent(row.id)}`,
    telegram_url: botUsername ? `https://t.me/${botUsername}?start=pay_${encodeURIComponent(row.id)}` : null,
    order_id: row.order_id,
    status: row.status,
    created,
    amount: row.amount_rial,
    amount_toman: Math.floor(row.amount_rial / 10),
    payable_amount: row.payable_amount_rial,
    payable_amount_toman: Math.floor(row.payable_amount_rial / 10),
    expires_at: row.expires_at,
    card: {
      number: row.card_number,
      formatted: formatCardNumber(row.card_number),
      holder_name: row.card_holder,
      bank: row.card_bank,
      bank_slug: row.card_bank_slug || 'shetab',
    },
    currency: 'IRR',
    description: row.description || '',
    metadata,
  };
};

export const createGatewayPayment = async (
  env: PaymentEnv,
  input: CreatePaymentInput
): Promise<CreatePaymentSuccess | PaymentErrorShape> => {
  await ensurePaymentTables(env);
  const nowMs = input.nowMs ?? Date.now();
  await sweepExpiredPayments(env, nowMs);

  const amountRial = Math.round(Number(input.amountRial || 0));
  if (!Number.isFinite(amountRial) || amountRial < 10_000) {
    return {
      ok: false,
      httpStatus: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'مبلغ سفارش باید حداقل ۱۰٬۰۰۰ ریال (۱٬۰۰۰ تومان) باشد.',
        fields: { amount: 'حداقل ۱۰٬۰۰۰ ریال' },
      },
    };
  }

  const orderId = String(input.orderId || '').trim();
  if (!orderId || orderId.length > 100 || !/^[A-Za-z0-9\-_.:/]+$/.test(orderId)) {
    return {
      ok: false,
      httpStatus: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'شناسه سفارش (order_id) نامعتبر است.',
        fields: { order_id: 'الزامی، حداکثر ۱۰۰ کاراکتر انگلیسی/عدد' },
      },
    };
  }

  // Optional strict check: reject if merchant's phone SMS forwarder is offline
  if (String(env.PAYMENT_REQUIRE_ONLINE_DEVICE || '').toLowerCase() === 'true') {
    const devStatus = await getOnlineDeviceSummary(env, nowMs);
    if (!devStatus.isOnline) {
      return {
        ok: false,
        httpStatus: 503,
        error: {
          code: 'MERCHANT_TEMPORARILY_INACTIVE',
          message: 'گوشی دریافت پیامک‌های بانکی موقتاً برخط نیست؛ لطفاً چند لحظه دیگر تلاش کنید.',
        },
      };
    }
  }

  // Idempotency check on order_id (Payexa v2 behavior)
  const existing = await env.DB.prepare(
    `SELECT * FROM payment_orders WHERE order_id = ?1 ORDER BY created_at DESC LIMIT 1`
  )
    .bind(orderId)
    .first<PaymentOrderRow>();

  if (existing) {
    if (existing.status === 'pending' && Date.parse(existing.expires_at) > nowMs) {
      if (existing.amount_rial !== amountRial) {
        return {
          ok: false,
          httpStatus: 409,
          error: {
            code: 'ORDER_ID_CONFLICT',
            message: 'برای این شماره سفارش، پرداخت فعالی با مبلغ متفاوت در انتظار واریز است.',
          },
        };
      }
      return {
        ok: true,
        httpStatus: 200,
        data: formatPaymentData(existing, env, false, input.originUrl),
      };
    }
    if (existing.status === 'paid') {
      return {
        ok: false,
        httpStatus: 409,
        error: {
          code: 'ORDER_ID_CONFLICT',
          message: 'این سفارش پیش‌تر با موفقیت پرداخت شده است.',
        },
      };
    }
  }

  const card = await pickActiveCard(env);
  if (!card) {
    return {
      ok: false,
      httpStatus: 503,
      error: {
        code: 'NO_ACTIVE_CARD',
        message: 'در حال حاضر کارت بانکی فعالی در درگاه ثبت نشده است. از پنل مدیریت کارت خود را ثبت کنید.',
      },
    };
  }

  const payableAmountRial = await allocateUniquePayableAmount(env, amountRial, nowMs);
  const paymentId = randomHex(16).toUpperCase();
  const buyerSecret = randomHex(16);
  const buyerSecretHash = await sha256Hex(buyerSecret);
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + PAYMENT_TTL_MS).toISOString();
  const phone = input.phone ? normalizePhone(input.phone) : '';
  const metadataJson = input.metadata !== undefined && input.metadata !== null ? JSON.stringify(input.metadata).slice(0, 2048) : '';

  const row: PaymentOrderRow = {
    id: paymentId,
    order_id: orderId,
    source: input.source || 'website',
    status: 'pending',
    amount_rial: amountRial,
    payable_amount_rial: payableAmountRial,
    card_id: card.id,
    card_number: card.card_number,
    card_holder: card.holder_name,
    card_bank: card.bank_name,
    card_bank_slug: card.bank_slug || 'shetab',
    phone,
    user_id: String(input.userId || ''),
    tg_user_id: String(input.tgUserId || ''),
    product_id: String(input.productId || ''),
    product_name: String(input.productName || ''),
    plan_id: String(input.planId || ''),
    plan_name: String(input.planName || ''),
    description: String(input.description || '').slice(0, 255),
    callback_url: String(input.callbackUrl || ''),
    return_url: String(input.returnUrl || ''),
    metadata_json: metadataJson,
    api_key_id: String(input.apiKeyId || ''),
    buyer_secret_hash: buyerSecretHash,
    matched_sms_id: '',
    paid_at: '',
    verified_at: '',
    fulfilled_at: '',
    access_code: '',
    access_expires_at: '',
    receipt_ref: '',
    receipt_note: '',
    receipt_image_b64: '',
    receipt_submitted_at: '',
    webhook_delivered_at: '',
    expires_at: expiresAt,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await env.DB.prepare(
    `INSERT INTO payment_orders (
      id, order_id, source, status, amount_rial, payable_amount_rial,
      card_id, card_number, card_holder, card_bank, card_bank_slug,
      phone, user_id, tg_user_id, product_id, product_name, plan_id, plan_name,
      description, callback_url, return_url, metadata_json, api_key_id, buyer_secret_hash,
      matched_sms_id, paid_at, verified_at, fulfilled_at, access_code, access_expires_at,
      receipt_ref, receipt_note, receipt_image_b64, receipt_submitted_at, webhook_delivered_at,
      expires_at, created_at, updated_at
    ) VALUES (
      ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,
      ?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36,?37,?38
    )`
  )
    .bind(
      row.id, row.order_id, row.source, row.status, row.amount_rial, row.payable_amount_rial,
      row.card_id, row.card_number, row.card_holder, row.card_bank, row.card_bank_slug,
      row.phone, row.user_id, row.tg_user_id, row.product_id, row.product_name, row.plan_id, row.plan_name,
      row.description, row.callback_url, row.return_url, row.metadata_json, row.api_key_id, row.buyer_secret_hash,
      row.matched_sms_id, row.paid_at, row.verified_at, row.fulfilled_at, row.access_code, row.access_expires_at,
      row.receipt_ref, row.receipt_note, row.receipt_image_b64, row.receipt_submitted_at, row.webhook_delivered_at,
      row.expires_at, row.created_at, row.updated_at
    )
    .run();

  return {
    ok: true,
    httpStatus: 201,
    buyerSecret,
    data: formatPaymentData(row, env, true, input.originUrl),
  };
};

/* --------------------- Fulfillment & Signed Webhooks --------------------- */

const fmtNumber = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const notifyAdminsTelegram = async (env: PaymentEnv, html: string, buttons?: tg.TgKeyboardButton[][]): Promise<void> => {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return;
  const admins = String(env.TELEGRAM_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const adminId of admins) {
    await tg.sendMessage(token, adminId, html, buttons ? { reply_markup: tg.inlineKeyboard(buttons) } : {}).catch(() => {});
  }
};

/**
 * Once a payment becomes `paid` (either automatically via Bank SMS or via Admin
 * manual approval of a fallback receipt), fulfill the order atomically:
 *  - Grant/extend `tool_access` + sync `user_subscriptions` on the website
 *  - Deliver the access code on Telegram (if buyer came from Telegram or has a verified Telegram account)
 *  - Notify admins on Telegram
 *  - Dispatch HMAC-signed webhook to `callback_url` (if configured)
 */
export const fulfillGatewayPayment = async (
  rawEnv: PaymentEnv,
  paymentId: string,
  via: string
): Promise<PaymentOrderRow | null> => {
  const env = await hydratePaymentEnv(rawEnv);
  const order = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
  if (!order || order.status !== 'paid') return order || null;

  const nowIso = new Date().toISOString();

  // Atomic claim so concurrent SMS/admin/verify calls never double-fulfill
  if (!order.fulfilled_at && order.product_id) {
    const claim = await env.DB.prepare(
      `UPDATE payment_orders SET fulfilled_at = ?1, updated_at = ?2 WHERE id = ?3 AND fulfilled_at = ''`
    )
      .bind(nowIso, nowIso, order.id)
      .run();

    if ((claim.meta?.changes ?? 0) > 0) {
      let buyerPhone = normalizePhone(order.phone || '');
      if (!buyerPhone && order.user_id) {
        const u = await env.DB.prepare(`SELECT phone FROM users WHERE id = ?1`).bind(order.user_id).first<{ phone: string }>();
        buyerPhone = normalizePhone(u?.phone || '');
      }

      if (buyerPhone || order.user_id) {
        const product = botProduct(order.product_id);
        const plan = order.plan_id ? botPlan(order.product_id, order.plan_id) : undefined;
        const productName = order.product_name || product?.name || order.product_id;
        const planName = order.plan_name || plan?.name || '';
        const toman = Math.floor(order.amount_rial / 10);

        const verifiedPhoneOwner = buyerPhone
          ? await findSiteUserByPhone(env, buyerPhone, order.tg_user_id || '').catch(() => null)
          : null;

        const grant = await grantToolAccess(env, {
          phone: buyerPhone,
          userId: order.user_id || verifiedPhoneOwner?.id || undefined,
          productId: order.product_id,
          planId: order.plan_id || undefined,
          note: `gateway ${via} (${order.id})`,
          productName,
          priceLabel: plan?.price || `${fmtNumber(toman)} تومان`,
          features: plan?.perks,
          channelLabel: order.source === 'telegram' ? 'ربات تلگرام' : 'درگاه پرداخت خودکار',
        });

        const resolvedUserId = order.user_id || verifiedPhoneOwner?.id || grant.subscriptionUserId || '';

        await env.DB.prepare(
          `UPDATE payment_orders
           SET phone = ?1,
               user_id = CASE WHEN user_id = '' THEN ?2 ELSE user_id END,
               access_code = ?3,
               access_expires_at = ?4,
               updated_at = ?5
           WHERE id = ?6`
        )
          .bind(buyerPhone, resolvedUserId, grant.code, grant.expiresAt, nowIso, order.id)
          .run();

        order.phone = buyerPhone;
        order.user_id = resolvedUserId;
        order.access_code = grant.code;
        order.access_expires_at = grant.expiresAt;
        order.fulfilled_at = nowIso;

        // Ensure user_subscriptions is synced ONLY for verified phone ownership
        if (verifiedPhoneOwner?.id && buyerPhone) {
          await syncPhoneGrantsToUser(env, verifiedPhoneOwner.id, buyerPhone).catch(() => {});
        }

        // Update linked bot_orders row if this originated in Telegram
        try {
          await ensureBotTables(env);
          const botOrd = await env.DB.prepare(
            `SELECT id FROM bot_orders WHERE id = ?1 OR payment_id = ?2 LIMIT 1`
          )
            .bind(order.order_id, order.id)
            .first<{ id: string }>();
          if (botOrd) {
            await updateBotOrder(env as any, botOrd.id, {
              status: 'fulfilled',
              decided_at: nowIso,
              decided_by: via,
            });
          }

          // Deliver on Telegram if tg_user_id is known OR phone is linked in bot_users
          let targetTgId = order.tg_user_id;
          if (!targetTgId && buyerPhone) {
            const linked = await env.DB.prepare(
              `SELECT tg_user_id FROM bot_users WHERE phone = ?1 AND verified_at <> '' LIMIT 1`
            )
              .bind(buyerPhone)
              .first<{ tg_user_id: string }>();
            targetTgId = linked?.tg_user_id || '';
          }

          const delId = `del-${Date.now().toString(36)}-${randomHex(3)}`;
          await insertDelivery(env as any, {
            id: delId,
            tg_user_id: targetTgId,
            phone: buyerPhone,
            product_id: order.product_id,
            product_name: productName,
            plan_name: planName,
            order_id: order.order_id,
            status: targetTgId && env.TELEGRAM_BOT_TOKEN ? 'pending_send' : 'queued',
            source: order.source === 'telegram' ? 'order' : 'website',
            code: grant.code,
            expires_at: grant.expiresAt,
            note: via,
            created_at: nowIso,
            delivered_at: '',
          });

          if (targetTgId && env.TELEGRAM_BOT_TOKEN) {
            const base = siteOrigin(env);
            let directLaunchUrl = `${base}${botProductPath(order.product_id)}?open=chat`;
            let profileLaunchUrl = `${base}/profile`;
            const tgLinkedUser = buyerPhone
              ? await findSiteUserByPhone(env, buyerPhone, targetTgId).catch(() => null)
              : null;
            if (tgLinkedUser?.id) {
              const magic = await createWebMagicLoginToken(env, tgLinkedUser.id, buyerPhone).catch(() => '');
              if (magic) {
                directLaunchUrl = `${base}${botProductPath(order.product_id)}?tg_auth=${magic}&open=chat`;
                profileLaunchUrl = `${base}/profile?tg_auth=${magic}`;
              }
            }
            const canUseInlineUrl = /^https:\/\/(?!localhost\b)/i.test(base);
            const msgLines = [
              '🎉 <b>پرداخت شما تأیید و اشتراک در اکانت سایت شما فعال شد!</b>',
              '',
              `📦 سرویس: <b>${tg.escapeHtml(productName)}</b>${planName ? ` — ${tg.escapeHtml(planName)}` : ''}`,
              `📅 اعتبار تا: <b>${grant.expiresAt.slice(0, 10)}</b>`,
              `🔑 کد پشتیبانی اختصاصی: <code>${tg.escapeHtml(grant.code)}</code>`,
              '',
              tgLinkedUser?.id
                ? '✨ <b>سرویس در پروفایل کاربری شما فعال است!</b> روی دکمه زیر بزنید تا بدون نیاز به وارد کردن هیچ کدی مستقیماً وارد سرویس شوید:'
                : '📱 برای استفاده مستقیم وارد لینک زیر شوید:',
            ];
            if (!canUseInlineUrl) {
              msgLines.push(`🚀 ورود مستقیم به سرویس:\n${tg.escapeHtml(directLaunchUrl)}`);
              msgLines.push(`👤 پروفایل کاربری:\n${tg.escapeHtml(profileLaunchUrl)}`);
            }
            msgLines.push(`🆔 شناسه پرداخت: <code>${tg.escapeHtml(order.id)}</code>`);

            if (canUseInlineUrl) {
              await tg
                .sendMessage(env.TELEGRAM_BOT_TOKEN, targetTgId, msgLines.join('\n'), {
                  reply_markup: tg.inlineKeyboard([
                    [{ text: '🚀 ورود مستقیم و استفاده از سرویس', url: directLaunchUrl }],
                    [{ text: '👤 مشاهده اشتراک در پروفایل من', url: profileLaunchUrl }],
                  ]),
                })
                .catch(() => {});
            } else {
              await tg
                .sendMessage(env.TELEGRAM_BOT_TOKEN, targetTgId, msgLines.join('\n'), {
                  reply_markup: tg.mainMenuKeyboard(),
                })
                .catch(() => {});
            }

            await env.DB.prepare(`UPDATE bot_deliveries SET status = 'delivered', delivered_at = ?1 WHERE id = ?2`)
              .bind(nowIso, delId)
              .run()
              .catch(() => {});
          }
        } catch {
          /* Telegram tables/token optional when running website-only */
        }

        // Notify admins
        await notifyAdminsTelegram(
          env,
          [
            `💸 <b>پرداخت موفق (${via === 'sms' ? 'تأیید خودکار پیامک بانکی' : tg.escapeHtml(via)})</b>`,
            `📦 ${tg.escapeHtml(productName)}${planName ? ` — ${tg.escapeHtml(planName)}` : ''}`,
            `💰 مبلغ یکتا: <b>${fmtNumber(order.payable_amount_rial)} ریال</b> (${fmtNumber(Math.floor(order.payable_amount_rial / 10))} تومان)`,
            `📱 مشتری: <code>${tg.escapeHtml(buyerPhone || order.user_id)}</code> (${order.source})`,
            `👤 اکانت سایت: ${resolvedUserId ? 'فعال و متصل ✅' : 'مهمان'}`,
            `🔑 کد دسترسی: <code>${tg.escapeHtml(grant.code)}</code>`,
            `🆔 پرداخت: <code>${tg.escapeHtml(order.id)}</code>`,
          ].join('\n')
        );
      }
    }
  }

  // Signed server-to-server webhook callback (for external websites / bots using API v2)
  if (order.callback_url && /^https?:\/\//i.test(order.callback_url) && !order.webhook_delivered_at) {
    try {
      let signingKey = String(env.AUTH_SECRET || 'omidpay-default-secret');
      if (order.api_key_id) {
        const keyRow = await env.DB.prepare(`SELECT signing_secret FROM payment_api_keys WHERE id = ?1`)
          .bind(order.api_key_id)
          .first<{ signing_secret: string }>();
        if (keyRow?.signing_secret) signingKey = keyRow.signing_secret;
      }
      const payloadStr = JSON.stringify({
        event: 'payment.paid',
        payment_id: order.id,
        order_id: order.order_id,
        status: 'paid',
        amount: order.amount_rial,
        payable_amount: order.payable_amount_rial,
        paid_at: order.paid_at || nowIso,
      });
      const sigHeader = await buildPayexaSignature(signingKey, payloadStr);
      const res = await fetch(order.callback_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payexa-Event': 'payment.paid',
          'X-Payexa-Signature': sigHeader,
        },
        body: payloadStr,
      });
      if (res.ok) {
        await env.DB.prepare(`UPDATE payment_orders SET webhook_delivered_at = ?1 WHERE id = ?2`)
          .bind(nowIso, order.id)
          .run()
          .catch(() => {});
      }
    } catch {
      /* best-effort webhook */
    }
  }

  return await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
};

/* ------------------------- Verify Endpoint Core -------------------------- */

export const verifyGatewayPayment = async (
  env: PaymentEnv,
  paymentId: string,
  expectedAmountRial?: number
): Promise<
  | {
      ok: true;
      httpStatus: 200;
      data: {
        payment_id: string;
        order_id: string;
        status: 'paid';
        first_verification: boolean;
        amount: number;
        payable_amount: number;
        paid_at: string;
        access_code?: string;
        metadata: unknown;
      };
    }
  | PaymentErrorShape
> => {
  await ensurePaymentTables(env);
  await sweepExpiredPayments(env);

  const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
  if (!row) {
    return {
      ok: false,
      httpStatus: 404,
      error: { code: 'PAYMENT_NOT_FOUND', message: 'پرداخت مورد نظر یافت نشد.' },
    };
  }

  if (expectedAmountRial !== undefined && Number(expectedAmountRial) > 0 && Math.round(Number(expectedAmountRial)) !== row.amount_rial) {
    return {
      ok: false,
      httpStatus: 409,
      error: { code: 'AMOUNT_MISMATCH', message: 'مبلغ ارسال‌شده در درخواست تأیید با مبلغ سفارش مطابقت ندارد.' },
    };
  }

  if (row.status === 'pending' || row.status === 'needs_review') {
    return {
      ok: false,
      httpStatus: 409,
      error: { code: 'PAYMENT_NOT_PAID', message: 'هنوز واریزی برای این سفارش تأیید نشده است.' },
    };
  }

  if (row.status !== 'paid') {
    return {
      ok: false,
      httpStatus: 409,
      error: { code: 'PAYMENT_EXPIRED', message: 'مهلت پرداخت به پایان رسیده یا سفارش لغو شده است.' },
    };
  }

  const nowIso = new Date().toISOString();
  const claim = await env.DB.prepare(
    `UPDATE payment_orders SET verified_at = ?1, updated_at = ?2 WHERE id = ?3 AND verified_at = ''`
  )
    .bind(nowIso, nowIso, row.id)
    .run();
  const firstVerification = (claim.meta?.changes ?? 0) > 0;

  // Ensure internal fulfillment also ran
  const fresh = (await fulfillGatewayPayment(env, row.id, 'verify')) || row;

  let metadata: unknown = null;
  if (fresh.metadata_json) {
    try {
      metadata = JSON.parse(fresh.metadata_json);
    } catch {
      metadata = null;
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    data: {
      payment_id: fresh.id,
      order_id: fresh.order_id,
      status: 'paid',
      first_verification: firstVerification,
      amount: fresh.amount_rial,
      payable_amount: fresh.payable_amount_rial,
      paid_at: fresh.paid_at,
      access_code: fresh.access_code || undefined,
      metadata,
    },
  };
};

/* --------------------- SMS Ingestion & Auto-Matching --------------------- */

export interface IncomingSmsMessage {
  sender: string;
  body: string;
  receivedAt?: string | number;
  smsId?: string;
}

export interface SmsProcessOutcome {
  status: 'matched' | 'unmatched_deposit' | 'ignored_non_deposit' | 'ignored_otp' | 'duplicate';
  parsed: ParsedBankSms;
  matchedPaymentId: string;
  matchedOrderId: string;
}

export const authenticateDeviceToken = async (env: PaymentEnv, rawToken: string): Promise<PaymentDeviceRow | null> => {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  await ensurePaymentTables(env);
  const hash = await sha256Hex(token);
  const dev = await env.DB.prepare(`SELECT * FROM payment_devices WHERE token_hash = ?1 AND is_active = 1 LIMIT 1`)
    .bind(hash)
    .first<PaymentDeviceRow>();
  return dev || null;
};

export const authenticateMerchantApiKey = async (env: PaymentEnv, rawKey: string): Promise<PaymentApiKeyRow | null> => {
  const key = String(rawKey || '').trim();
  if (!key) return null;
  await ensurePaymentTables(env);
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare(`SELECT * FROM payment_api_keys WHERE key_hash = ?1 AND is_active = 1 LIMIT 1`)
    .bind(hash)
    .first<PaymentApiKeyRow>();
  if (row) {
    await env.DB.prepare(`UPDATE payment_api_keys SET last_used_at = ?1 WHERE id = ?2`)
      .bind(new Date().toISOString(), row.id)
      .run()
      .catch(() => {});
  }
  return row || null;
};

export const recordDeviceHeartbeat = async (
  env: PaymentEnv,
  deviceId: string,
  meta: { batteryLevel?: number; deviceModel?: string; appVersion?: string } = {}
): Promise<void> => {
  const nowIso = new Date().toISOString();
  const battery = typeof meta.batteryLevel === 'number' && Number.isFinite(meta.batteryLevel)
    ? Math.max(-1, Math.min(100, Math.round(meta.batteryLevel)))
    : -1;
  const modelStr = String(meta.deviceModel || '').slice(0, 80);
  const verStr = String(meta.appVersion || '').slice(0, 40);
  await env.DB.prepare(
    `UPDATE payment_devices
     SET last_seen_at = ?1,
         battery_level = CASE WHEN ?2 >= 0 THEN ?3 ELSE battery_level END,
         device_model = CASE WHEN ?4 <> '' THEN ?5 ELSE device_model END,
         app_version = CASE WHEN ?6 <> '' THEN ?7 ELSE app_version END
     WHERE id = ?8`
  )
    .bind(nowIso, battery, battery, modelStr, modelStr, verStr, verStr, deviceId)
    .run();
};

export const processIncomingBankSms = async (
  env: PaymentEnv,
  deviceId: string,
  msg: IncomingSmsMessage,
  nowMs = Date.now()
): Promise<SmsProcessOutcome> => {
  await ensurePaymentTables(env);
  await sweepExpiredPayments(env, nowMs);

  const sender = String(msg.sender || '').trim().slice(0, 60);
  const rawBody = String(msg.body || '').trim();
  let receivedMs = nowMs;
  if (msg.receivedAt !== undefined && msg.receivedAt !== null && msg.receivedAt !== '') {
    const parsedTime = typeof msg.receivedAt === 'number' ? msg.receivedAt : Date.parse(String(msg.receivedAt));
    if (Number.isFinite(parsedTime) && parsedTime > 0) receivedMs = parsedTime;
  }
  const receivedIso = new Date(receivedMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const parsed = parseIranianBankSms(sender, rawBody);

  // Deduplication hash: same device + sender + normalized text within a 3-minute bucket (or explicit smsId)
  const dedupSeed = msg.smsId
    ? `${deviceId}:id:${msg.smsId}:${parsed.sanitizedText}`
    : `${deviceId}:${sender}:${parsed.sanitizedText}:${Math.floor(receivedMs / 180_000)}`;
  const msgHash = await sha256Hex(dedupSeed);

  const dup = await env.DB.prepare(`SELECT id, matched_payment_id, status FROM payment_sms_logs WHERE msg_hash = ?1 LIMIT 1`)
    .bind(msgHash)
    .first<{ id: string; matched_payment_id: string; status: string }>();
  if (dup) {
    return {
      status: 'duplicate',
      parsed,
      matchedPaymentId: dup.matched_payment_id || '',
      matchedOrderId: '',
    };
  }

  const logId = `sms-${Date.now().toString(36)}-${randomHex(4)}`;

  if (parsed.kind === 'otp_ignored' || !parsed.isDeposit || parsed.amountRial <= 0) {
    const status = parsed.kind === 'otp_ignored' ? 'ignored_otp' : 'ignored_non_deposit';
    await env.DB.prepare(
      `INSERT INTO payment_sms_logs (id, device_id, msg_hash, sender, body_sanitized, received_at, parsed_amount_rial, is_deposit, matched_payment_id, status, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,0,0,'',?7,?8)`
    )
      .bind(logId, deviceId, msgHash, sender, parsed.sanitizedText, receivedIso, status, nowIso)
      .run();
    await env.DB.prepare(`UPDATE payment_devices SET sms_count = sms_count + 1, last_seen_at = ?1 WHERE id = ?2`)
      .bind(nowIso, deviceId)
      .run()
      .catch(() => {});
    return { status, parsed, matchedPaymentId: '', matchedOrderId: '' };
  }

  // Search for a matching open payment (or one that expired within SMS_LATE_GRACE_MS)
  const minExpiresIso = new Date(receivedMs - SMS_LATE_GRACE_MS).toISOString();
  const maxCreatedIso = new Date(receivedMs + SMS_LATE_GRACE_MS).toISOString();

  const candidates = (
    await env.DB.prepare(
      `SELECT * FROM payment_orders
       WHERE payable_amount_rial = ?1
         AND status IN ('pending', 'expired', 'needs_review')
         AND expires_at >= ?2
         AND created_at <= ?3
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC`
    )
      .bind(parsed.amountRial, minExpiresIso, maxCreatedIso)
      .all<PaymentOrderRow>()
  ).results || [];

  // Optional cardLast4 refinement if present in SMS
  let match = candidates[0] || null;
  if (parsed.cardLast4 && candidates.length > 0) {
    const exactCard = candidates.find((c) => c.card_number.endsWith(parsed.cardLast4));
    if (exactCard) match = exactCard;
  }

  if (!match) {
    await env.DB.prepare(
      `INSERT INTO payment_sms_logs (id, device_id, msg_hash, sender, body_sanitized, received_at, parsed_amount_rial, is_deposit, matched_payment_id, status, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,1,'','unmatched_deposit',?8)`
    )
      .bind(logId, deviceId, msgHash, sender, parsed.sanitizedText, receivedIso, parsed.amountRial, nowIso)
      .run();
    await env.DB.prepare(`UPDATE payment_devices SET sms_count = sms_count + 1, last_seen_at = ?1 WHERE id = ?2`)
      .bind(nowIso, deviceId)
      .run()
      .catch(() => {});
    return { status: 'unmatched_deposit', parsed, matchedPaymentId: '', matchedOrderId: '' };
  }

  // Atomically mark order as paid
  const claim = await env.DB.prepare(
    `UPDATE payment_orders
     SET status = 'paid', paid_at = ?1, matched_sms_id = ?2, updated_at = ?3
     WHERE id = ?4 AND status IN ('pending', 'expired', 'needs_review')`
  )
    .bind(nowIso, logId, nowIso, match.id)
    .run();

  if ((claim.meta?.changes ?? 0) === 0) {
    return { status: 'unmatched_deposit', parsed, matchedPaymentId: '', matchedOrderId: '' };
  }

  await env.DB.prepare(
    `INSERT INTO payment_sms_logs (id, device_id, msg_hash, sender, body_sanitized, received_at, parsed_amount_rial, is_deposit, matched_payment_id, status, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,'matched',?9)`
  )
    .bind(logId, deviceId, msgHash, sender, parsed.sanitizedText, receivedIso, parsed.amountRial, match.id, nowIso)
    .run();

  await env.DB.prepare(
    `UPDATE payment_devices SET sms_count = sms_count + 1, matched_count = matched_count + 1, last_seen_at = ?1 WHERE id = ?2`
  )
    .bind(nowIso, deviceId)
    .run()
    .catch(() => {});

  await fulfillGatewayPayment(env, match.id, 'sms');

  return {
    status: 'matched',
    parsed,
    matchedPaymentId: match.id,
    matchedOrderId: match.order_id,
  };
};

/* ------------ Website <-> Telegram Phone Verification & Sync ------------- */

/**
 * Retroactively links any active `tool_access` rows matching `phone` into the
 * website user's `user_subscriptions` table so purchases made before registering
 * (or made in Telegram) show up immediately on the user's profile page.
 */
export const syncPhoneGrantsToUser = async (
  env: { DB: D1Like },
  userId: string,
  rawPhone: string
): Promise<number> => {
  const phone = normalizePhone(rawPhone);
  if (!userId || !phone) return 0;

  let synced = 0;
  try {
    // Clean legacy empty placeholder rows ('حساب کاربری امید عدلی' / 'کاربر جدید')
    await env.DB.prepare(`DELETE FROM user_subscriptions WHERE user_id = ?1 AND product_id = ''`)
      .bind(userId)
      .run()
      .catch(() => {});

    const grants = (
      await env.DB.prepare(`SELECT * FROM tool_access WHERE phone = ?1 AND status = 'active'`).bind(phone).all<any>()
    ).results || [];

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    for (const g of grants) {
      const existingSub = await env.DB.prepare(
        `SELECT id, status, end_date FROM user_subscriptions WHERE user_id = ?1 AND product_id = ?2 LIMIT 1`
      )
        .bind(userId, g.product_id)
        .first<{ id: string; status: string; end_date: string }>();

      const product = botProduct(g.product_id);
      const productName = product?.name || (g.product_id === 'all' ? 'اشتراک کامل همه ابزارها' : g.product_id);
      const endIso = g.expires_at || new Date(nowMs + 30 * 86400_000).toISOString();
      const isExpired = Boolean(g.expires_at && Date.parse(g.expires_at) < nowMs);
      const targetStatus = isExpired ? 'expired' : 'active';

      if (!existingSub) {
        await env.DB.prepare(
          `INSERT INTO user_subscriptions (id, user_id, product_id, product_name, plan_id, plan_name, status, price, features, auto_renew, start_date, end_date, created_at)
           VALUES (?1,?2,?3,?4,'','اشتراک فعال',?5,'پرداخت‌شده','[]',0,?6,?7,?8)`
        )
          .bind(`sub-${nowMs.toString(36)}-${randomHex(3)}`, userId, g.product_id, productName, targetStatus, g.created_at || nowIso, endIso, nowIso)
          .run();
        synced++;
      } else if (existingSub.status !== targetStatus || existingSub.end_date !== endIso) {
        await env.DB.prepare(
          `UPDATE user_subscriptions SET status = ?1, end_date = ?2 WHERE id = ?3`
        )
          .bind(targetStatus, endIso, existingSub.id)
          .run();
      }
    }
  } catch {
    /* non-fatal if tables aren't ready yet */
  }
  return synced;
};

/**
 * Full account subscription reconciler:
 *  1) Removes legacy fake starter rows (`product_id = ''`)
 *  2) Marks expired `user_subscriptions` (`end_date < now`) as `'expired'`
 *  3) Syncs `payment_orders` owned directly by `user_id` (`status = 'paid'`)
 *  4) Syncs `tool_access` rows for `phone` when `isPhoneVerified` is true
 */
export const syncUserAccountGrants = async (
  env: { DB: D1Like },
  userId: string,
  rawPhone: string,
  isPhoneVerified: boolean
): Promise<void> => {
  if (!userId) return;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  try {
    await env.DB.prepare(`DELETE FROM user_subscriptions WHERE user_id = ?1 AND product_id = ''`)
      .bind(userId)
      .run()
      .catch(() => {});

    await env.DB.prepare(
      `UPDATE user_subscriptions SET status = 'expired'
       WHERE user_id = ?1 AND status = 'active' AND end_date <> '' AND end_date < ?2`
    )
      .bind(userId, nowIso)
      .run()
      .catch(() => {});

    // Sync paid orders tied directly to this authenticated user_id
    const paidOrders = (
      await env.DB.prepare(
        `SELECT * FROM payment_orders WHERE user_id = ?1 AND status = 'paid' AND product_id <> '' ORDER BY created_at DESC LIMIT 25`
      )
        .bind(userId)
        .all<PaymentOrderRow>()
        .catch(() => ({ results: [] as PaymentOrderRow[] }))
    ).results || [];

    for (const po of paidOrders) {
      const existingSub = await env.DB.prepare(
        `SELECT id FROM user_subscriptions WHERE user_id = ?1 AND product_id = ?2 LIMIT 1`
      )
        .bind(userId, po.product_id)
        .first<{ id: string }>();
      if (!existingSub) {
        const product = botProduct(po.product_id);
        const plan = po.plan_id ? botPlan(po.product_id, po.plan_id) : undefined;
        const endIso = po.access_expires_at || new Date((Date.parse(po.paid_at || po.created_at) || nowMs) + 30 * 86400_000).toISOString();
        const isExp = Date.parse(endIso) < nowMs;
        await env.DB.prepare(
          `INSERT INTO user_subscriptions (id, user_id, product_id, product_name, plan_id, plan_name, status, price, features, auto_renew, start_date, end_date, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,?12)`
        )
          .bind(
            `sub-${nowMs.toString(36)}-${randomHex(3)}`,
            userId,
            po.product_id,
            po.product_name || product?.name || po.product_id,
            po.plan_id || '',
            po.plan_name || plan?.name || 'اشتراک فعال',
            isExp ? 'expired' : 'active',
            plan?.price || `${fmtNumber(Math.floor(po.amount_rial / 10))} تومان`,
            JSON.stringify(plan?.perks || []),
            po.paid_at || po.created_at || nowIso,
            endIso,
            nowIso
          )
          .run()
          .catch(() => {});
      }
    }

    if (isPhoneVerified && rawPhone) {
      await syncPhoneGrantsToUser(env, userId, rawPhone);
    }
  } catch {
    /* non-fatal */
  }
};

export interface SiteUserRow {
  id: string;
  full_name: string;
  login_id: string;
  login_type?: string;
  email?: string;
  phone?: string;
  phone_verified_at?: string;
  tg_user_id?: string;
  tg_username?: string;
  created_at?: string;
}

export const findSiteUserByPhone = async (
  env: PaymentEnv,
  rawPhone: string,
  tgUserId = ''
): Promise<SiteUserRow | null> => {
  await ensurePaymentTables(env);
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const tgStr = String(tgUserId || '').trim();
  const row = await env.DB.prepare(
    `SELECT * FROM users
     WHERE (phone = ?1 OR login_id = ?2)
       AND (COALESCE(phone_verified_at, '') <> '' OR (?3 <> '' AND COALESCE(tg_user_id, '') = ?4))
     LIMIT 1`
  )
    .bind(phone, phone, tgStr, tgStr)
    .first<SiteUserRow>()
    .catch(() => null);
  return row || null;
};

export const linkExistingSiteUserFromTelegram = async (
  env: PaymentEnv,
  args: { userId: string; phone: string; tgUserId: string; tgUsername?: string }
): Promise<SiteUserRow | null> => {
  await ensurePaymentTables(env);
  const phone = normalizePhone(args.phone);
  const nowIso = new Date().toISOString();
  const cleanUser = String(args.tgUsername || '').replace(/^@/, '').trim();
  await env.DB.prepare(
    `UPDATE users
     SET phone = ?1,
         phone_verified_at = CASE WHEN phone_verified_at = '' OR phone_verified_at IS NULL THEN ?2 ELSE phone_verified_at END,
         tg_user_id = ?3,
         tg_username = CASE WHEN ?4 <> '' THEN ?5 ELSE tg_username END
     WHERE id = ?6`
  )
    .bind(phone, nowIso, String(args.tgUserId), cleanUser, cleanUser, args.userId)
    .run()
    .catch(() => {});

  // Backfill user_id onto any past orders from this phone or Telegram user
  await env.DB.prepare(
    `UPDATE payment_orders SET user_id = ?1 WHERE user_id = '' AND (phone = ?2 OR tg_user_id = ?3)`
  )
    .bind(args.userId, phone, String(args.tgUserId))
    .run()
    .catch(() => {});

  await syncUserAccountGrants(env, args.userId, phone, true);
  return findSiteUserByPhone(env, phone, args.tgUserId);
};

export const registerSiteUserFromTelegram = async (
  env: PaymentEnv,
  args: {
    tgUserId: string;
    tgUsername?: string;
    phone: string;
    fullName: string;
    email?: string;
    password: string;
  }
): Promise<{ ok: boolean; created: boolean; error?: string; user?: SiteUserRow }> => {
  await ensurePaymentTables(env);
  const phone = normalizePhone(args.phone);
  if (!phone) return { ok: false, created: false, error: 'شماره موبایل معتبر نیست.' };

  const existing = await findSiteUserByPhone(env, phone, args.tgUserId);
  if (existing) {
    const linked = await linkExistingSiteUserFromTelegram(env, {
      userId: existing.id,
      phone,
      tgUserId: args.tgUserId,
      tgUsername: args.tgUsername,
    });
    return { ok: true, created: false, user: linked || existing };
  }

  const nameCheck = validateFullName(args.fullName);
  if (!nameCheck.ok) return { ok: false, created: false, error: nameCheck.error };

  const rawEmail = String(args.email || '').trim().toLowerCase();
  if (rawEmail && !isValidEmail(rawEmail)) {
    return { ok: false, created: false, error: 'فرمت ایمیل واردشده صحیح نیست.' };
  }

  const pwd = String(args.password || '');
  if (pwd.length < 6) {
    return { ok: false, created: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
  }

  const secret = String(env.AUTH_SECRET || 'user-secret');

  // Check if an unverified website account currently holds this phone:
  // - If the user knows its password, it is genuinely their account -> upgrade & verify it!
  // - Otherwise, it is an unverified claim by someone else -> detach the phone from that unverified row
  //   so the cryptographically verified Telegram SIM owner can register cleanly.
  const unverifiedClaim = await env.DB.prepare(
    `SELECT * FROM users
     WHERE (phone = ?1 OR login_id = ?2)
       AND COALESCE(phone_verified_at, '') = ''
     LIMIT 1`
  )
    .bind(phone, phone)
    .first<SiteUserRow & { password_hash?: string; password_salt?: string }>()
    .catch(() => null);

  if (unverifiedClaim) {
    const matchesOwnPwd = await verifyUserPassword(
      pwd,
      String(unverifiedClaim.password_salt || ''),
      String(unverifiedClaim.password_hash || ''),
      secret
    );
    if (matchesOwnPwd) {
      if (rawEmail && rawEmail !== String(unverifiedClaim.email || '').toLowerCase()) {
        const clash = await env.DB.prepare(
          `SELECT id FROM users WHERE (email = ?1 OR login_id = ?2) AND id != ?3 LIMIT 1`
        )
          .bind(rawEmail, rawEmail, unverifiedClaim.id)
          .first<{ id: string }>()
          .catch(() => null);
        if (!clash) {
          await env.DB.prepare(`UPDATE users SET full_name = ?1, email = ?2 WHERE id = ?3`)
            .bind(nameCheck.id, rawEmail, unverifiedClaim.id)
            .run()
            .catch(() => {});
        }
      }
      const linked = await linkExistingSiteUserFromTelegram(env, {
        userId: unverifiedClaim.id,
        phone,
        tgUserId: args.tgUserId,
        tgUsername: args.tgUsername,
      });
      return { ok: true, created: false, user: linked || unverifiedClaim };
    }

    // Evict unverified phone claim from stranger's row
    const fallbackLogin = unverifiedClaim.email
      ? String(unverifiedClaim.email)
      : `unverified_${unverifiedClaim.id}`;
    await env.DB.prepare(
      `UPDATE users
       SET phone = '',
           login_id = CASE WHEN login_id = ?1 THEN ?2 ELSE login_id END
       WHERE id = ?3 AND COALESCE(phone_verified_at, '') = ''`
    )
      .bind(phone, fallbackLogin, unverifiedClaim.id)
      .run()
      .catch(() => {});
  }

  if (rawEmail) {
    const emailClash = await env.DB.prepare(
      `SELECT id FROM users WHERE email = ?1 OR login_id = ?2 LIMIT 1`
    )
      .bind(rawEmail, rawEmail)
      .first<{ id: string }>()
      .catch(() => null);
    if (emailClash) {
      return { ok: false, created: false, error: 'این ایمیل قبلاً در سایت ثبت شده است. ایمیل دیگری وارد کنید یا گزینه رد شدن را بزنید.' };
    }
  }

  const userId = `${Date.now().toString(36)}-${randomHex(6)}`;
  const salt = randomUserSalt(16);
  const hash = await hashUserPassword(pwd, salt, secret);
  const nowIso = new Date().toISOString();
  const cleanTgUsername = String(args.tgUsername || '').replace(/^@/, '').trim();

  await env.DB.prepare(
    `INSERT INTO users (id, full_name, login_id, login_type, email, phone, password_hash, password_salt, phone_verified_at, tg_user_id, tg_username, created_at, last_login_at)
     VALUES (?1, ?2, ?3, 'phone', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(userId, nameCheck.id, phone, rawEmail, phone, hash, salt, nowIso, String(args.tgUserId), cleanTgUsername, nowIso, nowIso)
    .run();

  await env.DB.prepare(
    `INSERT INTO user_activities (id, user_id, type, description, related_id, created_at)
     VALUES (?1, ?2, 'account_created', 'ثبت‌نام یکپارچه حساب کاربری از طریق ربات تلگرام', '', ?3)`
  )
    .bind(`ua-${Date.now().toString(36)}-${randomHex(3)}`, userId, nowIso)
    .run()
    .catch(() => {});

  // Link any orders already placed by this Telegram user / phone
  await env.DB.prepare(
    `UPDATE payment_orders SET user_id = ?1 WHERE user_id = '' AND (phone = ?2 OR tg_user_id = ?3)`
  )
    .bind(userId, phone, String(args.tgUserId))
    .run()
    .catch(() => {});

  await syncUserAccountGrants(env, userId, phone, true);

  const createdRow = await findSiteUserByPhone(env, phone, args.tgUserId);
  return {
    ok: true,
    created: true,
    user: createdRow || {
      id: userId,
      full_name: nameCheck.id,
      login_id: phone,
      login_type: 'phone',
      email: rawEmail,
      phone,
      phone_verified_at: nowIso,
      tg_user_id: String(args.tgUserId),
      tg_username: cleanTgUsername,
      created_at: nowIso,
    },
  };
};

/**
 * Generates a secure magic login token (`tg_auth`) for 1-click website authentication
 * from Telegram delivery / profile buttons. Only consumed via JS POST (`tg_token_login`)
 * so Telegram link preview crawlers never burn it, and stays valid for a 5-minute
 * handoff grace after first redemption (supporting Telegram WebView -> Safari handoff on iOS).
 */
export const createWebMagicLoginToken = async (
  env: PaymentEnv,
  userId: string,
  rawPhone = ''
): Promise<string> => {
  await ensurePaymentTables(env);
  const token = `ml_${randomHex(16)}`;
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const phone = rawPhone ? normalizePhone(rawPhone) : '';
  await env.DB.prepare(
    `INSERT INTO phone_verifications (token, user_id, phone, status, tg_user_id, created_at, expires_at, verified_at)
     VALUES (?1, ?2, ?3, 'magic_pending', '', ?4, ?5, '')`
  )
    .bind(token, userId, phone, nowIso, expiresAt)
    .run();
  return token;
};

export const consumeWebMagicLoginToken = async (
  env: PaymentEnv,
  rawToken: string
): Promise<{ ok: boolean; userId?: string; phone?: string; error?: string }> => {
  await ensurePaymentTables(env);
  const token = String(rawToken || '').trim();
  if (!token.startsWith('ml_')) return { ok: false, error: 'لینک ورود یک‌کلیکی نامعتبر است.' };

  const row = await env.DB.prepare(`SELECT * FROM phone_verifications WHERE token = ?1 LIMIT 1`)
    .bind(token)
    .first<{ token: string; user_id: string; phone: string; status: string; expires_at: string; verified_at: string }>();

  if (!row) return { ok: false, error: 'لینک ورود یافت نشد یا منقضی شده است.' };
  const nowMs = Date.now();
  if (Date.parse(row.expires_at) < nowMs) {
    return { ok: false, error: 'مهلت اعتبار این لینک به پایان رسیده است. از ربات لینک جدید دریافت کنید.' };
  }

  if (row.status === 'magic_used') {
    const firstUsedMs = Date.parse(row.verified_at || '');
    // Allow 5-minute handoff window from Telegram In-App Browser to iOS Safari
    if (!Number.isFinite(firstUsedMs) || nowMs - firstUsedMs > 5 * 60_000) {
      return { ok: false, error: 'این لینک ورود یک‌بارمصرف قبلاً استفاده شده است.' };
    }
    return { ok: true, userId: row.user_id, phone: row.phone };
  }

  if (row.status !== 'magic_pending') {
    return { ok: false, error: 'وضعیت لینک ورود معتبر نیست.' };
  }

  const nowIso = new Date(nowMs).toISOString();
  await env.DB.prepare(`UPDATE phone_verifications SET status = 'magic_used', verified_at = ?1 WHERE token = ?2`)
    .bind(nowIso, token)
    .run();

  return { ok: true, userId: row.user_id, phone: row.phone };
};

export const createPhoneVerificationToken = async (
  env: PaymentEnv,
  userIdOrOpts: string | { userId: string; phone?: string; purpose?: string },
  expectedPhone = ''
): Promise<{ token: string; expiresAt: string; telegramDeepLink: string; botCommand: string }> => {
  await ensurePaymentTables(env);
  const userId = typeof userIdOrOpts === 'string' ? userIdOrOpts : userIdOrOpts.userId;
  const rawPhone = typeof userIdOrOpts === 'string' ? expectedPhone : (userIdOrOpts.phone || expectedPhone);
  const token = randomHex(12);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const phone = rawPhone ? normalizePhone(rawPhone) : '';

  await env.DB.prepare(
    `INSERT INTO phone_verifications (token, user_id, phone, status, tg_user_id, created_at, expires_at, verified_at)
     VALUES (?1, ?2, ?3, 'pending', '', ?4, ?5, '')`
  )
    .bind(token, userId, phone, nowIso, expiresAt)
    .run();

  const botUsername = String(env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  const botCommand = `/start verify_${token}`;
  const telegramDeepLink = botUsername ? `https://t.me/${botUsername}?start=verify_${token}` : '';

  return { token, expiresAt, telegramDeepLink, botCommand };
};

export const completePhoneVerificationToken = async (
  env: PaymentEnv,
  token: string,
  tgUserId: string,
  verifiedPhone: string,
  tgUsername = ''
): Promise<{ ok: boolean; error?: string; phone?: string; userId?: string }> => {
  await ensurePaymentTables(env);
  const cleanToken = String(token || '').trim();
  const phone = normalizePhone(verifiedPhone);
  if (!cleanToken || !phone) return { ok: false, error: 'اطلاعات تأیید نامعتبر است.' };

  const row = await env.DB.prepare(`SELECT * FROM phone_verifications WHERE token = ?1 LIMIT 1`)
    .bind(cleanToken)
    .first<{ token: string; user_id: string; phone: string; status: string; expires_at: string }>();

  if (!row) return { ok: false, error: 'لینک تأیید شماره یافت نشد یا نامعتبر است.' };
  if (row.status === 'verified') return { ok: true, phone, userId: row.user_id };
  if (Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, error: 'مهلت ۱۵ دقیقه‌ای این لینک به پایان رسیده است. از پروفایل سایت دوباره درخواست دهید.' };
  }
  if (row.phone && row.phone !== phone) {
    return {
      ok: false,
      error: `شماره تلگرام شما (${phone}) با شماره‌ای که در پروفایل سایت وارد کرده‌اید (${row.phone}) یکسان نیست.`,
    };
  }

  // Ensure phone is not already claimed by a DIFFERENT website account
  const clash = await env.DB.prepare(`SELECT id FROM users WHERE (phone = ?1 OR login_id = ?2) AND id <> ?3 LIMIT 1`)
    .bind(phone, phone, row.user_id)
    .first<{ id: string }>();
  if (clash) {
    return { ok: false, error: 'این شماره موبایل قبلاً روی یک حساب کاربری دیگر در سایت ثبت شده است.' };
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET phone = ?1, phone_verified_at = ?2, tg_user_id = ?3 WHERE id = ?4`
  )
    .bind(phone, nowIso, String(tgUserId), row.user_id)
    .run();
  if (tgUsername) {
    await env.DB.prepare(`UPDATE users SET tg_username = ?1 WHERE id = ?2`)
      .bind(String(tgUsername).replace(/^@/, ''), row.user_id)
      .run()
      .catch(() => {});
  }

  await env.DB.prepare(
    `UPDATE phone_verifications SET status = 'verified', phone = ?1, tg_user_id = ?2, verified_at = ?3 WHERE token = ?4`
  )
    .bind(phone, String(tgUserId), nowIso, cleanToken)
    .run();

  await syncPhoneGrantsToUser(env, row.user_id, phone);
  return { ok: true, phone, userId: row.user_id };
};

export { cleanCardNumber, cleanIban, detectIranBank, formatCardNumber, isValidIranBankCard, maskCardNumber, toLatinDigits };
