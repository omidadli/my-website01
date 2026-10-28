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
import {
  completePhoneVerificationToken,
  createGatewayPayment,
  ensurePaymentTables,
  formatCardNumber,
  fulfillGatewayPayment,
  sweepExpiredPayments,
  type PaymentOrderRow,
} from '../payment/gateway';

const loadBotCmsData = async (env: BotEnv): Promise<any> => {
  try {
    const row = await env.DB.prepare(`SELECT data FROM content WHERE id = 1`).first<{ data: string }>();
    return row?.data ? JSON.parse(row.data) : null;
  } catch {
    return null;
  }
};

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
    `قیمت محصول: ${fmtToman(o.amount_toman)}`,
    o.expected_amount_toman && o.expected_amount_toman !== o.amount_toman ? `مبلغ دقیق انتقال: ${fmtToman(o.expected_amount_toman)}` : '',
    o.ref_code ? `شماره پیگیری: <code>${tg.escapeHtml(o.ref_code)}</code>` : '',
    ...extraLines,
  ].filter(Boolean).join('\n');

/* ------------------------------ verification ------------------------------ */

const startVerification = async (env: BotEnv, chatId: string, webVerifyToken = '') => {
  await upsertBotUser(env, chatId, {
    pending: webVerifyToken ? { kind: 'verify_web_token', verifyToken: webVerifyToken } : { kind: 'verify_menu' },
  });
  await send(
    env,
    chatId,
    '📱 <b>احراز هویت امن شماره موبایل</b>\n\n' +
      (webVerifyToken
        ? '🔗 درخواست اتصال و تأیید حساب کاربری وب‌سایت دریافت شد.\n\n'
        : 'برای خرید و دریافت آنی محصولات باید مالکیت شماره شما تأیید شود.\n\n') +
      '🔒 برای امنیت حساب و جلوگیری از سوءاستفاده، تأیید شماره منحصراً از طریق دکمه‌ی رسمی تلگرام انجام می‌شود.\n' +
      '👇 کافی است روی دکمه‌ی <b>«📱 اشتراک شماره تلفن من»</b> در پایین صفحه بزنید:',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📱 اشتراک شماره تلفن من', request_contact: true }],
          [{ text: '❌ انصراف' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
};

const completeVerification = async (env: BotEnv, chatId: string, phone: string, via: string, tgUsername = '') => {
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

  // If this verification was initiated from the website profile (`verify_<token>`), complete website linkage!
  if (before?.kind === 'verify_web_token' && before.verifyToken) {
    const linked = await completePhoneVerificationToken(env, String(before.verifyToken), chatId, normalized, tgUsername);
    if (linked.ok) {
      await send(
        env,
        chatId,
        `✅ شماره‌ی ${displayPhone(normalized)} تأیید شد و حساب کاربری شما در وب‌سایت با موفقیت متصل گردید!\n` +
          '🎁 تمام اشتراک‌های فعال شما همگام‌سازی شدند و اکنون بدون نیاز به وارد کردن کد، در سایت فعال هستند.',
        { reply_markup: tg.mainMenuKeyboard() }
      );
    } else {
      await send(
        env,
        chatId,
        `✅ شماره‌ی ${displayPhone(normalized)} در ربات تأیید شد، اما اتصال به حساب سایت انجام نشد:\n⚠️ ${tg.escapeHtml(linked.error || '')}`,
        { reply_markup: tg.mainMenuKeyboard() }
      );
    }
  } else {
    await send(env, chatId, `✅ شماره‌ی ${displayPhone(normalized)} با موفقیت تأیید شد.`, {
      reply_markup: tg.mainMenuKeyboard(),
    });
  }

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
  const cmsData = await loadBotCmsData(env);
  const plans = botPlans(productId, cmsData);
  const rows: tg.TgKeyboardButton[][] = plans.map((p) => [
    { text: `${p.name} — ${p.price}`, callback_data: `plan:${productId}:${p.id}` },
  ]);
  await send(
    env,
    chatId,
    `🛒 <b>${tg.escapeHtml(product.name)}</b>\n${tg.escapeHtml(product.tagline)}\n\nپلن را انتخاب کنید:`,
    { reply_markup: tg.inlineKeyboard(rows) }
  );
};

const fmtRial = (n: number): string => `${faDigits(String(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')} ریال`;

const createPurchaseOrder = async (env: BotEnv, chatId: string, user: BotUserRow | null, productId: string, planId: string) => {
  const product = botProduct(productId);
  const cmsData = await loadBotCmsData(env);
  const plan = botPlan(productId, planId, cmsData);
  if (!product || !plan) return send(env, chatId, '❌ محصول/پلن نامعتبر است.');

  const phone = user?.phone || '';
  const baseToman = plan.amountToman || priceToToman(plan.price);
  const orderId = newId('ord');

  // Create unified Payexa-v2 SMS card-to-card gateway payment
  const gw = await createGatewayPayment(env, {
    amountRial: baseToman * 10,
    orderId,
    source: 'telegram',
    phone,
    tgUserId: chatId,
    productId,
    productName: product.name,
    planId: plan.id,
    planName: plan.name,
    description: `اشتراک ${product.name} — ${plan.name}`,
    originUrl: siteUrl(env),
  });

  const expectedToman = gw.ok ? gw.data.payable_amount_toman : Math.max(1000, baseToman - (10 + Math.floor(Math.random() * 89)));
  const paymentId = gw.ok ? gw.data.payment_id : '';

  const order: BotOrderRow = {
    id: orderId,
    tg_user_id: chatId,
    phone,
    product_id: productId,
    product_name: product.name,
    plan_id: plan.id,
    plan_name: plan.name,
    amount_toman: baseToman,
    expected_amount_toman: expectedToman,
    payment_id: paymentId,
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
  await upsertBotUser(env, chatId, { pending: { kind: 'awaiting_receipt', orderId: order.id, paymentId } });
  await logEvent(env, 'order_created', `${order.id} gw=${paymentId} ${productId}/${planId} price=${order.amount_toman} payable=${expectedToman}`);

  if (gw.ok) {
    const d = gw.data;
    const buttons: tg.TgKeyboardButton[][] = [
      [{ text: '✅ پرداخت کردم — بررسی وضعیت', callback_data: `chkpay:${d.payment_id}` }],
    ];
    if (d.payment_url && /^https:\/\//i.test(d.payment_url)) {
      buttons.push([{ text: '🌐 باز کردن صفحه پرداخت آنلاین', url: d.payment_url }]);
    }
    buttons.push([{ text: '🧾 ارسال تصویر رسید (در صورت تأخیر پیامک)', callback_data: `fbrcpt:${order.id}` }]);

    await send(
      env,
      chatId,
      [
        '💳 <b>فاکتور پرداخت خودکار کارت‌به‌کارت</b>',
        '',
        `📦 محصول: <b>${tg.escapeHtml(product.name)}</b> — ${tg.escapeHtml(plan.name)}`,
        `📅 مدت اعتبار: ${plan.durationDays} روز${plan.messageQuota ? ` (${plan.messageQuota} پیام)` : ' (نامحدود)'}`,
        '',
        `💰 <b>مبلغ دقیق و یکتای قابل پرداخت:</b>`,
        `👉 <code>${d.payable_amount}</code> ریال  (معادل <b>${fmtToman(d.payable_amount_toman)}</b>)`,
        '',
        '🚨 <b>هشدار بسیار مهم:</b> مبلغ بالا را <u>به هیچ‌وجه رُند نکنید</u>! دقیقاً همین مبلغ یکتا را کارت‌به‌کارت کنید تا به محض دریافت پیامک بانک (در چند ثانیه)، کد دسترسی <b>به‌صورت کاملاً خودکار و بدون نیاز به ارسال رسید</b> برایتان صادر شود.',
        '',
        `🏦 <b>بانک مقصد:</b> ${tg.escapeHtml(d.card.bank || 'شبکه شتاب')}`,
        `💳 <b>شماره کارت (ضربه بزنید کپی شود):</b>\n<code>${tg.escapeHtml(d.card.number)}</code>`,
        `👤 <b>به نام:</b> ${tg.escapeHtml(d.card.holder_name)}`,
        `⏱ <b>مهلت پرداخت:</b> ۳۰ دقیقه`,
        `🆔 شناسه پرداخت: <code>${tg.escapeHtml(d.payment_id)}</code>`,
      ].join('\n'),
      { reply_markup: tg.inlineKeyboard(buttons) }
    );
    return;
  }

  // Fallback if no active card is configured yet
  const card = String(env.BOT_CARD_NUMBER || '').trim();
  const holder = String(env.BOT_CARD_HOLDER || '').trim();
  await send(
    env,
    chatId,
    [
      '🧾 <b>سفارش جدید</b>',
      '',
      `📦 ${tg.escapeHtml(product.name)} — ${tg.escapeHtml(plan.name)}`,
      `💰 مبلغ دقیق قابل پرداخت: <b>${fmtToman(expectedToman)}</b> (${fmtRial(expectedToman * 10)})`,
      '⚠️ لطفاً همین مبلغ دقیق را واریز کنید تا سفارش به‌صورت خودکار تطبیق داده شود.',
      card
        ? `💳 <b>کارت به کارت:</b>\n<code>${tg.escapeHtml(card)}</code>${holder ? `\nبه نام: ${tg.escapeHtml(holder)}` : ''}`
        : '💳 شماره کارت فعال هنوز ثبت نشده است؛ از پشتیبانی راهنمایی بگیرید.',
      `🆔 سفارش: <code>${tg.escapeHtml(order.id)}</code>`,
    ].join('\n')
  );
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

  // Buyer checks SMS payment status (`chkpay:<paymentId>`)
  if (data.startsWith('chkpay:')) {
    const paymentId = data.slice(7);
    await ensurePaymentTables(env);
    await sweepExpiredPayments(env);
    const pRow = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`)
      .bind(paymentId)
      .first<PaymentOrderRow>();
    if (!pRow) return answer('تراکنش یافت نشد.', true);

    if (pRow.status === 'paid') {
      await answer('✅ پرداخت شما تأیید شد!');
      await fulfillGatewayPayment(env, paymentId, 'telegram_check');
      return;
    }
    if (pRow.status === 'expired' || pRow.status === 'canceled') {
      await answer('⌛ مهلت ۳۰ دقیقه‌ای این پرداخت به پایان رسیده است.', true);
      return send(
        env,
        chatId,
        '⌛ مهلت ۳۰ دقیقه‌ای این فاکتور تمام شده است.\nاگر واریز را انجام داده‌اید، عکس رسید را همین‌جا ارسال کنید؛ در غیر این صورت از «🛒 خرید اشتراک» فاکتور جدید بسازید.'
      );
    }
    const secLeft = Math.max(0, Math.floor((Date.parse(pRow.expires_at) - Date.now()) / 1000));
    const minLeft = Math.ceil(secLeft / 60);
    return answer(
      `⏳ هنوز پیامک واریز دقیق (${pRow.payable_amount_rial.toLocaleString('en-US')} ریال) دریافت نشده است. مهلت باقی‌مانده: ${minLeft} دقیقه.`,
      true
    );
  }

  // Buyer requests manual receipt fallback (`fbrcpt:<orderId>`)
  if (data.startsWith('fbrcpt:')) {
    const orderId = data.slice(7);
    await answer();
    await upsertBotUser(env, chatId, { pending: { kind: 'awaiting_receipt', orderId } });
    return send(
      env,
      chatId,
      '🧾 اگر مبلغ را اشتباهاً رُند واریز کرده‌اید یا پیامک بانک با تأخیر مواجه شده، همین الان <b>تصویر واضح رسید بانکی</b> خود را ارسال کنید تا بررسی شود.'
    );
  }

  // Admin: approve/reject gateway fallback receipt (`payok:<paymentId>` / `payno:<paymentId>`)
  if (data.startsWith('payok:')) {
    if (!isAdmin(env, fromId)) return answer('فقط ادمین.', true);
    const paymentId = data.slice(6);
    await ensurePaymentTables(env);
    const now = nowIso();
    await env.DB.prepare(
      `UPDATE payment_orders SET status = 'paid', paid_at = CASE WHEN paid_at = '' THEN ?1 ELSE paid_at END, updated_at = ?2 WHERE id = ?3`
    )
      .bind(now, now, paymentId)
      .run();
    await fulfillGatewayPayment(env, paymentId, `admin_tg:${fromId}`);
    await answer('✅ پرداخت تأیید و محصول تحویل شد');
    return tg.editMessageText(
      env.TELEGRAM_BOT_TOKEN || '',
      chatId,
      messageId,
      `✅ پرداخت درگاه <code>${tg.escapeHtml(paymentId)}</code> توسط ادمین تأیید و تحویل شد.`
    );
  }

  if (data.startsWith('payno:')) {
    if (!isAdmin(env, fromId)) return answer('فقط ادمین.', true);
    const paymentId = data.slice(6);
    await ensurePaymentTables(env);
    await env.DB.prepare(`UPDATE payment_orders SET status = 'rejected', updated_at = ?1 WHERE id = ?2`)
      .bind(nowIso(), paymentId)
      .run();
    await answer('❌ رسید رد شد');
    return tg.editMessageText(
      env.TELEGRAM_BOT_TOKEN || '',
      chatId,
      messageId,
      `❌ رسید پرداخت <code>${tg.escapeHtml(paymentId)}</code> رد شد.`
    );
  }

  // admin: approve & fulfill legacy bot order
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

  // ---- deep-link /start payloads FIRST (so `/start verify_...` or `/start pay_...` always works even mid-flow!) ----
  const startMatch = t.match(/^\/start\s+([A-Za-z0-9_-]+)$/);
  if (startMatch) {
    const startArg = startMatch[1];
    await upsertBotUser(env, chatId, { first_name: from.first_name || '', username: from.username || '' });

    if (startArg.startsWith('verify_')) {
      const verifyToken = startArg.slice(7);
      if (user?.verified_at && user.phone && user.verify_via === 'contact') {
        const linked = await completePhoneVerificationToken(env, verifyToken, chatId, user.phone, from.username || '');
        if (linked.ok) {
          return send(
            env,
            chatId,
            `✅ حساب کاربری وب‌سایت شما با شماره ${displayPhone(user.phone)} متصل و تأیید شد!\n🎁 اشتراک‌های شما در پروفایل سایت همگام‌سازی شدند.`,
            { reply_markup: tg.mainMenuKeyboard() }
          );
        }
        return send(env, chatId, `❌ خطا در اتصال حساب سایت: ${tg.escapeHtml(linked.error || '')}`, {
          reply_markup: tg.mainMenuKeyboard(),
        });
      }
      return startVerification(env, chatId, verifyToken);
    }

    if (startArg.startsWith('pay_')) {
      const paymentId = startArg.slice(4);
      await ensurePaymentTables(env);
      await sweepExpiredPayments(env);
      const pRow = await env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`)
        .bind(paymentId)
        .first<PaymentOrderRow>();
      if (!pRow) {
        return send(env, chatId, '❌ فاکتور پرداخت یافت نشد یا نامعتبر است.', { reply_markup: tg.mainMenuKeyboard() });
      }
      if (!pRow.tg_user_id) {
        await env.DB.prepare(`UPDATE payment_orders SET tg_user_id = ?1, updated_at = ?2 WHERE id = ?3`)
          .bind(chatId, nowIso(), paymentId)
          .run()
          .catch(() => {});
      }
      if (pRow.status === 'paid') {
        await fulfillGatewayPayment(env, paymentId, 'telegram_deeplink');
        return send(env, chatId, '✅ این فاکتور پرداخت شده و کد دسترسی برایتان ارسال گردید.', {
          reply_markup: tg.mainMenuKeyboard(),
        });
      }
      if (pRow.status !== 'pending') {
        return send(env, chatId, '⌛ مهلت این فاکتور به پایان رسیده است. لطفاً از سایت یا منوی خرید مجدداً اقدام کنید.');
      }
      return send(
        env,
        chatId,
        [
          '💳 <b>ادامه پرداخت در تلگرام</b>',
          '',
          `📦 سفارش: <b>${tg.escapeHtml(pRow.description || pRow.order_id)}</b>`,
          `💰 مبلغ دقیق و یکتای قابل پرداخت:`,
          `👉 <code>${pRow.payable_amount_rial}</code> ریال  (معادل <b>${fmtToman(Math.floor(pRow.payable_amount_rial / 10))}</b>)`,
          '',
          '🚨 <b>مبلغ را رُند نکنید!</b> به محض دریافت پیامک بانک، کد دسترسی همین‌جا برایتان ارسال می‌شود.',
          '',
          `🏦 بانک: ${tg.escapeHtml(pRow.card_bank || 'شتاب')}`,
          `💳 شماره کارت:\n<code>${tg.escapeHtml(formatCardNumber(pRow.card_number))}</code>`,
          `👤 به نام: ${tg.escapeHtml(pRow.card_holder)}`,
        ].join('\n'),
        {
          reply_markup: tg.inlineKeyboard([
            [{ text: '✅ پرداخت کردم — بررسی وضعیت', callback_data: `chkpay:${pRow.id}` }],
          ]),
        }
      );
    }
  }

  // ---- mid-flow states ----
  if ((pending?.kind === 'verify_menu' || pending?.kind === 'verify_web_token') && t !== '❌ انصراف' && !t.startsWith('/')) {
    return send(
      env,
      chatId,
      '🔒 برای جلوگیری از ثبت شماره‌ی دیگران، ورود تایپی شماره غیرفعال است.\n👇 لطفاً فقط روی دکمه‌ی <b>«📱 اشتراک شماره تلفن من»</b> در پایین صفحه بزنید.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📱 اشتراک شماره تلفن من', request_contact: true }],
            [{ text: '❌ انصراف' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
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

  // contact share (cryptographically verified by Telegram client)
  if (msg.contact) {
    const contact = msg.contact;
    if (!contact.user_id || String(contact.user_id) !== chatId) {
      return send(env, chatId, '❌ لطفاً فقط شماره‌ی حساب تلگرام خودتان را از طریق دکمه‌ی «📱 اشتراک شماره تلفن من» ارسال کنید.');
    }
    const phone = normalizePhone(contact.phone_number || '');
    if (!phone) return send(env, chatId, '❌ شماره قابل تشخیص نبود (فقط شماره‌های موبایل ایران ۰۹xxxxxxxxx پشتیبانی می‌شود).');
    await completeVerification(env, chatId, phone, 'contact', from.username || '');
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

/**
 * Push a product delivery (or queue it until the buyer verifies their phone in
 * Telegram). Shared by `functions/api/tools.ts` (admin grant) and website flows.
 */
export const deliverViaTelegram = async (
  env: BotEnv,
  args: {
    phone: string;
    productId: string;
    productName: string;
    planName?: string;
    code: string;
    expiresAt: string;
    note?: string;
    source?: string;
  }
): Promise<{ status: 'delivered' | 'queued'; deliveryId: string }> => {
  await ensureBotTables(env);
  const phone = normalizePhone(args.phone);
  const verifiedUser = phone ? await findVerifiedByPhone(env, phone) : null;
  const tgUserId = verifiedUser?.tg_user_id || '';
  const deliveryId = newId('del');
  const now = nowIso();

  await insertDelivery(env, {
    id: deliveryId,
    tg_user_id: tgUserId,
    phone,
    product_id: args.productId,
    product_name: args.productName,
    plan_name: args.planName || '',
    order_id: '',
    status: tgUserId && env.TELEGRAM_BOT_TOKEN ? 'pending_send' : 'queued',
    source: args.source || 'website',
    code: args.code,
    expires_at: args.expiresAt,
    note: args.note || '',
    created_at: now,
    delivered_at: '',
  });

  if (tgUserId && env.TELEGRAM_BOT_TOKEN) {
    await send(
      env,
      tgUserId,
      renderDelivery(
        {
          id: deliveryId,
          product_id: args.productId,
          product_name: args.productName,
          plan_name: args.planName || '',
          code: args.code,
          expires_at: args.expiresAt,
        },
        siteUrl(env)
      ),
      { reply_markup: tg.mainMenuKeyboard() }
    );
    await updateDelivery(env, deliveryId, { status: 'delivered', delivered_at: nowIso() });
    return { status: 'delivered', deliveryId };
  }
  return { status: 'queued', deliveryId };
};
