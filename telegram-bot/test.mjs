/**
 * Smoke tests for the bot business logic — run with: npm test
 * (No Telegram network calls; exercises normalize/store/flow end-to-end.)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePhone, displayPhone, genOtp, isValidPhone } from './lib/normalize.mjs';
import { createStore } from './lib/store.mjs';
import * as flow from './lib/flow.mjs';

/* ------------------------- normalize (same rules as the site) ------------------------- */
assert.equal(normalizePhone('09123456789'), '09123456789');
assert.equal(normalizePhone('+989123456789'), '09123456789');
assert.equal(normalizePhone('00989123456789'), '09123456789');
assert.equal(normalizePhone('989123456789'), '09123456789');
assert.equal(normalizePhone('9123456789'), '09123456789');
assert.equal(normalizePhone('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
assert.equal(normalizePhone('02122334455'), '');
assert.equal(isValidPhone('0912 345 6789'), true);
assert.equal(displayPhone('09123456789'), '0912 345 6789');
assert.equal(genOtp().length, 6);
console.log('✓ phone normalisation matches the website rules');

/* ------------------------------- store + verification ------------------------------- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
const store = createStore(dir);

// 1. manual phone -> OTP -> verified
const step1 = flow.startVerification(store, '111');
assert.ok(step1.text.includes('احراز هویت'));
const step2 = flow.handleManualPhone(store, '111', '+98 912 345 6789');
assert.equal(step2.ok, true);
const user = store.getUser('111');
assert.equal(user.pending.kind, 'awaiting_otp');
assert.equal(user.phoneCandidate, '09123456789');

// wrong OTP twice, then blocked on the third
assert.equal(flow.handleOtp(store, '111', '000000').ok, false);
assert.equal(flow.handleOtp(store, '111', '000000').ok, false);
assert.equal(flow.handleOtp(store, '111', '000000').ok, false);
assert.equal(store.getUser('111').pending, null);

// fresh OTP verifies
flow.handleManualPhone(store, '111', '09123456789');
const code = store.getUser('111').pending.code;
const done = flow.handleOtp(store, '111', code);
assert.equal(done.ok, true);
assert.equal(done.verifiedPhone, '09123456789');
assert.ok(store.getUser('111').verifiedAt);
console.log('✓ manual OTP verification works (with retry limits)');

// 2. contact share verification (strong path)
const viaContact = flow.handleContact(store, '222', { phone_number: '989123456789', user_id: 222 });
assert.equal(viaContact.ok, true);
assert.equal(store.getUser('222').verifyVia, 'contact');
assert.equal(store.getUser('222').phone, '09123456789');
// someone else's contact is rejected
const foreign = flow.handleContact(store, '333', { phone_number: '09123456789', user_id: 999 });
assert.equal(foreign.ok, false);
console.log('✓ contact-share verification works and rejects foreign contacts');

/* --------------------------------- orders & delivery --------------------------------- */
// website purchase BEFORE the user is linked -> queued_unverified
const web1 = flow.deliverFromWeb(store, { phone: '09129999999', productId: 'seo-tool', productName: 'ابزار سئو', payload: 'SEOCODE-1', type: 'code' });
assert.equal(web1.ok, true);
assert.equal(web1.delivery.status, 'queued_unverified');
assert.equal(web1.linked, false);

// user 444 verifies with that phone -> the queued delivery flushes
flow.handleContact(store, '444', { phone_number: '09129999999', user_id: 444 });
const queued = store.queuedDeliveries('444').length + store.allDeliveries().filter((d) => d.status === 'queued_unverified' && d.phone === '09129999999').length;
assert.ok(queued >= 1, 'delivery waits for verification');
console.log('✓ website purchases queue until the phone is verified');

// in-bot order with receipt -> admin approve -> delivery
const order = flow.createOrder(store, { tgUserId: '222', phone: '09123456789', productId: 'cro-pack', productName: 'پکیج CRO', receiptFileId: 'FILE123' });
assert.equal(order.status, 'pending');
assert.equal(store.pendingOrders().length, 1);
const approved = flow.approveOrder(store, order.id, 'ADMIN1');
assert.equal(approved.ok, true);
assert.equal(approved.delivery.status, 'pending_send'); // user 222 is verified
assert.equal(store.getOrder(order.id).status, 'approved');

// reject path
const order2 = flow.createOrder(store, { tgUserId: '222', phone: '09123456789', productId: 'x', productName: 'X' });
assert.equal(flow.rejectOrder(store, order2.id, 'ADMIN1', 'رسید نامعتبر').ok, true);
assert.equal(store.getOrder(order2.id).status, 'rejected');
console.log('✓ orders: approve creates a delivery, reject records the reason');

// delivery rendering
const text = flow.renderDeliveryText({ type: 'code', payload: 'M4K-7Q2X' }, { id: 'del-1', productName: 'ابزار هوشمند', note: 'اعتبار ۳۰ روزه' });
assert.ok(text.includes('M4K-7Q2X'));
assert.ok(text.includes('ابزار هوشمند'));
assert.ok(text.includes('del-1'));
console.log('✓ delivery messages render codes, notes and tracking ids');

/* ---------------------------------- admin data ---------------------------------- */
store.upsertProduct({ id: 'p1', title: 'محصول تست', type: 'link', payload: 'https://example.com/dl' });
assert.equal(store.getProduct('p1').title, 'محصول تست');
assert.ok(store.allUsers().length >= 3);
console.log('✓ product catalogue + user store persist');

fs.rmSync(dir, { recursive: true, force: true });
console.log('✅ همه‌ی بررسی‌های ربات تلگرام پاس شد.');
