/**
 * Bot business logic — no Telegram calls here, so it is fully unit-testable.
 * bot.mjs wires these functions to Telegram messages; test.mjs exercises them.
 *
 * Flows:
 *   1. Phone verification (صحت‌سنجی شماره):
 *      a. "Share contact"  — Telegram itself vouches for the phone number (strong).
 *      b. Manual entry + in-chat OTP — proves the person controls this Telegram
 *         account; good enough to link an account, weaker than (a).
 *   2. Product delivery (تحویل محصولات):
 *      - orders created in-bot (receipt review by admin) or via the website
 *        bridge (POST /api/deliver with the shared secret);
 *      - approved orders become deliveries, sent immediately if the user is
 *        verified, or QUEUED and flushed right after they verify.
 */
import { normalizePhone, displayPhone, genOtp, genId } from './normalize.mjs';
import { escapeHtml } from './tg.mjs';

export { escapeHtml };

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_TRIES = 3;

/* =========================== phone verification =========================== */

export function startVerification(store, tgUserId) {
  store.upsertUser(tgUserId, { pending: { kind: 'verify_menu' } });
  return {
    text:
      '📱 «احراز هویت امن شماره تلفن»\n\n' +
      'برای جلوگیری از جعل شماره و اتصال یکپارچه با حساب وب‌سایت، تأیید شماره منحصراً از طریق دکمه‌ی رسمی زیر انجام می‌شود:\n\n' +
      '👇 دکمه‌ی «📱 اشتراک شماره تلفن من» را لمس کنید.',
    keyboard: {
      keyboard: [[{ text: '📱 اشتراک شماره تلفن من', request_contact: true }], [{ text: '❌ انصراف' }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

/**
 * Legacy manual OTP helper — disabled for self-chat delivery unless an external
 * SMS gateway callback (`sendSms`) is explicitly provided by the caller.
 */
export function handleManualPhone(store, tgUserId, rawPhone, now = Date.now(), opts = {}) {
  if (typeof opts?.sendSms !== 'function') {
    return {
      ok: false,
      text: '🔒 به دلایل امنیتی ورود دستی شماره غیرفعال شده است. لطفاً دکمه‌ی «📱 اشتراک شماره تلفن من» را بزنید.',
    };
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { ok: false, text: '❌ شماره معتبر نیست. شماره باید موبایل ایران باشد، مثل 09123456789.' };
  }
  const code = genOtp();
  opts.sendSms(phone, code);
  store.upsertUser(tgUserId, {
    phoneCandidate: phone,
    pending: { kind: 'awaiting_otp', code, expiresAt: now + OTP_TTL_MS, tries: 0 },
  });
  return {
    ok: true,
    text: `📩 کد تأیید از طریق پیامک به شماره‌ی ${displayPhone(phone)} ارسال شد. کد ۶ رقمی را وارد کنید:`,
  };
}

export function handleOtp(store, tgUserId, rawCode, now = Date.now()) {
  const user = store.getUser(tgUserId) || {};
  const pending = user.pending || {};
  if (pending.kind !== 'awaiting_otp') return { ok: false, text: '' };
  const code = String(rawCode || '').trim();
  if (now > (pending.expiresAt || 0)) {
    store.upsertUser(tgUserId, { pending: null });
    return { ok: false, text: '⌛ کد منقضی شده است. دوباره شماره را وارد کنید.' };
  }
  if (code !== String(pending.code)) {
    const tries = (pending.tries || 0) + 1;
    if (tries >= OTP_MAX_TRIES) {
      store.upsertUser(tgUserId, { pending: null });
      return { ok: false, text: '❌ بارها کد اشتباه وارد شد. فرایند لغو شد؛ دوباره تلاش کنید.' };
    }
    store.upsertUser(tgUserId, { pending: { ...pending, tries } });
    return { ok: false, text: `❌ کد اشتباه است. (${tries} از ${OTP_MAX_TRIES} تلاش)` };
  }
  return completeVerification(store, tgUserId, user.phoneCandidate, 'otp');
}

/** Mark verified + return the queued deliveries that should now be sent. */
export function completeVerification(store, tgUserId, phone, via = 'contact', now = new Date().toISOString()) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, text: '❌ شماره معتبر نیست.' };
  store.upsertUser(tgUserId, {
    phone: normalized,
    verifiedAt: now,
    verifyVia: via,
    pending: null,
    phoneCandidate: null,
  });
  store.log('phone_verified', `tg=${tgUserId} phone=${normalized} via=${via}`);
  const queued = store.queuedDeliveries(tgUserId);
  return {
    ok: true,
    verifiedPhone: normalized,
    queuedDeliveries: queued,
    text:
      `✅ شماره‌ی ${displayPhone(normalized)} با موفقیت تایید شد.\n` +
      (queued.length
        ? `\n🎁 ${queued.length} محصول خریداری‌شده در صف تحویل داشتید — همین حالا برایتان ارسال می‌شود.`
        : '\nحالا می‌توانید محصولات و سفارش‌های خود را از منوی اصلی ببینید.'),
    keyboard: { remove_keyboard: true },
  };
}

/** Telegram "share contact" update → verify (strictly requires contact.user_id === tgUserId). */
export function handleContact(store, tgUserId, contact, now = new Date().toISOString()) {
  const phone = normalizePhone(contact?.phone_number || '');
  if (!phone) return { ok: false, text: '❌ شماره‌ی ارسالی قابل تشخیص نبود. لطفاً دوباره تلاش کنید.' };
  // Strict anti-spoofing check: forwarded/crafted contacts without matching user_id are rejected!
  if (!contact?.user_id || String(contact.user_id) !== String(tgUserId)) {
    return { ok: false, text: '❌ لطفاً فقط از دکمه‌ی «📱 اشتراک شماره تلفن من» در همین چت استفاده کنید (ارسال مخاطب دیگران مجاز نیست).' };
  }
  return completeVerification(store, tgUserId, phone, 'contact', now);
}

/* ============================== products/orders ============================== */

/** Create an order awaiting admin review (in-bot purchase / receipt upload). */
export function createOrder(store, { tgUserId, phone, productId, productName, note = '', receiptFileId = '', price = '' }) {
  const order = {
    id: genId('ord'),
    tgUserId: String(tgUserId),
    phone: normalizePhone(phone) || String(phone || ''),
    productId: String(productId || ''),
    productName: String(productName || productId || 'محصول'),
    price: String(price || ''),
    note: String(note || '').slice(0, 500),
    receiptFileId: String(receiptFileId || ''),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decidedAt: '',
    deliveryId: '',
  };
  store.addOrder(order);
  store.log('order_created', `${order.id} product=${order.productName} tg=${tgUserId}`);
  return order;
}

/** Admin approves → a delivery record appears (queued when not verified yet). */
export function approveOrder(store, orderId, adminId) {
  const order = store.getOrder(orderId);
  if (!order) return { ok: false, error: 'سفارش پیدا نشد.' };
  if (order.status !== 'pending') return { ok: false, error: 'این سفارش قبلاً بررسی شده است.' };
  const user = store.getUser(order.tgUserId) || {};
  const delivery = {
    id: genId('del'),
    tgUserId: order.tgUserId,
    phone: order.phone || user.phone || '',
    productId: order.productId,
    productName: order.productName,
    orderId: order.id,
    status: user.verifiedAt ? 'pending_send' : 'queued',
    source: 'order',
    createdAt: new Date().toISOString(),
    deliveredAt: '',
  };
  store.addDelivery(delivery);
  store.updateOrder(orderId, { status: 'approved', decidedAt: new Date().toISOString(), deliveryId: delivery.id, decidedBy: String(adminId) });
  store.log('order_approved', `${orderId} by ${adminId}`);
  return { ok: true, order: store.getOrder(orderId), delivery };
}

export function rejectOrder(store, orderId, adminId, reason = '') {
  const order = store.getOrder(orderId);
  if (!order) return { ok: false, error: 'سفارش پیدا نشد.' };
  store.updateOrder(orderId, { status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: String(adminId), rejectReason: String(reason || '').slice(0, 300) });
  store.log('order_rejected', `${orderId} by ${adminId}`);
  return { ok: true, order: store.getOrder(orderId) };
}

/** Website bridge: a purchase happened on the site → deliver to Telegram. */
export function deliverFromWeb(store, { phone, productId, productName, payload, type, note }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: 'phone نامعتبر است.' };
  const user = store.findUserByPhone(normalized);
  const delivery = {
    id: genId('del'),
    tgUserId: user ? user.tgUserId : '',
    phone: normalized,
    productId: String(productId || ''),
    productName: String(productName || productId || 'محصول'),
    orderId: '',
    // Custom payload from the site (access code, link, text) wins over the local product.
    payload: payload ? String(payload) : '',
    type: String(type || 'text'),
    note: String(note || '').slice(0, 500),
    status: user ? 'pending_send' : 'queued_unverified',
    source: 'website',
    createdAt: new Date().toISOString(),
    deliveredAt: '',
  };
  store.addDelivery(delivery);
  store.log('web_delivery', `${delivery.id} product=${delivery.productName} phone=${normalized}`);
  return { ok: true, delivery, linked: !!user };
}

/** Mark a delivery sent (Telegram accepted the message). */
export function markDelivered(store, deliveryId) {
  return store.updateDelivery(deliveryId, { status: 'delivered', deliveredAt: new Date().toISOString() });
}

/**
 * Render the delivery message body.
 * Product payload types: 'code' (access code), 'link', 'text', 'file' (Telegram file_id).
 */
export function renderDeliveryText(product, delivery) {
  const lines = [`🎁 <b>تحویل محصول: ${escapeHtml(delivery.productName || product?.title || '')}</b>`, ''];
  const payload = delivery.payload || product?.payload || '';
  const type = delivery.type || product?.type || 'text';
  if (type === 'code') lines.push('🔑 کد دسترسی شما:', `<code>${escapeHtml(payload)}</code>`, '', 'این کد را در بخش ورود محصول وارد کنید.');
  else if (type === 'link') lines.push(`🔗 لینک دریافت: ${escapeHtml(payload)}`);
  else if (payload) lines.push(escapeHtml(payload));
  if (delivery.note) lines.push('', `📌 ${escapeHtml(delivery.note)}`);
  lines.push('', `🆔 کد پیگیری: <code>${escapeHtml(delivery.id)}</code>`);
  return lines.join('\n');
}

/** Human-readable order status line for lists. */
export const ORDER_STATUS_FA = {
  pending: '⏳ در انتظار بررسی',
  approved: '✅ تایید شده',
  rejected: '❌ رد شده',
};
