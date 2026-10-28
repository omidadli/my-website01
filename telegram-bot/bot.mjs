#!/usr/bin/env node
/**
 * ربات تلگرام امید عدلی — احراز هویت شماره + تحویل محصولات + پنل ادمین
 *
 * اجرا:   npm start            (long polling — بدون نیاز به دامنه/سرور عمومی)
 *         BOT_MODE=webhook     (دریافت آپدیت‌ها روی HTTPS — نیاز به PUBLIC_URL)
 *
 * پیکربندی: .env (از روی .env.example) — توکن و secrets هرگز کامیت نمی‌شوند.
 * زیرساخت HTTP داخلی (پیش‌فرض :8787):
 *   GET  /api/health              سلامت سرویس
 *   POST /api/deliver             تحویل محصول از سمت سایت (هدر X-Bot-Webhook-Secret)
 *   POST /api/notify              ارسال پیام به کاربر با شماره تلفن تاییدشده
 */
import http from 'node:http';
import { config, assertConfig, isAdmin, BOT_ROOT } from './lib/env.mjs';
import { createStore } from './lib/store.mjs';
import * as tg from './lib/tg.mjs';
import { normalizePhone, displayPhone, genId } from './lib/normalize.mjs';
import * as flow from './lib/flow.mjs';
import { createPayexaClient, verifyPayexaWebhookSignature } from './lib/payexaClient.mjs';

const problems = assertConfig();
if (problems.length) {
  console.error('❌ پیکربندی ناقص است:\n - ' + problems.join('\n - ') + '\n\nفایل telegram-bot/.env را کامل کنید (به .env.example نگاه کنید).');
  process.exit(1);
}

const store = createStore(config.dataDir);
const TOKEN = config.token;
const payexa = createPayexaClient({ baseUrl: config.siteUrl, apiKey: config.gatewayApiKey });

/* ------------------------------- flood guard ------------------------------- */
const buckets = new Map();
function allowMessage(chatId) {
  const now = Date.now();
  const win = buckets.get(chatId) || [];
  const fresh = win.filter((t) => now - t < 60_000);
  if (fresh.length >= config.rateLimitPerMinute) {
    buckets.set(chatId, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(chatId, fresh);
  return true;
}

/* ------------------------------ send helpers ------------------------------ */
const send = (chatId, text, extra = {}) => tg.sendMessage(TOKEN, chatId, text, { parse_mode: 'HTML', ...extra }).catch((e) => console.error('[send]', e.message));
const sendKb = (chatId, text, keyboard) => send(chatId, text, keyboard ? { reply_markup: keyboard } : {});
const answer = (cbId, text = '', alert = false) => tg.answerCallback(TOKEN, cbId, text, alert).catch(() => {});

/* ------------------------------- main menu ------------------------------- */
const HELP_TEXT = [
  '❓ <b>راهنما</b>',
  '',
  '📱 <b>احراز هویت شماره</b> — شماره تلفن خود را تایید کنید تا محصولات خریداری‌شده از سایت به تلگرام شما تحویل داده شود.',
  '🎁 <b>محصولات من</b> — محصولات و کدهای دسترسی‌تان را دریافت کنید.',
  '📦 <b>سفارش‌ها و تحویل</b> — وضعیت سفارش‌ها و سابقه تحویل.',
  '💬 <b>پشتیبانی</b> — پیام شما مستقیم به تیم پشتیبانی می‌رسد.',
  '',
  `🌐 سایت: ${config.siteUrl}`,
  `☎️ پشتیبانی: ${config.supportHandle}`,
].join('\n');

async function showMainMenu(chatId, firstName = '') {
  await sendKb(
    chatId,
    `${firstName ? `${firstName} عزیز، سلام! 👋\n\n` : ''}از منوی زیر استفاده کنید:`,
    tg.mainMenuKeyboard()
  );
}

/* --------------------------- delivery dispatcher --------------------------- */
/** Send one delivery record to its user (if possible) and mark it delivered. */
async function dispatchDelivery(delivery) {
  const product = store.getProduct(delivery.productId);
  const chatId = delivery.tgUserId;
  if (!chatId) return false;
  try {
    const text = flow.renderDeliveryText(product, delivery);
    await send(chatId, text);
    if ((delivery.type || product?.type) === 'file' && (delivery.payload || product?.payload)) {
      await tg.sendDocument(TOKEN, chatId, { fileId: delivery.payload || product.payload }).catch(() => {});
    }
    if ((delivery.type || product?.type) === 'link' && /^https?:\/\//.test(delivery.payload || product?.payload || '')) {
      // also offer a tappable button
      await tg.sendMessage(TOKEN, chatId, '⬇️ دریافت:', {
        reply_markup: tg.inlineKeyboard([[{ text: '📥 دانلود / ورود', url: delivery.payload || product.payload }]]),
      }).catch(() => {});
    }
    flow.markDelivered(store, delivery.id);
    store.log('delivery_sent', `${delivery.id} -> tg=${chatId}`);
    return true;
  } catch (e) {
    console.error('[delivery]', delivery.id, e.message);
    store.updateDelivery(delivery.id, { status: 'failed', lastError: e.message });
    return false;
  }
}

async function dispatchQueuedFor(tgUserId) {
  for (const d of store.queuedDeliveries(tgUserId)) {
    store.updateDelivery(d.id, { status: 'pending_send' });
    await dispatchDelivery({ ...d, status: 'pending_send' });
  }
  // deliveries created by web while the user had no telegram link yet
  for (const d of store.allDeliveries().filter((x) => x.status === 'queued_unverified' && x.phone && store.findUserByPhone(x.phone)?.tgUserId === String(tgUserId))) {
    store.updateDelivery(d.id, { status: 'pending_send', tgUserId: String(tgUserId) });
    await dispatchDelivery({ ...d, status: 'pending_send', tgUserId: String(tgUserId) });
  }
}

/* ------------------------------ /start & help ------------------------------ */
async function cmdStart(chatId, user) {
  const u = store.getUser(chatId);
  if (!u) store.upsertUser(chatId, { firstName: user?.first_name || '', username: user?.username || '', createdAt: new Date().toISOString() });
  const intro = [
    '🤖 <b>ربات امید عدلی</b>',
    '',
    'اینجا می‌توانید:',
    '• شماره تلفن خود را تایید کنید (صحت‌سنجی) 📱',
    '• محصولات خریداری‌شده را تحویل بگیرید 🎁',
    '• وضعیت سفارش‌ها را پیگیری کنید 📦',
    '',
    `🌐 ${config.siteUrl}`,
  ].join('\n');
  await send(chatId, intro);
  await showMainMenu(chatId, user?.first_name || '');
}

/* --------------------------- verification flows --------------------------- */
async function menuVerify(chatId) {
  const r = flow.startVerification(store, chatId);
  await sendKb(chatId, r.text, r.keyboard);
}

async function onContact(chatId, contact) {
  const r = flow.handleContact(store, chatId, contact);
  await sendKb(chatId, r.text, tg.mainMenuKeyboard());
  if (r.ok) await dispatchQueuedFor(chatId);
}

async function onTextMessage(chatId, text, user) {
  const t = String(text || '').trim();
  const pending = store.getUser(chatId)?.pending || {};

  // 1) OTP entry
  if (pending.kind === 'awaiting_otp') {
    const r = flow.handleOtp(store, chatId, text);
    if (r.ok) {
      await sendKb(chatId, r.text, tg.mainMenuKeyboard());
      await dispatchQueuedFor(chatId);
    } else if (r.text) {
      await send(chatId, r.text);
    }
    return;
  }

  // 2) manual phone entry
  if (pending.kind === 'awaiting_phone') {
    const r = flow.handleManualPhone(store, chatId, text);
    await send(chatId, r.text, { parse_mode: 'HTML' });
    return;
  }

  // 3) admin product creation — awaiting payload
  if (pending.kind === 'admin_add_product_payload') {
    if (!isAdmin(chatId)) return send(chatId, '⛔ دسترسی فقط برای ادمین.');
    const draft = pending.draft || {};
    const product = { ...draft, payload: text.trim(), id: draft.id || genId('prd') };
    store.upsertProduct(product);
    store.upsertUser(chatId, { pending: null });
    store.log('product_added', `${product.id} ${product.title}`);
    await send(chatId, `✅ محصول «${tg.escapeHtml(product.title)}» ذخیره شد.\nنوع: ${product.type}\nشناسه: <code>${product.id}</code>`);
    return;
  }

  // 4) broadcast capture (admin)
  if (pending.kind === 'admin_broadcast') {
    if (!isAdmin(chatId)) return send(chatId, '⛔ دسترسی فقط برای ادمین.');
    store.upsertUser(chatId, { pending: null });
    const targets = store.allUsers().filter((u) => u.verifiedAt);
    await send(chatId, `📤 در حال ارسال به ${targets.length} کاربر تاییدشده…`);
    let ok = 0;
    for (const u of targets) {
      const done = await send(u.tgUserId, `📢 <b>پیام از طرف تیم امید عدلی</b>\n\n${tg.escapeHtml(t)}`);
      if (done?.length) ok++;
    }
    await send(chatId, `✅ ارسال شد: ${ok} از ${targets.length}`);
    return;
  }

  // 5) support message capture — BEFORE command matching so the message body
  //    never accidentally re-triggers a menu button.
  if (pending.kind === 'awaiting_support') {
    store.upsertUser(chatId, { pending: null });
    const u = store.getUser(chatId) || {};
    store.log('support_message', `tg=${chatId}: ${t.slice(0, 200)}`);
    const esc = tg.escapeHtml;
    for (const adminId of config.adminIds) {
      await send(adminId, `💬 پیام پشتیبانی از ${esc(user?.first_name || '')} ${u.username ? '@' + esc(u.username) : ''} (tg=${chatId}${u.phone ? ' | ' + displayPhone(u.phone) : ''}):\n\n${esc(t)}`);
    }
    return sendKb(chatId, '✅ پیام شما به پشتیبانی رسید. به‌زودی پاسخ می‌دهیم.', tg.mainMenuKeyboard());
  }

  // 6) plain commands & menu buttons
  if (t === '/start' || t === 'شروع') return cmdStart(chatId, user);
  if (t === '/help' || t === '❓ راهنما') return send(chatId, HELP_TEXT);
  if (t === '/verify' || t === '📱 احراز هویت شماره') return menuVerify(chatId);
  if (t === '/myproducts' || t === '🎁 محصولات من') return showMyProducts(chatId);
  if (t === '/orders' || t === '📦 سفارش‌ها و تحویل') return showOrders(chatId);
  if (t === '/support' || t === '💬 پشتیبانی') {
    store.upsertUser(chatId, { pending: { kind: 'awaiting_support' } });
    return send(chatId, '💬 پیام خود را بنویسید تا مستقیم به پشتیبانی ارسال شود:');
  }

  // 7) admin commands (guarded)
  if (t === '/admin' || t === '/stats' || t === '/orders_pending' || t === '/addproduct' || t === '/broadcast') {
    if (!isAdmin(chatId)) return send(chatId, '⛔ این دستور فقط برای ادمین است.');
    if (t === '/admin') return adminPanel(chatId);
    if (t === '/stats') return adminStats(chatId);
    if (t === '/orders_pending') return showPendingOrders(chatId);
    if (t === '/broadcast') {
      store.upsertUser(chatId, { pending: { kind: 'admin_broadcast' } });
      return send(chatId, '📢 متن پیام همگانی را بنویسید (برای کاربران تاییدشده ارسال می‌شود):');
    }
    if (t === '/addproduct') {
      store.upsertUser(chatId, { pending: { kind: 'admin_add_product_title' } });
      return send(chatId, '🆕 عنوان محصول را بنویسید:');
    }
  }

  // 8) admin product creation — awaiting title
  if (pending.kind === 'admin_add_product_title') {
    if (!isAdmin(chatId)) return send(chatId, '⛔ دسترسی فقط برای ادمین.');
    store.upsertUser(chatId, { pending: { kind: 'admin_add_product_type', draft: { title: t.slice(0, 120) } } });
    return send(chatId, 'نوع تحویل محصول را انتخاب کنید:', {
      reply_markup: tg.inlineKeyboard([
        [{ text: '🔑 کد دسترسی', data: 'ptype:code' }, { text: '🔗 لینک', data: 'ptype:link' }],
        [{ text: '📝 متن', data: 'ptype:text' }, { text: '📄 فایل (file_id تلگرام)', data: 'ptype:file' }],
      ]),
    });
  }

  return send(chatId, 'متوجه نشدم 🤔 از منوی زیر استفاده کنید یا /help را بزنید.', { reply_markup: tg.mainMenuKeyboard() });
}

/* ------------------------- products & orders (user) ------------------------- */
async function showMyProducts(chatId) {
  const u = store.getUser(chatId);
  if (!u?.verifiedAt) {
    return sendKb(chatId, 'برای دریافت محصولات اول شماره تلفن خود را تایید کنید.', tg.sharePhoneKeyboard());
  }
  const approved = store.ordersOf(chatId).filter((o) => o.status === 'approved');
  const delivered = store.deliveriesOf(chatId).filter((d) => d.status === 'delivered');
  if (!approved.length && !delivered.length) {
    return send(chatId, 'فعلاً محصولی برای شما ثبت نشده است. پس از خرید از سایت، محصول به‌صورت خودکار همین‌جا تحویل داده می‌شود. 🎁');
  }
  const rows = [];
  const seen = new Set();
  for (const d of delivered) {
    if (seen.has(d.productId || d.productName)) continue;
    seen.add(d.productId || d.productName);
    rows.push([{ text: `🎁 ${d.productName}`, data: `redeliver:${d.id}` }]);
  }
  for (const o of approved) {
    if (seen.has(o.productId || o.productName)) continue;
    seen.add(o.productId || o.productName);
    rows.push([{ text: `🎁 ${o.productName}`, data: `redeliver_order:${o.id}` }]);
  }
  await send(chatId, '🎁 <b>محصولات شما</b>\nبرای دریافت دوباره، روی هر محصول بزنید:', {
    reply_markup: tg.inlineKeyboard(rows),
  });
}

async function showOrders(chatId) {
  const orders = store.ordersOf(chatId);
  const deliveries = store.deliveriesOf(chatId);
  if (!orders.length && !deliveries.length) {
    return sendKb(chatId, 'هنوز سفارشی ثبت نکرده‌اید. پس از خرید، وضعیت سفارش همین‌جا نمایش داده می‌شود. 📦', tg.mainMenuKeyboard());
  }
  const lines = ['📦 <b>سفارش‌ها و تحویل</b>', ''];
  for (const o of orders.slice(0, 10)) {
    lines.push(`• ${o.productName} — ${flow.ORDER_STATUS_FA[o.status] || o.status} <code>${o.id}</code>`);
  }
  if (deliveries.length) {
    lines.push('', '🚚 <b>سابقه تحویل:</b>');
    for (const d of deliveries.slice(0, 10)) {
      const st = d.status === 'delivered' ? '✅ تحویل شده' : d.status === 'failed' ? '⚠️ ناموفق' : '⏳ در صف';
      lines.push(`• ${d.productName} — ${st} <code>${d.id}</code>`);
    }
  }
  await sendKb(chatId, lines.join('\n'), tg.mainMenuKeyboard());
}

/* --------------------------------- admin --------------------------------- */
async function adminPanel(chatId) {
  const pending = store.pendingOrders();
  const users = store.allUsers();
  const verified = users.filter((u) => u.verifiedAt).length;
  const lines = [
    '🛠 <b>پنل ادمین</b>',
    '',
    `👥 کاربران: ${users.length} (تاییدشده: ${verified})`,
    `📦 سفارش‌های در انتظار: ${pending.length}`,
    `🎁 محصولات: ${store.allProducts().length}`,
    `🚚 تحویل‌ها: ${store.allDeliveries().length}`,
    '',
    'دستورها:',
    '/orders_pending — سفارش‌های در انتظار بررسی',
    '/addproduct — افزودن محصول جدید',
    '/broadcast — ارسال پیام همگانی',
    '/stats — آمار کامل',
  ];
  await send(chatId, lines.join('\n'));
  if (pending.length) {
    await send(chatId, '⏳ <b>سفارش‌های در انتظار:</b>\nبرای بررسی /orders_pending را بزنید.');
  }
}

async function adminStats(chatId) {
  const users = store.allUsers();
  const verified = users.filter((u) => u.verifiedAt);
  const orders = store.allOrders();
  const deliveries = store.allDeliveries();
  const byStatus = (arr, s) => arr.filter((x) => x.status === s).length;
  const lines = [
    '📊 <b>آمار کامل</b>',
    '',
    `👥 کاربران: ${users.length} | تاییدشده: ${verified.length}`,
    `   از طریق اشتراک تماس: ${verified.filter((u) => u.verifyVia === 'contact').length} | OTP: ${verified.filter((u) => u.verifyVia === 'otp').length}`,
    '',
    `📦 سفارش‌ها: ${orders.length} | ⏳ ${byStatus(orders, 'pending')} | ✅ ${byStatus(orders, 'approved')} | ❌ ${byStatus(orders, 'rejected')}`,
    `🚚 تحویل‌ها: ${deliveries.length} | ✅ ${byStatus(deliveries, 'delivered')} | ⏳ صف: ${byStatus(deliveries, 'queued') + byStatus(deliveries, 'queued_unverified') + byStatus(deliveries, 'pending_send')} | ⚠️ ${byStatus(deliveries, 'failed')}`,
    '',
    `🎁 محصولات: ${store.allProducts().length}`,
  ];
  await send(chatId, lines.join('\n'));
}

async function showPendingOrders(chatId) {
  const pending = store.pendingOrders();
  if (!pending.length) return send(chatId, '✅ سفارش در انتظاری وجود ندارد.');
  for (const o of pending.slice(0, 10)) {
    const caption = [
      `📦 سفارش <code>${o.id}</code>`,
      `محصول: ${tg.escapeHtml(o.productName)}`,
      `کاربر: tg=${o.tgUserId}${o.phone ? ' | ' + displayPhone(o.phone) : ''}`,
      o.price ? `مبلغ: ${o.price}` : '',
      o.note ? `یادداشت: ${tg.escapeHtml(o.note)}` : '',
    ].filter(Boolean).join('\n');
    await send(chatId, caption, {
      reply_markup: tg.inlineKeyboard([
        [{ text: '✅ تایید و تحویل', data: `aok:${o.id}` }, { text: '❌ رد', data: `ano:${o.id}` }],
      ]),
    });
    if (o.receiptFileId) {
      await tg.sendDocument(TOKEN, chatId, { fileId: o.receiptFileId, caption: 'رسید پرداخت' }).catch(() => {});
    }
  }
}

/* ------------------------------ callback queries ------------------------------ */
async function onCallback(chatId, messageId, cbId, data, fromId) {
  // user: instant check on automated card-to-card payment (`chkpay:<paymentId>`)
  if (data.startsWith('chkpay:')) {
    const paymentId = data.slice(7);
    const verified = await payexa.verifyPayment(paymentId);
    if (!verified.ok) {
      const msg = verified?.error?.message || 'هنوز پیامک واریز از بانک دریافت نشده است. چند ثانیه دیگر دوباره تلاش کنید.';
      return answer(cbId, msg, true);
    }
    answer(cbId, '✅ پرداخت شما تأیید شد!');
    if (verified.data?.first_verification) {
      await tg.editMessageText(
        TOKEN,
        chatId,
        messageId,
        `✅ <b>پرداخت شماره <code>${tg.escapeHtml(paymentId)}</code> تأیید شد!</b>\nکد دسترسی شما صادر و فعال گردید.`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
    return;
  }

  // user: re-deliver
  if (data.startsWith('redeliver:')) {
    const d = store.allDeliveries().find((x) => x.id === data.slice(10));
    answer(cbId);
    if (d && d.tgUserId === String(chatId)) {
      await dispatchDelivery({ ...d, id: genId('del') }); // fresh record, old one stays 'delivered'
    }
    return;
  }
  if (data.startsWith('redeliver_order:')) {
    const o = store.getOrder(data.slice(16));
    answer(cbId);
    if (o && o.tgUserId === String(chatId) && o.status === 'approved') {
      const product = store.getProduct(o.productId);
      await send(chatId, flow.renderDeliveryText(product, {
        id: o.id, productName: o.productName, payload: product?.payload, type: product?.type, note: '',
      }));
    }
    return;
  }

  // admin: approve order
  if (data.startsWith('aok:')) {
    if (!isAdmin(fromId)) return answer(cbId, 'فقط ادمین.', true);
    const r = flow.approveOrder(store, data.slice(4), fromId);
    answer(cbId, r.ok ? '✅ تایید شد و تحویل ثبت شد' : r.error, !r.ok);
    if (r.ok) {
      await tg.editMessageText(TOKEN, chatId, messageId, `✅ سفارش <code>${r.order.id}</code> تایید و تحویل شد.`, { parse_mode: 'HTML' }).catch(() => {});
      // deliver now if the user is reachable
      const d = { ...r.delivery };
      if (d.tgUserId) await dispatchDelivery(d);
      else {
        const byPhone = store.findUserByPhone(d.phone);
        if (byPhone) {
          store.updateDelivery(d.id, { tgUserId: byPhone.tgUserId, status: 'pending_send' });
          await dispatchDelivery({ ...d, tgUserId: byPhone.tgUserId, status: 'pending_send' });
        }
      }
    }
    return;
  }

  // admin: reject order
  if (data.startsWith('ano:')) {
    if (!isAdmin(fromId)) return answer(cbId, 'فقط ادمین.', true);
    const r = flow.rejectOrder(store, data.slice(4), fromId);
    answer(cbId, r.ok ? '❌ رد شد' : r.error, !r.ok);
    if (r.ok) {
      await tg.editMessageText(TOKEN, chatId, messageId, `❌ سفارش <code>${r.order.id}</code> رد شد.`, { parse_mode: 'HTML' }).catch(() => {});
      if (r.order.tgUserId) {
        await send(r.order.tgUserId, `متأسفانه سفارش «${tg.escapeHtml(r.order.productName)}» تایید نشد. برای پیگیری با پشتیبانی در تماس باشید: ${config.supportHandle}`);
      }
    }
    return;
  }

  // admin: choose product type inside the /addproduct flow
  if (data.startsWith('ptype:')) {
    if (!isAdmin(fromId)) return answer(cbId, 'فقط ادمین.', true);
    const type = data.slice(6);
    const u = store.getUser(fromId) || {};
    const draft = (u.pending && u.pending.kind === 'admin_add_product_type' && u.pending.draft) || null;
    if (!draft?.title) {
      answer(cbId, 'ابتدا /addproduct را دوباره شروع کنید.', true);
      return;
    }
    store.upsertUser(fromId, { pending: { kind: 'admin_add_product_payload', draft: { ...draft, type } } });
    answer(cbId, '✅');
    const hint = {
      code: '🔑 کد دسترسی را بفرستید (مثلاً M4K-7Q2X).',
      link: '🔗 آدرس کامل لینک (https://…) را بفرستید.',
      text: '📝 متن تحویل را بفرستید.',
      file: '📄 شناسه‌ی فایل تلگرام (file_id) را بفرستید.',
    }[type] || 'محتوای تحویل را بفرستید.';
    await tg.editMessageText(TOKEN, chatId, messageId, `✅ نوع: ${type}`, {}).catch(() => {});
    await send(chatId, hint);
    return;
  }

  answer(cbId);
}

/* ------------------------------ update router ------------------------------ */
async function handleUpdate(u) {
  if (u.callback_query) {
    const cq = u.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatId) return;
    return onCallback(chatId, cq.message.message_id, cq.id, String(cq.data || ''), cq.from?.id);
  }

  const msg = u.message;
  if (!msg?.chat?.id) return;
  const chatId = msg.chat.id;
  if (msg.chat.type !== 'private') return; // private chats only
  if (!allowMessage(chatId)) return send(chatId, '⏳ لطفاً کمی آرام‌تر!');

  if (msg.contact) return onContact(chatId, msg.contact);

  const text = msg.text || msg.caption || '';
  if (!text) {
    if (msg.photo?.length) {
      // receipt photo in the purchase flow
      const pending = store.getUser(chatId)?.pending || {};
      if (pending.kind === 'awaiting_receipt') {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const order = flow.createOrder(store, {
          tgUserId: chatId,
          phone: store.getUser(chatId)?.phone || '',
          productId: pending.productId || '',
          productName: pending.productName || '',
          note: pending.note || '',
          receiptFileId: fileId,
        });
        store.upsertUser(chatId, { pending: null });
        await sendKb(chatId, `✅ رسید شما ثبت شد.\n📦 سفارش: ${tg.escapeHtml(order.productName)}\n🆔 <code>${order.id}</code>\nپس از بررسی ادمین، نتیجه اطلاع داده می‌شود.`, tg.mainMenuKeyboard());
        for (const adminId of config.adminIds) {
          await send(adminId, `🧾 سفارش جدید با رسید از tg=${chatId}\n/order — /orders_pending`);
        }
        return;
      }
    }
    return send(chatId, 'فقط پیام متنی یا عکس رسید قابل پردازش است. 🙂');
  }

  return onTextMessage(chatId, text, msg.from);
}

/* -------------------------------- HTTP bridge -------------------------------- */
function readRawBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

async function readBody(req) {
  const raw = await readRawBody(req);
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, bot: 'omidadli-telegram-bot', uptimeSec: Math.round(process.uptime()) });
  }

  // Telegram webhook endpoint (webhook mode)
  if (config.mode === 'webhook' && req.method === 'POST' && url.pathname === `/telegram/${config.webhookSecret}`) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== config.webhookSecret) return json(res, 403, { ok: false, error: 'bad secret' });
    const update = await readBody(req);
    json(res, 200, { ok: true });
    handleUpdate(update).catch((e) => console.error('[update]', e));
    return;
  }

  // Automated Card-to-Card Gateway HMAC Webhook (`POST /api/payexa-webhook`)
  if (req.method === 'POST' && url.pathname === '/api/payexa-webhook') {
    const raw = await readRawBody(req);
    const sig = String(req.headers['x-payexa-signature'] || '');
    if (!verifyPayexaWebhookSignature(config.gatewayApiKey, raw, sig)) {
      return json(res, 401, { ok: false, error: 'invalid_signature' });
    }
    let event = {};
    try { event = JSON.parse(raw || '{}'); } catch {}
    if (event.event === 'payment.paid' && event.payment_id) {
      const ver = await payexa.verifyPayment(event.payment_id, event.amount);
      if (ver.ok && ver.data?.first_verification) {
        const meta = ver.data.metadata || {};
        const tgUserId = String(meta.tg_user_id || '');
        if (tgUserId) {
          await send(
            tgUserId,
            `🎉 <b>پرداخت شما به‌صورت خودکار تأیید شد!</b>\n🆔 شناسه: <code>${tg.escapeHtml(event.payment_id)}</code>\nاشتراک شما فعال گردید.`
          );
        }
      }
    }
    return json(res, 200, { ok: true });
  }

  // Website bridge — authenticated by shared secret
  const isBridge = url.pathname === '/api/deliver' || url.pathname === '/api/notify';
  if (isBridge) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });
    if (!config.webhookSecret || req.headers['x-bot-webhook-secret'] !== config.webhookSecret) {
      return json(res, 401, { ok: false, error: 'unauthorized' });
    }
    const body = await readBody(req);

    if (url.pathname === '/api/notify') {
      const phone = normalizePhone(body.phone);
      const user = store.findUserByPhone(phone);
      if (!user) return json(res, 404, { ok: false, error: 'کاربر تاییدشده‌ای با این شماره یافت نشد.' });
      await send(user.tgUserId, String(body.message || '').slice(0, 3500));
      return json(res, 200, { ok: true, tgUserId: user.tgUserId });
    }

    // /api/deliver
    const r = flow.deliverFromWeb(store, body);
    if (!r.ok) return json(res, 400, r);
    if (r.linked && r.delivery.tgUserId) {
      await dispatchDelivery(r.delivery);
    } else {
      // no telegram link yet — queued; delivered right after phone verification
      store.log('web_delivery_queued', `${r.delivery.id} phone=${r.delivery.phone}`);
    }
    return json(res, 200, { ok: true, deliveryId: r.delivery.id, status: r.delivery.status, telegramLinked: r.linked });
  }

  return json(res, 404, { ok: false, error: 'not found' });
});

/* --------------------------------- startup --------------------------------- */
async function main() {
  const me = await tg.getMe(TOKEN).catch((e) => {
    console.error('❌ ارتباط با تلگرام برقرار نشد یا توکن نامعتبر است:', e.message);
    process.exit(1);
  });
  console.log(`🤖 ربات آماده است: @${me.username} (id=${me.id})`);
  console.log(`   حالت دریافت آپدیت: ${config.mode}`);
  console.log(`   داده‌ها: ${config.dataDir}`);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`   HTTP bridge: http://0.0.0.0:${config.port}/api/health`);
  });

  if (config.mode === 'webhook') {
    const hookUrl = `${config.publicUrl}/telegram/${config.webhookSecret}`;
    await tg.setWebhook(TOKEN, hookUrl, config.webhookSecret);
    console.log(`   webhook تنظیم شد: ${hookUrl}`);
  } else {
    await tg.deleteWebhook(TOKEN);
    console.log('   long polling شروع شد…');
    let offset = 0;
    for (;;) {
      try {
        const updates = await tg.tgCall(TOKEN, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        if (updates.ok) {
          for (const u of updates.result) {
            offset = u.update_id + 1;
            handleUpdate(u).catch((e) => console.error('[update]', e));
          }
        }
      } catch (e) {
        console.error('[poll]', e.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
}

main().catch((e) => {
  console.error('❌ خطای غیرمنتظره:', e);
  process.exit(1);
});
