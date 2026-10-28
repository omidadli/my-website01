/**
 * functions/api/telegram.ts — Telegram bot webhook hosted on Cloudflare Pages.
 *
 * Routes (all on this one file):
 *   POST /api/telegram                     → Telegram updates (webhook)
 *   POST /api/telegram with X-Telegram-Setup-Secret → register webhook securely
 *   GET  /api/telegram?setup=<secret>      → legacy webhook setup
 *   GET  /api/telegram                     → health/info
 *   POST /api/telegram/deliver             → website → customer delivery (bridge)
 *
 * Env (Cloudflare secrets/vars):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (required)
 *   TELEGRAM_ADMIN_IDS, BOT_CARD_NUMBER, BOT_CARD_HOLDER (recommended)
 *   GEMINI_API_KEY, TELEGRAM_VISION_MODEL, TELEGRAM_AUTO_APPROVE (optional)
 *   SITE_URL, SUPPORT_HANDLE (optional)
 *
 * Why Pages Functions instead of a separate server: the bot then shares D1 with
 * the site, so a verified purchase writes `tool_access` + `user_subscriptions`
 * directly — no sync job, no second database.
 */
import { handleBotUpdate } from '../../lib/telegram/bot';
import { ensureBotTables, claimUpdate, logEvent, newId, insertDelivery, nowIso } from '../../lib/telegram/store';
import { grantToolAccess } from '../../lib/telegram/grant';
import { normalizePhone } from '../../lib/userAuth';
import { botProduct, botPlans, botProductPath } from '../../lib/telegram/pricing';
import { sendMessage } from '../../lib/telegram/tgApi';

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });

export interface TelegramEnv {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_IDS?: string;
  BOT_CARD_NUMBER?: string;
  BOT_CARD_HOLDER?: string;
  TELEGRAM_AUTO_APPROVE?: string;
  GEMINI_API_KEY?: string;
  Gemini_api_key?: string;
  TELEGRAM_VISION_MODEL?: string;
  SITE_URL?: string;
  SUPPORT_HANDLE?: string;
}

const siteBase = (env: TelegramEnv) => String(env.SITE_URL || 'https://omidadli.site').replace(/\/+$/, '');

/* ------------------------------- webhook ------------------------------- */

const handleWebhook = async (request: Request, env: TelegramEnv, ctx: ExecutionContext): Promise<Response> => {
  const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '');
  if (!secret) return json({ ok: false, error: 'bot_not_configured' }, { status: 503 });

  // Telegram echoes our secret in this header on every call.
  const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (got !== secret) return json({ ok: false, error: 'forbidden' }, { status: 401 });

  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'no_token' }, { status: 503 });

  let update: any;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  // Deduplicate: Telegram retries updates when it doesn't get a fast 200.
  if (typeof update?.update_id === 'number') {
    const fresh = await claimUpdate(env, update.update_id);
    if (!fresh) return json({ ok: true, duplicate: true });
  }

  // Acknowledge immediately (Telegram timeout is ~60s) and finish in background.
  ctx.waitUntil(
    handleBotUpdate(env, update).catch(async (e) => {
      await logEvent(env, 'update_error', `${update?.update_id || '?'}: ${String(e?.message || e)}`);
    })
  );
  return json({ ok: true });
};

/* ------------------------- website → delivery bridge ------------------------- */

export const handleDeliver = async (request: Request, env: TelegramEnv): Promise<Response> => {
  const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '');
  if (!secret || request.headers.get('X-Bot-Webhook-Secret') !== secret) {
    return json({ ok: false, error: 'forbidden' }, { status: 401 });
  }
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'no_token' }, { status: 503 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const phone = normalizePhone(String(body?.phone || ''));
  if (!phone) return json({ ok: false, error: 'invalid_phone' }, { status: 400 });

  const productId = String(body?.productId || '');
  const product = botProduct(productId);
  const plan = productId && body?.planId ? botPlans(productId).find((p) => p.id === String(body.planId)) : undefined;
  const productName = String(body?.productName || product?.name || productId || 'محصول');
  const planName = plan?.name || String(body?.planName || '');
  const orderId = String(body?.orderId || '');

  await ensureBotTables(env);

  // Issue/extend the access code (same D1 the site reads) unless the caller
  // already did it and is only asking us to notify.
  let code = String(body?.code || '');
  let expiresAt = String(body?.expiresAt || '');
  if (!code && productId) {
    const grant = await grantToolAccess(env, {
      phone,
      productId,
      planId: plan?.id,
      days: plan?.durationDays,
      messageQuota: plan?.messageQuota,
      maxDevices: plan?.maxDevices,
      note: orderId ? `website order ${orderId}` : 'website delivery',
      productName,
      priceLabel: plan?.price || String(body?.price || ''),
      features: plan?.perks,
    });
    code = grant.code;
    expiresAt = grant.expiresAt;
  }
  if (!code) return json({ ok: false, error: 'missing_code' }, { status: 400 });

  // Find the Telegram account verified with this phone.
  const linked = await env.DB.prepare(`SELECT tg_user_id FROM bot_users WHERE phone = ?1 AND verified_at <> '' LIMIT 1`)
    .bind(phone)
    .first<{ tg_user_id: string }>();

  const deliveryId = newId('del');
  const queued = !linked;
  await insertDelivery(env, {
    id: deliveryId,
    tg_user_id: linked?.tg_user_id || '',
    phone,
    product_id: productId,
    product_name: productName,
    plan_name: planName,
    order_id: orderId,
    status: queued ? 'queued' : 'pending_send',
    source: 'website',
    code,
    expires_at: expiresAt,
    note: String(body?.note || ''),
    created_at: nowIso(),
    delivered_at: '',
  });

  if (linked?.tg_user_id) {
    const text = [
      '🎁 <b>محصول جدید برای شما فعال شد</b>',
      '',
      `📦 محصول: <b>${productName}</b>${planName ? ` — ${planName}` : ''}`,
      `🔑 کد دسترسی: <code>${code}</code>`,
      expiresAt ? `📅 اعتبار تا: ${expiresAt.slice(0, 10)}` : '',
      '',
      '📱 در صفحه‌ی محصول در سایت، شماره موبایل و همین کد را وارد کنید.',
      productId ? `🔗 ${siteBase(env)}${botProductPath(productId)}` : '',
      `🆔 کد پیگیری: <code>${deliveryId}</code>`,
    ].filter(Boolean).join('\n');
    try {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, linked.tg_user_id, text);
      await env.DB.prepare(`UPDATE bot_deliveries SET status = 'delivered', delivered_at = ?1 WHERE id = ?2`)
        .bind(nowIso(), deliveryId)
        .run();
    } catch (e: any) {
      await env.DB.prepare(`UPDATE bot_deliveries SET status = 'failed', note = ?1 WHERE id = ?2`)
        .bind(String(e?.message || e).slice(0, 200), deliveryId)
        .run();
    }
  }

  await logEvent(env, 'website_delivery', `${deliveryId} ${productId} ${phone} linked=${!!linked}`);
  return json({ ok: true, deliveryId, queued, linked: !!linked, code, expiresAt });
};

/* ------------------------------- setup/info ------------------------------- */

const handleSetup = async (request: Request, env: TelegramEnv): Promise<Response> => {
  const url = new URL(request.url);
  const provided = url.searchParams.get('setup') || request.headers.get('X-Telegram-Setup-Secret') || '';
  const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '');
  if (!secret || provided !== secret) return json({ ok: false, error: 'forbidden' }, { status: 401 });
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'no_token' }, { status: 503 });

  const webhookUrl = `${url.origin}/api/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (data.ok) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'شروع و منوی اصلی' },
          { command: 'verify', description: 'احراز هویت شماره تلفن' },
          { command: 'buy', description: 'خرید اشتراک محصولات' },
          { command: 'mysubs', description: 'اشتراک‌های من' },
          { command: 'orders', description: 'سفارش‌های من' },
          { command: 'support', description: 'پشتیبانی' },
          { command: 'help', description: 'راهنما' },
        ],
      }),
    }).catch(() => null);
  }
  return json({ ok: !!data.ok, webhookUrl, telegram: data });
};

export const onRequest = async (context: { request: Request; env: TelegramEnv; params?: any; waitUntil?: (p: Promise<any>) => void }): Promise<Response> => {
  const { request, env } = context;
  const execCtx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => {
      if (context.waitUntil) context.waitUntil(p);
      else void p;
    },
    passThroughOnException: () => {},
  } as ExecutionContext;

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path.endsWith('/deliver')) {
    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
    try {
      return await handleDeliver(request, env);
    } catch (e: any) {
      // Never leak a stack trace to the caller; log for the dashboard.
      const message = String(e?.message || e);
      await logEvent(env, 'deliver_error', message).catch(() => null);
      return json({ ok: false, error: 'deliver_failed', message: message.slice(0, 300) }, { status: 500 });
    }
  }

  if (request.method === 'POST' && request.headers.has('X-Telegram-Setup-Secret')) return handleSetup(request, env);
  if (request.method === 'POST') return handleWebhook(request, env, execCtx);

  if (request.method === 'GET') {
    if (url.searchParams.has('setup')) return handleSetup(request, env);
    return json({
      ok: true,
      bot: request.headers.get('host') ? 'omidadli-telegram-bot' : '',
      configured: {
        token: !!env.TELEGRAM_BOT_TOKEN,
        secret: !!env.TELEGRAM_WEBHOOK_SECRET,
        admins: String(env.TELEGRAM_ADMIN_IDS || '').split(',').filter((s) => s.trim()).length,
        vision: !!(env.GEMINI_API_KEY || env.Gemini_api_key),
        autoApprove: String(env.TELEGRAM_AUTO_APPROVE || 'vision'),
        card: !!env.BOT_CARD_NUMBER,
      },
      docs: 'docs/TELEGRAM-BOT-PROMPT.md',
    });
  }

  return json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
};
