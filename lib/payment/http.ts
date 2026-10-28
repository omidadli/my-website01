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
import { readReceiptWithVision } from '../telegram/receipt';
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
  isValidIranBankCard,
  maskCardNumber,
  processIncomingBankSms,
  randomHex,
  recordDeviceHeartbeat,
  sha256Hex,
  sweepExpiredPayments,
  verifyGatewayPayment,
  type PaymentEnv,
  type PaymentOrderRow,
} from './gateway';

export interface PaymentRequestContext {
  request: Request;
  env: PaymentEnv;
  isAdmin: () => Promise<boolean>;
  getCurrentUser: () => Promise<{ id: string; phone?: string; phone_verified_at?: string; full_name?: string } | null>;
  loadCmsData?: () => Promise<any>;
}

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
  const { request, env } = ctx;
  await ensurePaymentTables(env);

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
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

    // Deterministic order_id per (phone, product, plan) so double-clicking reuses the open pending payment!
    const orderId = `WEB-${productId}-${planId}-${phone}`;
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

    // Ensure a fresh buyerSecret is bound even when returning an existing pending payment
    let buyerSecret = created.buyerSecret || '';
    if (!buyerSecret) {
      buyerSecret = randomHex(16);
      const hash = await sha256Hex(buyerSecret);
      await env.DB.prepare(`UPDATE payment_orders SET buyer_secret_hash = ?1, user_id = CASE WHEN user_id = '' THEN ?2 ELSE user_id END WHERE id = ?3`)
        .bind(hash, user?.id || '', created.data.payment_id)
        .run()
        .catch(() => {});
    }

    return json(
      {
        ok: true,
        buyer_secret: buyerSecret,
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
    const refCode = String(body?.ref_code || body?.refCode || '').replace(/\D/g, '').slice(0, 32);
    const note = String(body?.note || '').trim().slice(0, 400);
    const imageB64 = String(body?.image_base64 || body?.imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    if (!refCode && !imageB64) {
      return payexaErr('VALIDATION_ERROR', 'لطفاً شماره پیگیری بانکی یا تصویر رسید واریز را وارد کنید.', 422);
    }
    if (imageB64.length > 2_500_000) {
      return payexaErr('VALIDATION_ERROR', 'حجم تصویر رسید بیش از حد مجاز است (حداکثر حدود ۱.۸ مگابایت).', 422);
    }

    if (refCode) {
      const dup = await env.DB.prepare(
        `SELECT id FROM payment_orders WHERE receipt_ref = ?1 AND status <> 'rejected' AND id <> ?2 LIMIT 1`
      )
        .bind(refCode, row.id)
        .first<{ id: string }>();
      if (dup) {
        return payexaErr('VALIDATION_ERROR', 'این شماره پیگیری قبلاً برای تراکنش دیگری ثبت شده است.', 409);
      }
    }

    // Optional AI OCR helper note for admin
    let ocrNote = '';
    const visionKey = String(env.TELEGRAM_RECEIPT_GEMINI_API_KEY || '').trim();
    if (imageB64 && visionKey) {
      const vision = await readReceiptWithVision(visionKey, imageB64, env.TELEGRAM_VISION_MODEL || 'gemini-2.5-flash').catch(() => null);
      if (vision?.ok) {
        ocrNote = ` | OCR: مبلغ=${vision.amount || '?'} پیگیری=${vision.ref || '?'} گیرنده=${vision.recipientName || '?'}`;
      }
    }

    const nowIso = new Date().toISOString();
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
      .bind(refCode, (note + ocrNote).slice(0, 500), imageB64, nowIso, nowIso, row.id)
      .run();

    // Alert Telegram Admins with 1-click approve/reject buttons
    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    if (token) {
      const admins = String(env.TELEGRAM_ADMIN_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const adminMsg = [
        '🧾 <b>رسید دستی (مسیر جبرانی درگاه) ثبت شد</b>',
        `🆔 شناسه پرداخت: <code>${tg.escapeHtml(row.id)}</code>`,
        `📦 سفارش: ${tg.escapeHtml(row.description || row.order_id)}`,
        `💰 مبلغ یکتای درخواستی: <b>${row.payable_amount_rial.toLocaleString('en-US')} ریال</b>`,
        refCode ? `🔢 شماره پیگیری اعلامی: <code>${tg.escapeHtml(refCode)}</code>` : '',
        note ? `📝 توضیح خریدار: ${tg.escapeHtml(note)}` : '',
        ocrNote ? `🤖 ${tg.escapeHtml(ocrNote.replace(/^ \| /, ''))}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      for (const adminId of admins) {
        await tg
          .sendMessage(token, adminId, adminMsg, {
            reply_markup: tg.inlineKeyboard([
              [
                { text: '✅ تأیید دستی و تحویل محصول', callback_data: `payok:${row.id}` },
                { text: '❌ رد رسید', callback_data: `payno:${row.id}` },
              ],
            ]),
          })
          .catch(() => {});
      }
    }

    return json({
      ok: true,
      data: {
        payment_id: row.id,
        status: 'needs_review',
        message: 'رسید شما ثبت شد و برای بررسی به پشتیبانی ارسال گردید. به محض تأیید، اشتراک شما فعال می‌شود.',
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
        receiptImageB64: p.status === 'needs_review' ? p.receipt_image_b64 : '',
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

      const name = String(body?.name || '').trim() || 'گوشی اندروید دریافت پیامک';
      const serial = String(body?.deviceSerial || '').trim().slice(0, 60);
      const rawToken = `omid_dev_${randomHex(20)}`;
      const tokenHash = await sha256Hex(rawToken);
      const tokenMask = `${rawToken.slice(0, 12)}…${rawToken.slice(-4)}`;
      const id = `dev-${Date.now().toString(36)}-${randomHex(3)}`;
      const nowIso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO payment_devices (id, name, device_serial, token_hash, token_mask, is_active, last_seen_at, battery_level, device_model, app_version, sms_count, matched_count, created_at)
         VALUES (?1,?2,?3,?4,?5,1,'',-1,'','',0,0,?6)`
      )
        .bind(id, name, serial, tokenHash, tokenMask, nowIso)
        .run();

      // Quick-connect JSON / URI for the Android Uploader app (QR & 1-click clipboard paste)
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
        await env.DB.prepare(`UPDATE payment_orders SET status = 'rejected', updated_at = ?1 WHERE id = ?2`)
          .bind(nowIso, paymentId)
          .run();
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
        smsText = `${p.card_bank || 'بانک سامان'}\nواریز به حساب\nمبلغ: ${p.payable_amount_rial.toLocaleString('en-US')} ریال\nکارت: *${p.card_number.slice(-4)}\nمانده: 48,250,000 ریال`;
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
