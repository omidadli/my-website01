-- 0006_telegram_bot.sql — tables for the Telegram sales/support bot.
--
-- The bot runs as a Cloudflare Pages Function (functions/api/telegram.ts) on the
-- SAME D1 database as the website, so purchases can write `tool_access` and
-- `user_subscriptions` directly. These bot_* tables hold Telegram-specific state.
--
-- (lib/telegram/store.ts also creates them lazily, so the bot works even if this
--  migration has not been applied yet — but applying it is recommended.)

CREATE TABLE IF NOT EXISTS bot_users (
  tg_user_id    TEXT PRIMARY KEY,
  first_name    TEXT DEFAULT '',
  username      TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  verified_at   TEXT DEFAULT '',
  verify_via    TEXT DEFAULT '',
  pending_state TEXT DEFAULT '',
  pending_json  TEXT DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bot_users_phone ON bot_users (phone);

CREATE TABLE IF NOT EXISTS bot_orders (
  id              TEXT PRIMARY KEY,
  tg_user_id      TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  product_id      TEXT NOT NULL,
  product_name    TEXT DEFAULT '',
  plan_id         TEXT DEFAULT '',
  plan_name       TEXT DEFAULT '',
  amount_toman    INTEGER NOT NULL DEFAULT 0,
  expected_amount_toman INTEGER NOT NULL DEFAULT 0,
  payment_id      TEXT DEFAULT '',
  -- awaiting_payment | receipt_submitted | auto_approved | needs_review
  -- | approved | rejected | fulfilled
  status          TEXT NOT NULL DEFAULT 'awaiting_payment',
  ref_code        TEXT DEFAULT '',
  receipt_file_id TEXT DEFAULT '',
  receipt_json    TEXT DEFAULT '',
  note            TEXT DEFAULT '',
  created_at      TEXT NOT NULL,
  decided_at      TEXT DEFAULT '',
  decided_by      TEXT DEFAULT '',
  delivery_id     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bot_orders_status ON bot_orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_orders_ref ON bot_orders (ref_code);
CREATE INDEX IF NOT EXISTS idx_bot_orders_tg ON bot_orders (tg_user_id, created_at);

CREATE TABLE IF NOT EXISTS bot_deliveries (
  id           TEXT PRIMARY KEY,
  tg_user_id   TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  product_id   TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  plan_name    TEXT DEFAULT '',
  order_id     TEXT DEFAULT '',
  -- queued | pending_send | delivered | failed
  status       TEXT NOT NULL DEFAULT 'queued',
  source       TEXT DEFAULT 'order',
  code         TEXT DEFAULT '',
  expires_at   TEXT DEFAULT '',
  note         TEXT DEFAULT '',
  created_at   TEXT NOT NULL,
  delivered_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bot_deliveries_tg ON bot_deliveries (tg_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_deliveries_phone ON bot_deliveries (phone, status);

CREATE TABLE IF NOT EXISTS bot_updates (
  update_id  INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_events (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
