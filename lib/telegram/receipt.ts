/**
 * lib/telegram/receipt.ts — Forensic Card-to-Card Bank Receipt Verification Engine.
 *
 * Used by BOTH the Website Payment Gateway (`/api/payment/v2/payments/:id/receipt`)
 * and the Telegram Bot (`lib/telegram/bot.ts`) whenever bank SMS delivery is
 * delayed/unavailable or the customer accidentally rounded the transfer amount.
 *
 * Security & Forensic Guarantees:
 *   1. Reference (`شماره پیگیری / مرجع / ارجاع`) must be present (6–32 digits),
 *      non-trivial (not 000000), and NEVER previously used on any order.
 *   2. Amount must match the order's exact unique payable amount (or, when
 *      `allowRoundedBaseAmount` is enabled for fallback receipts, the exact base
 *      plan price) in either Toman or Rial (×10).
 *   3. Pre-transfer confirmation screens ("پیش‌نمایش قبل از انتقال"), failed
 *      transfers ("ناموفق"), non-receipt images, and suspected edited/tampered
 *      screenshots are strictly flagged as `needs_review`.
 *   4. Destination holder name (`recipientName`) is verified with Iranian bank
 *      honorific normalization (`آقای / خانم / به نام ...`), and if destination
 *      `cardLast4` is printed on the receipt, it is cross-checked against the
 *      merchant's destination card.
 *   5. Transaction date/time supports BOTH Gregorian ISO and Persian Jalali
 *      (`۱۴۰۵/۰۸/۰۶ ۱۴:۲۵`, `۶ آبان ۱۴۰۵`) in Iran Standard Time (`UTC+03:30`).
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

/** Exact Solar Hijri (Jalali / Shamsi) to Gregorian calendar conversion. */
export const jalaliToGregorian = (jyInput: number, jm: number, jd: number): [number, number, number] => {
  const jy = jyInput - (jyInput > 979 ? 979 : 0);
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = (jyInput > 979 ? 1600 : 621) + 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > monthDays[gm]; gm++) gd -= monthDays[gm];
  return [gy, gm, gd];
};

const PERSIAN_MONTHS: Record<string, number> = {
  فروردین: 1,
  اردیبهشت: 2,
  خرداد: 3,
  تیر: 4,
  مرداد: 5,
  امرداد: 5,
  شهریور: 6,
  مهر: 7,
  آبان: 8,
  ابان: 8,
  آذر: 9,
  اذر: 9,
  دی: 10,
  بهمن: 11,
  اسفند: 12,
};

/**
 * Parse a receipt date string (Gregorian ISO, Jalali `1405/08/06 14:25`, 2-digit
 * Jalali `05/08/06`, or Persian month `6 آبان 1405`) into candidate epoch ms
 * values (accounting for Iran Standard Time `UTC+03:30` as well as UTC).
 */
export const parseReceiptTimestamps = (rawDate: string): { candidatesMs: number[]; hasTime: boolean } => {
  const norm = faDigits(String(rawDate || ''))
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim();
  if (!norm) return { candidatesMs: [], hasTime: false };

  const timeMatch = norm.match(/(?:^|[^\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?=$|[^\d:])/);
  const hasTime = Boolean(timeMatch);
  const hh = timeMatch ? Number(timeMatch[1]) : 0;
  const mm = timeMatch ? Number(timeMatch[2]) : 0;
  const ss = timeMatch && timeMatch[3] ? Number(timeMatch[3]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return { candidatesMs: [], hasTime };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const buildFromYmd = (gy: number, gm: number, gd: number, explicitTz: boolean): number[] => {
    if (gm < 1 || gm > 12 || gd < 1 || gd > 31) return [];
    const ymd = `${String(gy).padStart(4, '0')}-${pad2(gm)}-${pad2(gd)}`;
    if (!hasTime) {
      const utcMid = Date.parse(`${ymd}T00:00:00Z`);
      const irMid = Date.parse(`${ymd}T00:00:00+03:30`);
      return [irMid, utcMid].filter(Number.isFinite);
    }
    const hms = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
    if (explicitTz) {
      const parsed = Date.parse(norm);
      return Number.isFinite(parsed) ? [parsed] : [];
    }
    // Iranian banking apps print local Tehran time (UTC+03:30); also include UTC in case OCR already converted TZ
    const irTs = Date.parse(`${ymd}T${hms}+03:30`);
    const utcTs = Date.parse(`${ymd}T${hms}Z`);
    return [irTs, utcTs].filter(Number.isFinite);
  };

  // 1) Explicit ISO with Z or numeric offset
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(norm)) {
    const t = Date.parse(norm);
    if (Number.isFinite(t)) {
      const yCheck = new Date(t).getUTCFullYear();
      if (yCheck >= 2000 && yCheck <= 2100) return { candidatesMs: [t], hasTime };
    }
  }

  // 2) Numeric YYYY/MM/DD or YYYY-MM-DD (Gregorian 2020..2100 OR Jalali 1390..1450; works with ISO 'T' too!)
  const ymdMatch = norm.match(/(?:^|\D)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?=$|\D)/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (y >= 1390 && y <= 1450) {
      const [gy, gm, gd] = jalaliToGregorian(y, m, d);
      return { candidatesMs: buildFromYmd(gy, gm, gd, false), hasTime };
    }
    if (y >= 2000 && y <= 2100) {
      return { candidatesMs: buildFromYmd(y, m, d, false), hasTime };
    }
  }

  // 3) 2-digit Jalali year common on Iranian POS/bank receipts: "05/08/06" -> 1405/08/06
  const shortJalali = norm.match(/(?:^|\s)(\d{2})\/(\d{1,2})\/(\d{1,2})(?:\s|$|-)/);
  if (shortJalali) {
    const yy = Number(shortJalali[1]);
    const m = Number(shortJalali[2]);
    const d = Number(shortJalali[3]);
    const jy = yy >= 90 ? 1300 + yy : 1400 + yy;
    if (jy >= 1395 && jy <= 1430 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const [gy, gm, gd] = jalaliToGregorian(jy, m, d);
      return { candidatesMs: buildFromYmd(gy, gm, gd, false), hasTime };
    }
  }

  // 4) Persian month name format: "6 آبان 1405" or "۰۶ آبان ۱۴۰۵ - ۱۴:۲۵"
  for (const [mName, mNum] of Object.entries(PERSIAN_MONTHS)) {
    const re = new RegExp(`(?:^|\\D)(\\d{1,2})\\s+${mName}(?:\\s*ماه)?\\s+(\\d{2,4})(?=$|\\D)`);
    const pm = norm.match(re);
    if (pm) {
      const d = Number(pm[1]);
      let jy = Number(pm[2]);
      if (jy < 100) jy += 1400;
      if (jy >= 1395 && jy <= 1450) {
        const [gy, gm, gd] = jalaliToGregorian(jy, mNum, d);
        return { candidatesMs: buildFromYmd(gy, gm, gd, false), hasTime };
      }
    }
  }

  // 5) Final fallback to Date.parse (only if resulting year is sensible >= 2000)
  const fallback = Date.parse(norm);
  if (Number.isFinite(fallback)) {
    const y = new Date(fallback).getUTCFullYear();
    if (y >= 2000 && y <= 2100) return { candidatesMs: [fallback], hasTime };
  }

  return { candidatesMs: [], hasTime };
};

/**
 * Extract payment clues from free text (caption under the receipt photo, or a
 * follow-up message like «مبلغ ۵۹۰۰۰۰ — پیگیری 1234567890»).
 */
export const parsePaymentDetails = (raw: string): PaymentDetails => {
  const text = faDigits(String(raw || ''));

  const labelledRefMatch = text.match(
    /(?:شماره\s*(?:پیگیری|پيگيري|مرجع|ارجاع|سند)|پیگیری|پيگيري|کد\s*(?:پیگیری|رهگیری|مرجع)|rrn|ref(?:erence)?)\s*[:：]?\s*((?:\d[\s-]?){6,32})/i
  );
  const labelledRef = labelledRefMatch ? labelledRefMatch[1].replace(/\D/g, '') : '';

  const amountLabels = [
    /(?:مبلغ(?:\s*کل|\s*واریزی)?|amount|paid)\s*[:：]?\s*([\d][\d\s,٬،]{2,20})/i,
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
    if (spacedDigits.has(token.trim())) continue;
    if (digits === labelledRef) continue;
    if (digits.length >= 10 && digits.length <= 32) refs.push(digits);
    else if (digits.length >= 3 && digits.length <= 9 && !labelledAmounts.includes(Number(digits))) amounts.push(Number(digits));
  }
  refs.push(...spacedRuns);

  const uniqueRefs = [...new Set(refs.map((r) => r.replace(/^0+/, '') || r))];
  const ref = labelledRef || uniqueRefs[0] || '';

  const uniqueAmounts = [...new Set(amounts.filter((n) => n > 0))];
  const preferred = labelledAmounts[0] || uniqueAmounts[0] || 0;
  return { ref, amount: preferred, refs: uniqueRefs, amounts: uniqueAmounts };
};

/** Amount printed on a receipt matches the order in Toman or Rial (×10). */
export const amountMatches = (printed: number, orderToman: number): boolean => {
  if (!printed || !orderToman) return false;
  return printed === orderToman || printed === orderToman * 10 || printed * 10 === orderToman;
};

const NAME_STOPWORDS = new Set([
  'اقای',
  'اقا',
  'خانم',
  'جناب',
  'سرکار',
  'دکتر',
  'مهندس',
  'حاج',
  'به',
  'نام',
  'ذینفع',
  'گیرنده',
  'واریزشونده',
  'مقصد',
  'حساب',
  'کارت',
  'بانک',
  'بلوبانک',
  'بلو',
  'سامان',
  'ملت',
  'ملی',
  'پاسارگاد',
  'پارسیان',
  'تجارت',
  'صادرات',
  'سپه',
  'کشاورزی',
  'مسکن',
  'ویپاد',
  'رسالت',
  'آینده',
  'اینده',
  'mr',
  'mrs',
  'ms',
]);

const normalizePersianWord = (w: string): string =>
  faDigits(String(w || ''))
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\uFEFF]/g, '')
    .toLowerCase();

const tokenizePersonName = (raw: string): string[] => {
  const cleaned = normalizePersianWord(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
};

/**
 * Forensic Iranian account-holder matcher:
 *  - Tolerates bank honorifics/prefixes ("آقای امید عدلی", "به نام امید عدلی - بلوبانک")
 *  - Tolerates ZWNJ / Alef-Madda / Arabic Yeh & Kaf differences
 *  - Rejects partial/different surnames ("امید رضایی" != "امید عدلی")
 */
export const matchRecipientName = (expectedRaw: string, actualRaw: string): boolean => {
  const expCompact = normalizePersianWord(expectedRaw).replace(/[^\p{L}\p{N}]/gu, '');
  const actCompact = normalizePersianWord(actualRaw).replace(/[^\p{L}\p{N}]/gu, '');
  if (!expCompact || !actCompact) return false;
  if (expCompact === actCompact) return true;

  const expTokens = tokenizePersonName(expectedRaw);
  const actTokens = tokenizePersonName(actualRaw);
  if (!expTokens.length || !actTokens.length) return false;

  // Allow optional "سید/سیده" prefix on bank account registration if all expected tokens match
  const actFiltered = actTokens.filter((t) => t !== 'سید' && t !== 'سیده');
  const expFiltered = expTokens.filter((t) => t !== 'سید' && t !== 'سیده');
  if (!expFiltered.length || !actFiltered.length) return false;

  const actJoined = actFiltered.join('');
  const expJoined = expFiltered.join('');
  if (actJoined === expJoined) return true;

  // Every expected name token (e.g. both first & last name) must appear in actual tokens,
  // and actual cannot have unrelated extra surname tokens unless expected had >=2 tokens and all matched cleanly
  const allExpPresent = expFiltered.every((et) => actFiltered.some((at) => at === et));
  if (!allExpPresent) return false;
  if (expFiltered.length >= 2 && actFiltered.length <= expFiltered.length + 1) return true;
  return actFiltered.length === expFiltered.length;
};

export interface VisionReading {
  ok: boolean;
  ref?: string;
  amount?: number;
  /** ISO or Persian date string as printed */
  date?: string;
  /** Raw date/time string exactly as printed on receipt */
  dateRaw?: string;
  bank?: string;
  /** Beneficiary/account-holder name printed on the transfer receipt. */
  recipientName?: string;
  /** Payer/sender name if printed */
  payerName?: string;
  /** Last four digits of the destination card, if printed. */
  cardLast4?: string;
  /** Transfer status printed on screen: 'success' | 'failed' | 'preview_unpaid' | 'unknown' */
  transferStatus?: 'success' | 'failed' | 'preview_unpaid' | 'unknown';
  /** True if OCR spotted edited/overlaid fonts, Photoshop artifacts, or inconsistent alignment */
  tamperingSuspected?: boolean;
  looksLikeReceipt?: boolean;
  error?: string;
}

export interface ReceiptEvidence {
  /** reference typed by the user / found in the caption */
  textRef?: string;
  /** amount typed by the user / found in the caption (Toman or Rial) */
  textAmount?: number;
  /** parsed receipt photo (AI vision) */
  vision?: VisionReading | null;
  /** true when some OTHER order already used this reference */
  refTaken?: boolean;
  /** base order amount in Toman */
  orderToman: number;
  /** unique amount requested for this order; falls back to base amount for old orders */
  expectedAmountToman?: number;
  /** allow exact base plan price (`orderToman`) when customer rounded the unique amount on fallback receipt */
  allowRoundedBaseAmount?: boolean;
  /** beneficiary name configured for card-to-card payments */
  expectedRecipientName?: string;
  /** expected last 4 digits of merchant's destination card */
  expectedCardLast4?: string;
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

const isPlausibleTrackingRef = (ref: string): boolean => {
  if (!/^\d{6,32}$/.test(ref)) return false;
  // Reject trivial all-identical digits such as 000000 or 11111111
  if (/^(\d)\1{5,}$/.test(ref)) return false;
  return true;
};

/**
 * Pure forensic decision core. Policy:
 *  - duplicate reference          → `rejected` (same receipt can never pay twice)
 *  - valid complete bank receipt  → `auto_approved` (instant fulfillment without waiting)
 *  - anything suspicious/partial  → `needs_review` (routed to iPhone WebApp + Telegram Admin)
 */
export const decideReceipt = (e: ReceiptEvidence): ReceiptDecision => {
  const now = e.nowMs ?? Date.now();
  const reasons: string[] = [];
  const vision = e.vision || null;

  const refCandidates = [e.textRef, vision?.ref].filter((x): x is string => !!x && isPlausibleTrackingRef(x));
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
  const expectedAmount = e.expectedAmountToman || e.orderToman;
  const matchesTarget = (val: number): boolean =>
    amountMatches(val, expectedAmount) || (Boolean(e.allowRoundedBaseAmount) && amountMatches(val, e.orderToman));

  const amountOk = amounts.some((a) => matchesTarget(a));
  const visionAmountOk = typeof vision?.amount === 'number' && matchesTarget(vision.amount);
  const amountBad = (typeof vision?.amount === 'number' && !visionAmountOk) || (amounts.length > 0 && !amountOk);
  if (amountBad) reasons.push('amount_mismatch');
  else if (!amounts.length) reasons.push('amount_missing');
  if (amountOk && (!vision || visionAmountOk)) reasons.push('amount_ok');

  // ---- beneficiary & destination card last-4 checks ----
  const hasExpectedName = Boolean(String(e.expectedRecipientName || '').trim());
  const hasActualName = Boolean(String(vision?.recipientName || '').trim());
  const recipientOk = hasExpectedName && hasActualName && matchRecipientName(e.expectedRecipientName || '', vision?.recipientName || '');
  if (hasExpectedName && !hasActualName) reasons.push('recipient_name_missing');
  else if (hasExpectedName && !recipientOk) reasons.push('recipient_name_mismatch');

  const expectedLast4 = faDigits(String(e.expectedCardLast4 || '')).replace(/\D/g, '').slice(-4);
  const actualLast4 = faDigits(String(vision?.cardLast4 || '')).replace(/\D/g, '').slice(-4);
  const cardLast4Conflict = expectedLast4.length === 4 && actualLast4.length === 4 && expectedLast4 !== actualLast4;
  const cardLast4Matched = expectedLast4.length === 4 && actualLast4.length === 4 && expectedLast4 === actualLast4;
  if (cardLast4Conflict) reasons.push('card_last4_mismatch');

  // Destination ownership must be proven by recipientName (or cardLast4 if name wasn't configured)
  const destinationVerified = (recipientOk || (!hasExpectedName && cardLast4Matched)) && !cardLast4Conflict;

  // ---- transaction date check (Gregorian + Persian Jalali + Iran +03:30 TZ) ----
  let dateOk = false;
  const dateSource = vision?.date || vision?.dateRaw || '';
  if (dateSource) {
    const parsedDates = parseReceiptTimestamps(dateSource);
    const rawAlso =
      !parsedDates.candidatesMs.length && vision?.dateRaw && vision.dateRaw !== dateSource
        ? parseReceiptTimestamps(vision.dateRaw)
        : parsedDates;

    if (rawAlso.candidatesMs.length > 0) {
      const graceBefore = rawAlso.hasTime ? 3 * 3600_000 : 36 * 3600_000;
      const graceAfter = rawAlso.hasTime ? 15 * 60_000 : 24 * 3600_000;
      dateOk = rawAlso.candidatesMs.some((t) => t >= e.orderCreatedAtMs - graceBefore && t <= now + graceAfter);
      if (!dateOk) reasons.push('date_out_of_range');
    } else {
      dateOk = false;
      reasons.push('date_unreadable');
    }
  } else {
    reasons.push('date_missing');
    dateOk = false;
  }

  // ---- forensic fraud & status sanity ----
  if (vision && !vision.ok) reasons.push('vision_failed');
  if (vision?.ok && vision.looksLikeReceipt === false) reasons.push('not_a_receipt');
  if (vision?.transferStatus === 'preview_unpaid') reasons.push('unpaid_preview_screen');
  if (vision?.transferStatus === 'failed') reasons.push('failed_transfer');
  if (vision?.tamperingSuspected) reasons.push('suspected_tampering');

  const hasFraudFlag =
    reasons.includes('not_a_receipt') ||
    reasons.includes('vision_failed') ||
    reasons.includes('unpaid_preview_screen') ||
    reasons.includes('failed_transfer') ||
    reasons.includes('suspected_tampering') ||
    reasons.includes('card_last4_mismatch');

  const visionConfirms = !!(
    vision?.ok &&
    vision.looksLikeReceipt !== false &&
    ref &&
    visionAmountOk &&
    dateOk &&
    destinationVerified &&
    !hasFraudFlag
  );

  const textOnlyOk = !!(ref && amountOk && uniqueRefs.length <= 1 && dateOk && (!hasExpectedName || recipientOk) && !hasFraudFlag);

  let status: ReceiptDecisionStatus = 'needs_review';
  let confidence = 0.2;

  if (visionConfirms && uniqueRefs.length <= 1) {
    status = 'auto_approved';
    confidence = cardLast4Matched ? 0.98 : vision && vision.ref === ref ? 0.95 : 0.9;
    reasons.push('auto_vision');
  } else if (textOnlyOk && !vision?.ok) {
    confidence = 0.55;
    reasons.push('text_only');
  } else if (textOnlyOk) {
    confidence = 0.65;
    reasons.push('text_ok_vision_weak');
  }

  if (status === 'needs_review') {
    if (reasons.includes('suspected_tampering') || reasons.includes('unpaid_preview_screen') || reasons.includes('failed_transfer')) {
      confidence = 0.08;
    } else if (reasons.includes('ref_missing') && reasons.includes('amount_missing')) {
      confidence = 0.15;
    } else if (reasons.includes('amount_mismatch') || reasons.includes('ref_mismatch') || reasons.includes('card_last4_mismatch')) {
      confidence = 0.25;
    } else if (reasons.includes('ref_missing')) {
      confidence = 0.35;
    } else if (reasons.includes('amount_missing')) {
      confidence = 0.4;
    }
  }

  if (vision?.ok && vision.looksLikeReceipt === false && !reasons.includes('not_a_receipt')) {
    reasons.push('not_a_receipt');
  }
  const summary =
    status === 'auto_approved'
      ? 'رسید بانکی اصالت‌سنجی و تأیید خودکار شد ✅'
      : 'رسید نیاز به بررسی تکمیلی دارد و به پشتیبانی ارجاع شد.';

  return { status, ref, confidence, reasons, summary };
};

/**
 * Policy gate for text-only receipts.
 */
export const applyAutoApprovePolicy = (d: ReceiptDecision, policy: 'vision' | 'always' | 'off'): ReceiptDecision => {
  if (policy === 'off') return d.status === 'rejected' ? d : { ...d, status: 'needs_review', reasons: [...d.reasons, 'policy_off'] };
  if (d.status !== 'needs_review') return d;
  if (policy === 'always' && d.reasons.includes('text_only') && d.confidence >= 0.55) {
    return { ...d, status: 'auto_approved', reasons: [...d.reasons, 'policy_always'], summary: 'رسید تأیید شد ✅' };
  }
  return d;
};

/** Forensic OCR & Fraud-Detection Prompt for Iranian Bank Receipts (BluBank, Saman, Mellat, Bam, Wepod, Ap, 780, ATM). */
export const VISION_PROMPT = [
  'تو بازرس ارشد اصالت‌سنجی رسیدهای بانکی ایران (بلوبانک، سامان، ملت، ملی/بام، پاسارگاد/ویپاد، پارسیان، آپ، ۷۸۰، تاپ، خودپرداز و اینترنت‌بانک) هستی.',
  'تصویر را با دقت پیکسلی بررسی کن و فقط یک شیء JSON معتبر خروجی بده (بدون هیچ متن اضافی):',
  '{"looksLikeReceipt": true, "transferStatus": "success", "tamperingSuspected": false, "ref": "شماره پیگیری/مرجع/ارجاع فقط رقم یا null", "amount": 5950060, "amountRaw": "متن دقیق مبلغ و واحد چاپ‌شده", "date": "YYYY-MM-DDTHH:mm:ss+03:30 یا YYYY-MM-DD یا null", "transactionDateRaw": "متن دقیق تاریخ و ساعت چاپ‌شده روی رسید مثل ۱۴۰۵/۰۸/۰۶ ۱۴:۲۵ یا null", "bank": "نام بانک/اپلیکیشن یا null", "recipientName": "نام دقیق صاحب حساب مقصد/گیرنده یا null", "payerName": "نام واریزکننده/مبدا یا null", "cardLast4": "۴ رقم آخر کارت مقصد یا null"}',
  'قوانین بسیار سخت‌گیرانه تشخیص اصالت و ضدتقلب:',
  '1) تفاوت «رسید نهایی موفق» با «صفحه پیش‌نمایش قبل از پرداخت»: اگر تصویر مربوط به مرحله قبل از زدن دکمه تایید/انتقال است (مثلاً دکمه «تایید و انتقال» یا «ادامه» پایین صفحه است و هنوز شماره پیگیری صادر نشده)، حتماً transferStatus="preview_unpaid" بگذار. اگر تراکنش ناموفق/خطا خورده transferStatus="failed" بگذار. فقط زمانی transferStatus="success" بگذار که رسید نهایی تراکنش موفق (سبز/انجام شد همراه شماره پیگیری/مرجع) باشد.',
  '2) تشخیص دستکاری تصویری (tamperingSuspected): اگر فونت عدد مبلغ، نام گیرنده یا تاریخ با بقیه فونت‌های رسید ناهماهنگ است، دور اعداد هاله/کادر ویرایش عکس دیده می‌شود یا متن روی اسکرین‌شات تایپ شده است، حتماً tamperingSuspected=true برگردان.',
  '3) مبلغ (amount): رقم‌های فارسی/عربی را به لاتین تبدیل کن و جداکننده‌ها را حذف کن؛ عدد چاپ‌شده را دقیقاً همان‌طور که هست بنویس (تومان و ریال را خودت ضرب یا تقسیم نکن؛ واحد را در amountRaw بیاور).',
  '4) نام گیرنده (recipientName): فقط نام صاحب حساب مقصد/ذینفع («به نام»، «گیرنده»، «مقصد»، در بلوبانک نام بالای شماره کارت مقصد) را بنویس و هرگز نام فرستنده/مبدا را جای گیرنده نگذار.',
  '5) تاریخ (date و transactionDateRaw): تاریخ و ساعت دقیق انجام تراکنش روی رسید را عیناً در transactionDateRaw بنویس و معادل میلادی آن را هم در date قرار بده (ایران همیشه +03:30 است). هرگز تاریخ نوار وضعیت بالای گوشی را به جای تاریخ تراکنش نگیر.'
].join('\n');

const parseVisionAmount = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = faDigits(value).replace(/[٬،,\s]/g, '').replace(/[^0-9.]/g, '');
  if (!normalized || !/\d/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined;
};

const firstNonEmpty = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

/** Parse Gemini OCR output without mistaking formatted Persian numbers for missing fields. */
export const parseVisionResponse = (text: string): VisionReading => {
  try {
    const cleaned = String(text || '')
      .replace(/```(?:json)?/gi, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, error: 'no_json' };
    const j = JSON.parse(cleaned.slice(start, end + 1));
    const ref = faDigits(String(j.ref ?? j.reference ?? j.rrn ?? j.traceNumber ?? j.trackingCode ?? '')).replace(/\D/g, '');
    const amount = parseVisionAmount(j.amount ?? j.amountRaw ?? j.paidAmount ?? j.transactionAmount ?? j.transferAmount);
    const recipientName = firstNonEmpty(
      j.recipientName,
      j.beneficiaryName,
      j.destinationAccountHolder,
      j.receiverName,
      j.payeeName,
      j.destinationName
    );
    const payerName = firstNonEmpty(j.payerName, j.senderName, j.sourceAccountHolder);
    const dateRaw = firstNonEmpty(j.transactionDateRaw, j.dateRaw);
    const date = firstNonEmpty(j.date, j.transactionDate, dateRaw, j.paidAt);
    const cardLast4 = firstNonEmpty(j.cardLast4, j.destinationCardLast4, j.receiverCardLast4);
    const rawStatus = String(j.transferStatus || '').toLowerCase().trim();
    const transferStatus: VisionReading['transferStatus'] =
      rawStatus === 'preview_unpaid' || rawStatus === 'preview' || rawStatus === 'unpaid'
        ? 'preview_unpaid'
        : rawStatus === 'failed' || rawStatus === 'error'
          ? 'failed'
          : rawStatus === 'success' || rawStatus === 'ok' || rawStatus === 'completed'
            ? 'success'
            : undefined;

    return {
      ok: true,
      ref: ref || undefined,
      amount,
      date,
      dateRaw,
      bank: firstNonEmpty(j.bank, j.bankName),
      recipientName,
      payerName,
      cardLast4: cardLast4 ? faDigits(cardLast4).replace(/\D/g, '').slice(-4) : undefined,
      transferStatus,
      tamperingSuspected: j.tamperingSuspected === true || j.edited === true || j.isFake === true,
      looksLikeReceipt: j.looksLikeReceipt === true || j.isReceipt === true || j.receiptType === 'bank_transfer',
    };
  } catch {
    return { ok: false, error: 'bad_json' };
  }
};

/** Detect image MIME type from base64 magic header (JPEG, PNG, WEBP) so Gemini never rejects PNG/WebP screenshots from iOS/Android! */
export const detectBase64ImageMime = (b64: string): string => {
  const head = String(b64 || '').trim().slice(0, 16);
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  if (head.startsWith('UklGR')) return 'image/webp';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  return 'image/jpeg';
};

/**
 * AI vision pass on the receipt photo (Gemini, inline base64 image).
 * Returns { ok: false } on any failure — the caller falls back to review queue.
 */
export const readReceiptWithVision = async (
  apiKey: string,
  imageBase64: string,
  model = 'gemini-2.5-flash'
): Promise<VisionReading> => {
  const key = String(apiKey || '').trim();
  const cleanB64 = String(imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (!key || !cleanB64) return { ok: false, error: 'no_key_or_image' };
  const mimeType = detectBase64ImageMime(cleanB64);
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
              { inline_data: { mime_type: mimeType, data: cleanB64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 500 },
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
