/**
 * lib/payment/http.ts — Unified HTTP handler for `/api/payment/*`.
 *
 * Shared by Cloudflare Pages Functions (`functions/api/payment.ts` +
 * `functions/_middleware.ts`) and local Vite Dev (`vite-dev-api.ts`) so
 * production and development behave identically.
 */

import { getPlan, resolvePlanPrice } from '../toolPlans';
import { getTool, scopeCovers, signAccessToken } from '../tools';
import { priceToToman } from '../telegram/pricing';
import {
  applyAutoApprovePolicy,
  decideReceipt,
  detectBase64ImageMime,
  faDigits,
  parsePaymentDetails,
  readReceiptWithVision,
} from '../telegram/receipt';
import { ensureBotTables, updateOrder as updateBotOrder } from '../telegram/store';
import * as tg from '../telegram/tgApi';
import { normalizePhone } from '../userAuth';
import {
  authenticateDeviceToken,
  authenticateMerchantApiKey,
  cleanCardNumber,
  cleanIban,
  createGatewayPayment,
  detectIranBank,
  ensurePaymentTables,
  formatCardNumber,
  fulfillGatewayPayment,
  getOnlineDeviceSummary,
  getPaymentSettingsMap,
  hmacSha256Hex,
  hydratePaymentEnv,
  isReceiptRefUsedAnywhere,
  isValidIranBankCard,
  maskCardNumber,
  processIncomingBankSms,
  randomHex,
  recordDeviceHeartbeat,
  setPaymentSettings,
  sha256Hex,
  sweepExpiredPayments,
  toLatinDigits,
  verifyGatewayPayment,
  type PaymentCardRow,
  type PaymentDeviceRow,
  type PaymentEnv,
  type PaymentOrderRow,
} from './gateway';
import {
  renderIosBridgeIconSvg,
  renderIosBridgeManifest,
  renderIosBridgeServiceWorker,
  renderIosSmsBridgeHtml,
} from './iosBridge';

export interface PaymentRequestContext {
  request: Request;
  env: PaymentEnv;
  isAdmin: () => Promise<boolean>;
  verifyAdminPassword?: (password: string) => Promise<boolean>;
  getCurrentUser: () => Promise<{ id: string; phone?: string; phone_verified_at?: string; full_name?: string } | null>;
  loadCmsData?: () => Promise<any>;
}

const RECEIPT_REASON_FA: Record<string, string> = {
  ref_missing: 'شماره پیگیری از روی رسید قابل تشخیص نبود.',
  ref_mismatch: 'شماره پیگیری تایپ‌شده با شماره چاپ‌شده روی تصویر رسید مغایرت دارد.',
  duplicate_ref: 'این شماره پیگیری قبلاً استفاده شده است.',
  amount_missing: 'مبلغ واریزی از روی رسید قابل تشخیص نبود.',
  amount_mismatch: 'مبلغ مندرج در رسید با مبلغ سفارش مطابقت ندارد.',
  recipient_name_missing: 'نام صاحب حساب مقصد روی رسید قابل خواندن نیست.',
  recipient_name_mismatch: 'نام گیرنده در رسید با نام صاحب کارت درگاه مطابقت ندارد.',
  card_last4_mismatch: '۴ رقم آخر کارت مقصد در رسید با کارت درگاه مطابقت ندارد.',
  date_missing: 'تاریخ تراکنش روی رسید مشخص نیست.',
  date_unreadable: 'فرمت تاریخ تراکنش روی رسید قابل تشخیص نبود.',
  date_out_of_range: 'تاریخ/ساعت رسید خارج از بازه زمانی این سفارش است.',
  vision_failed: 'تصویر رسید به‌صورت خودکار خوانده نشد و به بررسی دستی ارجاع شد.',
  not_a_receipt: 'تصویر ارسالی شبیه رسید بانکی معتبر نیست.',
  unpaid_preview_screen: 'تصویر مربوط به پیش‌نمایش قبل از پرداخت است، نه رسید نهایی تراکنش موفق.',
  failed_transfer: 'وضعیت تراکنش در رسید «ناموفق» تشخیص داده شد.',
  suspected_tampering: 'تصویر رسید مشکوک به ویرایش یا دستکاری تشخیص داده شد.',
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });

const payexaErr = (code: string, message: string, status = 400, fields?: Record<string, string>): Response =>
  json({ ok: false, error: { code, message, ...(fields ? { fields } : {}) } }, status);

const extractToken = (request: Request, headerName = 'X-API-KEY'): string => {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get(headerName) || '').trim();
};

const buildReceiptDataUri = (rawB64: string): string => {
  const trimmed = String(rawB64 || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  return `data:${detectBase64ImageMime(trimmed)};base64,${trimmed}`;
};

const rejectGatewayOrder = async (env: PaymentEnv, row: PaymentOrderRow, via: string): Promise<void> => {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE payment_orders SET status = 'rejected', receipt_ref = '', updated_at = ?1 WHERE id = ?2`
  )
    .bind(nowIso, row.id)
    .run();

  try {
    await ensureBotTables(env as any);
    const botOrd = await env.DB.prepare(
      `SELECT id, tg_user_id FROM bot_orders WHERE id = ?1 OR payment_id = ?2 LIMIT 1`
    )
      .bind(row.order_id, row.id)
      .first<{ id: string; tg_user_id: string }>();
    if (botOrd) {
      await updateBotOrder(env as any, botOrd.id, {
        status: 'rejected',
        decided_at: nowIso,
        decided_by: via,
      });
    }
    const targetTg = row.tg_user_id || botOrd?.tg_user_id || '';
    if (targetTg && env.TELEGRAM_BOT_TOKEN) {
      await tg
        .sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          targetTg,
          [
            '❌ <b>رسید ارسالی شما تأیید نشد.</b>',
            `🆔 شناسه پرداخت: <code>${tg.escapeHtml(row.id)}</code>`,
            'لطفاً در صورت انجام واریز، تصویر کامل و واضح رسید نهایی تراکنش موفق (حاوی شماره پیگیری، مبلغ و نام گیرنده) را ارسال نمایید.',
          ].join('\n')
        )
        .catch(() => {});
    }
  } catch {
    /* optional telegram sync */
  }
};

const safeJsonBody = async (request: Request): Promise<any> => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

/** Bind device & issue signed paid-tool token once a payment has been fulfilled. */
const mintToolSessionFromOrder = async (
  env: PaymentEnv,
  order: PaymentOrderRow,
  deviceId: string
): Promise<string> => {
  const secret = String(env.AUTH_SECRET || '');
  const did = String(deviceId || '').trim().slice(0, 80);
  if (!secret || !did || !order.product_id || !order.phone || !order.access_code) return '';

  const rows = (
    await env.DB.prepare(`SELECT * FROM tool_access WHERE phone = ?1 AND code = ?2 AND status = 'active'`)
      .bind(order.phone, order.access_code)
      .all<any>()
  ).results || [];
  const grant = rows.find((r) => scopeCovers(r.product_id, order.product_id));
  if (!grant) return '';

  let devices: string[] = [];
  try {
    const parsed = JSON.parse(grant.devices || '[]');
    if (Array.isArray(parsed)) devices = parsed.filter((x) => typeof x === 'string');
  } catch {
    devices = [];
  }

  if (!devices.includes(did)) {
    if (devices.length >= Number(grant.max_devices || 1)) return '';
    devices.push(did);
    await env.DB.prepare(`UPDATE tool_access SET devices = ?1 WHERE id = ?2`)
      .bind(JSON.stringify(devices), grant.id)
      .run()
      .catch(() => {});
  }

  const exp = grant.expires_at
    ? Math.min(Date.parse(grant.expires_at), Date.now() + 30 * 86400_000)
    : Date.now() + 30 * 86400_000;
  return signAccessToken({ phone: order.phone, scope: grant.product_id, did, gid: grant.id, exp }, secret);
};

export const handlePaymentRequest = async (ctx: PaymentRequestContext): Promise<Response> => {
  const { request } = ctx;
  const rawEnv = ctx.env;
  await ensurePaymentTables(rawEnv);

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const cleanPathname = url.pathname.replace(/\/+$/, '') || '/';

  /* =======================================================================
   * 0. STANDALONE iOS < 16 / iPHONE X SMS BRIDGE PWA (`/sms-bridge/*`)
   * ======================================================================= */
  if (cleanPathname === '/sms-bridge' && (method === 'GET' || method === 'HEAD')) {
    return new Response(method === 'HEAD' ? null : renderIosSmsBridgeHtml(url.origin), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
  if (cleanPathname === '/sms-bridge/manifest.webmanifest' && (method === 'GET' || method === 'HEAD')) {
    return new Response(method === 'HEAD' ? null : renderIosBridgeManifest(url.origin), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  if (cleanPathname === '/sms-bridge/sw.js' && (method === 'GET' || method === 'HEAD')) {
    return new Response(method === 'HEAD' ? null : renderIosBridgeServiceWorker(), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Service-Worker-Allowed': '/sms-bridge',
      },
    });
  }
  if (cleanPathname === '/sms-bridge/icon.svg' && (method === 'GET' || method === 'HEAD')) {
    return new Response(method === 'HEAD' ? null : renderIosBridgeIconSvg(), {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  // Strip leading `/api/payment` prefix so sub-paths are clean
  const subPath = url.pathname.replace(/^\/api\/payment\/?/, '').replace(/\/+$/, '');

  // CORS preflight for Android app / external webhooks if needed
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-KEY, X-Device-Token, X-Buyer-Secret, X-Device-Id',
      },
    });
  }

  // Hydrate runtime settings synced via `/sms-bridge` (BluBank card + Telegram bot + Gemini Vision key)
  const env = await hydratePaymentEnv(rawEnv);

  /* =======================================================================
   * 1. ANDROID SMS UPLOADER DEVICE ENDPOINTS (`/api/payment/device/*`)
   * ======================================================================= */
  if (subPath === 'device/ping' || subPath === 'device/sms') {
    if (method !== 'POST') return payexaErr('METHOD_NOT_ALLOWED', 'فقط متد POST مجاز است.', 405);
    const rawDevToken = extractToken(request, 'X-Device-Token');
    const device = await authenticateDeviceToken(env, rawDevToken);
    if (!device) {
      return payexaErr('UNAUTHORIZED', 'توکن دستگاه معتبر نیست یا غیرفعال شده است.', 401);
    }

    const body = await safeJsonBody(request);
    await recordDeviceHeartbeat(env, device.id, {
      batteryLevel: typeof body?.battery_level === 'number' ? body.battery_level : body?.batteryLevel,
      deviceModel: body?.device_model || body?.deviceModel,
      appVersion: body?.app_version || body?.appVersion,
    });

    if (subPath === 'device/ping') {
      await sweepExpiredPayments(env);
      const pendingRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payment_orders WHERE status = 'pending'`).first<{ c: number }>();
      const pendingCount = pendingRow?.c || 0;
      return json({
        ok: true,
        pendingOrdersCount: pendingCount,
        data: {
          device_id: device.id,
          device_name: device.name,
          server_time: new Date().toISOString(),
          pending_payments: pendingCount,
        },
      });
    }

    // `device/sms` — single message or batch `{ messages: [...] }`
    const rawList: any[] = Array.isArray(body?.messages)
      ? body.messages.slice(0, 50)
      : body?.body || body?.message || body?.text
      ? [body]
      : [];

    if (!rawList.length) {
      return payexaErr('VALIDATION_ERROR', 'متن پیامک ارسال نشده است.', 422);
    }

    const results = [];
    let matchedCount = 0;
    for (const item of rawList) {
      const outcome = await processIncomingBankSms(env, device.id, {
        sender: String(item?.sender || item?.from || item?.address || ''),
        body: String(item?.body || item?.message || item?.text || ''),
        receivedAt: item?.received_at ?? item?.receivedAt ?? item?.timestamp,
        smsId: item?.sms_id ? String(item.sms_id) : item?.id ? String(item.id) : undefined,
      });
      if (outcome.status === 'matched') matchedCount++;
      results.push({
        status: outcome.status,
        amount_rial: outcome.parsed.amountRial,
        bank: outcome.parsed.bankName,
        matched_payment_id: outcome.matchedPaymentId || null,
        order_id: outcome.matchedOrderId || null,
      });
    }

    const firstRes = results[0] || null;
    return json({
      ok: true,
      matched: matchedCount > 0,
      status: firstRes?.status || 'ignored',
      matchedPaymentId: firstRes?.matched_payment_id || null,
      data: {
        processed: results.length,
        matched: matchedCount,
        results,
      },
    });
  }

  /* =======================================================================
   * 1B. iPHONE / iOS < 16 BRIDGE & 1-STEP BLUBANK/TELEGRAM SYNC (`/api/payment/ios/*`)
   * ======================================================================= */
  if (subPath === 'ios/setup' && method === 'POST') {
    const body = await safeJsonBody(request);
    const rawDevToken = (url.searchParams.get('token') || '').trim() || extractToken(request, 'X-Device-Token');
    const existingDevice = rawDevToken ? await authenticateDeviceToken(env, rawDevToken) : null;
    const adminSessionOk = await ctx.isAdmin().catch(() => false);

    let passwordOk = false;
    const providedPass = String(body?.adminPassword || '').trim();
    if (!existingDevice && !adminSessionOk) {
      if (!providedPass) {
        return payexaErr('UNAUTHORIZED', 'لطفاً رمز مدیریت سایت را وارد کنید تا همگام‌سازی انجام شود.', 401);
      }
      if (ctx.verifyAdminPassword) {
        passwordOk = await ctx.verifyAdminPassword(providedPass);
      } else if (env.ADMIN_PASSWORD) {
        const secret = env.AUTH_SECRET || 'omidpay-setup-compare';
        const [a, b] = await Promise.all([
          hmacSha256Hex(secret, providedPass),
          hmacSha256Hex(secret, String(env.ADMIN_PASSWORD)),
        ]);
        passwordOk = a === b;
      }
      if (!passwordOk) {
        return payexaErr('UNAUTHORIZED', 'رمز مدیریت سایت اشتباه است.', 401);
      }
    }

    const cardDigits = cleanCardNumber(String(body?.cardNumber || ''));
    const holderName = String(body?.holderName || '').trim().slice(0, 80);
    if (!isValidIranBankCard(cardDigits)) {
      return payexaErr('VALIDATION_ERROR', 'شماره کارت ۱۶ رقمی معتبر نیست (رقم کنترلی کارت بانکی را بررسی کنید).', 422);
    }
    if (!holderName || holderName.length < 3) {
      return payexaErr('VALIDATION_ERROR', 'نام و نام خانوادگی صاحب حساب (دقیقاً مطابق بلوبانک/کارت) الزامی است.', 422);
    }

    const bankInfo = detectIranBank(cardDigits);
    const nowIso = new Date().toISOString();

    // 1) Upsert destination card as primary active card & deactivate auto-seeded placeholder card
    await env.DB.prepare(`UPDATE payment_cards SET is_active = 0 WHERE id = 'card-env-default'`)
      .run()
      .catch(() => {});

    const sameCard = await env.DB.prepare(`SELECT id FROM payment_cards WHERE card_number = ?1 LIMIT 1`)
      .bind(cardDigits)
      .first<{ id: string }>();

    if (sameCard) {
      await env.DB.prepare(
        `UPDATE payment_cards
         SET holder_name = ?1, bank_name = ?2, bank_slug = ?3, is_active = 1, priority = 0, updated_at = ?4
         WHERE id = ?5`
      )
        .bind(holderName, bankInfo.name, bankInfo.slug, nowIso, sameCard.id)
        .run();
      await env.DB.prepare(`UPDATE payment_cards SET priority = priority + 1 WHERE id <> ?1 AND priority = 0`)
        .bind(sameCard.id)
        .run()
        .catch(() => {});
    } else {
      await env.DB.prepare(`UPDATE payment_cards SET priority = priority + 1 WHERE priority = 0`)
        .run()
        .catch(() => {});
      await env.DB.prepare(
        `INSERT INTO payment_cards (id, card_number, holder_name, iban, bank_name, bank_slug, is_active, priority, daily_limit_rial, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', ?4, ?5, 1, 0, 0, ?6, ?7)`
      )
        .bind(`card-${Date.now().toString(36)}-${randomHex(3)}`, cardDigits, holderName, bankInfo.name, bankInfo.slug, nowIso, nowIso)
        .run();
    }

    // 2) Sync Telegram Bot Token, Admin ID, Webhook Secret & optional Gemini Vision Key
    const currentSettings = await getPaymentSettingsMap(env);
    const botTokenInput = String(body?.telegramBotToken || '').trim();
    const adminIdInput = faDigits(String(body?.telegramAdminId || '')).replace(/[^\d,\s-]/g, '').trim();
    const visionKeyInput = String(body?.geminiVisionKey || '').trim();

    const settingsPatch: Record<string, string> = {};
    const finalBotToken =
      botTokenInput && !botTokenInput.includes('••')
        ? botTokenInput
        : currentSettings.telegram_bot_token || String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const finalAdminIds = adminIdInput || currentSettings.telegram_admin_ids || String(env.TELEGRAM_ADMIN_IDS || '').trim();
    const finalWebhookSecret =
      currentSettings.telegram_webhook_secret || String(env.TELEGRAM_WEBHOOK_SECRET || '').trim() || randomHex(20);

    if (botTokenInput && !botTokenInput.includes('••')) settingsPatch.telegram_bot_token = botTokenInput;
    if (adminIdInput) settingsPatch.telegram_admin_ids = adminIdInput;
    if (visionKeyInput && !visionKeyInput.includes('••')) settingsPatch.receipt_gemini_key = visionKeyInput;
    settingsPatch.telegram_webhook_secret = finalWebhookSecret;

    let botUsername = currentSettings.telegram_bot_username || String(env.TELEGRAM_BOT_USERNAME || '').trim();
    let webhookRegistered = false;
    let telegramNotified = false;

    if (finalBotToken && /^\d+:/.test(finalBotToken)) {
      // Discover @username via getMe
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${finalBotToken}/getMe`);
        const meJson: any = await meRes.json().catch(() => null);
        if (meJson?.ok && meJson.result?.username) {
          botUsername = String(meJson.result.username);
          settingsPatch.telegram_bot_username = botUsername;
        }
      } catch {
        /* offline / sandbox egress */
      }

      // Auto-register Telegram Webhook if running on public HTTPS origin
      if (/^https:\/\//i.test(url.origin)) {
        try {
          const whRes = await fetch(`https://api.telegram.org/bot${finalBotToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${url.origin}/api/telegram`,
              secret_token: finalWebhookSecret,
              allowed_updates: ['message', 'callback_query'],
            }),
          });
          const whJson: any = await whRes.json().catch(() => null);
          webhookRegistered = Boolean(whJson?.ok);
          if (webhookRegistered) {
            await fetch(`https://api.telegram.org/bot${finalBotToken}/setMyCommands`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                commands: [
                  { command: 'start', description: 'شروع و منوی اصلی' },
                  { command: 'verify', description: 'احراز هویت شماره موبایل' },
                  { command: 'buy', description: 'خرید اشتراک محصولات' },
                  { command: 'mysubs', description: 'اشتراک‌های من' },
                  { command: 'orders', description: 'سفارش‌های من' },
                  { command: 'support', description: 'پشتیبانی' },
                  { command: 'help', description: 'راهنما' },
                ],
              }),
            }).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }

      // Send live sync confirmation to Admin on Telegram!
      const firstAdmin = finalAdminIds.split(',').map((s) => s.trim()).filter(Boolean)[0];
      if (firstAdmin) {
        try {
          await tg.sendMessage(
            finalBotToken,
            firstAdmin,
            [
              '✅ <b>همگام‌سازی خودکار وب‌اپ آیفون با بلوبانک و تلگرام انجام شد!</b>',
              '',
              `🏦 بانک فعال: <b>${tg.escapeHtml(bankInfo.name)}</b>`,
              `💳 کارت مقصد: <code>${tg.escapeHtml(formatCardNumber(cardDigits))}</code>`,
              `👤 صاحب حساب: <b>${tg.escapeHtml(holderName)}</b>`,
              '',
              '💡 <b>نکته سریع:</b> علاوه بر اتوماسیون Shortcuts آیفون، هر زمان پیامک واریز بلوبانک را مستقیماً در همین چت ربات هم Paste/Forward کنید، ربات در کسری از ثانیه سفارش مشتری را تایید و تحویل می‌دهد!',
            ].join('\n')
          );
          telegramNotified = true;
        } catch {
          /* ignore */
        }
      }
    }

    await setPaymentSettings(env, settingsPatch);

    // 3) Auto-provision or keep iPhone device token so NO separate 6-digit code step is needed!
    let outDeviceToken = rawDevToken;
    let outDeviceId = existingDevice?.id || '';
    let outDeviceName = existingDevice?.name || String(body?.deviceName || 'آیفون بلوبانک من').trim();

    if (!existingDevice) {
      outDeviceToken = `omid_dev_${randomHex(20)}`;
      const tokenHash = await sha256Hex(outDeviceToken);
      const tokenMask = `${outDeviceToken.slice(0, 12)}…${outDeviceToken.slice(-4)}`;
      outDeviceId = `dev-ios-${Date.now().toString(36)}`;
      await env.DB.prepare(
        `INSERT INTO payment_devices (id, name, device_serial, token_hash, token_mask, pair_code, pair_token, pair_expires_at, is_active, last_seen_at, battery_level, device_model, app_version, sms_count, matched_count, created_at)
         VALUES (?1,?2,'iPhone-AutoSync',?3,?4,'','','',1,?5,-1,?6,'ios-pwa-2.0',0,0,?7)`
      )
        .bind(
          outDeviceId,
          outDeviceName,
          tokenHash,
          tokenMask,
          nowIso,
          String(body?.deviceModel || 'iPhone (BluBank Sync)').slice(0, 80),
          nowIso
        )
        .run();
    } else {
      await recordDeviceHeartbeat(env, existingDevice.id, {
        deviceModel: String(body?.deviceModel || existingDevice.device_model || 'iPhone (BluBank Sync)').slice(0, 80),
        appVersion: 'ios-pwa-2.0',
      });
    }

    const refreshedEnv = await hydratePaymentEnv(rawEnv);

    return json({
      ok: true,
      device_id: outDeviceId,
      device_name: outDeviceName,
      device_token: outDeviceToken,
      ios_sms_url: `${url.origin}/api/payment/ios/sms?token=${encodeURIComponent(outDeviceToken)}`,
      ios_sms_get_url: `${url.origin}/api/payment/ios/sms?token=${encodeURIComponent(outDeviceToken)}&text=`,
      card: {
        number: cardDigits,
        formatted: formatCardNumber(cardDigits),
        holder_name: holderName,
        bank: bankInfo.name,
        bank_slug: bankInfo.slug,
      },
      telegram: {
        configured: Boolean(finalBotToken),
        bot_username: botUsername || null,
        admin_ids: finalAdminIds,
        webhook_registered: webhookRegistered,
        notified: telegramNotified,
      },
      vision_ready: Boolean(refreshedEnv.TELEGRAM_RECEIPT_GEMINI_API_KEY),
    });
  }

  if (subPath === 'ios/pair' && method === 'POST') {
    const body = await safeJsonBody(request);
    const code = toLatinDigits(String(body?.code || '')).replace(/\D/g, '');
    if (code.length !== 6) {
      return payexaErr('VALIDATION_ERROR', 'کد اتصال باید دقیقاً ۶ رقم باشد.', 422);
    }

    const nowIso = new Date().toISOString();
    // Clear expired pairing codes first
    await env.DB.prepare(
      `UPDATE payment_devices SET pair_code = '', pair_token = '', pair_expires_at = '' WHERE pair_expires_at <> '' AND pair_expires_at <= ?1`
    )
      .bind(nowIso)
      .run()
      .catch(() => {});

    const dev = await env.DB.prepare(
      `SELECT * FROM payment_devices WHERE pair_code = ?1 AND is_active = 1 AND pair_expires_at > ?2 LIMIT 1`
    )
      .bind(code, nowIso)
      .first<PaymentDeviceRow>();

    if (!dev || !dev.pair_token) {
      return payexaErr('UNAUTHORIZED', 'کد ۶ رقمی نامعتبر است یا منقضی شده است. از پنل ادمین کد جدید بگیرید.', 401);
    }

    const rawToken = dev.pair_token;
    // Single-use: wipe temporary pairing credentials immediately
    await env.DB.prepare(
      `UPDATE payment_devices SET pair_code = '', pair_token = '', pair_expires_at = '' WHERE id = ?1`
    )
      .bind(dev.id)
      .run();

    await recordDeviceHeartbeat(env, dev.id, {
      deviceModel: String(body?.deviceModel || 'iPhone (iOS WebApp)').slice(0, 80),
      appVersion: 'ios-pwa-1.0',
    });

    return json({
      ok: true,
      device_id: dev.id,
      device_name: dev.name,
      device_token: rawToken,
      server_url: `${url.origin}/api/payment`,
      ios_sms_url: `${url.origin}/api/payment/ios/sms?token=${encodeURIComponent(rawToken)}&text=`,
    });
  }

  if (
    subPath === 'ios/sms' ||
    subPath === 'ios/poll' ||
    subPath === 'ios/config' ||
    subPath === 'ios/self-test' ||
    subPath === 'ios/quick-confirm' ||
    subPath === 'ios/review-decision' ||
    subPath === 'ios/receipt-image'
  ) {
    const rawDevToken =
      (url.searchParams.get('token') || '').trim() ||
      extractToken(request, 'X-Device-Token');
    const device = await authenticateDeviceToken(env, rawDevToken);
    if (!device) {
      return payexaErr('UNAUTHORIZED', 'توکن آیفون معتبر نیست یا غیرفعال شده است.', 401);
    }

    if (subPath === 'ios/config' && method === 'GET') {
      const activeCard = await env.DB.prepare(
        `SELECT * FROM payment_cards WHERE is_active = 1 ORDER BY priority ASC, created_at ASC LIMIT 1`
      ).first<PaymentCardRow>();
      return json({
        ok: true,
        device_name: device.name,
        card: activeCard
          ? {
              number: activeCard.card_number,
              formatted: formatCardNumber(activeCard.card_number),
              holder_name: activeCard.holder_name,
              bank: activeCard.bank_name,
              bank_slug: activeCard.bank_slug,
            }
          : null,
        telegram: {
          configured: Boolean(env.TELEGRAM_BOT_TOKEN),
          bot_username: env.TELEGRAM_BOT_USERNAME || '',
          admin_ids: env.TELEGRAM_ADMIN_IDS || '',
        },
        vision_ready: Boolean(env.TELEGRAM_RECEIPT_GEMINI_API_KEY),
      });
    }

    if (subPath === 'ios/poll' && method === 'GET') {
      await recordDeviceHeartbeat(env, device.id, {
        deviceModel: device.device_model || 'iPhone (iOS WebApp)',
        appVersion: device.app_version || 'ios-pwa-2.0',
      });
      await sweepExpiredPayments(env);
      const [pendingRes, reviewRes, logsRes, cardRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, order_id, payable_amount_rial, amount_rial, phone, product_name, description, expires_at
           FROM payment_orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`
        ).all<any>(),
        env.DB.prepare(
          `SELECT id, order_id, payable_amount_rial, amount_rial, phone, product_name, description, receipt_ref, receipt_note,
                  CASE WHEN receipt_image_b64 <> '' THEN 1 ELSE 0 END AS has_image, receipt_submitted_at
           FROM payment_orders WHERE status = 'needs_review' ORDER BY updated_at DESC LIMIT 15`
        ).all<any>(),
        env.DB.prepare(
          `SELECT id, status, parsed_amount_rial, body_sanitized, created_at
           FROM payment_sms_logs ORDER BY created_at DESC LIMIT 20`
        ).all<any>(),
        env.DB.prepare(
          `SELECT card_number, holder_name, bank_name, bank_slug FROM payment_cards WHERE is_active = 1 ORDER BY priority ASC, created_at ASC LIMIT 1`
        ).first<any>(),
      ]);

      const nowMs = Date.now();
      const pendingOrders = (pendingRes.results || []).map((o) => ({
        id: o.id,
        order_id: o.order_id,
        payable_amount_rial: o.payable_amount_rial,
        amount_rial: o.amount_rial,
        phone: o.phone,
        product_name: o.product_name,
        description: o.description,
        seconds_remaining: Math.max(0, Math.floor((Date.parse(o.expires_at) - nowMs) / 1000)),
      }));

      return json({
        ok: true,
        device_id: device.id,
        device_name: device.name,
        matched_count: device.matched_count,
        card_summary: cardRow
          ? {
              masked: maskCardNumber(cardRow.card_number),
              holder_name: cardRow.holder_name,
              bank: cardRow.bank_name,
            }
          : null,
        telegram_ready: Boolean(env.TELEGRAM_BOT_TOKEN),
        vision_ready: Boolean(env.TELEGRAM_RECEIPT_GEMINI_API_KEY),
        pending_orders: pendingOrders,
        review_orders: reviewRes.results || [],
        recent_logs: logsRes.results || [],
      });
    }

    if (subPath === 'ios/self-test' && method === 'POST') {
      const testOrderId = `selftest-${Date.now().toString(36)}`;
      const created = await createGatewayPayment(env, {
        orderId: testOrderId,
        amountRial: 150_000,
        source: 'api',
        description: '[تست خودکار اتصال بلوبانک و ربات تلگرام]',
        originUrl: url.origin,
      });
      if ('error' in created) {
        return json({ ok: false, error: created.error.message }, created.httpStatus);
      }

      const sampleSms = `بلوبانک\n${created.data.payable_amount.toLocaleString('en-US')} ریال به حسابتان نشست.\nموجودی: ۱۲,۵۰۰,۰۰۰ ریال`;
      const smsOutcome = await processIncomingBankSms(env, device.id, {
        sender: 'BluBank-SelfTest',
        body: sampleSms,
        smsId: `selftest-sms-${Date.now()}`,
      });

      // Clean up the synthetic test order so revenue stats stay 100% accurate!
      await env.DB.prepare(`DELETE FROM payment_orders WHERE id = ?1`)
        .bind(created.data.payment_id)
        .run()
        .catch(() => {});

      const isMatched = smsOutcome.status === 'matched';
      let tgSent = false;
      const firstAdmin = String(env.TELEGRAM_ADMIN_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (env.TELEGRAM_BOT_TOKEN && firstAdmin) {
        try {
          await tg.sendMessage(
            env.TELEGRAM_BOT_TOKEN,
            firstAdmin,
            [
              '🧪 <b>تست خودکار درگاه بلوبانک و تلگرام با موفقیت انجام شد!</b>',
              `🏦 کارت مقصد: <code>${tg.escapeHtml(created.data.card.formatted)}</code> (${tg.escapeHtml(created.data.card.bank)})`,
              `💰 تخصیص مبلغ یکتا و تطبیق پیامک بلوبانک: <b>${isMatched ? 'موفق ✅' : 'بررسی شود ⚠️'}</b>`,
              `🧠 موتور هوشمند تشخیص رسید بانکی: <b>${env.TELEGRAM_RECEIPT_GEMINI_API_KEY ? 'فعال ✅' : 'نیازمند کلید Gemini'}</b>`,
            ].join('\n')
          );
          tgSent = true;
        } catch {
          /* ignore */
        }
      }

      return json({
        ok: true,
        sms_matched: isMatched,
        card_bank: created.data.card.bank,
        card_holder: created.data.card.holder_name,
        tested_payable_rial: created.data.payable_amount,
        telegram_sent: tgSent,
        vision_ready: Boolean(env.TELEGRAM_RECEIPT_GEMINI_API_KEY),
      });
    }

    if (subPath === 'ios/receipt-image' && method === 'GET') {
      const paymentId = String(url.searchParams.get('payment_id') || '').trim();
      const row = await env.DB.prepare(`SELECT receipt_image_b64 FROM payment_orders WHERE id = ?1`)
        .bind(paymentId)
        .first<{ receipt_image_b64: string }>();
      if (!row || !row.receipt_image_b64) return payexaErr('NOT_FOUND', 'تصویر رسیدی ثبت نشده است.', 404);
      return json({ ok: true, data_uri: buildReceiptDataUri(row.receipt_image_b64) });
    }

    if (subPath === 'ios/review-decision' && method === 'POST') {
      const body = await safeJsonBody(request);
      const paymentId = String(body?.paymentId || body?.payment_id || '').trim();
      const op = String(body?.op || 'approve');
      const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`)
        .bind(paymentId)
        .first<PaymentOrderRow>();
      if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'تراکنش یافت نشد.', 404);
      const nowIso = new Date().toISOString();

      if (op === 'reject') {
        await rejectGatewayOrder(env, row, 'ios_receipt_reject');
        return json({ ok: true, status: 'rejected', payment_id: paymentId });
      }

      await env.DB.prepare(
        `UPDATE payment_orders SET status = 'paid', paid_at = CASE WHEN paid_at = '' THEN ?1 ELSE paid_at END, updated_at = ?2 WHERE id = ?3`
      )
        .bind(nowIso, nowIso, paymentId)
        .run();
      await env.DB.prepare(
        `UPDATE payment_devices SET matched_count = matched_count + 1, last_seen_at = ?1 WHERE id = ?2`
      )
        .bind(nowIso, device.id)
        .run();
      await fulfillGatewayPayment(env, paymentId, 'ios_receipt_approve');
      return json({ ok: true, status: 'paid', payment_id: paymentId });
    }

    if (subPath === 'ios/quick-confirm' && method === 'POST') {
      const body = await safeJsonBody(request);
      const paymentId = String(body?.paymentId || body?.payment_id || '').trim();
      const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`)
        .bind(paymentId)
        .first<PaymentOrderRow>();
      if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'فاکتور یافت نشد.', 404);
      if (row.status === 'paid') return json({ ok: true, status: 'paid' });

      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE payment_orders SET status = 'paid', paid_at = CASE WHEN paid_at = '' THEN ?1 ELSE paid_at END, updated_at = ?2 WHERE id = ?3`
      )
        .bind(nowIso, nowIso, paymentId)
        .run();
      await env.DB.prepare(
        `UPDATE payment_devices SET matched_count = matched_count + 1, last_seen_at = ?1 WHERE id = ?2`
      )
        .bind(nowIso, device.id)
        .run();

      await fulfillGatewayPayment(env, paymentId, 'ios_webapp_confirm');
      return json({ ok: true, status: 'paid', payment_id: paymentId });
    }

    if (subPath === 'ios/sms' && (method === 'GET' || method === 'POST')) {
      let smsText = String(
        url.searchParams.get('text') ||
          url.searchParams.get('body') ||
          url.searchParams.get('sms') ||
          ''
      ).trim();
      let sender = String(url.searchParams.get('sender') || url.searchParams.get('from') || 'iOS-Shortcuts').trim();
      let receivedAt: string | undefined;

      if (method === 'POST' && !smsText) {
        const ct = (request.headers.get('content-type') || '').toLowerCase();
        const rawText = await request.text().catch(() => '');
        if (ct.includes('application/json')) {
          try {
            const j = JSON.parse(rawText || '{}');
            smsText = String(j?.body || j?.text || j?.message || j?.sms || '').trim();
            if (j?.sender || j?.from) sender = String(j.sender || j.from).trim();
            if (j?.receivedAt || j?.received_at) receivedAt = String(j.receivedAt || j.received_at);
          } catch {
            smsText = rawText.trim();
          }
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(rawText);
          smsText = String(params.get('text') || params.get('body') || params.get('sms') || rawText).trim();
          if (params.get('sender')) sender = String(params.get('sender')).trim();
        } else {
          // Plain raw text directly from Apple Shortcuts (`Shortcut Input`)!
          smsText = rawText.trim();
        }
      }

      if (!smsText) {
        return payexaErr('VALIDATION_ERROR', 'متن پیامک خالی است.', 422);
      }

      await recordDeviceHeartbeat(env, device.id, {
        deviceModel: device.device_model || 'iPhone (iOS Shortcuts)',
        appVersion: device.app_version || 'ios-bridge-1.0',
      });

      const outcome = await processIncomingBankSms(env, device.id, {
        sender,
        body: smsText,
        receivedAt,
      });

      return json({
        ok: true,
        matched: outcome.status === 'matched',
        status: outcome.status,
        matchedPaymentId: outcome.matchedPaymentId || null,
        amount_rial: outcome.parsed.amountRial,
      });
    }
  }

  /* =======================================================================
   * 2. WEBSITE BUYER DIRECT CHECKOUT (`POST /api/payment/checkout`)
   * ======================================================================= */
  if (subPath === 'checkout' && method === 'POST') {
    const body = await safeJsonBody(request);
    const productId = String(body?.productId || '').trim();
    const planId = String(body?.planId || '').trim();
    const tool = getTool(productId);
    const plan = tool ? getPlan(productId, planId) : undefined;
    if (!tool || !plan) {
      return payexaErr('VALIDATION_ERROR', 'محصول یا پلن انتخابی معتبر نیست.', 422);
    }

    const user = await ctx.getCurrentUser();
    const phoneInput = String(body?.phone || user?.phone || '').trim();
    const phone = normalizePhone(phoneInput);
    if (!phone) {
      return payexaErr('VALIDATION_ERROR', 'لطفاً شماره موبایل معتبر (مثلاً 09123456789) وارد کنید تا کد دسترسی برایتان صادر شود.', 422, {
        phone: 'شماره موبایل الزامی است',
      });
    }

    const cmsData = ctx.loadCmsData ? await ctx.loadCmsData().catch(() => null) : null;
    const effectivePriceLabel = resolvePlanPrice(productId, plan, cmsData);
    const amountToman = priceToToman(effectivePriceLabel) || priceToToman(plan.price);
    const amountRial = amountToman * 10;

    // Safely reuse an open pending invoice ONLY when the caller is the SAME authenticated user
    // (or holds the existing X-Buyer-Secret), preventing buyer_secret hijacking AND allowing
    // unlimited repeat renewals once an order is paid/expired!
    await sweepExpiredPayments(env);
    let orderId = `WEB-${productId}-${planId}-${Date.now().toString(36)}-${randomHex(3)}`;
    let preservedBuyerSecret = '';

    if (user?.id) {
      const openSameUser = await env.DB.prepare(
        `SELECT order_id, amount_rial FROM payment_orders
         WHERE source = 'website' AND user_id = ?1 AND phone = ?2 AND product_id = ?3 AND plan_id = ?4 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`
      )
        .bind(user.id, phone, productId, plan.id)
        .first<{ order_id: string; amount_rial: number }>();
      if (openSameUser && openSameUser.amount_rial === amountRial) {
        orderId = openSameUser.order_id;
      }
    } else {
      const callerSecret = (request.headers.get('X-Buyer-Secret') || String(body?.buyerSecret || '')).trim();
      if (callerSecret) {
        const callerHash = await sha256Hex(callerSecret);
        const openBySecret = await env.DB.prepare(
          `SELECT order_id, amount_rial FROM payment_orders
           WHERE source = 'website' AND buyer_secret_hash = ?1 AND phone = ?2 AND product_id = ?3 AND plan_id = ?4 AND status = 'pending'
           ORDER BY created_at DESC LIMIT 1`
        )
          .bind(callerHash, phone, productId, plan.id)
          .first<{ order_id: string; amount_rial: number }>();
        if (openBySecret && openBySecret.amount_rial === amountRial) {
          orderId = openBySecret.order_id;
          preservedBuyerSecret = callerSecret;
        }
      }
    }

    const created = await createGatewayPayment(env, {
      amountRial,
      orderId,
      source: 'website',
      phone,
      userId: user?.id || '',
      productId,
      productName: tool.name,
      planId: plan.id,
      planName: plan.name,
      description: `اشتراک ${tool.name} — پلن ${plan.name}`,
      returnUrl: `${url.origin}/products/${encodeURIComponent(productId)}`,
      originUrl: url.origin,
    });

    if ('error' in created) {
      return json({ ok: false, error: created.error }, created.httpStatus);
    }

    const buyerSecret = created.buyerSecret || preservedBuyerSecret || '';

    return json(
      {
        ok: true,
        buyer_secret: buyerSecret || undefined,
        data: created.data,
      },
      created.httpStatus
    );
  }

  /* =======================================================================
   * 3. PUBLIC CLIENT POLLING (`GET /api/payment/v2/payments/:id/client` or `/client`)
   * ======================================================================= */
  const clientMatch = subPath.match(/^v2\/payments\/([A-Za-z0-9_-]+)\/client$/);
  if ((clientMatch || subPath === 'client') && method === 'GET') {
    const paymentId = clientMatch ? clientMatch[1] : String(url.searchParams.get('payment_id') || '').trim();
    if (!paymentId) return payexaErr('VALIDATION_ERROR', 'شناسه پرداخت مشخص نشده است.', 422);

    await sweepExpiredPayments(env);
    const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
    if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'پرداخت مورد نظر یافت نشد.', 404);

    const secondsRemaining = row.status === 'pending'
      ? Math.max(0, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000))
      : 0;

    // Verify whether caller is the authorized buyer (via X-Buyer-Secret or authenticated user session)
    const buyerSecret = (request.headers.get('X-Buyer-Secret') || url.searchParams.get('buyer_secret') || '').trim();
    const deviceId = (request.headers.get('X-Device-Id') || url.searchParams.get('device_id') || '').trim();
    let isAuthorizedBuyer = false;
    if (buyerSecret && row.buyer_secret_hash) {
      const h = await sha256Hex(buyerSecret);
      if (h === row.buyer_secret_hash) isAuthorizedBuyer = true;
    }
    if (!isAuthorizedBuyer) {
      const user = await ctx.getCurrentUser();
      if (user) {
        if (row.user_id && user.id === row.user_id) isAuthorizedBuyer = true;
        else if (user.phone_verified_at && user.phone && normalizePhone(user.phone) === row.phone) isAuthorizedBuyer = true;
      }
    }

    let toolToken = '';
    if (row.status === 'paid' && isAuthorizedBuyer && deviceId && row.product_id && row.access_code) {
      toolToken = await mintToolSessionFromOrder(env, row, deviceId);
    }

    // Payexa security rule: full card number is ONLY exposed while payment is open (`pending`)
    const showFullCard = row.status === 'pending' && secondsRemaining > 0;

    const botUserClean = String(env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();

    return json({
      ok: true,
      data: {
        payment_id: row.id,
        order_id: row.order_id,
        source: row.source,
        status: row.status,
        description: row.description,
        product_id: row.product_id || null,
        product_name: row.product_name || null,
        plan_id: row.plan_id || null,
        plan_name: row.plan_name || null,
        amount: row.amount_rial,
        amount_toman: Math.floor(row.amount_rial / 10),
        payable_amount: row.payable_amount_rial,
        payable_amount_toman: Math.floor(row.payable_amount_rial / 10),
        seconds_remaining: secondsRemaining,
        expires_at: row.expires_at,
        paid_at: row.paid_at || null,
        return_url: row.return_url || row.callback_url || null,
        telegram_url: botUserClean ? `https://t.me/${botUserClean}?start=pay_${row.id}` : null,
        receipt_submitted: !!row.receipt_submitted_at,
        card: showFullCard
          ? {
              number: row.card_number,
              formatted: formatCardNumber(row.card_number),
              holder_name: row.card_holder,
              bank: row.card_bank,
              bank_slug: row.card_bank_slug || 'shetab',
            }
          : null,
        card_masked: maskCardNumber(row.card_number),
        // Protected fulfillment credentials — ONLY returned to the verified buyer!
        fulfillment:
          row.status === 'paid' && isAuthorizedBuyer
            ? {
                phone: row.phone,
                access_code: row.access_code || null,
                access_expires_at: row.access_expires_at || null,
                tool_token: toolToken || null,
              }
            : null,
      },
    });
  }

  /* =======================================================================
   * 4. FALLBACK RECEIPT & CANCEL (`POST /api/payment/v2/payments/:id/receipt|cancel`)
   * ======================================================================= */
  const receiptMatch = subPath.match(/^v2\/payments\/([A-Za-z0-9_-]+)\/receipt$/);
  if (receiptMatch && method === 'POST') {
    const paymentId = receiptMatch[1];
    const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
    if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'پرداخت یافت نشد.', 404);
    if (row.status === 'paid') return json({ ok: true, status: 'paid', message: 'این پرداخت قبلاً تأیید شده است.' });

    const body = await safeJsonBody(request);
    const refCode = toLatinDigits(String(body?.ref_code || body?.refCode || '')).replace(/\D/g, '').slice(0, 32);
    const note = String(body?.note || '').trim().slice(0, 400);
    const imageB64 = String(body?.image_base64 || body?.imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    if (!refCode && !imageB64) {
      return payexaErr('VALIDATION_ERROR', 'لطفاً تصویر واضح رسید بانکی (و در صورت تمایل شماره پیگیری) را وارد کنید.', 422);
    }
    if (imageB64.length > 2_500_000) {
      return payexaErr('VALIDATION_ERROR', 'حجم تصویر رسید بیش از حد مجاز است (حداکثر حدود ۱.۸ مگابایت).', 422);
    }

    // Parse any clues typed in note/refCode
    const textClues = parsePaymentDetails(`${refCode ? `پیگیری ${refCode} ` : ''}${note}`);
    const typedRef = refCode || textClues.ref || '';

    if (typedRef && (await isReceiptRefUsedAnywhere(env, typedRef, row.id, ''))) {
      return payexaErr(
        'DUPLICATE_RECEIPT',
        'این شماره پیگیری بانکی قبلاً برای تراکنش دیگری ثبت و استفاده شده است.',
        409
      );
    }

    // Forensic AI Vision Inspection
    const visionKey = String(env.TELEGRAM_RECEIPT_GEMINI_API_KEY || '').trim();
    const vision =
      imageB64 && visionKey
        ? await readReceiptWithVision(visionKey, imageB64, env.TELEGRAM_VISION_MODEL || 'gemini-2.5-flash').catch(() => null)
        : null;

    const candidateRef = typedRef || vision?.ref || '';
    const refTaken = candidateRef ? await isReceiptRefUsedAnywhere(env, candidateRef, row.id, row.order_id || '') : false;

    const policyRaw = String(env.TELEGRAM_AUTO_APPROVE || 'vision').toLowerCase();
    const policy: 'vision' | 'always' | 'off' = policyRaw === 'always' || policyRaw === 'off' ? policyRaw : 'vision';

    const decision = applyAutoApprovePolicy(
      decideReceipt({
        textRef: typedRef || undefined,
        textAmount: textClues.amount || undefined,
        vision,
        refTaken,
        orderToman: Math.floor(row.amount_rial / 10),
        expectedAmountToman: Math.floor(row.payable_amount_rial / 10),
        allowRoundedBaseAmount: true,
        expectedRecipientName: row.card_holder,
        expectedCardLast4: cleanCardNumber(row.card_number).slice(-4),
        orderCreatedAtMs: Date.parse(row.created_at) || Date.now(),
      }),
      policy
    );

    if (decision.status === 'rejected') {
      return payexaErr('DUPLICATE_RECEIPT', decision.summary, 409);
    }

    const nowIso = new Date().toISOString();
    const reasonsFa = decision.reasons
      .map((r) => RECEIPT_REASON_FA[r])
      .filter(Boolean);
    const forensicSummary = [
      note,
      vision?.ok
        ? `OCR: مبلغ=${vision.amount || '?'} | پیگیری=${vision.ref || '?'} | گیرنده=${vision.recipientName || '?'} | تاریخ=${vision.dateRaw || vision.date || '?'}`
        : imageB64 && !visionKey
          ? 'OCR: کلید بینایی تنظیم نشده (بررسی دستی)'
          : '',
      reasonsFa.length ? `بررسی: ${reasonsFa.join('، ')}` : '',
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 500);

    // === CASE A: VALID AUTHENTIC RECEIPT -> INSTANT AUTO-APPROVAL & DELIVERY! ===
    if (decision.status === 'auto_approved') {
      const claim = await env.DB.prepare(
        `UPDATE payment_orders
         SET status = 'paid',
             paid_at = CASE WHEN paid_at = '' THEN ?1 ELSE paid_at END,
             receipt_ref = ?2,
             receipt_note = ?3,
             receipt_image_b64 = ?4,
             receipt_submitted_at = ?5,
             updated_at = ?6
         WHERE id = ?7 AND status <> 'paid'`
      )
        .bind(nowIso, decision.ref || candidateRef, forensicSummary, imageB64, nowIso, nowIso, row.id)
        .run();

      if ((claim.meta?.changes ?? 0) > 0) {
        await fulfillGatewayPayment(env, row.id, 'auto_receipt_vision');
      }

      return json({
        ok: true,
        data: {
          payment_id: row.id,
          status: 'paid',
          auto_approved: true,
          confidence: decision.confidence,
          message: '✅ رسید بانکی شما با موفقیت اصالت‌سنجی و تأیید خودکار شد! اشتراک شما هم‌اکنون فعال است.',
        },
      });
    }

    // === CASE B: SUSPICIOUS / INCOMPLETE RECEIPT -> QUEUE FOR ADMIN REVIEW ===
    await env.DB.prepare(
      `UPDATE payment_orders
       SET status = 'needs_review',
           receipt_ref = ?1,
           receipt_note = ?2,
           receipt_image_b64 = ?3,
           receipt_submitted_at = ?4,
           updated_at = ?5
       WHERE id = ?6 AND status <> 'paid'`
    )
      .bind(decision.ref || candidateRef, forensicSummary, imageB64, nowIso, nowIso, row.id)
      .run();

    // Alert Telegram Admins with full forensic breakdown + 1-click approve/reject buttons
    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    if (token) {
      const admins = String(env.TELEGRAM_ADMIN_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const adminMsg = [
        '🧐 <b>رسید مشکوک / نیازمند بررسی انسانی ثبت شد</b>',
        `🆔 شناسه پرداخت: <code>${tg.escapeHtml(row.id)}</code>`,
        `📦 سفارش: ${tg.escapeHtml(row.description || row.order_id)}`,
        `💰 مبلغ یکتای درخواستی: <b>${row.payable_amount_rial.toLocaleString('en-US')} ریال</b>`,
        `📊 اطمینان سیستم: <b>${Math.round(decision.confidence * 100)}٪</b>`,
        candidateRef ? `🔢 شماره پیگیری: <code>${tg.escapeHtml(candidateRef)}</code>` : '',
        reasonsFa.length ? `⚠️ دلایل نیاز به بررسی:\n• ${reasonsFa.map((r) => tg.escapeHtml(r)).join('\n• ')}` : '',
        vision?.ok
          ? `🤖 تشخیص OCR: مبلغ=${vision.amount || '?'} | گیرنده=${tg.escapeHtml(vision.recipientName || '?')} | تاریخ=${tg.escapeHtml(vision.dateRaw || vision.date || '?')}`
          : '',
        note ? `📝 توضیح خریدار: ${tg.escapeHtml(note)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      for (const adminId of admins) {
        await tg
          .sendMessage(token, adminId, adminMsg, {
            reply_markup: tg.inlineKeyboard([
              [
                { text: '✅ تأیید دستی و تحویل محصول', callback_data: `payok:${row.id}` },
                { text: '❌ رد رسید مشکوک', callback_data: `payno:${row.id}` },
              ],
            ]),
          })
          .catch(() => {});
      }
    }

    const buyerHint = reasonsFa.length
      ? `رسید شما ثبت شد و به دلیل نیاز به بررسی تکمیلی (${reasonsFa[0]}) به پشتیبانی ارجاع گردید؛ به محض تأیید، اشتراک شما خودکار فعال می‌شود.`
      : 'رسید شما ثبت شد و برای بررسی به پشتیبانی ارسال گردید. به محض تأیید، اشتراک شما فعال می‌شود.';

    return json({
      ok: true,
      data: {
        payment_id: row.id,
        status: 'needs_review',
        auto_approved: false,
        confidence: decision.confidence,
        reasons: decision.reasons,
        message: buyerHint,
      },
    });
  }

  const cancelMatch = subPath.match(/^v2\/payments\/([A-Za-z0-9_-]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    const paymentId = cancelMatch[1];
    const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
    if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'پرداخت یافت نشد.', 404);
    const buyerSecret = (request.headers.get('X-Buyer-Secret') || '').trim();
    const user = await ctx.getCurrentUser();
    const secretOk = buyerSecret && row.buyer_secret_hash && (await sha256Hex(buyerSecret)) === row.buyer_secret_hash;
    const userOk = !!(user && row.user_id && user.id === row.user_id);
    if (!secretOk && !userOk && !(await ctx.isAdmin())) {
      return payexaErr('UNAUTHORIZED', 'اجازه لغو این پرداخت را ندارید.', 403);
    }
    if (row.status === 'pending') {
      await env.DB.prepare(`UPDATE payment_orders SET status = 'canceled', updated_at = ?1 WHERE id = ?2`)
        .bind(new Date().toISOString(), paymentId)
        .run();
    }
    return json({ ok: true, data: { payment_id: paymentId, status: row.status === 'pending' ? 'canceled' : row.status } });
  }

  /* =======================================================================
   * 5. PAYEXA V2 MERCHANT API (`/api/payment/v2/payments...`)
   * ======================================================================= */
  if (subPath === 'v2/payments' || subPath.startsWith('v2/payments/')) {
    const rawKey = extractToken(request, 'X-API-KEY');
    const apiKeyRow = rawKey ? await authenticateMerchantApiKey(env, rawKey) : null;
    const adminOk = apiKeyRow ? false : await ctx.isAdmin();

    if (!apiKeyRow && !adminOk) {
      return payexaErr('UNAUTHORIZED', 'کلید API ارسال نشده یا نامعتبر است.', 401);
    }

    // POST /api/payment/v2/payments -> Create Payment
    if (subPath === 'v2/payments' && method === 'POST') {
      const body = await safeJsonBody(request);
      const amountRial = body?.amount !== undefined ? Number(body.amount) : Number(body?.amount_toman || 0) * 10;
      const callbackUrl = String(body?.callback_url || '').trim();
      const returnUrl = String(body?.return_url || '').trim();

      if (!callbackUrl && !returnUrl) {
        return payexaErr('VALIDATION_ERROR', 'حداقل یکی از فیلدهای callback_url یا return_url الزامی است.', 422, {
          callback_url: 'نشانی کال‌بک یا بازگشت الزامی است',
        });
      }

      const created = await createGatewayPayment(env, {
        amountRial,
        orderId: String(body?.order_id || ''),
        source: 'api',
        callbackUrl,
        returnUrl,
        description: String(body?.description || ''),
        metadata: body?.metadata,
        phone: String(body?.phone || body?.metadata?.phone || ''),
        productId: String(body?.product_id || body?.metadata?.product_id || body?.metadata?.productId || ''),
        planId: String(body?.plan_id || body?.metadata?.plan_id || body?.metadata?.planId || ''),
        apiKeyId: apiKeyRow?.id || '',
        originUrl: url.origin,
      });

      if ('error' in created) return json({ ok: false, error: created.error }, created.httpStatus);
      return json({ ok: true, data: created.data }, created.httpStatus);
    }

    // POST /api/payment/v2/payments/:id/verify -> Atomic Verify
    const verifyMatch = subPath.match(/^v2\/payments\/([A-Za-z0-9_-]+)\/verify$/);
    if (verifyMatch && method === 'POST') {
      const body = await safeJsonBody(request);
      const expectedAmount = body?.amount !== undefined ? Number(body.amount) : undefined;
      const verified = await verifyGatewayPayment(env, verifyMatch[1], expectedAmount);
      if ('error' in verified) return json({ ok: false, error: verified.error }, verified.httpStatus);
      return json({ ok: true, data: verified.data }, 200);
    }

    // GET /api/payment/v2/payments/:id or GET /api/payment/v2/payments?order_id=...
    if (method === 'GET') {
      await sweepExpiredPayments(env);
      const idMatch = subPath.match(/^v2\/payments\/([A-Za-z0-9_-]+)$/);
      const orderIdQuery = String(url.searchParams.get('order_id') || '').trim();
      const row = idMatch
        ? await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(idMatch[1]).first<PaymentOrderRow>()
        : orderIdQuery
        ? await env.DB.prepare(`SELECT * FROM payment_orders WHERE order_id = ?1 ORDER BY created_at DESC LIMIT 1`)
            .bind(orderIdQuery)
            .first<PaymentOrderRow>()
        : null;

      if (!row) return payexaErr('PAYMENT_NOT_FOUND', 'پرداخت یافت نشد.', 404);
      return json({
        ok: true,
        data: {
          payment_id: row.id,
          order_id: row.order_id,
          status: row.status,
          amount: row.amount_rial,
          payable_amount: row.payable_amount_rial,
          payable_amount_toman: Math.floor(row.payable_amount_rial / 10),
          verified: !!row.verified_at,
          paid_at: row.paid_at || null,
          expires_at: row.expires_at,
          description: row.description,
        },
      });
    }
  }

  /* =======================================================================
   * 6. ADMIN PANEL GATEWAY ENDPOINTS (`/api/payment/admin/*`)
   * ======================================================================= */
  if (subPath.startsWith('admin/')) {
    if (!(await ctx.isAdmin())) {
      return json({ ok: false, error: 'فقط مدیر سایت به این بخش دسترسی دارد.' }, 401);
    }

    if (subPath === 'admin/receipt-image' && method === 'GET') {
      const paymentId = String(url.searchParams.get('payment_id') || '').trim();
      const row = await env.DB.prepare(`SELECT receipt_image_b64 FROM payment_orders WHERE id = ?1`)
        .bind(paymentId)
        .first<{ receipt_image_b64: string }>();
      if (!row || !row.receipt_image_b64) return json({ ok: false, error: 'تصویر رسیدی ثبت نشده است.' }, 404);
      return json({ ok: true, data_uri: buildReceiptDataUri(row.receipt_image_b64) });
    }

    if (subPath === 'admin/overview' && method === 'GET') {
      await sweepExpiredPayments(env);
      const [cardsRes, deviceStatus, keysRes, paymentsRes, smsRes] = await Promise.all([
        env.DB.prepare(`SELECT * FROM payment_cards ORDER BY priority ASC, created_at DESC`).all<any>(),
        getOnlineDeviceSummary(env),
        env.DB.prepare(`SELECT id, name, key_mask, allowed_origins, is_active, last_used_at, created_at FROM payment_api_keys ORDER BY created_at DESC`).all<any>(),
        env.DB.prepare(`SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT 100`).all<PaymentOrderRow>(),
        env.DB.prepare(`SELECT * FROM payment_sms_logs ORDER BY created_at DESC LIMIT 100`).all<any>(),
      ]);

      const payments = (paymentsRes.results || []).map((p) => ({
        id: p.id,
        orderId: p.order_id,
        source: p.source,
        status: p.status,
        amountRial: p.amount_rial,
        payableAmountRial: p.payable_amount_rial,
        cardBank: p.card_bank,
        cardMasked: maskCardNumber(p.card_number),
        phone: p.phone,
        productId: p.product_id,
        productName: p.product_name,
        planName: p.plan_name,
        description: p.description,
        accessCode: p.access_code,
        receiptRef: p.receipt_ref,
        receiptNote: p.receipt_note,
        hasReceiptImage: !!p.receipt_image_b64,
        paidAt: p.paid_at,
        expiresAt: p.expires_at,
        createdAt: p.created_at,
      }));

      const paidTotalRial = payments
        .filter((p) => p.status === 'paid')
        .reduce((acc, p) => acc + Number(p.payableAmountRial || 0), 0);

      return json({
        ok: true,
        stats: {
          paidCount: payments.filter((p) => p.status === 'paid').length,
          pendingCount: payments.filter((p) => p.status === 'pending').length,
          reviewCount: payments.filter((p) => p.status === 'needs_review').length,
          paidTotalRial,
          onlineDevices: deviceStatus.onlineCount,
          totalDevices: deviceStatus.totalActive,
        },
        cards: cardsRes.results || [],
        devices: deviceStatus.devices.map((d) => ({
          id: d.id,
          name: d.name,
          deviceSerial: d.device_serial,
          tokenMask: d.token_mask,
          isActive: !!d.is_active,
          lastSeenAt: d.last_seen_at,
          isOnline: !!(d.last_seen_at && Date.parse(d.last_seen_at) >= Date.now() - 10 * 60_000),
          batteryLevel: d.battery_level,
          deviceModel: d.device_model,
          appVersion: d.app_version,
          smsCount: d.sms_count,
          matchedCount: d.matched_count,
          createdAt: d.created_at,
        })),
        apiKeys: keysRes.results || [],
        payments,
        smsLogs: smsRes.results || [],
        serverOrigin: url.origin,
      });
    }

    if (subPath === 'admin/cards' && method === 'POST') {
      const body = await safeJsonBody(request);
      const op = String(body?.op || 'save');

      if (op === 'delete') {
        await env.DB.prepare(`DELETE FROM payment_cards WHERE id = ?1`).bind(String(body?.id || '')).run();
        return json({ ok: true });
      }
      if (op === 'toggle') {
        await env.DB.prepare(`UPDATE payment_cards SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = ?1 WHERE id = ?2`)
          .bind(new Date().toISOString(), String(body?.id || ''))
          .run();
        return json({ ok: true });
      }

      const cardNumber = cleanCardNumber(String(body?.cardNumber || ''));
      const holderName = String(body?.holderName || '').trim();
      const iban = cleanIban(String(body?.iban || ''));
      const skipLuhn = body?.allowTestCard === true;

      if (cardNumber.length !== 16 || (!skipLuhn && !isValidIranBankCard(cardNumber))) {
        return json({ ok: false, error: 'شماره کارت ۱۶ رقمی معتبر نیست (رقم کنترلی شتاب نادرست است).' }, 400);
      }
      if (holderName.length < 2) {
        return json({ ok: false, error: 'نام و نام خانوادگی صاحب کارت را وارد کنید.' }, 400);
      }

      const bank = detectIranBank(cardNumber);
      const nowIso = new Date().toISOString();
      const id = String(body?.id || `card-${Date.now().toString(36)}-${randomHex(3)}`);

      await env.DB.prepare(
        `INSERT INTO payment_cards (id, card_number, holder_name, iban, bank_name, bank_slug, is_active, priority, daily_limit_rial, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,1,?7,0,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           card_number = excluded.card_number,
           holder_name = excluded.holder_name,
           iban = excluded.iban,
           bank_name = excluded.bank_name,
           bank_slug = excluded.bank_slug,
           priority = excluded.priority,
           updated_at = excluded.updated_at`
      )
        .bind(id, cardNumber, holderName, iban, bank.name, bank.slug, Number(body?.priority || 1), nowIso, nowIso)
        .run();

      return json({ ok: true, id, bank });
    }

    if (subPath === 'admin/devices' && method === 'POST') {
      const body = await safeJsonBody(request);
      const op = String(body?.op || 'create');

      if (op === 'delete') {
        await env.DB.prepare(`DELETE FROM payment_devices WHERE id = ?1`).bind(String(body?.id || '')).run();
        return json({ ok: true });
      }
      if (op === 'toggle') {
        await env.DB.prepare(`UPDATE payment_devices SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?1`)
          .bind(String(body?.id || ''))
          .run();
        return json({ ok: true });
      }
      if (op === 'regen_pair') {
        const targetId = String(body?.id || '');
        const existing = await env.DB.prepare(`SELECT * FROM payment_devices WHERE id = ?1`)
          .bind(targetId)
          .first<PaymentDeviceRow>();
        if (!existing) return json({ ok: false, error: 'دستگاه یافت نشد.' }, 404);
        const rawToken = `omid_dev_${randomHex(20)}`;
        const tokenHash = await sha256Hex(rawToken);
        const tokenMask = `${rawToken.slice(0, 12)}…${rawToken.slice(-4)}`;
        const pairCode = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        const pairExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

        await env.DB.prepare(
          `UPDATE payment_devices
           SET token_hash = ?1, token_mask = ?2, pair_code = ?3, pair_token = ?4, pair_expires_at = ?5, is_active = 1
           WHERE id = ?6`
        )
          .bind(tokenHash, tokenMask, pairCode, rawToken, pairExpiresAt, targetId)
          .run();

        const connectPayload = JSON.stringify({
          type: 'omidpay_uploader_v1',
          server_url: `${url.origin}/api/payment`,
          device_token: rawToken,
          device_name: existing.name,
        });

        return json({
          ok: true,
          id: targetId,
          name: existing.name,
          deviceToken: rawToken,
          pairCode,
          pairExpiresAt,
          iosBridgeUrl: `${url.origin}/sms-bridge`,
          iosShortcutUrl: `${url.origin}/api/payment/ios/sms?token=${encodeURIComponent(rawToken)}&text=`,
          connectPayload,
        });
      }

      const name = String(body?.name || '').trim() || 'آیفون X / گوشی دریافت پیامک';
      const serial = String(body?.deviceSerial || '').trim().slice(0, 60);
      const rawToken = `omid_dev_${randomHex(20)}`;
      const tokenHash = await sha256Hex(rawToken);
      const tokenMask = `${rawToken.slice(0, 12)}…${rawToken.slice(-4)}`;
      const pairCode = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const pairExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const id = `dev-${Date.now().toString(36)}-${randomHex(3)}`;
      const nowIso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO payment_devices (id, name, device_serial, token_hash, token_mask, pair_code, pair_token, pair_expires_at, is_active, last_seen_at, battery_level, device_model, app_version, sms_count, matched_count, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,'',-1,'','',0,0,?9)`
      )
        .bind(id, name, serial, tokenHash, tokenMask, pairCode, rawToken, pairExpiresAt, nowIso)
        .run();

      // Quick-connect JSON / URI for the Android Uploader & iOS Web App
      const connectPayload = JSON.stringify({
        type: 'omidpay_uploader_v1',
        server_url: `${url.origin}/api/payment`,
        device_token: rawToken,
        device_name: name,
      });

      return json({
        ok: true,
        id,
        name,
        deviceToken: rawToken,
        pairCode,
        pairExpiresAt,
        iosBridgeUrl: `${url.origin}/sms-bridge`,
        iosShortcutUrl: `${url.origin}/api/payment/ios/sms?token=${encodeURIComponent(rawToken)}&text=`,
        connectPayload,
      });
    }

    if (subPath === 'admin/keys' && method === 'POST') {
      const body = await safeJsonBody(request);
      const op = String(body?.op || 'create');

      if (op === 'delete') {
        await env.DB.prepare(`DELETE FROM payment_api_keys WHERE id = ?1`).bind(String(body?.id || '')).run();
        return json({ ok: true });
      }
      if (op === 'toggle') {
        await env.DB.prepare(`UPDATE payment_api_keys SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?1`)
          .bind(String(body?.id || ''))
          .run();
        return json({ ok: true });
      }

      const name = String(body?.name || '').trim() || 'کلید API وب‌سایت/ربات';
      const allowedOrigins = String(body?.allowedOrigins || '').trim();
      const rawKey = `omid_live_${randomHex(20)}`;
      const keyHash = await sha256Hex(rawKey);
      const keyMask = `${rawKey.slice(0, 13)}…${rawKey.slice(-4)}`;
      const id = `key-${Date.now().toString(36)}-${randomHex(3)}`;
      const nowIso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO payment_api_keys (id, name, key_hash, key_mask, signing_secret, allowed_origins, is_active, last_used_at, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,1,'',?7)`
      )
        .bind(id, name, keyHash, keyMask, rawKey, allowedOrigins, nowIso)
        .run();

      return json({ ok: true, id, name, apiKey: rawKey });
    }

    if (subPath === 'admin/payments' && method === 'POST') {
      const body = await safeJsonBody(request);
      const paymentId = String(body?.paymentId || '').trim();
      const op = String(body?.op || '');
      const row = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(paymentId).first<PaymentOrderRow>();
      if (!row) return json({ ok: false, error: 'تراکنش یافت نشد.' }, 404);

      const nowIso = new Date().toISOString();
      if (op === 'approve') {
        await env.DB.prepare(
          `UPDATE payment_orders SET status = 'paid', paid_at = CASE WHEN paid_at = '' THEN ?1 ELSE paid_at END, updated_at = ?2 WHERE id = ?3`
        )
          .bind(nowIso, nowIso, paymentId)
          .run();
        const updated = await fulfillGatewayPayment(env, paymentId, 'admin_manual');
        return json({ ok: true, payment: updated });
      }
      if (op === 'reject') {
        await rejectGatewayOrder(env, row, 'admin_manual_reject');
        return json({ ok: true });
      }
      return json({ ok: false, error: 'عملیات نامعتبر است.' }, 400);
    }

    if (subPath === 'admin/simulate-sms' && method === 'POST') {
      const body = await safeJsonBody(request);
      let smsText = String(body?.body || '').trim();
      const sender = String(body?.sender || 'BANK-SIMULATOR').trim();

      if (!smsText && body?.paymentId) {
        const p = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`)
          .bind(String(body.paymentId))
          .first<PaymentOrderRow>();
        if (!p) return json({ ok: false, error: 'تراکنش انتخابی یافت نشد.' }, 404);
        smsText = String(p.card_bank || '').includes('بلو')
          ? `بلوبانک\n${p.payable_amount_rial.toLocaleString('en-US')} ریال به حسابتان نشست.\nموجودی: ۴۸,۲۵۰,۰۰۰ ریال`
          : `${p.card_bank || 'بانک سامان'}\nواریز به حساب\nمبلغ: ${p.payable_amount_rial.toLocaleString('en-US')} ریال\nکارت: *${p.card_number.slice(-4)}\nمانده: 48,250,000 ریال`;
      }

      if (!smsText) {
        return json({ ok: false, error: 'متن پیامک شبیه‌سازی را وارد کنید یا یک تراکنش در انتظار را انتخاب نمایید.' }, 400);
      }

      const outcome = await processIncomingBankSms(env, 'admin-sandbox-simulator', {
        sender,
        body: smsText,
        smsId: `sim-${Date.now()}-${randomHex(3)}`,
      });

      return json({
        ok: true,
        simulatedSms: smsText,
        outcome,
      });
    }
  }

  return payexaErr('NOT_FOUND', 'مسیر درخواستی در سرویس درگاه پرداخت یافت نشد.', 404);
};
