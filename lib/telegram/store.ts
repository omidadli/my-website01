/**
 * lib/telegram/store.ts — D1 persistence for the Telegram bot (tables bot_*).
 *
 * The bot lives in Cloudflare Pages Functions so it shares the SAME D1 database
 * as the website: verified phones link straight to `users`, purchases write
 * `tool_access` (product access codes) and `user_subscriptions` (profile page).
 * Migration: migrations/0006_telegram_bot.sql (also created lazily here).
 */

/**
 * Structural stand-in for D1 so this module type-checks both under
 * functions/tsconfig.json (with @cloudflare/workers-types) and the root
 * tsconfig (browser libs only).
 */
export interface D1LikeStatement {
  bind(...values: unknown[]): D1LikeStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results?: T[]; meta?: { changes?: number } }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1LikeStatement;
  batch(stmts: D1LikeStatement[]): Promise<unknown>;
}

export interface BotEnv {
  DB: D1Like;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;
  /** comma-separated Telegram user ids */
  TELEGRAM_ADMIN_IDS?: string;
  /** card-to-card payment info shown in the purchase flow */
  BOT_CARD_NUMBER?: string;
  BOT_CARD_HOLDER?: string;
  BOT_CARD_IBAN?: string;
  BOT_CARD_BANK?: string;
  /** 'vision' (default) | 'always' | 'off' — auto-approval policy for receipts */
  TELEGRAM_AUTO_APPROVE?: string;
  /** Dedicated Gemini secret used only for Telegram payment-receipt OCR. */
  TELEGRAM_RECEIPT_GEMINI_API_KEY?: string;
  /** Generic website/product fallback key; not used for Telegram receipt OCR. */
  GEMINI_API_KEY?: string;
  Gemini_api_key?: string;
  TELEGRAM_VISION_MODEL?: string;
  SITE_URL?: string;
  SITE_BASE_URL?: string;
  SUPPORT_HANDLE?: string;
  PAYMENT_REQUIRE_ONLINE_DEVICE?: string;
}

export interface BotUserRow {
  tg_user_id: string;
  first_name: string;
  username: string;
  phone: string;
  verified_at: string;
  verify_via: string;
  pending_state: string;
  pending_json: string;
  created_at: string;
  updated_at: string;
}

export interface BotOrderRow {
  id: string;
  tg_user_id: string;
  phone: string;
  product_id: string;
  product_name: string;
  plan_id: string;
  plan_name: string;
  amount_toman: number;
  /** Exact requested transfer amount, including the per-order unique delta. */
  expected_amount_toman?: number;
  /** Linked Payexa-v2 SMS gateway payment_id (`PAY-...`) when created via unified gateway. */
  payment_id?: string;
  status: string; // awaiting_payment | receipt_submitted | auto_approved | needs_review | approved | rejected | fulfilled
  ref_code: string;
  receipt_file_id: string;
  receipt_json: string;
  note: string;
  created_at: string;
  decided_at: string;
  decided_by: string;
  delivery_id: string;
}

export interface BotDeliveryRow {
  id: string;
  tg_user_id: string;
  phone: string;
  product_id: string;
  product_name: string;
  plan_name: string;
  order_id: string;
  status: string; // queued | pending_send | delivered | failed
  source: string; // order | website
  code: string;
  expires_at: string;
  note: string;
  created_at: string;
  delivered_at: string;
}

const BOT_TABLES = [
  `CREATE TABLE IF NOT EXISTS bot_users (
    tg_user_id TEXT PRIMARY KEY,
    first_name TEXT DEFAULT '',
    username TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    verified_at TEXT DEFAULT '',
    verify_via TEXT DEFAULT '',
    pending_state TEXT DEFAULT '',
    pending_json TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bot_users_phone ON bot_users (phone)`,
  `CREATE TABLE IF NOT EXISTS bot_orders (
    id TEXT PRIMARY KEY,
    tg_user_id TEXT NOT NULL,
    phone TEXT DEFAULT '',
    product_id TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    plan_id TEXT DEFAULT '',
    plan_name TEXT DEFAULT '',
    amount_toman INTEGER NOT NULL DEFAULT 0,
    expected_amount_toman INTEGER NOT NULL DEFAULT 0,
    payment_id TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'awaiting_payment',
    ref_code TEXT DEFAULT '',
    receipt_file_id TEXT DEFAULT '',
    receipt_json TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    decided_at TEXT DEFAULT '',
    decided_by TEXT DEFAULT '',
    delivery_id TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bot_orders_status ON bot_orders (status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_orders_ref ON bot_orders (ref_code)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_orders_tg ON bot_orders (tg_user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS bot_deliveries (
    id TEXT PRIMARY KEY,
    tg_user_id TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    product_id TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    plan_name TEXT DEFAULT '',
    order_id TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    source TEXT DEFAULT 'order',
    code TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    delivered_at TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bot_deliveries_tg ON bot_deliveries (tg_user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_deliveries_phone ON bot_deliveries (phone, status)`,
  `CREATE TABLE IF NOT EXISTS bot_updates (
    update_id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bot_events (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
];

const readyByDb = new WeakMap<object, Promise<void>>();

export const ensureBotTables = (env: BotEnv): Promise<void> => {
  const dbKey = env.DB as unknown as object;
  let pending = readyByDb.get(dbKey);
  if (!pending) {
    pending = (async () => {
      await env.DB.batch(BOT_TABLES.map((sql) => env.DB.prepare(sql)));
      // Backward-compatible additive migration for already-created D1 databases.
      for (const colSql of [
        `ALTER TABLE bot_orders ADD COLUMN expected_amount_toman INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE bot_orders ADD COLUMN payment_id TEXT DEFAULT ''`,
      ]) {
        try {
          await env.DB.prepare(colSql).run();
        } catch (error) {
          if (!String((error as any)?.message || error).toLowerCase().includes('duplicate column')) throw error;
        }
      }
    })().catch((e) => {
      readyByDb.delete(dbKey);
      throw e;
    });
    readyByDb.set(dbKey, pending);
  }
  return pending;
};

export const nowIso = (): string => new Date().toISOString();

export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/* ------------------------------- users ------------------------------- */

export const getBotUser = async (env: BotEnv, tgUserId: string | number): Promise<BotUserRow | null> => {
  const row = await env.DB.prepare(`SELECT * FROM bot_users WHERE tg_user_id = ?1`).bind(String(tgUserId)).first<BotUserRow>();
  return row || null;
};

export const upsertBotUser = async (env: BotEnv, tgUserId: string | number, patch: Partial<BotUserRow> & { pending?: unknown } = {}): Promise<BotUserRow> => {
  const id = String(tgUserId);
  const existing = await getBotUser(env, id);
  const now = nowIso();
  const pendingJson = patch.pending !== undefined ? JSON.stringify(patch.pending ?? null) : (existing?.pending_json ?? '');
  const pendingState = patch.pending !== undefined
    ? String((patch.pending as any)?.kind || '')
    : (patch.pending_state ?? '');
  const row: BotUserRow = {
    tg_user_id: id,
    first_name: patch.first_name ?? existing?.first_name ?? '',
    username: patch.username ?? existing?.username ?? '',
    phone: patch.phone ?? existing?.phone ?? '',
    verified_at: patch.verified_at ?? existing?.verified_at ?? '',
    verify_via: patch.verify_via ?? existing?.verify_via ?? '',
    pending_state: pendingState,
    pending_json: pendingJson,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO bot_users (tg_user_id, first_name, username, phone, verified_at, verify_via, pending_state, pending_json, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(tg_user_id) DO UPDATE SET
       first_name = excluded.first_name, username = excluded.username, phone = excluded.phone,
       verified_at = excluded.verified_at, verify_via = excluded.verify_via,
       pending_state = excluded.pending_state, pending_json = excluded.pending_json, updated_at = excluded.updated_at`
  ).bind(row.tg_user_id, row.first_name, row.username, row.phone, row.verified_at, row.verify_via, row.pending_state, row.pending_json, row.created_at, row.updated_at).run();
  return row;
};

export const getPending = <T = any>(user: BotUserRow | null): (T & { kind: string }) | null =>
  user ? parseJson<T & { kind: string } | null>(user.pending_json, null) : null;

export const findVerifiedByPhone = async (env: BotEnv, phone: string): Promise<BotUserRow | null> => {
  const row = await env.DB.prepare(`SELECT * FROM bot_users WHERE phone = ?1 AND verified_at <> '' LIMIT 1`).bind(phone).first<BotUserRow>();
  return row || null;
};

/* ------------------------------- orders ------------------------------- */

export const insertOrder = async (env: BotEnv, order: BotOrderRow): Promise<void> => {
  await env.DB.prepare(
    `INSERT INTO bot_orders (id, tg_user_id, phone, product_id, product_name, plan_id, plan_name, amount_toman, expected_amount_toman, payment_id, status, ref_code, receipt_file_id, receipt_json, note, created_at, decided_at, decided_by, delivery_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`
  ).bind(
    order.id, order.tg_user_id, order.phone, order.product_id, order.product_name, order.plan_id, order.plan_name,
    order.amount_toman, order.expected_amount_toman || order.amount_toman, order.payment_id || '', order.status, order.ref_code, order.receipt_file_id, order.receipt_json, order.note,
    order.created_at, order.decided_at, order.decided_by, order.delivery_id
  ).run();
};

export const getOrder = async (env: BotEnv, id: string): Promise<BotOrderRow | null> =>
  (await env.DB.prepare(`SELECT * FROM bot_orders WHERE id = ?1`).bind(id).first<BotOrderRow>()) || null;

export const updateOrder = async (env: BotEnv, id: string, patch: Partial<BotOrderRow>): Promise<void> => {
  const cur = await getOrder(env, id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  await env.DB.prepare(
    `UPDATE bot_orders SET phone=?1, status=?2, ref_code=?3, receipt_file_id=?4, receipt_json=?5, note=?6, decided_at=?7, decided_by=?8, delivery_id=?9, payment_id=?10 WHERE id=?11`
  ).bind(next.phone, next.status, next.ref_code, next.receipt_file_id, next.receipt_json, next.note, next.decided_at, next.decided_by, next.delivery_id, next.payment_id || '', id).run();
};

export const ordersOf = async (env: BotEnv, tgUserId: string): Promise<BotOrderRow[]> =>
  (await env.DB.prepare(`SELECT * FROM bot_orders WHERE tg_user_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(String(tgUserId)).all<BotOrderRow>()).results || [];

export const pendingReviewOrders = async (env: BotEnv, limit = 10): Promise<BotOrderRow[]> =>
  (await env.DB.prepare(`SELECT * FROM bot_orders WHERE status IN ('needs_review','receipt_submitted') ORDER BY created_at DESC LIMIT ?1`).bind(limit).all<BotOrderRow>()).results || [];

/** True when this payment reference was already used on a non-rejected order. */
export const refAlreadyUsed = async (env: BotEnv, ref: string, excludeOrderId = ''): Promise<boolean> => {
  if (!ref) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM bot_orders WHERE ref_code = ?1 AND status <> 'rejected' AND id <> ?2 LIMIT 1`
  ).bind(ref, excludeOrderId).first<{ id: string }>();
  return !!row;
};

/* ----------------------------- deliveries ----------------------------- */

export const insertDelivery = async (env: BotEnv, d: BotDeliveryRow): Promise<void> => {
  await env.DB.prepare(
    `INSERT INTO bot_deliveries (id, tg_user_id, phone, product_id, product_name, plan_name, order_id, status, source, code, expires_at, note, created_at, delivered_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`
  ).bind(d.id, d.tg_user_id, d.phone, d.product_id, d.product_name, d.plan_name, d.order_id, d.status, d.source, d.code, d.expires_at, d.note, d.created_at, d.delivered_at).run();
};

export const updateDelivery = async (env: BotEnv, id: string, patch: Partial<BotDeliveryRow>): Promise<void> => {
  const rows = (await env.DB.prepare(`SELECT * FROM bot_deliveries WHERE id = ?1`).bind(id).all<BotDeliveryRow>()).results || [];
  const cur = rows[0];
  if (!cur) return;
  const next = { ...cur, ...patch };
  await env.DB.prepare(
    `UPDATE bot_deliveries SET tg_user_id=?1, status=?2, code=?3, expires_at=?4, note=?5, delivered_at=?6 WHERE id=?7`
  ).bind(next.tg_user_id, next.status, next.code, next.expires_at, next.note, next.delivered_at, id).run();
};

export const deliveriesOf = async (env: BotEnv, tgUserId: string): Promise<BotDeliveryRow[]> =>
  (await env.DB.prepare(`SELECT * FROM bot_deliveries WHERE tg_user_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(String(tgUserId)).all<BotDeliveryRow>()).results || [];

export const queuedDeliveries = async (env: BotEnv, tgUserId: string): Promise<BotDeliveryRow[]> =>
  (await env.DB.prepare(`SELECT * FROM bot_deliveries WHERE tg_user_id = ?1 AND status IN ('queued','pending_send') ORDER BY created_at ASC`).bind(String(tgUserId)).all<BotDeliveryRow>()).results || [];

export const queuedDeliveriesByPhone = async (env: BotEnv, phone: string): Promise<BotDeliveryRow[]> =>
  (await env.DB.prepare(`SELECT * FROM bot_deliveries WHERE phone = ?1 AND status IN ('queued','pending_send') ORDER BY created_at ASC`).bind(phone).all<BotDeliveryRow>()).results || [];

/* ------------------------------ updates/events ------------------------------ */

/** Insert-or-ignore an update_id; returns false when the update was already handled. */
export const claimUpdate = async (env: BotEnv, updateId: number): Promise<boolean> => {
  try {
    const r = await env.DB.prepare(`INSERT OR IGNORE INTO bot_updates (update_id, created_at) VALUES (?1, ?2)`).bind(updateId, nowIso()).run();
    return (r.meta?.changes ?? 1) > 0;
  } catch {
    return true; // table hiccup — better to process twice than to drop an update
  }
};

export const logEvent = async (env: BotEnv, kind: string, detail: string): Promise<void> => {
  try {
    await env.DB.prepare(`INSERT INTO bot_events (id, kind, detail, created_at) VALUES (?1,?2,?3,?4)`)
      .bind(newId('bev'), kind, String(detail || '').slice(0, 500), nowIso()).run();
  } catch { /* non-fatal */ }
};

export const botStats = async (env: BotEnv) => {
  const q = async (sql: string, ...binds: unknown[]): Promise<number> => {
    try {
      const row = await env.DB.prepare(sql).bind(...binds).first<{ c: number }>();
      return row?.c || 0;
    } catch {
      return 0;
    }
  };
  return {
    users: await q(`SELECT COUNT(*) AS c FROM bot_users`),
    verified: await q(`SELECT COUNT(*) AS c FROM bot_users WHERE verified_at <> ''`),
    orders: await q(`SELECT COUNT(*) AS c FROM bot_orders`),
    pendingReview: await q(`SELECT COUNT(*) AS c FROM bot_orders WHERE status IN ('needs_review','receipt_submitted')`),
    autoApproved: await q(`SELECT COUNT(*) AS c FROM bot_orders WHERE status IN ('auto_approved','approved','fulfilled') AND decided_by = 'auto'`),
    delivered: await q(`SELECT COUNT(*) AS c FROM bot_deliveries WHERE status = 'delivered'`),
  };
};
