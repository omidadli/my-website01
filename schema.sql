-- CMS schema for Cloudflare D1
-- Run with:  npx wrangler d1 execute <DATABASE_NAME> --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  alt TEXT DEFAULT '',
  size_kb INTEGER DEFAULT 0,
  content_type TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip, attempted_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  date TEXT NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 0,
  reply TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT ''               -- ISO timestamp (rate limiting); `date` is the Persian display string
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id);

-- Lead capture (contact form + booking calendar)
CREATE TABLE IF NOT EXISTS leads (
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
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ip_time ON leads (ip, created_at);

-- Media stored inside D1 (free fallback when R2 is not available)
CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_kb INTEGER DEFAULT 0,
  data_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- AI assistant conversation history (behavior monitoring)
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  ip TEXT DEFAULT '',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  mode TEXT DEFAULT 'local',
  -- Which of the 5 key slots answered (0 = local answer / no key), and the
  -- conversation id used to stitch the server-side chat memory together.
  key_slot INTEGER NOT NULL DEFAULT 0,
  session_id TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_ip_time ON chat_messages (ip, created_at);

-- Paid AI tools (محصولات هوشمند): per-phone access grants, bound to a limited
-- number of devices so a buyer cannot freely re-share the access code.
CREATE TABLE IF NOT EXISTS tool_access (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT 'all',   -- specific tool id, or 'all'
  code TEXT NOT NULL,                        -- secret access code given to the buyer
  status TEXT NOT NULL DEFAULT 'active',     -- active | revoked
  max_devices INTEGER NOT NULL DEFAULT 1,
  message_quota INTEGER NOT NULL DEFAULT 0,  -- messages allowed over the plan window; 0 = unlimited
  devices TEXT NOT NULL DEFAULT '[]',        -- JSON array of bound device ids
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL,                  -- also the start of the current plan/quota window
  expires_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tool_access_phone ON tool_access (phone, product_id);

-- Site user accounts (profile, saved articles, subscriptions, consultations).
-- Passwords are stored as PBKDF2-SHA256 hashes; never plaintext.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE,             -- normalized email OR phone (lowercased email / digits-only phone)
  login_type TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'phone'
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  phone_verified_at TEXT NOT NULL DEFAULT '',
  tg_user_id TEXT NOT NULL DEFAULT '',
  tg_username TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_login_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_users_login ON users (login_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_tg_user_id ON users (tg_user_id);

-- Persistent HttpOnly-cookie sessions for users (separate from admin tokens).
CREATE TABLE IF NOT EXISTS user_sessions (
  token TEXT PRIMARY KEY,                    -- random 32-byte hex, also stored in the session cookie
  user_id TEXT NOT NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at);

-- Per-user saved articles (read-it-later list).
CREATE TABLE IF NOT EXISTS user_saved_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  notes TEXT DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL,
  read_at TEXT DEFAULT '',
  UNIQUE(user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_user ON user_saved_articles (user_id, saved_at);

-- Per-user subscriptions (products/plans they bought).
CREATE TABLE IF NOT EXISTS user_subscriptions (
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
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON user_subscriptions (user_id, start_date);

-- Per-user consultation requests (track what the admin replied).
CREATE TABLE IF NOT EXISTS user_consultations (
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cons_user ON user_consultations (user_id, created_at);

-- Activity log for the dashboard timeline.
CREATE TABLE IF NOT EXISTS user_activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_id TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_act_user_time ON user_activities (user_id, created_at);

-- Device-based free-trial counters (gamification): N free messages per tool per device.
CREATE TABLE IF NOT EXISTS tool_trials (
  device_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, product_id)
);

-- Message log for the paid AI tools (usage monitoring + per-phone rate limit).
CREATE TABLE IF NOT EXISTS tool_messages (
  id TEXT PRIMARY KEY,
  phone TEXT DEFAULT '',
  product_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_messages_phone_time ON tool_messages (phone, created_at);

-- Per-tool AI connection (provider / model / API key). API KEYS live ONLY here,
-- are admin-only, and are NEVER returned to the public content API.
CREATE TABLE IF NOT EXISTS tool_settings (
  product_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'gemini',   -- 'gemini' | 'openai'
  base_url TEXT DEFAULT '',                    -- for OpenAI-compatible proxies
  model TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- AI sections: 5 API key slots per section (admin panel tab «کلیدهای API»),
-- per-slot health/cooldown, server-side chat memory so a key rotation does not
-- break the conversation, and the rotation audit log.
-- (Same statements as migrations/0005_ai_section_keys.sql — kept in sync by hand.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_section_keys (
    section_id TEXT PRIMARY KEY,
    keys_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS ai_key_state (
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
  );

CREATE TABLE IF NOT EXISTS ai_chat_session (
    session_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    sticky_key_id TEXT DEFAULT '',
    turns INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS ai_chat_memory (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_ai_memory_session ON ai_chat_memory (session_id, created_at);

CREATE TABLE IF NOT EXISTS ai_key_events (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    code TEXT DEFAULT '',
    status INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_ai_key_events_time ON ai_key_events (created_at);

-- ---------------------------------------------------------------------------
-- Telegram bot tables (migrations/0006_telegram_bot.sql)
-- ---------------------------------------------------------------------------

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
  payment_id      TEXT DEFAULT '',
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

-- ---------------------------------------------------------------------------
-- Automated Card-to-Card SMS Payment Gateway (migrations/0007_payment_gateway.sql)
-- ---------------------------------------------------------------------------

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
  source                TEXT NOT NULL DEFAULT 'website',
  status                TEXT NOT NULL DEFAULT 'pending',
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
  status      TEXT NOT NULL DEFAULT 'pending',
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

