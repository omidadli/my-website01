/**
 * lib/payment/smsParser.ts — Iranian Bank SMS Parser & Security Guard.
 *
 * Parses incoming SMS messages forwarded from the merchant's Android phone:
 *  1. Blocks & redacts OTP / dynamic second passwords (رمز پویا / کد تایید) so
 *     sensitive codes are NEVER stored or processed on the server.
 *  2. Distinguishes deposits (واریز / +amount / نشست / بستانکار) from
 *     withdrawals (برداشت / خرید / -amount / بدهکار).
 *  3. Extracts the exact deposit amount in Rials (`amountRial`), avoiding
 *     dates, clock times, account numbers, tracking references, and account
 *     balances (`مانده` / `موجودی`).
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
  /رمز\s*(?:دوم|پویا|یکبار\s*مصرف|تک\s*بار)/i,
  /پویا\s*[:：]?\s*\d{4,8}/i,
  /کد\s*(?:تایید|تأیید|ورود|محرمانه|فعالسازی|فعال سازی|امنیتی|احراز)/i,
  /\b(?:otp|verification\s*code|login\s*code|passcode|pin\s*code)\b/i,
];

const DEPOSIT_KEYWORDS: RegExp[] = [
  /واریز/,
  /نشست/,
  /بستانکار/,
  /افزایش\s*موجودی/,
  /انتقال\s*به\s*حساب/,
  /واریزی/,
  /حواله\s*وارده/,
  /(?:^|[\s:\n])\+[\d,٬،]{4,}/,
  /[\d,٬،]{4,}\+(?:$|[\s\n])/,
];

const WITHDRAWAL_KEYWORDS: RegExp[] = [
  /برداشت/,
  /کسر\s*از/,
  /بدهکار/,
  /خرید\s*(?:کالا|اینترنتی|پوز|پایانه)/,
  /پرداخت\s*قبض/,
  /انتقال\s*از\s*حساب/,
  /(?:^|[\s:\n])-[\d,٬،]{4,}/,
  /[\d,٬،]{4,}-(?:$|[\s\n])/,
];

const BALANCE_LINE_RE = /(?:مانده|موجودی|قابل\s*برداشت)/i;

const KNOWN_BANKS: Array<{ re: RegExp; name: string }> = [
  { re: /بلو|blubank|blu/i, name: 'بلوبانک' },
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

/** Remove dates, times, IBANs, masked card numbers and slash-delimited account numbers so their digits aren't misread as amounts. */
const scrubNonAmountTokens = (line: string): string =>
  line
    // IBANs
    .replace(/\bIR\d{10,26}\b/gi, ' ')
    // Full or masked card numbers: 6219-8610-1234-5678, 6219*1234, 6219**5678
    .replace(/\b\d{4}[\s*-]+\d{2,4}[\s*-]*\d{0,4}[\s*-]*\d{2,4}\b/g, ' ')
    .replace(/\b\d{16}\b/g, ' ')
    // Dates: 1405/08/06, 05/08/06, 2026-10-28
    .replace(/\b(?:\d{2}|\d{4})[/-]\d{1,2}[/-]\d{1,2}\b/g, ' ')
    // Clock times: 14:25:10 or 14:25
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    // Account numbers with dots or slashes: 010.123456.01 or 1-234567-890-1
    .replace(/\b\d+(?:[./-]\d+){2,}\b/g, ' ')
    // Tracking/ref numbers explicitly labelled
    .replace(/(?:پیگیری|مرجع|سند|شماره\s*حساب|حساب|سپرده|کارت)\s*[:：]?\s*[\d*-]+/gi, ' ');

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

  const hasDepositKeyword = DEPOSIT_KEYWORDS.some((re) => re.test(normalized));
  const hasWithdrawalKeyword = WITHDRAWAL_KEYWORDS.some((re) => re.test(normalized));

  // If explicitly a withdrawal without deposit wording (note: "قابل برداشت" contains "برداشت", so strip "قابل برداشت" before checking!)
  const withoutAvailableBalance = normalized.replace(/قابل\s*برداشت/g, '');
  const realWithdrawal = WITHDRAWAL_KEYWORDS.some((re) => re.test(withoutAvailableBalance));

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

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  // Split out balance segments even when bank puts deposit & balance on the same line:
  // e.g. "واریز +4,999,440 مانده: 12,340,000"
  const nonBalanceChunks: string[] = [];
  for (const line of lines) {
    const cut = line.split(/(?:مانده|موجودی|قابل\s*برداشت)\s*[:：]?/i)[0]?.trim() || '';
    if (cut && !BALANCE_LINE_RE.test(cut)) {
      nonBalanceChunks.push(cut);
    }
  }
  const candidateText = scrubNonAmountTokens(nonBalanceChunks.join('\n'));

  let amountRaw = 0;
  let explicitToman = false;

  // Priority A: Explicit deposit-labelled amount ("واریز: 4,999,440 ریال", "مبلغ: 4,999,440", "+4,999,440", "4,999,440+")
  const explicitPatterns: RegExp[] = [
    /(?:واریز(?:\s*به\s*(?:حساب|سپرده|کارت))?|مبلغ(?:\s*واریز(?:ی)?)?|افزایش\s*موجودی|بستانکار)\s*[:：]?\s*\+?([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال)?/i,
    /\+([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال)?/i,
    /([\d][\d,٬،]{3,16})\+\s*(تومان|تومن|ریال|ريال)?/i,
    /([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال)\s*(?:به\s*حساب(?:تان)?\s*نشست|واریز\s*شد)/i,
    /([\d][\d,٬،]{3,16})\s*(تومان|تومن|ریال|ريال)/i,
  ];

  for (const re of explicitPatterns) {
    const m = candidateText.match(re);
    if (m) {
      const parsed = parseFormattedNumber(m[1]);
      if (parsed >= 1000) {
        amountRaw = parsed;
        const unit = String(m[2] || '').trim();
        explicitToman = unit === 'تومان' || unit === 'تومن';
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
        explicitToman = /\b(?:تومان|تومن)\b/.test(candidateText);
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
