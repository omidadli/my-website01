/**
 * End-to-end test of the Telegram purchase flow, against a real SQLite engine
 * (node:sqlite) standing in for Cloudflare D1, with the Telegram API and the AI
 * vision call stubbed. Run via `npm test`.
 *
 * Covers the promise of the feature: a customer pays by card, sends the receipt,
 * and WITHOUT any admin action gets: verified access code + product delivery +
 * website subscription. Plus the safety rails (duplicate reference, wrong
 * amount, hands-off policy, renewal extending instead of resetting).
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

/* ----------------------------- D1 shim ----------------------------- */

const makeD1 = () => {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql: string) => {
    // our code always binds ?1..?N in ascending order → plain anonymous binds
    const normalized = sql.replace(/\?\d+/g, '?');
    let args: unknown[] = [];
    const api = {
      bind(...values: unknown[]) {
        args = values;
        return api;
      },
      async first<T = any>(): Promise<T | null> {
        const row = db.prepare(normalized).get(...(args as any[]));
        return (row as T) ?? null;
      },
      async all<T = any>() {
        return { results: db.prepare(normalized).all(...(args as any[])) as T[] };
      },
      async run() {
        const r = db.prepare(normalized).run(...(args as any[]));
        return { meta: { changes: Number(r.changes || 0) } };
      },
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (list: any[]) => {
      const out = [];
      for (const s of list) out.push(await s.run());
      return out;
    },
    _db: db,
  } as any;
};

const SCHEMA = `
CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, phone TEXT, login_id TEXT);
CREATE TABLE tool_access (
  id TEXT PRIMARY KEY, phone TEXT, product_id TEXT, code TEXT, status TEXT,
  max_devices INTEGER DEFAULT 1, message_quota INTEGER DEFAULT 0, devices TEXT DEFAULT '[]',
  note TEXT, created_at TEXT, expires_at TEXT
);
CREATE TABLE user_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT, product_id TEXT, product_name TEXT, plan_id TEXT,
  plan_name TEXT, status TEXT, price TEXT, features TEXT, auto_renew INTEGER DEFAULT 0,
  start_date TEXT, end_date TEXT, created_at TEXT
);
CREATE TABLE user_activities (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT, description TEXT, related_id TEXT, created_at TEXT
);
`;

/* --------------------------- env + fetch stubs --------------------------- */

const sent: { chatId: string; text: string }[] = [];
let visionAnswer = '';

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input?.url || input);
  if (url.includes('generativelanguage.googleapis.com')) {
    return jsonResponse({ candidates: [{ content: { parts: [{ text: visionAnswer }] } }] });
  }
  if (url.includes('api.telegram.org')) {
    const method = url.split('/').pop() || '';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === 'sendMessage') {
      sent.push({ chatId: String(body.chat_id), text: String(body.text) });
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }
    if (method === 'getFile') return jsonResponse({ ok: true, result: { file_path: 'photos/receipt.jpg' } });
    if (url.endsWith('receipt.jpg')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    return jsonResponse({ ok: true, result: true });
  }
  return jsonResponse({});
}) as any;

/* ------------------------------ the scenario ------------------------------ */

const { grantToolAccess } = await import('../lib/telegram/grant');
const { decideReceipt, applyAutoApprovePolicy, parsePaymentDetails, readReceiptWithVision } = await import('../lib/telegram/receipt');
const store = await import('../lib/telegram/store');
const { botPlan } = await import('../lib/telegram/pricing');

const db = makeD1();
db._db.exec(SCHEMA);

const env: any = {
  DB: db,
  TELEGRAM_BOT_TOKEN: '123:TEST',
  TELEGRAM_WEBHOOK_SECRET: 'secret',
  TELEGRAM_ADMIN_IDS: '999',
  BOT_CARD_NUMBER: '6037-9911-1234-5678',
  BOT_CARD_HOLDER: 'امید عدلی',
  TELEGRAM_RECEIPT_GEMINI_API_KEY: 'gk',
  TELEGRAM_AUTO_APPROVE: 'vision',
  SITE_URL: 'https://omidadli.site',
};
await store.ensureBotTables(env);

const CUSTOMER = '555';
const productId = 'business-therapist';
const plan = botPlan(productId, 'basic')!;

// --- 1) customer creates an order (verified phone) ---
await store.upsertBotUser(env, CUSTOMER, { phone: '09123456789', verified_at: new Date().toISOString(), verify_via: 'contact', first_name: 'رضا' });

const order = {
  id: store.newId('ord'),
  tg_user_id: CUSTOMER,
  phone: '09123456789',
  product_id: productId,
  product_name: 'تراپیست بیزینسی',
  plan_id: plan.id,
  plan_name: plan.name,
  amount_toman: plan.amountToman,
  expected_amount_toman: plan.amountToman + 1632,
  status: 'awaiting_payment',
  ref_code: '',
  receipt_file_id: '',
  receipt_json: '',
  note: '',
  created_at: new Date().toISOString(),
  decided_at: '',
  decided_by: '',
  delivery_id: '',
};
await store.insertOrder(env, order);
assert.equal((await store.getOrder(env, order.id))?.status, 'awaiting_payment');

// --- 2) receipt arrives: vision reads a matching receipt ---
const { handleBotUpdate } = await import('../lib/telegram/bot');
visionAnswer = JSON.stringify({ looksLikeReceipt: true, ref: '1234567890', amount: (plan.amountToman + 1632) * 10, date: new Date().toISOString().slice(0, 10), bank: 'ملت', recipientName: 'امید عدلی' });

// the customer's pending state points at this order
await store.upsertBotUser(env, CUSTOMER, { pending: { kind: 'awaiting_receipt', orderId: order.id } });

sent.length = 0;
await handleBotUpdate(env, {
  update_id: 1,
  message: {
    message_id: 10,
    chat: { id: Number(CUSTOMER), type: 'private' },
    from: { id: Number(CUSTOMER), first_name: 'رضا' },
    photo: [{ file_id: 'ph1' }, { file_id: 'ph2' }],
  },
});

const after = await store.getOrder(env, order.id);
assert.equal(after?.status, 'fulfilled', 'order must be auto-approved and fulfilled');
assert.equal(after?.decided_by, 'auto', 'no admin involvement');

// --- 3) the access code exists in the website's own table ---
const access = await db.prepare(`SELECT * FROM tool_access WHERE phone = ?1 AND product_id = ?2`).bind('09123456789', productId).first();
assert.ok(access, 'tool_access row created');
assert.equal(access.status, 'active');
assert.equal(access.message_quota, plan.messageQuota);
assert.equal(access.max_devices, plan.maxDevices);
assert.ok(access.expires_at > new Date().toISOString());

// --- 4) delivery record + message to the customer ---
const deliveries = await store.deliveriesOf(env, CUSTOMER);
assert.equal(deliveries.length, 1);
assert.equal(deliveries[0].status, 'delivered');
assert.equal(deliveries[0].code, access.code);
const customerMsg = sent.find((m) => m.chatId === CUSTOMER && m.text.includes(access.code));
assert.ok(customerMsg, 'the customer received the code');
const adminMsg = sent.find((m) => m.chatId === '999');
assert.ok(adminMsg?.text.includes('خودکار'), 'admins are informed it was automatic');

// --- 5) the same receipt cannot pay twice ---
assert.equal(await store.refAlreadyUsed(env, '1234567890', ''), true);

// --- 6) renewal extends the existing expiry instead of resetting it ---
const before = Date.parse(access.expires_at);
const regrant = await grantToolAccess(env, {
  phone: '09123456789',
  productId,
  planId: plan.id,
  productName: 'تراپیست بیزینسی',
  priceLabel: plan.price,
});
const afterRenew = Date.parse(regrant.expiresAt);
assert.ok(regrant.refreshed, 'renewal flagged');
assert.equal(regrant.code, access.code, 'same access code is kept on renewal');
const daysAdded = Math.round((afterRenew - before) / 86400_000);
assert.equal(daysAdded, plan.durationDays, 'expiry extended by exactly one plan period');

// --- 7) a registered website user also gets a subscription row ---
db._db.prepare(`INSERT INTO users (id, full_name, email, phone, login_id) VALUES (?,?,?,?,?)`).run('u1', 'رضا', 'reza@test.com', '09123456789', '09123456789');
await grantToolAccess(env, { phone: '09123456789', productId, planId: 'pro', productName: 'تراپیست بیزینسی', priceLabel: plan.price });
const sub = db._db.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?`).get('u1') as any;
assert.ok(sub, 'subscription created for the website account');
assert.equal(sub.plan_id, 'pro');
const activity = db._db.prepare(`SELECT * FROM user_activities WHERE user_id = ?`).get('u1') as any;
assert.ok(activity, 'activity timeline entry created');

// --- 8) safety rails ---
const wrongAmount = applyAutoApprovePolicy(
  decideReceipt({
    orderToman: plan.amountToman,
    orderCreatedAtMs: Date.now(),
    textRef: '9999999999',
    textAmount: 1000,
    expectedAmountToman: plan.amountToman + 1632,
    expectedRecipientName: 'امید عدلی',
    vision: { ok: true, ref: '9999999999', amount: 1000, date: '2020-01-01', recipientName: 'شخص دیگر', looksLikeReceipt: true },
  }),
  'vision'
);
assert.equal(wrongAmount.status, 'needs_review', 'a wrong amount is never auto-approved');
assert.ok(wrongAmount.reasons.includes('amount_mismatch'), 'wrong transfer amount is explained');
assert.ok(wrongAmount.reasons.includes('recipient_name_mismatch'), 'wrong beneficiary is explained');
assert.ok(wrongAmount.reasons.includes('date_out_of_range'), 'wrong transfer date is explained');

const handsOff = applyAutoApprovePolicy(
  decideReceipt({ orderToman: plan.amountToman, orderCreatedAtMs: Date.now(), textRef: '8888888888', textAmount: plan.amountToman }),
  'always'
);
assert.equal(handsOff.status, 'needs_review', "policy 'always' cannot bypass missing OCR date and beneficiary");

const offPolicy = applyAutoApprovePolicy(
  decideReceipt({
    orderToman: plan.amountToman,
    orderCreatedAtMs: Date.now(),
    textRef: '7777777777',
    vision: { ok: true, ref: '7777777777', amount: plan.amountToman, looksLikeReceipt: true },
  }),
  'off'
);
assert.equal(offPolicy.status, 'needs_review', "policy 'off' always asks the admin");

// --- 9) vision call is wired correctly ---
const parsed = await readReceiptWithVision('gk', 'AAAA', 'gemini-2.5-flash');
assert.equal(parsed.ok, true);
assert.equal(parsed.ref, '1234567890');
assert.equal(parsed.amount, plan.amountToman * 10);

// --- 10) parsing a real-world caption ---
const details = parsePaymentDetails(`واریز ${plan.amountToman} تومان شماره پیگیری ۴۵۶۷۸۹۰۱۲۳`);
assert.equal(details.ref, '4567890123');
assert.ok(details.amounts.includes(plan.amountToman));

globalThis.fetch = originalFetch;
console.log('✅ telegram purchase flow: 10/10 checks passed (auto-verify → access code → delivery → renewal)');
