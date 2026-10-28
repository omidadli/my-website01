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

  console.log(`\n${fail === 0 ? '✅' : '❌'} payment-gateway: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
