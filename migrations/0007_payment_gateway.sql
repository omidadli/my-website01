-- 0007_payment_gateway.sql — Self-hosted Automatic Card-to-Card SMS Payment Gateway (OmidPay)
-- + Unified Website <-> Telegram Phone Verification tables.
-- (Also created lazily by lib/payment/gateway.ts -> ensurePaymentTables.)

CREATE TABLE IF NOT EXISTS payment_cards (
  id               TEXT PRIMARY KEY,
  card_number      TEXT NOT NULL,
  holder_name      TEXT NOT NULL,
  iban             TEXT DEFAULT '',
  bank_name        TEXT DEFAULT '',
  bank_slug        TEXT DEFAULT 'shetab',
  is_active        INTEGER NOT NULL DEFAULT 1,
  priority         INTEGER NOT NULL DEFAULT 1,
  daily_limit_rial INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_cards_active ON payment_cards (is_active, priority);

CREATE TABLE IF NOT EXISTS payment_devices (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  device_serial   TEXT DEFAULT '',
  token_hash      TEXT NOT NULL UNIQUE,
  token_mask      TEXT NOT NULL,
  pair_code       TEXT DEFAULT '',
  pair_token      TEXT DEFAULT '',
  pair_expires_at TEXT DEFAULT '',
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_seen_at  TEXT DEFAULT '',
  battery_level INTEGER NOT NULL DEFAULT -1,
  device_model  TEXT DEFAULT '',
  app_version   TEXT DEFAULT '',
  sms_count     INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_devices_token ON payment_devices (token_hash);

CREATE TABLE IF NOT EXISTS payment_api_keys (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_mask        TEXT NOT NULL,
  signing_secret  TEXT NOT NULL,
  allowed_origins TEXT DEFAULT '',
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_used_at    TEXT DEFAULT '',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_api_keys_hash ON payment_api_keys (key_hash);

CREATE TABLE IF NOT EXISTS payment_orders (
  id                    TEXT PRIMARY KEY,
  order_id              TEXT NOT NULL,
  source                TEXT NOT NULL DEFAULT 'website', -- website | telegram | api
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | paid | expired | canceled | needs_review | rejected
  amount_rial           INTEGER NOT NULL,
  payable_amount_rial   INTEGER NOT NULL,
  card_id               TEXT DEFAULT '',
  card_number           TEXT NOT NULL,
  card_holder           TEXT NOT NULL,
  card_bank             TEXT DEFAULT '',
  card_bank_slug        TEXT DEFAULT 'shetab',
  phone                 TEXT DEFAULT '',
  user_id               TEXT DEFAULT '',
  tg_user_id            TEXT DEFAULT '',
  product_id            TEXT DEFAULT '',
  product_name          TEXT DEFAULT '',
  plan_id               TEXT DEFAULT '',
  plan_name             TEXT DEFAULT '',
  description           TEXT DEFAULT '',
  callback_url          TEXT DEFAULT '',
  return_url            TEXT DEFAULT '',
  metadata_json         TEXT DEFAULT '',
  api_key_id            TEXT DEFAULT '',
  buyer_secret_hash     TEXT DEFAULT '',
  matched_sms_id        TEXT DEFAULT '',
  paid_at               TEXT DEFAULT '',
  verified_at           TEXT DEFAULT '',
  fulfilled_at          TEXT DEFAULT '',
  access_code           TEXT DEFAULT '',
  access_expires_at     TEXT DEFAULT '',
  receipt_ref           TEXT DEFAULT '',
  receipt_note          TEXT DEFAULT '',
  receipt_image_b64     TEXT DEFAULT '',
  receipt_submitted_at  TEXT DEFAULT '',
  webhook_delivered_at  TEXT DEFAULT '',
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_payable ON payment_orders (status, payable_amount_rial);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id ON payment_orders (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_phone ON payment_orders (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_sms_logs (
  id                  TEXT PRIMARY KEY,
  device_id           TEXT NOT NULL,
  msg_hash            TEXT NOT NULL UNIQUE,
  sender              TEXT DEFAULT '',
  body_sanitized      TEXT DEFAULT '',
  received_at         TEXT NOT NULL,
  parsed_amount_rial  INTEGER NOT NULL DEFAULT 0,
  is_deposit          INTEGER NOT NULL DEFAULT 0,
  matched_payment_id  TEXT DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'ignored_non_deposit',
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_sms_logs_created ON payment_sms_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS phone_verifications (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  phone       TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | verified | expired
  tg_user_id  TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  verified_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON phone_verifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

