/**
 * Environment / config loader — zero-dependency (parses `.env` itself).
 *
 * NEVER hard-code the bot token or secrets. Copy `.env.example` to `.env` and
 * fill it in; `.env` is git-ignored and must stay out of version control.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BOT_ROOT = path.resolve(__dirname, '..');

/** Minimal .env parser (KEY=VALUE, # comments, optional quotes). */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf-8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(BOT_ROOT, '.env'));

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  /** BotFather token — REQUIRED. */
  token: String(process.env.BOT_TOKEN || '').trim(),
  /** Comma-separated Telegram user ids allowed to use /admin. */
  adminIds: String(process.env.ADMIN_TG_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Shared secret for the HTTP bridge the website calls (X-Bot-Webhook-Secret). */
  webhookSecret: String(process.env.WEBHOOK_SECRET || '').trim(),
  /** 'polling' (default, no public URL needed) or 'webhook'. */
  mode: (String(process.env.BOT_MODE || 'polling').toLowerCase() === 'webhook' ? 'webhook' : 'polling'),
  /** Public https URL of this bot server, required only in webhook mode. */
  publicUrl: String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, ''),
  /** Port for the built-in HTTP server (webhook + website bridge + health). */
  port: num(process.env.BOT_PORT, 8787),
  /** Where the JSON data files live. */
  dataDir: process.env.DATA_DIR ? path.resolve(BOT_ROOT, process.env.DATA_DIR) : path.join(BOT_ROOT, 'data'),
  /** Free-text shown in /start and support replies. */
  supportHandle: String(process.env.SUPPORT_HANDLE || '@omidadli').trim(),
  siteUrl: String(process.env.SITE_URL || 'https://omidadli.com').trim().replace(/\/+$/, ''),
  /** Max messages accepted per chat per minute (simple flood guard). */
  rateLimitPerMinute: num(process.env.RATE_LIMIT_PER_MINUTE, 20),
};

export function assertConfig() {
  const problems = [];
  if (!config.token) problems.push('BOT_TOKEN تنظیم نشده است (از BotFather بگیرید و در .env قرار دهید).');
  if (!config.adminIds.length) problems.push('ADMIN_TG_IDS تنظیم نشده است (آیدی عددی تلگرام خودتان).');
  if (config.mode === 'webhook') {
    if (!config.publicUrl) problems.push('PUBLIC_URL برای حالت webhook لازم است.');
    if (!config.publicUrl.startsWith('https://')) problems.push('PUBLIC_URL باید https باشد.');
    if (!config.webhookSecret) problems.push('WEBHOOK_SECRET برای حالت webhook لازم است.');
  }
  return problems;
}

export const isAdmin = (tgUserId) => config.adminIds.includes(String(tgUserId));
