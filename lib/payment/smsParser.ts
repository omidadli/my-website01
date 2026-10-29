/**
 * lib/payment/smsParser.ts — Iranian Bank & BluBank SMS Parser & Security Guard.
 *
 * Parses incoming SMS messages forwarded from the merchant's iPhone (Shortcuts /
 * `/sms-bridge`), Telegram Bot admin forward, or Android phone:
 *  1. Blocks & redacts OTP / dynamic second passwords (رمز پویا / کد ورود به بلو / کد تایید)
 *     so sensitive codes are NEVER stored or processed on the server.
 *  2. Distinguishes deposits (واریز / به حسابتان نشست / حسابتان شارژ شد / +amount / بستانکار)
 *     from withdrawals (برداشت / از حسابتان پرید / خرید شارژ / -amount / بدهکار).
 *  3. Extracts the exact deposit amount in Rials (`amountRial`), avoiding dates,
 *     clock times, account numbers, tracking references, fees (`کارمزد`), and
 *     account balances (`مانده` / `موجودی` / `قابل برداشت`).
 */

import { toLatinDigits } from './banks';

export type SmsClassification = 'deposit' | 'withdrawal' | 'otp_ignored' | 'non_bank_ignored';

export interface ParsedBankSms {
  kind: SmsClassification;
  isDeposit: boolean;
  /** Canonical deposit amount in Rials (0 when not a valid deposit) */
  amountRial: number;
  /** Deposit amount in Toman (`Math.floor(amountRial / 10)`) */
  amountToman: number;
  /** Detected currency unit on the SMS ('IRR' | 'IRT') */
  detectedUnit: 'IRR' | 'IRT';
  /** Optional last 4 digits of card/account if visible */
  cardLast4: string;
  /** Optional bank name inferred from sender or body */
  bankName: string;
  /** Sanitized SMS text safe for admin audit logging (OTPs redacted) */
  sanitizedText: string;
}

const normalizeSmsText = (raw: string): string =>
  toLatinDigits(String(raw || ''))
    .replace(/[\u200B-\u200F\u202A-\u202E\u061C\uFEFF]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\r\n?/g, '\n')
    .trim();

const OTP_PATTERNS: RegExp[] = [
  /رمز\s*(?:دوم|پویا|یکبار\s*مصرف|تک\s*بار|عبور|کارت)/i,
  /پویا\s*[:：]?\s*\d{4,8}/i,
  /کد\s*(?:تایید|تأیید|تاییدیه|تأییدیه|ورود|محرمانه|فعالسازی|فعال\s*سازی|امنیتی|احراز|تغییر\s*رمز)/i,
  /(?:این\s*کد|رمز)\s*را\s*در\s*اختیار/i,
  /\b(?:otp|verification\s*code|login\s*code|passcode|pin\s*code|security\s*code)\b/i,
];

const DEPOSIT_KEYWORDS: RegExp[] = [
  /واریز/,
  /نشست/,
  /بستانکار/,
  /افزایش\s*موجودی/,
  /انتقال\s*به\s*حساب/,
  /واریزی/,
  /حواله\s*وارده/,
  /دریافت\s*وجه/,
  /به\s*حساب(?:\s*شما|\s*بلو(?:ی)?\s*شما|\s*تان)?\s*اضافه\s*شد/,
  /حساب(?:تان|\s*شما)?\s*[\d,٬،\s]+(?:ریال|ريال|تومان|تومن)?\s*شارژ\s*شد/,
  /(?<!خرید\s)شارژ\s*حساب/,
  /\b(?:deposit|credited)\b/i,
  /(?:^|[\s:\n])\+[\d,٬،]{4,}/,
  /[\d,٬،]{4,}\+(?:$|[\s\n])/,
];

const WITHDRAWAL_KEYWORDS: RegExp[] = [
  /برداشت/,
  /کسر\s*از/,
  /بدهکار/,
  /از\s*حساب(?:تان|\s*شما)?\s*(?:پرید|کم\s*شد|کسر\s*شد)/,
  /خرید\s*(?:کالا|اینترنتی|پوز|پایانه|شارژ|با\s*کارت)/,
  /پرداخت\s*قبض/,
  /انتقال\s*(?:وجه\s*)?از\s*حساب/,
  /\b(?:withdraw|withdrawal|debited)\b/i,
  /(?:^|[\s:\n])-[\d,٬،]{4,}/,
  /[\d,٬،]{4,}-(?:$|[\s\n])/,
];

const BALANCE_SEGMENT_RE =
  /(?:مانده(?:\s*حساب|\s*قابل\s*برداشت)?|موجودی(?:\s*جدید|\s*فعلی|\s*کل|\s*حساب)?|قابل\s*برداشت|\bbalance\b)\s*[:：=]?\s*[+\-]?\s*[\d][\d,٬،]*(?:\s*(?:ریال|ريال|تومان|تومن|irr|rial))?[+\-]?/gi;

const FEE_SEGMENT_RE =
  /(?:کارمزد(?:\s*انتقال)?|\bfee\b)\s*[:：=]?\s*[\d][\d,٬،]*(?:\s*(?:ریال|ريال|تومان|تومن|irr))?/gi;

const BALANCE_LINE_ONLY_RE = /^\s*(?:مانده|موجودی|قابل\s*برداشت|\bbalance\b)\b/i;

const KNOWN_BANKS: Array<{ re: RegExp; name: string }> = [
  { re: /بلو\s*بانک|بلوبانک|\bبلو\b|blubank|\bblu\b|6219861[789]/i, name: 'بلوبانک' },
  { re: /ویپاد|wepod/i, name: 'ویپاد' },
  { re: /ملی|melli|bam|بام/i, name: 'بانک ملی' },
  { re: /ملت|mellat/i, name: 'بانک ملت' },
  { re: /سامان|saman/i, name: 'بانک سامان' },
  { re: /پاسارگاد|pasargad/i, name: 'بانک پاسارگاد' },
  { re: /پارسیان|parsian/i, name: 'بانک پارسیان' },
  { re: /سپه|sepah/i, name: 'بانک سپه' },
  { re: /کشاورزی|keshavarzi|agri/i, name: 'بانک کشاورزی' },
  { re: /مسکن|maskan/i, name: 'بانک مسکن' },
  { re: /صادرات|saderat|bsi/i, name: 'بانک صادرات' },
  { re: /تجارت|tejarat/i, name: 'بانک تجارت' },
  { re: /اقتصاد\s*نوین|enbank/i, name: 'اقتصاد نوین' },
  { re: /سینا|sina/i, name: 'بانک سینا' },
  { re: /کارآفرین|karafarin/i, name: 'بانک کارآفرین' },
  { re: /گردشگری|gardeshgari/i, name: 'بانک گردشگری' },
  { re: /آینده|ayandeh/i, name: 'بانک آینده' },
  { re: /شهر|shahr/i, name: 'بانک شهر' },
  { re: /رفاه|refah/i, name: 'بانک رفاه' },
  { re: /رسالت|resalat/i, name: 'بانک رسالت' },
  { re: /مهر\s*ایران|mehr/i, name: 'بانک مهر ایران' },
  { re: /پست\s*بانک|postbank/i, name: 'پست بانک' },
  { re: /دی\b|day\s*bank/i, name: 'بانک دی' },
];

const parseFormattedNumber = (raw: string): number => {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits || digits.length < 4 || digits.length > 13) return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

/** Remove dates, times, IBANs, masked card numbers and account/ref numbers without ever eating deposit amounts. */
const scrubNonAmountTokens = (input: string): string =>
  input
    // Strip explicit balance & fee segments anywhere (even on single-line SMS before or after deposit!)
    .replace(BALANCE_SEGMENT_RE, ' ')
    .replace(FEE_SEGMENT_RE, ' ')
    // IBANs
    .replace(/\bIR\d{10,26}\b/gi, ' ')
    // Dates + optional attached hyphenated time: 1405/08/06-14:25:10, 05/08/06, 2026-10-28
    .replace(/\b(?:\d{2}|\d{4})[/-]\d{1,2}[/-]\d{1,2}(?:[\s\-T]+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, ' ')
    // Clock times: 14:25:10 or 14:25
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    // Full or masked card numbers: 6219-8619-1234-5678, 6219*1234, 6219**5678
    .replace(/\b\d{4}[\s*-]+\d{2,4}[\s*-]*\d{0,4}[\s*-]*\d{2,4}\b/g, ' ')
    .replace(/\b\d{6}[*×xX]+\d{4}\b/g, ' ')
    .replace(/\b\d{16}\b/g, ' ')
    // Account numbers with dots or dashes: 010.123456.01 or 821-800-1234567-1
    .replace(/\b\d+(?:[./-]\d+){2,}\b/g, ' ')
    // Tracking/ref/explicit account numbers (carefully NOT matching "واریز به حساب 5894300 ریال"!)
    .replace(/(?:شماره\s*پیگیری|پیگیری|مرجع|ارجاع|سند|شماره\s*حساب|شماره\s*سپرده|شماره\s*کارت|\brrn\b|\bref\b)\s*[:：]?\s*[\d*-]+/gi, ' ')
    .replace(/(?:حساب|سپرده|کارت)\s*[:：]\s*[\d.*-]+(?!\s*(?:ریال|ريال|تومان|تومن|irr))/gi, ' ');

const detectBankName = (sender: string, text: string): string => {
  const combined = `${sender} ${text}`;
  for (const b of KNOWN_BANKS) {
    if (b.re.test(combined)) return b.name;
  }
  return '';
};

const extractCardLast4 = (text: string): string => {
  const masked = text.match(/\b\d{4,6}[*×xX]+\d*(\d{4})\b/);
  if (masked) return masked[1];
  const spacedCard = text.match(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-](\d{4})\b/);
  if (spacedCard) return spacedCard[1];
  const cardLabel = text.match(/کارت\s*[:：]?\s*(?:\d{12})?(\d{4})\b/);
  if (cardLabel) return cardLabel[1];
  return '';
};

export const parseIranianBankSms = (sender: string, rawBody: string): ParsedBankSms => {
  const normalized = normalizeSmsText(rawBody);
  const senderNorm = normalizeSmsText(sender);
  const bankName = detectBankName(senderNorm, normalized);

  // 1) Strict OTP / Dynamic Second Password filter — never process or keep raw OTP!
  if (OTP_PATTERNS.some((re) => re.test(normalized))) {
    return {
      kind: 'otp_ignored',
      isDeposit: false,
      amountRial: 0,
      amountToman: 0,
      detectedUnit: 'IRR',
      cardLast4: '',
      bankName,
      sanitizedText: '[پیامک حاوی رمز/کد امنیتی — به دلایل امنیتی سانسور و نادیده گرفته شد]',
    };
  }

  // Strip "قابل برداشت" before checking withdrawal keywords so "مانده قابل برداشت" never looks like "برداشت"
  const withoutAvailableBalance = normalized.replace(/قابل\s*برداشت/g, '');
  const hasDepositKeyword = DEPOSIT_KEYWORDS.some((re) => re.test(withoutAvailableBalance));
  const realWithdrawal = WITHDRAWAL_KEYWORDS.some((re) => re.test(withoutAvailableBalance));

  // If it clearly states withdrawal (e.g., "از حسابتان پرید", "برداشت", "خرید شارژ") without deposit, classify as withdrawal
  if (realWithdrawal && !hasDepositKeyword) {
    return {
      kind: 'withdrawal',
      isDeposit: false,
      amountRial: 0,
      amountToman: 0,
      detectedUnit: 'IRR',
      cardLast4: extractCardLast4(normalized),
      bankName,
      sanitizedText: normalized.slice(0, 400),
    };
  }

  // Even if both matched ambiguously (e.g. "خرید شارژ" accidentally matching a loose pattern), prioritize explicit withdrawal phrases
  if (/از\s*حساب(?:تان|\s*شما)?\s*(?:پرید|کم\s*شد|کسر\s*شد)|خرید\s*شارژ/.test(withoutAvailableBalance)) {
    return {
      kind: 'withdrawal',
      isDeposit: false,
      amountRial: 0,
      amountToman: 0,
      detectedUnit: 'IRR',
      cardLast4: extractCardLast4(normalized),
      bankName,
      sanitizedText: normalized.slice(0, 400),
    };
  }

  if (!hasDepositKeyword) {
    return {
      kind: 'non_bank_ignored',
      isDeposit: false,
      amountRial: 0,
      amountToman: 0,
      detectedUnit: 'IRR',
      cardLast4: '',
      bankName,
      sanitizedText: normalized.slice(0, 400),
    };
  }

  // Scrub balance segments, fees, dates, times, IBANs, card numbers, and account numbers
  const scrubbedFull = scrubNonAmountTokens(normalized);
  const nonBalanceLines = scrubbedFull
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => Boolean(l) && !BALANCE_LINE_ONLY_RE.test(l));
  const candidateText = nonBalanceLines.join('\n');

  let amountRaw = 0;
  let explicitToman = false;

  // Priority A: Explicit deposit-labelled & BluBank poetic patterns
  const explicitPatterns: RegExp[] = [
    // BluBank poetic: "5,894,300 ریال به حسابتان نشست" / "حسابتان 5,894,300 ریال شارژ شد"
    /([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال|irr|rial)\s*(?:به\s*حساب(?:تان|\s*شما|\s*بلو(?:ی)?\s*شما)?\s*(?:نشست|اضافه\s*شد)|واریز\s*شد|شارژ\s*شد)/i,
    /حساب(?:تان|\s*شما)?\s*([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال)?\s*شارژ\s*شد/i,
    // Standard bank labels: "واریز: 4,999,440 ریال", "واریز به حساب 5894300 ریال", "مبلغ: 4,999,440"
    /(?:واریز(?:\s*به\s*(?:حساب|سپرده|کارت)(?:\s*کوتاه\s*مدت|\s*بلند\s*مدت|\s*جاری|\s*قرض\s*الحسنه)?)?|مبلغ(?:\s*واریز(?:ی)?)?|افزایش\s*موجودی|بستانکار|دریافت\s*وجه|\bdeposit\b|\bcredited\b)\s*[:：=]?\s*\+?([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال|irr|rial)?/i,
    /\+([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال|irr|rial)?/i,
    /([\d][\d,٬،]{3,16})\+\s*(تومان|تومن|ریال|ريال|irr|rial)?/i,
    /([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال|irr|rial)/i,
  ];

  for (const re of explicitPatterns) {
    const m = candidateText.match(re);
    if (m) {
      const parsed = parseFormattedNumber(m[1]);
      if (parsed >= 1000) {
        amountRaw = parsed;
        const unit = String(m[2] || '').trim().toLowerCase();
        explicitToman = unit === 'تومان' || unit === 'تومن' || unit === 'toman';
        break;
      }
    }
  }

  // Priority B: Fallback to first comma-separated or 5..12 digit amount on a deposit line
  if (!amountRaw) {
    const numMatch = candidateText.match(/\b(\d{1,3}(?:[,٬،]\d{3})+|\d{5,12})\b/);
    if (numMatch) {
      const parsed = parseFormattedNumber(numMatch[1]);
      if (parsed >= 1000) {
        amountRaw = parsed;
        explicitToman = /(?:تومان|تومن|\btoman\b)/i.test(candidateText);
      }
    }
  }

  if (!amountRaw) {
    return {
      kind: 'non_bank_ignored',
      isDeposit: false,
      amountRial: 0,
      amountToman: 0,
      detectedUnit: 'IRR',
      cardLast4: extractCardLast4(normalized),
      bankName,
      sanitizedText: normalized.slice(0, 400),
    };
  }

  const amountRial = explicitToman ? amountRaw * 10 : amountRaw;
  const amountToman = Math.floor(amountRial / 10);

  return {
    kind: 'deposit',
    isDeposit: true,
    amountRial,
    amountToman,
    detectedUnit: explicitToman ? 'IRT' : 'IRR',
    cardLast4: extractCardLast4(normalized),
    bankName,
    sanitizedText: normalized.slice(0, 400),
  };
};
