/**
 * lib/telegram/bot.ts — Telegram bot logic for Cloudflare Pages Functions.
 *
 * Purchase flow (card-to-card with AUTOMATIC receipt verification):
 *
 *   🛒 خرید اشتراک → انتخاب محصول/پلن → نمایش شماره کارت + مبلغ
 *   → مشتری عکس رسید را می‌فرستد (+ مبلغ/شماره پیگیری در کپشن یا پیام بعدی)
 *   → بررسی خودکار (lib/telegram/receipt.ts):
 *        • شماره پیگیری معتبر و تکراری نباشد
 *        • مبلغ با قیمت پلن بخواند (تومان یا ریال)
 *        • (اختیاری) عکس رسید با بینایی ماشین خوانده و تأیید شود
 *   → تأیید خودکار → صدور/تمدید دسترسی (tool_access) + اشتراک سایت
 *                  → تحویل محصول (کد دسترسی + لینک) به مشتری
 *   → هر تصمیم برای ادمین‌ها هم اطلاع‌رسانی می‌شود؛ رسیدهای مشکوک با دکمه
 *     تأیید/رد دستی برای ادمین می‌آیند.
 */
import { normalizePhone } from '../userAuth';
import {
  faDigits,
  botProduct,
  botProducts,
  botPlan,
  botPlans,
  botProductPath,
  priceToToman,
} from './pricing';
import {
  decideReceipt,
  applyAutoApprovePolicy,
  parsePaymentDetails,
  readReceiptWithVision,
  type ReceiptDecision,
  type VisionReading,
} from './receipt';
import {
  BotEnv,
  BotOrderRow,
  BotUserRow,
  ensureBotTables,
  getBotUser,
  upsertBotUser,
  getPending,
  findVerifiedByPhone,
  insertOrder,
  getOrder,
  updateOrder,
  ordersOf,
  pendingReviewOrders,
  refAlreadyUsed,
  insertDelivery,
  updateDelivery,
  deliveriesOf,
  queuedDeliveries,
  queuedDeliveriesByPhone,
  logEvent,
  botStats,
  newId,
  nowIso,
} from './store';
import { grantToolAccess } from './grant';
import * as tg from './tgApi';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_TRIES = 3;

/* ------------------------------- helpers ------------------------------- */

export const parseAdminIds = (env: BotEnv): string[] =>
  String(env.TELEGRAM_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const isAdmin = (env: BotEnv, tgUserId: string | number) => parseAdminIds(env).includes(String(tgUserId));

const autoApprovePolicy = (env: BotEnv): 'vision' | 'always' | 'off' => {
  const v = String(env.TELEGRAM_AUTO_APPROVE || 'vision').toLowerCase();
  return v === 'always' || v === 'off' ? v : 'vision';
};

/** 09123456789 -> 0912 345 6789 (display only) */
const displayPhone = (phone: string): string => {
  const p = faDigits(String(phone || '')).replace(/\D/g, '');
  return p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
};

const fmtToman = (n: number): string => `${faDigits(String(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')} تومان`;

const fmtDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso || '';
  }
};

const siteUrl = (env: BotEnv): string => String(env.SITE_URL || 'https://omidadli.site').replace(/\/+$/, '');

const send = (env: BotEnv, chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg.sendMessage(env.TELEGRAM_BOT_TOKEN || '', chatId, text, extra);

const notifyAdmins = async (env: BotEnv, text: string, rows?: tg.TgKeyboardButton[][]) => {
  for (const adminId of parseAdminIds(env)) {
    await send(env, adminId, text, rows ? { reply_markup: tg.inlineKeyboard(rows) } : {});
  }
};

/* --------------------------- delivery rendering --------------------------- */

const renderDelivery = (d: { product_name: string; plan_name: string; code: string; expires_at: string; product_id: string; id: string }, baseUrl: string): string =>
  [
    '🎁 <b>تحویل محصول شما</b>',
    '',
    `📦 محصول: <b>${tg.escapeHtml(d.product_name)}</b>${d.plan_name ? ` — ${tg.escapeHtml(d.plan_name)}` : ''}`,
    `🔑 کد دسترسی: <code>${tg.escapeHtml(d.code)}</code>`,
    d.expires_at ? `📅 اعتبار تا: ${fmtDate(d.expires_at)}` : '',
    '',
    '📱 <b>نحوه استفاده:</b> در صفحه‌ی محصول در سایت، شماره موبایل و همین کد را وارد کنید تا دسترسی فعال شود.',
    d.product_id ? `🔗 ${tg.escapeHtml(baseUrl + botProductPath(d.product_id))}` : '',
    `🆔 کد پیگیری تحویل: <code>${tg.escapeHtml(d.id)}</code>`,
  ].filter(Boolean).join('\n');

const renderOrderCard = (o: BotOrderRow, extraLines: string[] = []): string =>
  [
    `📦 سفارش <code>${tg.escapeHtml(o.id)}</code>`,
    `محصول: ${tg.escapeHtml(o.product_name)} — ${tg.escapeHtml(o.plan_name)}`,
    `مبلغ: ${fmtToman(o.amount_toman)}`,
    o.ref_code ? `شماره پیگیری: <code>${tg.escapeHtml(o.ref_code)}</code>` : '',
    ...extraLines,
  ].filter(Boolean).join('\n');

/* ------------------------------ verification ------------------------------ */

const startVerification = async (env: BotEnv, chatId: string) => {
  await upsertBotUser(env, chatId, { pending: { kind: 'verify_menu' } });
  await send(env, chatId,
    '📱 <b>احراز هویت شماره تلفن</b>\n\n' +
    'برای خرید و دریافت محصولات باید شماره شما تأیید شود.\n\n' +
    'روش ۱ (پیشنهادی): دکمه‌ی «اشتراک شماره تلفن من» را بزنید — تلگرام شماره‌ی شما را تأییدشده می‌فرستد.\n' +
    'روش ۲: شماره را دستی وارد کنید تا کد تایید در همین چت برایتان ارسال شود.',
    {
      reply_markup: {
        keyboard: [[{ text: '📱 اشتراک شماره تلفن من', request_contact: true }], [{ text: '⌨️ ورود دستی شماره' }, { text: '❌ انصراف' }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
};

const completeVerification = async (env: BotEnv, chatId: string, phone: string, via: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    await send(env, chatId, '❌ شماره معتبر نیست.');
    return;
  }
  const before = getPending<any>(await getBotUser(env, chatId));
  await upsertBotUser(env, chatId, {
    phone: normalized,
    verified_at: nowIso(),
    verify_via: via,
    pending: null,
  });
  await logEvent(env, 'phone_verified', `tg=${chatId} phone=${normalized} via=${via}`);
  await send(env, chatId,
    `✅ شماره‌ی ${displayPhone(normalized)} با موفقیت تأیید شد.`,
    { reply_markup: tg.mainMenuKeyboard() }
  );

  // Deliver anything that was waiting for verification.
  const queued = [...(await queuedDeliveries(env, chatId)), ...(await queuedDeliveriesByPhone(env, normalized))];
  const seen = new Set<string>();
  let flushed = 0;
  for (const d of queued) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    if (!d.tg_user_id) await updateDelivery(env, d.id, { tg_user_id: chatId });
    await send(env, chatId, renderDelivery(d, siteUrl(env)));
    await updateDelivery(env, d.id, { status: 'delivered', delivered_at: nowIso(), tg_user_id: chatId });
    flushed++;
  }
  if (flushed) await send(env, chatId, `🎁 ${flushed} محصول در انتظار شما بود — همین حالا تحویل داده شد.`);

  // Resume an interrupted purchase (user tapped buy before verifying).
  if (before?.kind === 'verify_then_buy' && before.productId && before.planId) {
    await createPurchaseOrder(env, chatId, await getBotUser(env, chatId), before.productId, before.planId);
  }
};

/* ------------------------------ purchase flow ------------------------------ */

const showProducts = async (env: BotEnv, chatId: string) => {
  const rows: tg.TgKeyboardButton[][] = botProducts().map((p) => [{ text: `🛒 ${p.name}`, callback_data: `buy:${p.id}` }]);
  await send(env, chatId, '🛒 <b>محصولات دیجیتال</b>\nمحصول مورد نظر را انتخاب کنید:', { reply_markup: tg.inlineKeyboard(rows) });
};

const showPlans = async (env: BotEnv, chatId: string, productId: string) => {
  const product = botProduct(productId);
  if (!product) return send(env, chatId, '❌ محصول پیدا نشد.');
  const plans = botPlans(productId);
  const rows: tg.TgKeyboardButton[][] = plans.map((p) => [
    { text: `${p.name} — ${p.price}`, callback_data: `plan:${productId}:${p.id}` },
  ]);
  await send(env, chatId,
    `🛒 <b>${tg.escapeHtml(product.name)}</b>\n${tg.escapeHtml(product.tagline)}\n\nپلن را انتخاب کنید:`,
    { reply_markup: tg.inlineKeyboard(rows) }
  );
};

const createPurchaseOrder = async (env: BotEnv, chatId: string, user: BotUserRow | null, productId: string, planId: string) => {
  const product = botProduct(productId);
  const plan = botPlan(productId, planId);
  if (!product || !plan) return send(env, chatId, '❌ محصول/پلن نامعتبر است.');

  const phone = user?.phone || '';
  const order: BotOrderRow = {
    id: newId('ord'),
    tg_user_id: chatId,
    phone,
    product_id: productId,
    product_name: product.name,
    plan_id: plan.id,
    plan_name: plan.name,
    amount_toman: plan.amountToman || priceToToman(plan.price),
    expected_amount_toman: (plan.amountToman || priceToToman(plan.price)) + 1000 + Math.floor(Math.random() * 9000),
    status: 'awaiting_payment',
    ref_code: '',
    receipt_file_id: '',
    receipt_json: '',
    note: '',
    created_at: nowIso(),
    decided_at: '',
    decided_by: '',
    delivery_id: '',
  };
  await insertOrder(env, order);
  await upsertBotUser(env, chatId, { pending: { kind: 'awaiting_receipt', orderId: order.id } });
  await logEvent(env, 'order_created', `${order.id} ${productId}/${planId} amount=${order.amount_toman}`);

  const card = String(env.BOT_CARD_NUMBER || '').trim();
  const holder = String(env.BOT_CARD_HOLDER || '').trim();
  await send(env, chatId, [
    '🧾 <b>سفارش جدید</b>',
    '',
    `📦 ${tg.escapeHtml(product.name)} — ${tg.escapeHtml(plan.name)}`,
    `💰 مبلغ دقیق قابل پرداخت: <b>${fmtToman(order.expected_amount_toman || order.amount_toman)}</b>`,
    '⚠️ لطفاً همین مبلغ دقیق را واریز کنید تا سفارش به‌صورت خودکار تطبیق داده شود.',
    `📅 مدت دسترسی: ${plan.durationDays} روز${plan.messageQuota ? ` — ${plan.messageQuota} پیام` : ' — نامحدود'}`,
    '',
    card
      ? `💳 <b>کارت به کارت:</b>\n<code>${tg.escapeHtml(card)}</code>${holder ? `\nبه نام: ${tg.escapeHtml(holder)}` : ''}`
      : '💳 شماره کارت بعداً از پشتیبانی اعلام می‌شود.',
    '',
    'پس از پرداخت فقط عکس رسید را همین‌جا بفرستید؛ نیازی به تایپ مبلغ یا شماره پیگیری نیست.',
    `🆔 سفارش: <code>${tg.escapeHtml(order.id)}</code>`,
  ].join('\n'));
};

/* --------------------------- receipt verification --------------------------- */

const receiptReasonFa: Record<string, string> = {
  ref_missing: 'شماره پیگیری از روی رسید قابل تشخیص نبود.',
  ref_mismatch: 'شماره‌های پیگیری موجود در رسید با هم تطبیق ندارند.',
  duplicate_ref: 'این شماره پیگیری قبلاً برای سفارش دیگری استفاده شده است.',
  amount_missing: 'مبلغ واریزی از روی رسید قابل تشخیص نبود.',
  amount_mismatch: 'مبلغ واریزی با مبلغ دقیق اعلام‌شده برای این سفارش مطابقت ندارد.',
  recipient_name_missing: 'نام صاحب حساب مقصد در رسید خوانا نیست.',
  recipient_name_mismatch: 'نام صاحب حساب مقصد با نام مورد انتظار برای دریافت وجه مطابقت ندارد.',
  date_missing: 'تاریخ تراکنش در رسید مشخص نیست.',
  date_unreadable: 'تاریخ تراکنش از روی رسید قابل خواندن یا تبدیل نبود.',
  date_out_of_range: 'تاریخ تراکنش با بازه زمانی سفارش مطابقت ندارد.',
  vision_failed: 'تصویر رسید به‌طور قابل‌اعتماد خوانده نشد.',
  not_a_receipt: 'تصویر ارسالی شبیه رسید پرداخت بانکی نیست.',
};
const renderCustomerReceiptFeedback = (reasons: string[], order: BotOrderRow, expectedRecipientName: string): string => {
  const visible = [...new Set(reasons)].filter((reason) => receiptReasonFa[reason]);
  if (!visible.length) return '⏳ رسید دریافت شد، اما هنوز شواهد کافی برای تأیید خودکار وجود ندارد.';
  const expected = order.expected_amount_toman || order.amount_toman;
  const lines = visible.map((reason) => {
    if (reason === 'amount_mismatch') return `• مبلغ رسید با سفارش مطابقت ندارد. مبلغ دقیق درخواستی: ${fmtToman(expected)}.`;
    if (reason === 'recipient_name_mismatch' && expectedRecipientName) return `• نام صاحب حساب مقصد با «${tg.escapeHtml(expectedRecipientName)}» مطابقت ندارد.`;
    return `• ${receiptReasonFa[reason]}`;
  });
  return ['⚠️ <b>رسید هنوز تأیید نشد</b>', 'مواردی که نیاز به اصلاح یا بررسی دارند:', ...lines].join('\n');
};

const runReceiptPipeline = async (
  env: BotEnv,
  order: BotOrderRow,
  captionText: string,
  photoFileId: string
): Promise<void> => {
  const details = parsePaymentDetails(captionText);
  let vision: VisionReading | null = null;
  // Keep compatibility with the existing Cloudflare secret name while preferring
  // the canonical uppercase variable for new deployments.
  // Dedicated key for Telegram receipt OCR only; never borrow the website/products' shared fallback.
  const visionApiKey = String(env.TELEGRAM_RECEIPT_GEMINI_API_KEY || '').trim();
  if (photoFileId && visionApiKey) {
    const img = await tg.downloadFileBase64(env.TELEGRAM_BOT_TOKEN || '', photoFileId);
    if (img) vision = await readReceiptWithVision(visionApiKey, img.base64, env.TELEGRAM_VISION_MODEL || 'gemini-2.5-flash');
  }

  const ref = details.ref || vision?.ref || '';
  const refTaken = ref ? await refAlreadyUsed(env, ref, order.id) : false;

  const decision = applyAutoApprovePolicy(
    decideReceipt({
      textRef: details.ref,
      textAmount: details.amount,
      vision,
      refTaken,
      orderToman: order.amount_toman,
      expectedAmountToman: order.expected_amount_toman || order.amount_toman,
      expectedRecipientName: String(env.BOT_CARD_HOLDER || '').trim(),
      orderCreatedAtMs: Date.parse(order.created_at) || Date.now(),
    }),
    autoApprovePolicy(env)
  );

  await updateOrder(env, order.id, {
    ref_code: ref,
    receipt_file_id: photoFileId,
    receipt_json: JSON.stringify({ decision, details, vision: vision ? { ...vision, error: undefined } : null }),
    status: decision.status === 'auto_approved' ? 'auto_approved' : decision.status === 'rejected' ? 'rejected' : 'needs_review',
    decided_at: decision.status === 'auto_approved' ? nowIso() : '',
    decided_by: decision.status === 'auto_approved' ? 'auto' : '',
    note: decision.reasons.join(','),
  });

  if (decision.status === 'auto_approved') {
    await fulfillOrder(env, await getOrder(env, order.id) || order, 'auto');
    return;
  }

  if (decision.status === 'rejected') {
    await send(env, order.tg_user_id,
      `❌ ${tg.escapeHtml(decision.summary)}\n\nاگر پرداخت جدیدی انجام داده‌اید، عکس رسید همان را بفرستید.` +
      (photoFileId ? '' : '\n(عکس رسید ارسال نشده بود)')
    );
    await notifyAdmins(env, `❌ رسید رد شد (خودکار)\n${renderOrderCard(order, [`دلیل: ${decision.reasons.join(', ')}`])}`);
    return;
  }

  // needs review
  await send(env, order.tg_user_id,
    renderCustomerReceiptFeedback(decision.reasons, order, String(env.BOT_CARD_HOLDER || '').trim()) + '\n\n' +
    'نیازی به وارد کردن مبلغ یا شماره پیگیری نیست؛ اگر رسید صحیح باشد، نتیجه را همین‌جا اطلاع می‌دهیم.'
  );
  await notifyAdmins(env,
    `⏳ <b>رسید نیاز به بررسی دارد</b>\n${renderOrderCard(order, [
      `اطمینان: ${Math.round(decision.confidence * 100)}٪`,
      `دلایل: ${decision.reasons.join(', ')}`,
      decision.ref ? `شماره پیگیری تشخیص‌داده: ${decision.ref}` : '',
    ])}\nبرای بررسی عکس رسید، /orders_pending را بزنید.`,
    [
      [{ text: '✅ تأیید و تحویل', callback_data: `aok:${order.id}` }, { text: '❌ رد', callback_data: `ano:${order.id}` }],
    ]
  );
};

/** Grant access + deliver the product + mark everything done. */
export const fulfillOrder = async (env: BotEnv, order: BotOrderRow, decidedBy: string): Promise<void> => {
  const grant = await grantToolAccess(env, {
    phone: order.phone,
    productId: order.product_id,
    planId: order.plan_id,
    note: `telegram order ${order.id}`,
    productName: order.product_name,
    priceLabel: fmtToman(order.amount_toman),
    features: botPlan(order.product_id, order.plan_id)?.perks,
  });

  const deliveryId = newId('del');
  await insertDelivery(env, {
    id: deliveryId,
    tg_user_id: order.tg_user_id,
    phone: order.phone,
    product_id: order.product_id,
    product_name: order.product_name,
    plan_name: order.plan_name,
    order_id: order.id,
    status: 'pending_send',
    source: 'order',
    code: grant.code,
    expires_at: grant.expiresAt,
    note: '',
    created_at: nowIso(),
    delivered_at: '',
  });

  await send(env, order.tg_user_id, renderDelivery({
    product_name: order.product_name,
    plan_name: order.plan_name,
    code: grant.code,
    expires_at: grant.expiresAt,
    product_id: order.product_id,
    id: deliveryId,
  }, siteUrl(env)), { reply_markup: tg.mainMenuKeyboard() });

  await updateDelivery(env, deliveryId, { status: 'delivered', delivered_at: nowIso() });
  await updateOrder(env, order.id, {
    status: 'fulfilled',
    decided_at: nowIso(),
    decided_by: decidedBy,
    delivery_id: deliveryId,
  });
  await logEvent(env, 'order_fulfilled', `${order.id} by ${decidedBy} code=${grant.code}`);

  await notifyAdmins(env, `✅ سفارش ${decidedBy === 'auto' ? '<b>خودکار</b> تأیید و تحویل شد' : 'تأیید و تحویل شد'}\n${renderOrderCard(order, [
    `کد صادرشده: ${grant.code}`,
    `اعتبار تا: ${fmtDate(grant.expiresAt)}`,
    grant.subscriptionUserId ? 'اشتراک سایت کاربر هم به‌روز شد ✅' : '⚠️ شماره در سایت ثبت نشده — فقط دسترسی محصول صادر شد',
  ])}`);
};

/* --------------------------------- menus --------------------------------- */

const showMySubs = async (env: BotEnv, chatId: string) => {
  const user = await getBotUser(env, chatId);
  if (!user?.verified_at) {
    return send(env, chatId, 'برای دیدن اشتراک‌ها اول شماره خود را تأیید کنید.', { reply_markup: tg.sharePhoneKeyboard() });
  }
  const rows = (await env.DB.prepare(`SELECT * FROM tool_access WHERE phone = ?1 ORDER BY created_at DESC LIMIT 10`).bind(user.phone).all<any>()).results || [];
  const deliveries = await deliveriesOf(env, chatId);
  if (!rows.length && !deliveries.length) {
    return send(env, chatId, 'فعلاً اشتراک فعالی ندارید. از «🛒 خرید اشتراک» شروع کنید.');
  }
  const lines = ['🎁 <b>اشتراک‌ها و محصولات شما</b>', ''];
  for (const r of rows) {
    const product = botProduct(r.product_id);
    const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
    lines.push(
      `• ${tg.escapeHtml(product?.name || r.product_id)} — ${expired ? 'منقضی ❌' : 'فعال ✅'}`,
      `  کد: <code>${tg.escapeHtml(r.code)}</code>${r.expires_at ? ` | تا ${fmtDate(r.expires_at)}` : ''}`
    );
  }
  if (deliveries.length) {
    lines.push('', '🚚 <b>آخرین تحویل‌ها:</b>');
    for (const d of deliveries.slice(0, 5)) {
      lines.push(`• ${tg.escapeHtml(d.product_name)} — ${d.status === 'delivered' ? '✅' : '⏳'} <code>${tg.escapeHtml(d.id)}</code>`);
    }
  }
  await send(env, chatId, lines.join('\n'));
};

const showOrders = async (env: BotEnv, chatId: string) => {
  const orders = await ordersOf(env, chatId);
  if (!orders.length) return send(env, chatId, 'هنوز سفارشی ثبت نکرده‌اید.');
  const statusFa: Record<string, string> = {
    awaiting_payment: '💳 در انتظار پرداخت/رسید',
    receipt_submitted: '⏳ رسید دریافت شد',
    auto_approved: '✅ تأیید خودکار',
    needs_review: '⏳ در حال بررسی',
    approved: '✅ تأیید شده',
    rejected: '❌ رد شده',
    fulfilled: '🎁 تحویل شده',
  };
  const lines = ['📦 <b>سفارش‌های شما</b>', ''];
  for (const o of orders.slice(0, 10)) {
    lines.push(`• ${tg.escapeHtml(o.product_name)} — ${statusFa[o.status] || o.status} <code>${tg.escapeHtml(o.id)}</code>`);
  }
  await send(env, chatId, lines.join('\n'));
};

const HELP_TEXT = [
  '❓ <b>راهنما</b>',
  '',
  '📱 <b>احراز هویت شماره</b> — تأیید شماره برای خرید و تحویل محصول',
  '🛒 <b>خرید اشتراک</b> — انتخاب محصول، کارت‌به‌کارت، ارسال رسید، تأیید و تحویل خودکار',
  '🎁 <b>اشتراک‌های من</b> — کدهای دسترسی و اعتبارها',
  '📦 <b>سفارش‌ها</b> — پیگیری وضعیت سفارش‌ها',
  '💬 <b>پشتیبانی</b> — ارتباط مستقیم با تیم',
].join('\n');

/* ------------------------------ update router ------------------------------ */

const onCallback = async (env: BotEnv, chatId: string, messageId: number, cbId: string, data: string, fromId: string) => {
  const answer = (text = '', alert = false) => tg.answerCallback(env.TELEGRAM_BOT_TOKEN || '', cbId, text, alert);

  if (data.startsWith('buy:')) {
    await answer();
    return showPlans(env, chatId, data.slice(4));
  }
  if (data.startsWith('plan:')) {
    await answer();
    const [, productId = '', planId = ''] = data.split(':');
    const user = await getBotUser(env, chatId);
    if (!user?.verified_at) {
      await send(env, chatId, 'برای خرید اول شماره خود را تأیید کنید:', { reply_markup: tg.sharePhoneKeyboard() });
      await upsertBotUser(env, chatId, { pending: { kind: 'verify_then_buy', productId, planId } });
      return;
    }
    return createPurchaseOrder(env, chatId, user, productId, planId);
  }
  if (data === 'buy') {
    await answer();
    return showProducts(env, chatId);
  }

  // admin: approve & fulfill
  if (data.startsWith('aok:')) {
    if (!isAdmin(env, fromId)) return answer('فقط ادمین.', true);
    const order = await getOrder(env, data.slice(4));
    if (!order) return answer('سفارش پیدا نشد.', true);
    if (order.status === 'fulfilled') return answer('قبلاً تحویل شده.', true);
    await answer('✅ تأیید و تحویل شد');
    await tg.editMessageText(env.TELEGRAM_BOT_TOKEN || '', chatId, messageId, `✅ سفارش <code>${tg.escapeHtml(order.id)}</code> تأیید و تحویل شد.`);
    return fulfillOrder(env, order, `admin:${fromId}`);
  }

  // admin: reject
  if (data.startsWith('ano:')) {
    if (!isAdmin(env, fromId)) return answer('فقط ادمین.', true);
    const order = await getOrder(env, data.slice(4));
    if (!order) return answer('سفارش پیدا نشد.', true);
    await answer('❌ رد شد');
    await updateOrder(env, order.id, { status: 'rejected', decided_at: nowIso(), decided_by: `admin:${fromId}` });
    await tg.editMessageText(env.TELEGRAM_BOT_TOKEN || '', chatId, messageId, `❌ سفارش <code>${tg.escapeHtml(order.id)}</code> رد شد.`);
    await send(env, order.tg_user_id, 'متأسفانه سفارش شما تأیید نشد. برای پیگیری با پشتیبانی در تماس باشید.');
    return logEvent(env, 'order_rejected', `${order.id} by ${fromId}`);
  }

  return answer();
};

const onText = async (env: BotEnv, chatId: string, text: string, from: { first_name?: string; username?: string }) => {
  const t = faDigits(String(text || '')).trim();
  const user = await getBotUser(env, chatId);
  const pending = getPending<any>(user);

  // ---- mid-flow states first ----
  if (pending?.kind === 'awaiting_otp') {
    const code = t.replace(/\D/g, '');
    const now = Date.now();
    if (now > (pending.expiresAt || 0)) {
      await upsertBotUser(env, chatId, { pending: null });
      return send(env, chatId, '⌛ کد منقضی شد. دوباره تلاش کنید.');
    }
    if (code !== String(pending.code || '')) {
      const tries = (pending.tries || 0) + 1;
      if (tries >= OTP_MAX_TRIES) {
        await upsertBotUser(env, chatId, { pending: null });
        return send(env, chatId, '❌ تلاش‌ها تمام شد. دوباره شروع کنید.');
      }
      await upsertBotUser(env, chatId, { pending: { ...pending, tries } });
      return send(env, chatId, `❌ کد اشتباه است. (${tries} از ${OTP_MAX_TRIES})`);
    }
    return completeVerification(env, chatId, pending.phoneCandidate || user?.phone || '', 'otp');
  }

  if (pending?.kind === 'awaiting_phone') {
    const phone = normalizePhone(t);
    if (!phone) return send(env, chatId, '❌ شماره معتبر نیست. مثل 09123456789 وارد کنید:');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await upsertBotUser(env, chatId, {
      pending: { kind: 'awaiting_otp', code, expiresAt: Date.now() + OTP_TTL_MS, tries: 0, phoneCandidate: phone },
    });
    return send(env, chatId, `📩 کد تایید (در همین چت):\n\n🔐 <b>${code}</b>\n\nکد را همین‌جا ارسال کنید. (اعتبار ۵ دقیقه)`);
  }

  // receipt follow-up: payment details text while an order awaits the receipt
  if (pending?.kind === 'awaiting_receipt' && /\d/.test(t)) {
    const order = await getOrder(env, pending.orderId || '');
    if (order && order.status !== 'fulfilled') {
      return runReceiptPipeline(env, order, t, order.receipt_file_id || '');
    }
  }

  if (pending?.kind === 'awaiting_payment_details') {
    const order = await getOrder(env, pending.orderId || '');
    await upsertBotUser(env, chatId, { pending: null });
    if (order && order.status !== 'fulfilled') {
      return runReceiptPipeline(env, order, t, order.receipt_file_id || '');
    }
    return;
  }

  if (pending?.kind === 'awaiting_support') {
    await upsertBotUser(env, chatId, { pending: null });
    await notifyAdmins(env, `💬 پیام پشتیبانی از ${tg.escapeHtml(from.first_name || '')} ${from.username ? '@' + tg.escapeHtml(from.username) : ''} (tg=${chatId}${user?.phone ? ' | ' + displayPhone(user.phone) : ''}):\n\n${tg.escapeHtml(t)}`);
    return send(env, chatId, '✅ پیام شما به پشتیبانی رسید.', { reply_markup: tg.mainMenuKeyboard() });
  }

  if (pending?.kind === 'admin_broadcast') {
    if (!isAdmin(env, chatId)) return;
    await upsertBotUser(env, chatId, { pending: null });
    const all = (await env.DB.prepare(`SELECT tg_user_id FROM bot_users WHERE verified_at <> ''`).all<{ tg_user_id: string }>()).results || [];
    let ok = 0;
    for (const u of all) {
      await send(env, u.tg_user_id, `📢 <b>پیام از طرف تیم</b>\n\n${tg.escapeHtml(t)}`);
      ok++;
    }
    return send(env, chatId, `✅ ارسال شد به ${ok} کاربر.`);
  }

  // ---- commands & menu buttons ----
  if (t === '/start' || t === 'شروع') {
    await upsertBotUser(env, chatId, { first_name: from.first_name || '', username: from.username || '' });
    const lines = [
      '🤖 <b>ربات فروش و تحویل محصولات امید عدلی</b>',
      '',
      '📱 شماره خود را تأیید کنید',
      '🛒 اشتراک محصولات هوشمند را بخرید (کارت‌به‌کارت + تأیید خودکار رسید)',
      '🎁 محصول و کد دسترسی را همین‌جا تحویل بگیرید',
    ];

    // Bootstrap: with no admins configured yet, tell the owner their numeric id
    // so they don't have to hunt for it in @userinfobot.
    if (parseAdminIds(env).length === 0) {
      lines.push(
        '',
        '⚙️ <b>راه‌اندازی ادمین</b>',
        `آیدی عددی شما: <code>${chatId}</code>`,
        'این عدد را در Cloudflare با نام <code>TELEGRAM_ADMIN_IDS</code> ثبت کنید تا پنل ادمین برایتان باز شود.'
      );
      await logEvent(env, 'admin_bootstrap_hint', `tg=${chatId} username=${from.username || ''}`);
    } else if (isAdmin(env, chatId)) {
      lines.push('', '🛠 شما ادمین هستید — /admin');
    }

    await send(env, chatId, lines.join('\n'), { reply_markup: tg.mainMenuKeyboard() });
    return;
  }
  if (t === '/help' || t === '❓ راهنما') return send(env, chatId, HELP_TEXT);
  if (t === '/verify' || t === '📱 احراز هویت شماره') return startVerification(env, chatId);
  if (t === '/buy' || t === '🛒 خرید اشتراک') return showProducts(env, chatId);
  if (t === '/mysubs' || t === '🎁 اشتراک‌های من') return showMySubs(env, chatId);
  if (t === '/orders' || t === '📦 سفارش‌ها') return showOrders(env, chatId);
  if (t === '/support' || t === '💬 پشتیبانی') {
    await upsertBotUser(env, chatId, { pending: { kind: 'awaiting_support' } });
    return send(env, chatId, '💬 پیام خود را بنویسید:');
  }
  if (t === '❌ انصراف') {
    await upsertBotUser(env, chatId, { pending: null });
    return send(env, chatId, 'لغو شد.', { reply_markup: tg.mainMenuKeyboard() });
  }

  // ---- admin commands ----
  if (t === '/admin' || t === '/stats' || t === '/orders_pending' || t === '/broadcast') {
    if (!isAdmin(env, chatId)) {
      if (parseAdminIds(env).length === 0) {
        return send(env, chatId, `⚙️ هنوز ادمینی تنظیم نشده است.\nآیدی عددی شما: <code>${chatId}</code>\nآن را در Cloudflare با نام <code>TELEGRAM_ADMIN_IDS</code> ثبت کنید.`);
      }
      return send(env, chatId, '⛔ فقط ادمین.');
    }
    if (t === '/broadcast') {
      await upsertBotUser(env, chatId, { pending: { kind: 'admin_broadcast' } });
      return send(env, chatId, '📢 متن پیام همگانی را بنویسید:');
    }
    if (t === '/orders_pending') {
      const orders = await pendingReviewOrders(env);
      if (!orders.length) return send(env, chatId, '✅ سفارش در انتظاری نیست.');
      for (const o of orders) {
        await send(env, chatId, renderOrderCard(o), {
          reply_markup: tg.inlineKeyboard([[{ text: '✅ تأیید و تحویل', callback_data: `aok:${o.id}` }, { text: '❌ رد', callback_data: `ano:${o.id}` }]]),
        });
      }
      return;
    }
    const stats = await botStats(env);
    return send(env, chatId, [
      '🛠 <b>پنل ادمین</b>',
      '',
      `👥 کاربران: ${stats.users} (تأییدشده: ${stats.verified})`,
      `📦 سفارش‌ها: ${stats.orders} | در انتظار بررسی: ${stats.pendingReview}`,
      `✅ تأیید خودکار: ${stats.autoApproved} | 🚚 تحویل‌شده: ${stats.delivered}`,
      '',
      '/orders_pending — بررسی رسیدها',
      '/broadcast — پیام همگانی',
    ].join('\n'));
  }

  // admin product-title style free text — fall through
  return send(env, chatId, 'متوجه نشدم 🤔 از منوی زیر استفاده کنید یا /help بزنید.', { reply_markup: tg.mainMenuKeyboard() });
};

/** Handle one Telegram update (message / callback_query / contact). */
export const handleBotUpdate = async (env: BotEnv, update: any): Promise<void> => {
  await ensureBotTables(env);
  const token = env.TELEGRAM_BOT_TOKEN || '';

  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatId) return;
    await onCallback(env, String(chatId), cq.message.message_id, cq.id, String(cq.data || ''), String(cq.from?.id || ''));
    return;
  }

  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== 'private') return;
  const chatId = String(msg.chat.id);
  const from = msg.from || {};

  await upsertBotUser(env, chatId, { first_name: from.first_name || '', username: from.username || '' });

  // contact share (phone verification)
  if (msg.contact) {
    const contact = msg.contact;
    if (contact.user_id && String(contact.user_id) !== chatId) {
      return send(env, chatId, '❌ لطفاً شماره‌ی خودتان را از دکمه‌ی همین چت بفرستید.');
    }
    const phone = normalizePhone(contact.phone_number || '');
    if (!phone) return send(env, chatId, '❌ شماره قابل تشخیص نبود.');
    await completeVerification(env, chatId, phone, 'contact');
    const pending = getPending<any>(await getBotUser(env, chatId));
    return;
  }

  // receipt photo
  if (msg.photo?.length) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const pending = getPending<any>(await getBotUser(env, chatId));
    const orderId = pending?.orderId || '';
    const order = orderId ? await getOrder(env, orderId) : null;
    if (order && order.status !== 'fulfilled' && order.status !== 'rejected') {
      await updateOrder(env, order.id, { receipt_file_id: fileId, status: 'receipt_submitted' });
      // A photo is sufficient: run OCR immediately even when no caption is provided.
      // Gemini extracts amount/reference/date; typed customer details are not required.
      return runReceiptPipeline(env, order, msg.caption || '', fileId);
    }
    return send(env, chatId, 'برای ارسال رسید اول از «🛒 خرید اشتراک» سفارش بسازید.');
  }

  const text = msg.text || msg.caption || '';
  if (!text) return;
  return onText(env, chatId, text, from);
};
