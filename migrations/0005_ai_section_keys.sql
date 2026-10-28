-- Migration 0005: 5 AI key slots per section + server-side chat memory.
--
-- Adds the tables behind the admin panel tab «کلیدهای API» (API keys) and the
-- key-rotation / conversation-continuity engine in lib/aiKeys.ts + lib/aiSection.ts:
--
--   ai_section_keys : the 5 key slots of every AI section (JSON, server-only)
--   ai_key_state    : health / cooldown / counters per slot
--   ai_chat_session : which key is answering a conversation (sticky key)
--   ai_chat_memory  : server-side chat memory (survives a key switch)
--   ai_key_events   : audit trail of limit hits and rotations
--
-- Plus two columns on chat_messages so the admin panel can show which key slot
-- answered. The API also creates all of this lazily on the first request
-- (ensureCoreTables in functions/api/_shared.ts), so running this file is
-- optional — but recommended on an existing database.
--
-- Run ONCE:
--   npx wrangler d1 execute <DATABASE_NAME> --remote --file=./migrations/0005_ai_section_keys.sql
--
-- NOTE: the two ALTER statements at the end fail with "duplicate column name"
-- if the API already added those columns lazily. That error is harmless; every
-- CREATE TABLE / CREATE INDEX above is IF NOT EXISTS.

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

-- Added after chat_messages first shipped (the API adds them lazily too).
ALTER TABLE chat_messages ADD COLUMN key_slot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN session_id TEXT DEFAULT '';
