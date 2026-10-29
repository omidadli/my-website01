/**
 * End-to-end & unit tests for:
 *  1. Self-hosted Payexa-compatible SMS Card-to-Card Payment Gateway (lib/payment/*)
 *  2. Iranian Bank SMS Parser + OTP Privacy Blocker + Shetab BIN/Luhn Validator
 *  3. Android SMS Uploader Device API (/api/payment/device/ping & /api/payment/device/sms)
 *  4. Merchant REST API v2 (/api/payment/v2/payments & atomic verify + HMAC webhook)
 *  5. Telegram Bot <-> Website Phone Ownership Verification & Spoofing Prevention
 *
 * Run: npx tsx scripts/payment-gateway.test.ts
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { detectIranBank, isValidIranBankCard } from '../lib/payment/banks';
import { parseIranianBankSms } from '../lib/payment/smsParser';
import {
  createGatewayPayment,
  createPhoneVerificationToken,
  ensurePaymentTables,
  verifyPayexaSignature,
} from '../lib/payment/gateway';
import { handlePaymentRequest } from '../lib/payment/http';
import { handleBotUpdate } from '../lib/telegram/bot';
import { jalaliToGregorian, matchRecipientName, parseReceiptTimestamps } from '../lib/telegram/receipt';

const makeD1 = (sqlite: DatabaseSync) => {
  const prep = (sql: string) => {
    const positional = sql.replace(/\?\d+/g, '?');
    const runWith = (args: unknown[]) => ({ positional, args: args.map((v) => (v === undefined ? null : v)) });
    const exec = {
      args: [] as unknown[],
      bind(...a: unknown[]) {
        const next = Object.create(exec);
        next.args = a;
        return next;
      },
      async run() {
        const { positional: q, args } = runWith(this.args);
        const info = sqlite.prepare(q).run(...(args as any[]));
        return { success: true, meta: { changes: Number(info.changes || 0) } };
      },
      async first<T = any>(): Promise<T | null> {
        const { positional: q, args } = runWith(this.args);
        const row = sqlite.prepare(q).get(...(args as any[])) as T | undefined;
        return row ?? null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        const { positional: q, args } = runWith(this.args);
        const rows = sqlite.prepare(q).all(...(args as any[])) as T[];
        return { results: rows };
      },
    };
    return exec;
  };
  return {
    prepare: prep,
    async batch(stmts: any[]) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
};

let pass = 0;
let fail = 0;
const test = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (e: any) {
    fail++;
    console.error(`✗ ${name}\n   ${e?.stack || e?.message || e}`);
  }
};
const ok = (v: unknown, msg = 'expected truthy') => {
  if (!v) throw new Error(msg);
};
const eq = (a: unknown, b: unknown, msg = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};

(async () => {
  /* ---------------- 1. Shetab BIN & Luhn ---------------- */
  await test('detects Iranian bank BINs and validates Shetab Luhn checksum', () => {
    const saman = detectIranBank('6219-8610-3452-9007');
    eq(saman.slug, 'saman');
    ok(isValidIranBankCard('6219861034529007'), 'valid Saman test card');
    ok(!isValidIranBankCard('6219861034529008'), 'corrupted check digit must fail Luhn');
  });

  /* ---------------- 2. Bank SMS Parser & OTP Filter ---------------- */
  await test('parses diverse Iranian bank deposit SMS formats in Rial and Toman', () => {
    // Bank Saman (Rial)
    const s1 = parseIranianBankSms('9820000', 'بانک سامان\nواریز به حساب 821-2-12345\nمبلغ: 5,899,420 ریال\nمانده: 94,000,000 ریال');
    eq(s1.kind, 'deposit');
    eq(s1.amountRial, 5899420);

    // Bank Melli BMI (+ sign credit)
    const s2 = parseIranianBankSms('9830009417', 'بانک ملی ایران\nانتقال پایا\nمبلغ:+۱۲,۸۹۹,۷۱۰ ریال\nمانده:۵۰,۰۰۰,۰۰۰');
    eq(s2.kind, 'deposit');
    eq(s2.amountRial, 12899710);

    // BluBank (Toman -> Rial conversion!)
    const s3 = parseIranianBankSms('BluBank', 'بلوبانک؛ واریز به حساب شما به مبلغ ۵۸۹٬۹۳۵ تومان انجام شد. موجودی: ۱٬۲۰۰٬۰۰۰ تومان');
    eq(s3.kind, 'deposit');
    eq(s3.amountRial, 5899350);

    // Bank Mellat (Bestankar)
    const s4 = parseIranianBankSms('9830003303', 'بانک ملت\nحساب123456\nبستانکار:24,899,120ريال\nمانده:80,000,000ريال');
    eq(s4.kind, 'deposit');
    eq(s4.amountRial, 24899120);
  });

  await test('strictly blocks OTP / dynamic password SMS and debit/withdrawal SMS', () => {
    const otp = parseIranianBankSms('9820000', 'بانک سامان\nخرید اینترنتی مبلغ: 5,899,420 ریال\nرمز پویا: 849201');
    eq(otp.kind, 'otp_ignored');
    eq(otp.isDeposit, false);
    eq(otp.amountRial, 0);
    ok(otp.sanitizedText.includes('سانسور') && !otp.sanitizedText.includes('849201'), 'OTP code must be redacted');

    const debit = parseIranianBankSms('9820000', 'بانک سامان\nبرداشت از حساب مبلغ: 5,899,420 ریال\nمانده: 12,000,000 ریال');
    eq(debit.kind, 'withdrawal');
  });

  /* ---------------- 3. Unique Amount, Cooldown, Device SMS & API v2 ---------------- */
  await test('allocates unique non-colliding IRR amounts, matches Android SMS, delivers grant, and fires signed webhook', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('schema.sql', 'utf8'));
    const env: any = { DB: makeD1(sqlite), SITE_URL: 'https://omidadli.site' };
    await ensurePaymentTables(env);

    const callHttp = (req: Request, isAdmin = false) =>
      handlePaymentRequest({
        request: req,
        env,
        isAdmin: async () => isAdmin,
        getCurrentUser: async () => null,
      });

    // Admin adds destination Shetab card, Android device, and Merchant API v2 key
    const cardRes = await callHttp(
      new Request('https://omidadli.site/api/payment/admin/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber: '6219861034529007', holderName: 'امید عدلی' }),
      }),
      true
    );
    eq(cardRes.status, 200);

    const devRes = await callHttp(
      new Request('https://omidadli.site/api/payment/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Admin S23', deviceSerial: 'SN-01' }),
      }),
      true
    );
    const devJson: any = await devRes.json();
    ok(devJson.ok && devJson.deviceToken);

    const keyRes = await callHttp(
      new Request('https://omidadli.site/api/payment/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'External Shop' }),
      }),
      true
    );
    const keyJson: any = await keyRes.json();
    ok(keyJson.ok && keyJson.apiKey);

    // Create 5 concurrent invoices with the exact same base price (5,900,000 IRR)
    const payables = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const c = await createGatewayPayment(env, {
        source: 'website',
        orderId: `ord_unique_${i}`,
        amountRial: 5900000,
        productId: 'business-therapist',
        planId: 'starter',
        phone: '09121112233',
      });
      if ('error' in c) throw new Error(c.error.message);
      ok(c.data.payable_amount < 5900000 && c.data.payable_amount >= 5890000, 'buyer-favorable deduction');
      eq(c.data.payable_amount % 10, 0, 'exact integer Toman');
      ok(!payables.has(c.data.payable_amount), 'no collision across active orders');
      payables.add(c.data.payable_amount);
    }

    // Create an external API v2 payment with webhook
    let webhookHeaders: Record<string, string> = {};
    let webhookRawBody = '';
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url) === 'https://merchant.example/webhook') {
        webhookHeaders = init?.headers || {};
        webhookRawBody = String(init?.body || '');
        return new Response('ok', { status: 200 });
      }
      return origFetch(url, init);
    }) as any;

    try {
      const createRes = await callHttp(
        new Request('https://omidadli.site/api/payment/v2/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyJson.apiKey}`,
          },
          body: JSON.stringify({
            amount: 5900000,
            order_id: 'ext_1001',
            callback_url: 'https://merchant.example/webhook',
            description: 'اشتراک تست',
            metadata: { product_id: 'business-therapist', plan_id: 'starter', phone: '09123334455' },
          }),
        })
      );
      eq(createRes.status, 201);
      const createJson: any = await createRes.json();
      ok(createJson.ok);
      const paymentId = createJson.data.payment_id;
      const exactPayable = createJson.data.payable_amount;
      ok(!payables.has(exactPayable), '6th concurrent order also gets distinct payable_amount');

      // Conflict check: reusing order_id with different amount returns 409 ORDER_ID_CONFLICT
      const conflictRes = await callHttp(
        new Request('https://omidadli.site/api/payment/v2/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyJson.apiKey}` },
          body: JSON.stringify({
            amount: 7500000,
            order_id: 'ext_1001',
            callback_url: 'https://merchant.example/webhook',
          }),
        })
      );
      eq(conflictRes.status, 409);

      // Android Uploader Ping
      const pingRes = await callHttp(
        new Request('https://omidadli.site/api/payment/device/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devJson.deviceToken}` },
          body: JSON.stringify({ batteryLevel: 88, deviceModel: 'Samsung S23', appVersion: '1.0.0' }),
        })
      );
      eq(pingRes.status, 200);

      // Android Uploader uploads incoming Bank SMS with exact payable amount!
      const smsBody = `بانک سامان\nواریز به حساب\nمبلغ: ${exactPayable.toLocaleString('en-US')} ریال\nمانده: 99,000,000 ریال`;
      const smsRes = await callHttp(
        new Request('https://omidadli.site/api/payment/device/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devJson.deviceToken}` },
          body: JSON.stringify({ sender: '9820000', body: smsBody }),
        })
      );
      const smsJson: any = await smsRes.json();
      eq(smsJson.ok, true);
      eq(smsJson.matched, true);
      eq(smsJson.matchedPaymentId, paymentId);

      // Duplicate SMS upload must be ignored idempotently
      const dupRes = await callHttp(
        new Request('https://omidadli.site/api/payment/device/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devJson.deviceToken}` },
          body: JSON.stringify({ sender: '9820000', body: smsBody }),
        })
      );
      const dupJson: any = await dupRes.json();
      eq(dupJson.status, 'duplicate');

      // Verify HMAC signature sent to merchant webhook
      ok(webhookRawBody.length > 0, 'webhook must have been called');
      const sigHeader = webhookHeaders['X-Payexa-Signature'] || '';
      const validSig = await verifyPayexaSignature(keyJson.apiKey, webhookRawBody, sigHeader);
      eq(validSig, true, 'HMAC-SHA256 webhook signature verified');

      // Atomic /verify endpoint: first call => first_verification: true, second call => false!
      const ver1 = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${paymentId}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyJson.apiKey}` },
          body: JSON.stringify({ amount: 5900000 }),
        })
      );
      const ver1Json: any = await ver1.json();
      eq(ver1Json.ok, true);
      eq(ver1Json.data.first_verification, true);

      const ver2 = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${paymentId}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyJson.apiKey}` },
          body: JSON.stringify({ amount: 5900000 }),
        })
      );
      const ver2Json: any = await ver2.json();
      eq(ver2Json.ok, true);
      eq(ver2Json.data.first_verification, false, 'replay protection on verify');

      // Check tool_access was automatically granted for phone 09123334455
      const grant = sqlite
        .prepare(`SELECT code, status FROM tool_access WHERE phone = ? AND product_id = ?`)
        .get('09123334455', 'business-therapist') as any;
      ok(grant && grant.status === 'active' && grant.code.length >= 6, 'tool_access automatically granted');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  /* ---------------- 4. Auth Audit Fixes: Spoof Protection & Website <-> Bot Link ---------------- */
  await test('prevents Telegram contact spoofing and securely links website phone via verify_<token>', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('schema.sql', 'utf8'));
    const env: any = {
      DB: makeD1(sqlite),
      TELEGRAM_BOT_TOKEN: 'TEST',
      SITE_URL: 'https://omidadli.site',
    };
    await ensurePaymentTables(env);

    // Seed two website accounts:
    // 1. An attacker who typed victim's phone 09129998877 without owning it
    sqlite
      .prepare(
        `INSERT INTO users (id, full_name, email, phone, login_id, login_type, password_hash, password_salt, created_at)
         VALUES ('u_attacker', 'Attacker', 'att@x.com', '09129998877', 'att@x.com', 'email', 'h', 's', '2026-10-28T00:00:00.000Z')`
      )
      .run();
    // 2. Legitimate customer with pre-existing tool_access grant
    sqlite
      .prepare(
        `INSERT INTO users (id, full_name, email, phone, login_id, login_type, password_hash, password_salt, created_at)
         VALUES ('u_real', 'Real User', 'real@x.com', '09127776655', 'real@x.com', 'email', 'h', 's', '2026-10-28T00:00:00.000Z')`
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tool_access (id, phone, product_id, code, status, created_at, expires_at)
         VALUES ('ta_pre', '09127776655', 'growth-path', 'GP-9999', 'active', '2026-10-28T00:00:00.000Z', '2027-01-01T00:00:00.000Z')`
      )
      .run();

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })) as any;

    try {
      // A) Spoofed contact (contact.user_id missing or belonging to another user) MUST be rejected!
      await handleBotUpdate(env, {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 5001, first_name: 'Spoofer' },
          chat: { id: 5001, type: 'private' },
          contact: { phone_number: '+989129998877' }, // missing user_id!
        },
      });
      const spoofed = sqlite.prepare(`SELECT verified_at FROM bot_users WHERE tg_user_id = '5001'`).get() as any;
      ok(!spoofed?.verified_at, 'contact without matching user_id must NEVER verify');

      // B) Real owner of 09129998877 verifies in Telegram WITHOUT a website verify_<token>:
      //    Attacker's website account u_attacker MUST NOT become phone_verified_at!
      await handleBotUpdate(env, {
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 6001, first_name: 'Victim' },
          chat: { id: 6001, type: 'private' },
          contact: { phone_number: '+989129998877', user_id: 6001 },
        },
      });
      const attRow = sqlite.prepare(`SELECT phone_verified_at FROM users WHERE id = 'u_attacker'`).get() as any;
      eq(attRow.phone_verified_at || '', '', 'unlinked website account must not be verified by stranger bot usage');

      // C) Real user u_real initiates website verification -> /start verify_<token> -> shares own contact!
      const vTok = await createPhoneVerificationToken(env, 'u_real', '09127776655');
      await handleBotUpdate(env, {
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: 7001, first_name: 'Real', username: 'realuser' },
          chat: { id: 7001, type: 'private' },
          text: `/start verify_${vTok.token}`,
        },
      });
      await handleBotUpdate(env, {
        update_id: 4,
        message: {
          message_id: 4,
          from: { id: 7001, first_name: 'Real', username: 'realuser' },
          chat: { id: 7001, type: 'private' },
          contact: { phone_number: '+989127776655', user_id: 7001 },
        },
      });

      const realRow = sqlite
        .prepare(`SELECT phone_verified_at, tg_user_id FROM users WHERE id = 'u_real'`)
        .get() as any;
      ok(realRow.phone_verified_at.length > 0, 'website user phone_verified_at is now verified!');
      eq(realRow.tg_user_id, '7001');

      // Retroactive subscription sync check!
      const syncedSub = sqlite
        .prepare(`SELECT status FROM user_subscriptions WHERE user_id = 'u_real' AND product_id = 'growth-path'`)
        .get() as any;
      eq(syncedSub?.status, 'active', 'existing tool_access grant synced to website user_subscriptions');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // -------------------------------------------------------------------------
  // 8. iPhone X (iOS < 16) Standalone PWA (`/sms-bridge`) & `/api/payment/ios/*`
  // -------------------------------------------------------------------------
  await test('iPhone X (iOS < 16) PWA (/sms-bridge), 6-digit pairing, Apple Shortcuts SMS & Quick-Confirm', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('schema.sql', 'utf8'));
    const env: any = { DB: makeD1(sqlite), SITE_URL: 'https://omidadli.site' };
    await ensurePaymentTables(env);

    const callHttp = (req: Request) =>
      handlePaymentRequest({
        request: req,
        env,
        isAdmin: async () => true,
        getCurrentUser: async () => null,
      });

    // 1) Render /sms-bridge HTML, Manifest, SW, Icon and verify strict iOS 12-15 Safari compatibility!
    const bridgeRes = await callHttp(new Request('https://omidadli.site/sms-bridge'));
    eq(bridgeRes.status, 200);
    const bridgeHtml = await bridgeRes.text();
    ok(bridgeHtml.includes('apple-mobile-web-app-capable'), 'includes iOS standalone meta tag');
    ok(/font-size:\s*16px/.test(bridgeHtml), 'inputs use >=16px to prevent iOS Safari auto-zoom');
    ok(!bridgeHtml.includes('oklch('), 'zero oklch() CSS so iOS < 16.4 renders all colors');
    ok(!bridgeHtml.includes('color-mix('), 'zero color-mix() CSS for iOS < 16.2');
    ok(!bridgeHtml.includes('@layer'), 'zero @layer CSS for iOS < 15.4');
    const styleMatch = bridgeHtml.match(/<style>([\s\S]*?)<\/style>/);
    ok(Boolean(styleMatch), 'contains inline <style>');
    const inlineCss = styleMatch![1];
    ok(!/\bgap\s*:/.test(inlineCss), 'zero CSS Flexbox gap (unsupported in iOS < 14.5)');
    ok(!/\binset\s*:/.test(inlineCss), 'zero CSS inset shorthand (unsupported in iOS < 14.1)');
    // Extract inline <script>, parse it with vm.Script, and verify zero ES2020+/ES2021+ syntax (`?.`, `??`, `.replaceAll(`)
    const scriptMatch = bridgeHtml.match(/<script>([\s\S]*?)<\/script>/);
    ok(Boolean(scriptMatch && scriptMatch[1].length > 500), 'contains inline ES5/ES6 script');
    const inlineJs = scriptMatch![1];
    new vm.Script(inlineJs);
    ok(!inlineJs.includes('?.'), 'zero optional chaining (?.) in inline JS for iOS 12/13.0-13.3');
    ok(!inlineJs.includes('??'), 'zero nullish coalescing (??) in inline JS for iOS 12/13.0-13.3');
    ok(!inlineJs.includes('.replaceAll('), 'zero String.prototype.replaceAll for iOS < 13.4');

    const manifestRes = await callHttp(new Request('https://omidadli.site/sms-bridge/manifest.webmanifest'));
    eq(manifestRes.status, 200);
    const swRes = await callHttp(new Request('https://omidadli.site/sms-bridge/sw.js'));
    eq(swRes.status, 200);
    const iconRes = await callHttp(new Request('https://omidadli.site/sms-bridge/icon.svg'));
    eq(iconRes.status, 200);

    // 2) Add destination card & create iPhone X device -> receives 6-digit pairCode!
    await callHttp(
      new Request('https://omidadli.site/api/payment/admin/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardNumber: '6219861034529007',
          holderName: 'امید عدلی',
          priority: 1,
        }),
      })
    );

    const createDevRes = await callHttp(
      new Request('https://omidadli.site/api/payment/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'iPhone X (iOS 15.8)' }),
      })
    );
    const createDevJson: any = await createDevRes.json();
    eq(createDevJson.ok, true);
    eq(String(createDevJson.pairCode || '').length, 6, 'issues 6-digit pairing code for iOS Home Screen WebClip');

    // Convert pairCode to Persian digits to verify Persian keyboard support on iPhone X!
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const persianCode = String(createDevJson.pairCode).replace(/\d/g, (d) => persianDigits[Number(d)]);

    const pairRes = await callHttp(
      new Request('https://omidadli.site/api/payment/ios/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: persianCode, deviceModel: 'iPhone X (iOS 15)' }),
      })
    );
    eq(pairRes.status, 200);
    const pairJson: any = await pairRes.json();
    eq(pairJson.ok, true);
    eq(pairJson.device_token, createDevJson.deviceToken, 'exchanges 6-digit code for device_token');

    // Single-use check: re-submitting same 6-digit code MUST fail with 401!
    const replayPairRes = await callHttp(
      new Request('https://omidadli.site/api/payment/ios/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: createDevJson.pairCode }),
      })
    );
    eq(replayPairRes.status, 401, '6-digit pairing code is strictly single-use');

    // Also test regenerating a fresh 6-digit pair code (`regen_pair`)
    const regenRes = await callHttp(
      new Request('https://omidadli.site/api/payment/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'regen_pair', id: createDevJson.id }),
      })
    );
    const regenJson: any = await regenRes.json();
    eq(regenJson.ok, true);
    eq(String(regenJson.pairCode || '').length, 6);
    const pairRes2 = await callHttp(
      new Request('https://omidadli.site/api/payment/ios/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: regenJson.pairCode, deviceModel: 'iPhone X (iOS 14.8)' }),
      })
    );
    const pairJson2: any = await pairRes2.json();
    eq(pairJson2.ok, true);
    const activeToken = pairJson2.device_token;

    // 3) Create two pending orders; match #1 via Apple Shortcuts plain-text POST `/api/payment/ios/sms`
    //    and confirm #2 via 1-tap `POST /api/payment/ios/quick-confirm`!
    const ord1 = await createGatewayPayment(env, {
      orderId: 'ios_ord_1',
      amountRial: 3_500_000,
      source: 'website',
      productId: 'business-therapist',
      planId: 'basic',
      phone: '09124445566',
    });
    if ('error' in ord1) throw new Error(ord1.error.message);

    const ord2 = await createGatewayPayment(env, {
      orderId: 'ios_ord_2',
      amountRial: 3_500_000,
      source: 'website',
      productId: 'growth-path',
      planId: 'pro',
      phone: '09124445566',
    });
    if ('error' in ord2) throw new Error(ord2.error.message);

    // Poll from iPhone X WebApp
    const pollRes = await callHttp(
      new Request(`https://omidadli.site/api/payment/ios/poll?token=${encodeURIComponent(activeToken)}`)
    );
    const pollJson: any = await pollRes.json();
    eq(pollJson.ok, true);
    eq(pollJson.pending_orders.length, 2, 'iPhone radar sees both open pending orders');

    // Apple Shortcuts Personal Automation (`Message`) posts raw plain text body (`Shortcut Input`)!
    const rawShortcutSms = `بلوبانک\nواریز به حساب شما\nمبلغ: ${ord1.data.payable_amount.toLocaleString('en-US')} ریال\nموجودی: ۱۲,۵۰۰,۰۰۰ ریال`;
    const iosSmsRes = await callHttp(
      new Request(`https://omidadli.site/api/payment/ios/sms?token=${encodeURIComponent(activeToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: rawShortcutSms,
      })
    );
    const iosSmsJson: any = await iosSmsRes.json();
    eq(iosSmsJson.ok, true);
    eq(iosSmsJson.matched, true, 'Apple Shortcuts plain-text POST automatically matched pending invoice');
    eq(iosSmsJson.matchedPaymentId, ord1.data.payment_id);

    // 1-Tap Quick Confirm on order #2 from iPhone X Home Screen PWA
    const quickRes = await callHttp(
      new Request('https://omidadli.site/api/payment/ios/quick-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ paymentId: ord2.data.payment_id }),
      })
    );
    const quickJson: any = await quickRes.json();
    eq(quickJson.ok, true);
    eq(quickJson.status, 'paid', '1-tap iPhone quick-confirm marks order paid and fulfills subscription');
  });

  // -------------------------------------------------------------------------
  // 9. BluBank Exhaustive SMS Edge Cases & Regression Suite
  // -------------------------------------------------------------------------
  await test('parses all real-world BluBank SMS templates & blocks BluBank withdrawals/OTPs/balance traps', () => {
    // A) Classic BluBank poetic deposit
    const blu1 = parseIranianBankSms(
      '1000621986',
      'بلوبانک\n۵٬۸۹۴٬۳۰۰ ریال به حسابتان نشست.\nموجودی: ۱۲٬۴۵۰٬۰۰۰ ریال\n۱۴۰۵/۰۸/۰۶ ۱۴:۲۵'
    );
    eq(blu1.kind, 'deposit');
    eq(blu1.bankName, 'بلوبانک');
    eq(blu1.amountRial, 5_894_300);

    // B) BluBank "شارژ شد" deposit
    const blu2 = parseIranianBankSms(
      'Blu',
      'بلوبانک\nحسابتان ۵,۸۹۴,۳۰۰ ریال شارژ شد.\nموجودی: ۱۲,۴۵۰,۰۰۰ ریال'
    );
    eq(blu2.kind, 'deposit');
    eq(blu2.amountRial, 5_894_300);

    // C) Regression: unformatted digits right after "واریز به حساب" MUST NOT be eaten!
    const rawAccount = parseIranianBankSms('BANK', 'واریز به حساب 5894300 ریال\nمانده: 19000000 ریال');
    eq(rawAccount.kind, 'deposit');
    eq(rawAccount.amountRial, 5_894_300);

    // D) Regression: single-line SMS where مانده & کارمزد appear BEFORE واریز!
    const singleLine = parseIranianBankSms(
      'Saman',
      'بانک سامان مانده: 50,000,000 ریال کارمزد: 5,000 ریال واریز: 5,894,300 ریال 1405/08/06-14:25:10'
    );
    eq(singleLine.kind, 'deposit');
    eq(singleLine.amountRial, 5_894_300);

    // E) BluBank withdrawal ("از حسابتان پرید") MUST NEVER match as deposit!
    const bluWithdraw = parseIranianBankSms('Blu', 'بلوبانک\n۵,۸۹۴,۳۰۰ ریال از حسابتان پرید!\nموجودی: ۶,۰۰۰,۰۰۰ ریال');
    eq(bluWithdraw.kind, 'withdrawal');
    eq(bluWithdraw.isDeposit, false);

    // F) Mobile SIM top-up ("خرید شارژ") MUST NEVER match "شارژ حساب"!
    const simTopup = parseIranianBankSms('Blu', 'بلوبانک\nخرید شارژ ۵۰۰,۰۰۰ ریال\nموجودی: ۵,۵۰۰,۰۰۰ ریال');
    eq(simTopup.kind, 'withdrawal');
    eq(simTopup.isDeposit, false);

    // G) BluBank login OTP ("کد ورود به بلو") MUST be strictly blocked & sanitized!
    const bluOtp = parseIranianBankSms('Blu', 'بلوبانک\nکد ورود به بلو: ۵۸۲۹۱\nاین کد را در اختیار کسی قرار ندهید.');
    eq(bluOtp.kind, 'otp_ignored');
    ok(!bluOtp.sanitizedText.includes('58291'), 'OTP digits scrubbed');

    // H) Jalali calendar & recipient name normalization checks
    const [gy, gm, gd] = jalaliToGregorian(1405, 8, 6);
    eq(`${gy}-${gm}-${gd}`, '2026-10-28', '1405/08/06 converts accurately to 2026-10-28');
    const tsCands = parseReceiptTimestamps('۱۴۰۵/۰۸/۰۶ - ۱۴:۲۵');
    ok(tsCands.candidatesMs.includes(Date.parse('2026-10-28T14:25:00+03:30')), 'Jalali receipt timestamp parsed in Iran +03:30');
    eq(matchRecipientName('امید عدلی', 'آقای امید عدلی - بلوبانک'), true);
    eq(matchRecipientName('امید عدلی', 'امید رضایی'), false);
  });

  // -------------------------------------------------------------------------
  // 10. 1-Step `/api/payment/ios/setup` Sync + Telegram Admin BluBank Forward + Anti-Hijack Checkout
  // -------------------------------------------------------------------------
  await test('1-step /sms-bridge setup syncs BluBank + Telegram, supports Telegram SMS forward, and prevents checkout hijacking', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('schema.sql', 'utf8'));
    const env: any = {
      DB: makeD1(sqlite),
      SITE_URL: 'https://omidadli.site',
      ADMIN_PASSWORD: 'MySuperSecretAdminPass!',
      AUTH_SECRET: 'test-auth-secret',
    };
    await ensurePaymentTables(env);

    const tgCalls: Array<{ url: string; body: any }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const u = String(typeof input === 'string' ? input : input?.url || input);
      if (u.includes('api.telegram.org')) {
        const b = init?.body ? JSON.parse(String(init.body)) : null;
        tgCalls.push({ url: u, body: b });
        if (u.endsWith('/getMe')) {
          return new Response(JSON.stringify({ ok: true, result: { username: 'omidadli_pay_bot' } }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }
      return origFetch(input, init);
    }) as any;

    try {
      const callHttp = (req: Request, isAdmin = false) =>
        handlePaymentRequest({
          request: req,
          env,
          isAdmin: async () => isAdmin,
          getCurrentUser: async () => null,
        });

      // 1) Wrong admin password -> 401
      const badPassRes = await callHttp(
        new Request('https://omidadli.site/api/payment/ios/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminPassword: 'wrong',
            cardNumber: '6219861934529008',
            holderName: 'امید عدلی',
          }),
        })
      );
      eq(badPassRes.status, 401);

      // 2) Correct 1-step setup -> registers BluBank card + Telegram bot + webhook + returns iPhone device_token!
      const setupRes = await callHttp(
        new Request('https://omidadli.site/api/payment/ios/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminPassword: 'MySuperSecretAdminPass!',
            cardNumber: '6219 8619 3452 9008',
            holderName: 'امید عدلی',
            telegramBotToken: '987654:AAH_TEST_TOKEN',
            telegramAdminId: '777888',
            geminiVisionKey: 'AIzaSyTestVisionKey1234567890',
          }),
        })
      );
      eq(setupRes.status, 200);
      const setupJson: any = await setupRes.json();
      eq(setupJson.ok, true);
      eq(setupJson.card.bank_slug, 'blu', 'auto-detected BluBank card');
      eq(setupJson.telegram.bot_username, 'omidadli_pay_bot', 'fetched bot username via getMe');
      eq(setupJson.telegram.webhook_registered, true, 'auto-registered Telegram webhook');
      eq(setupJson.vision_ready, true, 'receipt AI vision active');
      ok(setupJson.device_token.startsWith('omid_dev_'), 'provisioned iPhone token in 1 step');

      // 3) Buyer A starts website checkout -> receives buyer_secret
      const chkA = await callHttp(
        new Request('https://omidadli.site/api/payment/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: 'business-therapist', planId: 'basic', phone: '09121112222' }),
        })
      );
      eq(chkA.status, 201);
      const chkAJson: any = await chkA.json();
      const secretA = chkAJson.buyer_secret;
      const payIdA = chkAJson.data.payment_id;
      eq(chkAJson.data.card.bank_slug, 'blu', 'website checkout immediately uses synced BluBank card');

      // 4) Stranger tries checkout with same phone WITHOUT secretA -> MUST NOT hijack payIdA or overwrite secretA!
      const chkStranger = await callHttp(
        new Request('https://omidadli.site/api/payment/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: 'business-therapist', planId: 'basic', phone: '09121112222' }),
        })
      );
      const chkStrangerJson: any = await chkStranger.json();
      ok(chkStrangerJson.data.payment_id !== payIdA, 'stranger cannot attach to or hijack Buyer A pending payment');

      // 5) Admin forwards BluBank SMS directly into Telegram Bot chat -> matches payIdA & fulfills!
      await handleBotUpdate(env, {
        update_id: 901,
        message: {
          message_id: 50,
          from: { id: 777888, first_name: 'Omid' },
          chat: { id: 777888, type: 'private' },
          text: `بلوبانک\n${chkAJson.data.payable_amount.toLocaleString('en-US')} ریال به حسابتان نشست.\nموجودی: ۹۵,۰۰۰,۰۰۰ ریال`,
        },
      });

      // Buyer A polls with original secretA -> status is 'paid' AND fulfillment credentials intact!
      const pollBuyerA = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${payIdA}/client`, {
          headers: { 'X-Buyer-Secret': secretA, 'X-Device-Id': 'dev-buyer-a' },
        })
      );
      const pollBuyerAJson: any = await pollBuyerA.json();
      eq(pollBuyerAJson.data.status, 'paid', 'Telegram admin BluBank SMS forward paid the invoice');
      ok(Boolean(pollBuyerAJson.data.fulfillment?.access_code), 'Buyer A original buyer_secret still unlocks access_code');
      ok(Boolean(pollBuyerAJson.data.fulfillment?.tool_token), 'Buyer A receives signed tool session token');

      // Stranger polling payIdA with stranger's secret MUST NOT see fulfillment!
      const pollStranger = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${payIdA}/client`, {
          headers: { 'X-Buyer-Secret': chkStrangerJson.buyer_secret, 'X-Device-Id': 'dev-stranger' },
        })
      );
      const pollStrangerJson: any = await pollStranger.json();
      eq(pollStrangerJson.data.fulfillment, null, 'stranger cannot steal Buyer A access_code');

      // 6) Buyer A wants to RENEW same product/plan right after paying -> MUST succeed (201), NOT 409!
      const chkRenew = await callHttp(
        new Request('https://omidadli.site/api/payment/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: 'business-therapist', planId: 'basic', phone: '09121112222' }),
        })
      );
      eq(chkRenew.status, 201, 'repeat purchase / renewal succeeds without ORDER_ID_CONFLICT');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // -------------------------------------------------------------------------
  // 11. Forensic Customer Receipt Validator (Auto-Approve Valid vs Flag Suspicious)
  // -------------------------------------------------------------------------
  await test('forensic receipt validator auto-approves genuine Jalali/BluBank receipts and flags every suspicious/fake receipt', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('schema.sql', 'utf8'));
    const env: any = {
      DB: makeD1(sqlite),
      SITE_URL: 'https://omidadli.site',
      ADMIN_PASSWORD: 'pass',
      TELEGRAM_RECEIPT_GEMINI_API_KEY: 'gk-forensic',
    };
    await ensurePaymentTables(env);

    let mockVisionJson: any = {};
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const u = String(typeof input === 'string' ? input : input?.url || input);
      if (u.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(mockVisionJson) }] } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (u.includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }
      return origFetch(input, init);
    }) as any;

    try {
      const callHttp = (req: Request) =>
        handlePaymentRequest({
          request: req,
          env,
          isAdmin: async () => false,
          verifyAdminPassword: async (pw) => pw === 'pass',
          getCurrentUser: async () => null,
        });

      // Setup BluBank card (6219-8619-3452-9008 -> last4 = "9008")
      const setupRes = await callHttp(
        new Request('https://omidadli.site/api/payment/ios/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminPassword: 'pass',
            cardNumber: '6219861934529008',
            holderName: 'امید عدلی',
          }),
        })
      );
      const { device_token: iosTok } = (await setupRes.json()) as any;

      // Create Order #1 (suppose SMS failed AND buyer rounded to base plan amount!)
      const o1 = await createGatewayPayment(env, {
        orderId: 'rcpt_valid_1',
        amountRial: 5_900_000,
        source: 'website',
        productId: 'business-therapist',
        planId: 'basic',
        phone: '09125556677',
      });
      if ('error' in o1) throw new Error(o1.error.message);

      // Compute current Jalali-equivalent or current Tehran ISO timestamp so test works on any date
      const nowIran = new Date(Date.now() + 3.5 * 3600_000).toISOString().slice(0, 19); // naive Tehran time (no Z!)
      mockVisionJson = {
        looksLikeReceipt: true,
        transferStatus: 'success',
        tamperingSuspected: false,
        ref: '884422119900',
        amount: '۵٬۹۰۰٬۰۰۰ ریال', // Rounded base price in Rial!
        date: nowIran, // Timezone-naive Tehran clock time!
        bank: 'بلوبانک',
        recipientName: 'آقای امید عدلی - بلوبانک', // Real bank honorific + suffix!
        cardLast4: '9008',
      };

      const validRcptRes = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${o1.data.payment_id}/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' }),
        })
      );
      eq(validRcptRes.status, 200);
      const validRcptJson: any = await validRcptRes.json();
      eq(validRcptJson.data.status, 'paid', 'valid genuine receipt is IMMEDIATELY auto-approved');
      eq(validRcptJson.data.auto_approved, true);

      // Verify grant was issued!
      const grantRow = sqlite
        .prepare(`SELECT code, status FROM tool_access WHERE phone = '09125556677' AND product_id = 'business-therapist'`)
        .get() as any;
      eq(grantRow?.status, 'active', 'auto-approved receipt issued active subscription');

      // Replay Attack: reusing ref '884422119900' on Order #2 MUST be rejected (409)!
      const o2 = await createGatewayPayment(env, {
        orderId: 'rcpt_replay_2',
        amountRial: 5_900_000,
        source: 'website',
        productId: 'growth-path',
        planId: 'basic',
        phone: '09125556677',
      });
      if ('error' in o2) throw new Error(o2.error.message);

      const replayRes = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${o2.data.payment_id}/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: 'iVBORw0KGgoAAAA==' }),
        })
      );
      eq(replayRes.status, 409, 'reused bank reference rejected with 409 DUPLICATE_RECEIPT');

      // Fraud Vector A: Pre-payment confirmation preview screen ("پیش‌نمایش قبل از انتقال") -> needs_review!
      mockVisionJson = {
        looksLikeReceipt: true,
        transferStatus: 'preview_unpaid',
        tamperingSuspected: false,
        ref: '776655443322',
        amount: o2.data.payable_amount,
        date: nowIran,
        recipientName: 'امید عدلی',
        cardLast4: '9008',
      };
      const previewFraudRes = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${o2.data.payment_id}/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: 'iVBORw0KGgoAAAA==' }),
        })
      );
      const previewFraudJson: any = await previewFraudRes.json();
      eq(previewFraudJson.data.status, 'needs_review', 'unpaid preview screenshot flagged for review');
      ok(previewFraudJson.data.reasons.includes('unpaid_preview_screen'));

      // Fraud Vector B: Wrong destination card last-4 ("1234" != "9008") -> needs_review!
      const o3 = await createGatewayPayment(env, {
        orderId: 'rcpt_wrongcard_3',
        amountRial: 5_900_000,
        source: 'website',
        productId: 'problem-solver',
        planId: 'basic',
        phone: '09125556677',
      });
      if ('error' in o3) throw new Error(o3.error.message);

      mockVisionJson = {
        looksLikeReceipt: true,
        transferStatus: 'success',
        tamperingSuspected: false,
        ref: '554433221100',
        amount: o3.data.payable_amount,
        date: nowIran,
        recipientName: 'امید عدلی',
        cardLast4: '1234', // Mismatched card!
      };
      const wrongCardRes = await callHttp(
        new Request(`https://omidadli.site/api/payment/v2/payments/${o3.data.payment_id}/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: 'iVBORw0KGgoAAAA==' }),
        })
      );
      const wrongCardJson: any = await wrongCardRes.json();
      eq(wrongCardJson.data.status, 'needs_review', 'mismatched card last-4 flagged as suspicious');
      ok(wrongCardJson.data.reasons.includes('card_last4_mismatch'));

      // Check iPhone `/sms-bridge` poll sees both suspicious receipts in `review_orders`, can view image & reject!
      const pollIos = await callHttp(
        new Request(`https://omidadli.site/api/payment/ios/poll?token=${encodeURIComponent(iosTok)}`)
      );
      const pollIosJson: any = await pollIos.json();
      eq(pollIosJson.review_orders.length, 2, 'suspicious receipts surfaced live in /sms-bridge');

      const imgRes = await callHttp(
        new Request(
          `https://omidadli.site/api/payment/ios/receipt-image?token=${encodeURIComponent(iosTok)}&payment_id=${o3.data.payment_id}`
        )
      );
      const imgJson: any = await imgRes.json();
      ok(String(imgJson.data_uri || '').startsWith('data:image/png;base64,'), 'serves PNG receipt preview to iPhone');

      const rejectRes = await callHttp(
        new Request('https://omidadli.site/api/payment/ios/review-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device-Token': iosTok },
          body: JSON.stringify({ paymentId: o3.data.payment_id, op: 'reject' }),
        })
      );
      const rejectJson: any = await rejectRes.json();
      eq(rejectJson.status, 'rejected', 'admin rejected suspicious receipt directly from iPhone /sms-bridge');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  console.log(`\n${fail === 0 ? '✅' : '❌'} payment-gateway: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
