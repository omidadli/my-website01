/**
 * lib/telegram/receipt.ts — automatic card-to-card receipt verification.
 *
 * The buyer pays by card transfer and sends the receipt photo to the bot. This
 * module decides — WITHOUT human review when possible — whether the receipt is
 * consistent with the order:
 *
 *   1. «شماره پیگیری» (reference) is present, well-formed and NEVER used before
 *   2. the amount matches the plan price (Toman or Rial ×10 — Iranian receipts
 *      usually print Rial)
 *   3. the photo itself looks like a bank receipt and its printed amount /
 *      reference / date agree with the order (optional AI vision pass)
 *
 * Everything decision-related is pure (`decideReceipt`) so it is unit-testable;
 * the vision call is injectable and skipped entirely when no key is configured.
 */

export interface PaymentDetails {
  /** candidate reference (شماره پیگیری), digits only */
  ref: string;
  /** candidate amount in Toman (as printed/typed) */
  amount: number;
  /** raw digit runs seen in the text (debug/admin display) */
  refs: string[];
  amounts: number[];
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export const faDigits = (s: string): string =>
  String(s || '').replace(/[۰-۹٠-٩]/g, (d) => {
    const i = PERSIAN_DIGITS.indexOf(d);
    return String(i >= 0 ? i : Math.max(0, ARABIC_DIGITS.indexOf(d)));
  });

/**
 * Extract payment clues from free text (caption under the receipt photo, or a
 * follow-up message like «مبلغ ۵۹۰۰۰۰ — پیگیری 1234567890»).
 *
 * Heuristics, in order:
 *   - a labelled reference wins («شماره پیگیری: …», «ref:», «rrn:»)
 *   - a labelled/currency-adjacent number becomes the amount
 *   - long digit runs (≥10) or space-separated runs are references
 *   - short runs (3–9 digits) are amount candidates
 */
export const parsePaymentDetails = (raw: string): PaymentDetails => {
  const text = faDigits(String(raw || ''));

  const labelledRefMatch = text.match(/(?:شماره\s*پیگیری|پیگیری|پيگيري|rrn|ref(?:erence)?)\s*[:：]?\s*((?:\d[\s-]?){6,32})/i);
  const labelledRef = labelledRefMatch ? labelledRefMatch[1].replace(/\D/g, '') : '';

  // «مبلغ 590000», «amount: 590,000», «590000 تومان»
  const amountLabels = [
    /(?:مبلغ(?:\s*کل)?|amount|paid)\s*[:：]?\s*([\d][\d\s,٬،]{2,20})/i,
    /([\d][\d\s,٬،]{2,20})\s*(?:تومان|تومن|ریال|ريال|toman|rial)/i,
  ];
  const labelledAmounts: number[] = [];
  for (const re of amountLabels) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1].replace(/\D/g, ''));
      if (Number.isFinite(n) && n > 0) labelledAmounts.push(n);
    }
  }

  // space-separated digit runs = one reference (e.g. «1234 5678 9012»)
  const spacedRuns: string[] = [];
  const spacedRe = /\d{2,4}(?:\s\d{2,4}){1,6}/g;
  let sm: RegExpExecArray | null;
  while ((sm = spacedRe.exec(text))) {
    const joined = sm[0].replace(/\D/g, '');
    if (joined.length >= 8) spacedRuns.push(joined);
  }
  const spacedDigits = new Set(spacedRuns.flatMap((r) => r.match(/\d{2,4}/g) || []));

  const tokens = text.split(/[\s ,٬،؛;.\-–—|/\\()[\]{}<>«»"'`~!@#$%^&*+=?؟:]+/);
  const refs: string[] = [];
  const amounts: number[] = [...labelledAmounts];

  for (const token of tokens) {
    const digits = token.replace(/\D/g, '');
    if (!digits) continue;
    if (spacedDigits.has(token.trim())) continue; // already part of a spaced reference
    if (digits === labelledRef) continue;
    if (digits.length >= 10 && digits.length <= 32) refs.push(digits);
    else if (digits.length >= 3 && digits.length <= 9 && !labelledAmounts.includes(Number(digits))) amounts.push(Number(digits));
  }
  refs.push(...spacedRuns);

  const uniqueRefs = [...new Set(refs.map((r) => r.replace(/^0+/, '') || r))];
  const ref = labelledRef || uniqueRefs[0] || '';

  // The amount closest to a labelled amount wins; otherwise keep them all for
  // decideReceipt to match against the order price (Toman or Rial).
  const uniqueAmounts = [...new Set(amounts.filter((n) => n > 0))];
  const preferred = labelledAmounts[0] || uniqueAmounts[0] || 0;
  return { ref, amount: preferred, refs: uniqueRefs, amounts: uniqueAmounts };
};

/** Amount printed on a receipt matches the order in Toman or Rial (×10). */
export const amountMatches = (printed: number, orderToman: number): boolean => {
  if (!printed || !orderToman) return false;
  return printed === orderToman || printed === orderToman * 10 || printed * 10 === orderToman;
};

export interface VisionReading {
  ok: boolean;
  ref?: string;
  amount?: number;
  /** ISO or Persian date string as printed */
  date?: string;
  bank?: string;
  looksLikeReceipt?: boolean;
  error?: string;
}

export interface ReceiptEvidence {
  /** reference typed by the user / found in the caption */
  textRef?: string;
  /** amount typed by the user / found in the caption (Toman) */
  textAmount?: number;
  /** parsed receipt photo (AI vision) */
  vision?: VisionReading | null;
  /** true when some OTHER order already used this reference */
  refTaken?: boolean;
  /** order amount in Toman */
  orderToman: number;
  /** when the order was created (ms) — for the date-window check */
  orderCreatedAtMs: number;
  nowMs?: number;
}

export type ReceiptDecisionStatus = 'auto_approved' | 'needs_review' | 'rejected';

export interface ReceiptDecision {
  status: ReceiptDecisionStatus;
  /** the reference to store (best candidate) */
  ref: string;
  /** 0..1 — shown to the admin on manual review */
  confidence: number;
  /** machine-readable reasons (for tests + admin display) */
  reasons: string[];
  /** short Persian summary for the customer/admin */
  summary: string;
}

/**
 * Pure decision core. Policy:
 *  - duplicate reference  → rejected (same receipt can't pay twice)
 *  - amount clearly wrong → needs_review (never auto-approve)
 *  - otherwise, auto-approve only when enough consistent evidence exists:
 *      * vision confirms a receipt with matching amount/ref, OR
 *      * `allowTextOnly` and the typed ref+amount check out
 */
export const decideReceipt = (e: ReceiptEvidence): ReceiptDecision => {
  const now = e.nowMs ?? Date.now();
  const reasons: string[] = [];
  const vision = e.vision || null;

  const refCandidates = [e.textRef, vision?.ref].filter((x): x is string => !!x && /^\d{6,30}$/.test(x));
  const uniqueRefs = [...new Set(refCandidates)];
  const ref = uniqueRefs[0] || '';

  if (e.refTaken) {
    return {
      status: 'rejected',
      ref,
      confidence: 1,
      reasons: ['duplicate_ref'],
      summary: 'این شماره پیگیری قبلاً برای رسید دیگری استفاده شده است. اگر پرداخت جدیدی انجام داده‌اید، رسید همان را بفرستید.',
    };
  }

  if (!ref) reasons.push('ref_missing');
  if (uniqueRefs.length > 1) reasons.push('ref_mismatch');

  // ---- amount checks ----
  const amounts = [e.textAmount, vision?.amount].filter((x): x is number => typeof x === 'number' && x > 0);
  const amountOk = amounts.some((a) => amountMatches(a, e.orderToman));
  const amountBad = amounts.length > 0 && !amountOk;
  if (amountBad) reasons.push('amount_mismatch');
  else if (!amounts.length) reasons.push('amount_missing');
  if (amountOk) reasons.push('amount_ok');

  // ---- date window: [order creation - 2h, now + 2 days] ----
  let dateOk = true;
  if (vision?.date) {
    const t = Date.parse(vision.date);
    if (Number.isFinite(t)) {
      // Date-only receipts (no clock time) parse to midnight, so allow the whole
      // day of the order; timestamps get a tighter 2-hour grace period.
      const hasTime = /\d{1,2}:\d{2}/.test(String(vision.date));
      const grace = hasTime ? 2 * 3600_000 : 36 * 3600_000;
      dateOk = t >= e.orderCreatedAtMs - grace && t <= now + 2 * 86400_000;
      if (!dateOk) reasons.push('date_out_of_range');
    }
  }

  // ---- vision sanity ----
  if (vision && !vision.ok) reasons.push('vision_failed');
  if (vision?.ok && vision.looksLikeReceipt === false) reasons.push('not_a_receipt');

  const visionConfirms = !!(vision?.ok && vision.looksLikeReceipt !== false && (amountOk || !vision.amount));
  const textOnlyOk = !!(ref && amountOk && uniqueRefs.length <= 1 && dateOk);

  let status: ReceiptDecisionStatus = 'needs_review';
  let confidence = 0.2;

  if (textOnlyOk && visionConfirms) {
    // The photo itself was read and agrees with the order — strongest evidence.
    status = 'auto_approved';
    confidence = vision && vision.ref === ref ? 0.95 : 0.9;
    reasons.push('auto_vision');
  } else if (textOnlyOk && !vision?.ok) {
    // No vision available/readable — policy (`applyAutoApprovePolicy`) may
    // upgrade this to auto_approved when the admin accepts text-only receipts.
    confidence = 0.55;
    reasons.push('text_only');
  } else if (textOnlyOk) {
    confidence = 0.65;
    reasons.push('text_ok_vision_weak');
  }

  if (status === 'needs_review') {
    if (reasons.includes('ref_missing') && reasons.includes('amount_missing')) confidence = 0.15;
    else if (reasons.includes('amount_mismatch') || reasons.includes('ref_mismatch')) confidence = 0.3;
    else if (reasons.includes('ref_missing')) confidence = 0.35;
    else if (reasons.includes('amount_missing')) confidence = 0.4;
  }

  const summary = status === 'auto_approved' ? 'رسید تأیید شد ✅' : 'رسید نیاز به بررسی دستی دارد ⏳';

  return { status, ref, confidence, reasons, summary };
};

/**
 * Policy gate for text-only receipts: `allowTextOnly` upgrades a confident
 * `needs_review` to `auto_approved` (the admin wants hands-off processing even
 * without AI vision).
 */
export const applyAutoApprovePolicy = (d: ReceiptDecision, policy: 'vision' | 'always' | 'off'): ReceiptDecision => {
  if (policy === 'off') return d.status === 'rejected' ? d : { ...d, status: 'needs_review', reasons: [...d.reasons, 'policy_off'] };
  if (d.status !== 'needs_review') return d;
  if (policy === 'always' && d.reasons.includes('text_only') && d.confidence >= 0.55) {
    return { ...d, status: 'auto_approved', reasons: [...d.reasons, 'policy_always'], summary: 'رسید تأیید شد ✅' };
  }
  return d;
};

/** Prompt + JSON contract for the AI vision pass. */
export const VISION_PROMPT = [
  'این تصویر یک رسید پرداخت بانکی ایرانی (کارت‌به‌کارت / پایا / ساتنا) است.',
  'فقط و فقط یک شیء JSON با این ساختار برگردان و هیچ متن دیگری ننویس:',
  '{"looksLikeReceipt": true|false, "ref": "شماره پیگیری فقط رقم", "amount": عدد_ریال_یا_تومان_بدون_جداکننده, "date": "YYYY-MM-DDTHH:mm:ss اگر ساعت خواناست، وگرنه YYYY-MM-DD یا تاریخ فارسی", "bank": "نام بانک", "cardLast4": "۴ رقم آخر کارت مقصد اگر مشخص است"}',
  'اگر فیلدی خوانا نبود مقدار null بگذار. amount را دقیقاً همان‌طور که روی رسید چاپ شده (ریال یا تومان) برگردان. تاریخ و ساعت را از زمان تراکنش بردار، نه ساعت گوشی یا زمان دریافت عکس. شماره کارت مقصد را از کارت مبدا اشتباه نگیر.',
].join('\n');

/** Parse the vision model response (tolerant to code fences / extra prose). */
export const parseVisionResponse = (text: string): VisionReading => {
  try {
    const cleaned = String(text || '')
      .replace(/```(?:json)?/gi, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, error: 'no_json' };
    const j = JSON.parse(cleaned.slice(start, end + 1));
    const ref = faDigits(String(j.ref ?? '')).replace(/\D/g, '');
    const amount = Number(j.amount ?? 0);
    return {
      ok: true,
      ref: ref || undefined,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined,
      date: j.date ? String(j.date) : undefined,
      bank: j.bank ? String(j.bank) : undefined,
      looksLikeReceipt: j.looksLikeReceipt !== false,
    };
  } catch {
    return { ok: false, error: 'bad_json' };
  }
};

/**
 * AI vision pass on the receipt photo (Gemini, inline base64 image).
 * Returns { ok: false } on any failure — the caller falls back to text checks.
 */
export const readReceiptWithVision = async (
  apiKey: string,
  imageBase64: string,
  model = 'gemini-2.5-flash'
): Promise<VisionReading> => {
  const key = String(apiKey || '').trim();
  if (!key || !imageBase64) return { ok: false, error: 'no_key_or_image' };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: VISION_PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 400 },
      }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const j: any = await res.json().catch(() => null);
    const text = String(j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '');
    if (!text) return { ok: false, error: 'empty' };
    return parseVisionResponse(text);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e || 'network') };
  }
};
