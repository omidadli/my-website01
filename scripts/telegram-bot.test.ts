/**
 * Tests for the Telegram bot's pure logic: receipt parsing, the auto-approval
 * decision engine and renewal math. Run via `npm test`.
 */
import {
  parsePaymentDetails,
  amountMatches,
  decideReceipt,
  applyAutoApprovePolicy,
  parseVisionResponse,
} from '../lib/telegram/receipt';
import { priceToToman, botPlans, botPlan, botProducts, faDigits } from '../lib/telegram/pricing';
import { nextExpiry } from '../lib/telegram/grant';

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (e: any) {
    fail++;
    console.error(`✗ ${name}\n   ${e?.message || e}`);
  }
};
const eq = (a: unknown, b: unknown) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`expected ${sb}, got ${sa}`);
};
const ok = (v: unknown, msg = 'expected truthy') => {
  if (!v) throw new Error(msg);
};

/* ------------------------------- pricing ------------------------------- */

t('price labels parse to Toman', () => {
  eq(priceToToman('۵۹۰٬۰۰۰ تومان'), 590000);
  eq(priceToToman('۱٬۲۹۰٬۰۰۰ تومان'), 1290000);
  eq(priceToToman('2,490,000 Toman'), 2490000);
  eq(priceToToman(''), 0);
});

t('every plan has a positive numeric price', () => {
  for (const p of botProducts()) {
    const plans = botPlans(p.id);
    ok(plans.length === 3, `${p.id} should have 3 plans`);
    for (const plan of plans) ok(plan.amountToman > 0, `${p.id}/${plan.id} unpriced`);
    ok(botPlan(p.id, 'pro')?.popular === true, `${p.id} pro should be anchored`);
  }
});

/* --------------------------- receipt parsing --------------------------- */

t('parses labelled payment reference and amount (Persian digits)', () => {
  const d = parsePaymentDetails('مبلغ ۵۹۰۰۰۰ تومان — شماره پیگیری: ۱۲۳۴۵۶۷۸۹۰');
  eq(d.ref, '1234567890');
  ok(d.amounts.includes(590000));
});

t('parses a reference split by spaces', () => {
  const d = parsePaymentDetails('پیگیری 1234 5678 9012 مبلغ 1290000');
  eq(d.ref, '123456789012');
  eq(d.amounts.includes(1290000), true);
});

t('amount matches in Toman or Rial', () => {
  ok(amountMatches(590000, 590000));
  ok(amountMatches(5900000, 590000)); // receipt printed in Rial
  ok(!amountMatches(400000, 590000));
});

/* -------------------------- decision engine -------------------------- */

const base = {
  orderToman: 590000,
  expectedAmountToman: 590000,
  orderCreatedAtMs: Date.parse('2026-10-01T10:00:00Z'),
  nowMs: Date.parse('2026-10-01T12:00:00Z'),
};

t('auto-approves when vision reads a matching receipt', () => {
  const d = decideReceipt({
    ...base,
    textRef: '1234567890',
    expectedRecipientName: 'امید عدلی',
    vision: { ok: true, ref: '1234567890', amount: 5900000, date: '2026-10-01', recipientName: 'امید عدلی', looksLikeReceipt: true },
  });
  eq(d.status, 'auto_approved');
  ok(d.confidence >= 0.85);
});

t('rejects a reused payment reference', () => {
  const d = decideReceipt({ ...base, textRef: '1234567890', textAmount: 590000, refTaken: true });
  eq(d.status, 'rejected');
  ok(d.reasons.includes('duplicate_ref'));
});

t('never auto-approves a wrong amount', () => {
  const d = decideReceipt({
    ...base,
    textRef: '1234567890',
    textAmount: 100000,
    vision: { ok: true, ref: '1234567890', amount: 100000, looksLikeReceipt: true },
  });
  eq(d.status, 'needs_review');
  ok(d.reasons.includes('amount_mismatch'));
});

t('receipt without OCR date and beneficiary waits for review', () => {
  const d = decideReceipt({ ...base, expectedRecipientName: 'امید عدلی', textRef: '1234567890', textAmount: 590000 });
  eq(d.status, 'needs_review');
  ok(d.reasons.includes('date_missing'));
  ok(d.reasons.includes('recipient_name_missing'));
});

t("policy 'always' cannot bypass missing receipt date and beneficiary", () => {
  const d = decideReceipt({ ...base, expectedRecipientName: 'امید عدلی', textRef: '1234567890', textAmount: 590000 });
  eq(applyAutoApprovePolicy(d, 'always').status, 'needs_review');
  eq(applyAutoApprovePolicy(d, 'vision').status, 'needs_review');
});

t("policy 'off' forces manual review even with a good photo", () => {
  const d = decideReceipt({
    ...base,
    textRef: '1234567890',
    expectedRecipientName: 'امید عدلی',
    vision: { ok: true, ref: '1234567890', amount: 590000, date: '2026-10-01', recipientName: 'امید عدلی', looksLikeReceipt: true },
  });
  eq(applyAutoApprovePolicy(d, 'off').status, 'needs_review');
});

t('flags an out-of-window receipt date', () => {
  const d = decideReceipt({
    ...base,
    textRef: '1234567890',
    expectedRecipientName: 'امید عدلی',
    vision: { ok: true, ref: '1234567890', amount: 590000, date: '2025-01-01', recipientName: 'امید عدلی', looksLikeReceipt: true },
  });
  eq(d.status, 'needs_review');
  ok(d.reasons.includes('date_out_of_range'));
});

t('flags a non-receipt photo', () => {
  const d = decideReceipt({ ...base, textRef: '1234567890', vision: { ok: true, looksLikeReceipt: false } });
  eq(d.status, 'needs_review');
  ok(d.reasons.includes('not_a_receipt'));
});

t('vision JSON parser tolerates code fences and prose', () => {
  const v = parseVisionResponse('نتیجه:\n```json\n{"looksLikeReceipt":true,"ref":"۱۲۳۴۵۶۷۸۹۰","amount":5900000,"date":"2026-10-01"}\n```');
  ok(v.ok);
  eq(v.ref, '1234567890');
  eq(v.amount, 5900000);
  eq(parseVisionResponse('no json here').ok, false);
});

/* ---------------------------- renewal math ---------------------------- */

t('renewal extends a still-active grant instead of resetting it', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const active = new Date(now + 10 * 86400_000).toISOString();
  const next = Date.parse(nextExpiry(active, now, 30));
  eq(Math.round((next - now) / 86400_000), 40);
});

t('renewal of an expired grant starts from now', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const expired = new Date(now - 5 * 86400_000).toISOString();
  const next = Date.parse(nextExpiry(expired, now, 30));
  eq(Math.round((next - now) / 86400_000), 30);
});

t('faDigits converts both Persian and Arabic numerals', () => {
  eq(faDigits('۰۹۱۲'), '0912');
  eq(faDigits('٠٩١٢'), '0912');
});

console.log(`\n${fail === 0 ? '✅' : '❌'} telegram-bot: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
