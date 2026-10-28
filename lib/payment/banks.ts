/**
 * lib/payment/banks.ts — Iranian bank BIN detection, card formatting & Luhn check.
 * Pure TypeScript (no DOM / Node globals) — shared across Cloudflare Functions,
 * Vite dev server, Telegram bot and the React payment UI.
 */

export interface IranBankInfo {
  slug: string;
  name: string;
  shortName: string;
  accent: string;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export const toLatinDigits = (raw: string): string =>
  String(raw || '').replace(/[۰-۹٠-٩]/g, (d) => {
    const p = PERSIAN_DIGITS.indexOf(d);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(d);
    return a >= 0 ? String(a) : d;
  });

export const toPersianDigits = (raw: string | number): string =>
  String(raw ?? '').replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);

export const cleanCardNumber = (raw: string): string =>
  toLatinDigits(raw).replace(/\D/g, '').slice(0, 16);

export const formatCardNumber = (raw: string): string => {
  const d = cleanCardNumber(raw);
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

export const maskCardNumber = (raw: string): string => {
  const d = cleanCardNumber(raw);
  if (d.length < 16) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}**-****-${d.slice(12, 16)}`;
};

/** Standard Luhn check for 16-digit Iranian Shetab bank cards. */
export const isValidIranBankCard = (raw: string): boolean => {
  const d = cleanCardNumber(raw);
  if (!/^\d{16}$/.test(d)) return false;
  if (/^(\d)\1{15}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let digit = Number(d[i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

export const cleanIban = (raw: string): string => {
  const cleaned = toLatinDigits(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('IR')) return cleaned.slice(0, 26);
  if (/^\d{24}$/.test(cleaned)) return `IR${cleaned}`;
  return cleaned.slice(0, 26);
};

// Longer prefixes (8-digit neo-banks) checked before 6-digit BINs.
const BANK_PREFIXES: Array<{ prefixes: string[]; info: IranBankInfo }> = [
  {
    prefixes: ['62198619', '62198618'],
    info: { slug: 'blu', name: 'بلوبانک (سامان)', shortName: 'بلوبانک', accent: '#2563eb' },
  },
  {
    prefixes: ['50222915'],
    info: { slug: 'wepod', name: 'ویپاد (پاسارگاد)', shortName: 'ویپاد', accent: '#0ea5e9' },
  },
  {
    prefixes: ['603799'],
    info: { slug: 'melli', name: 'بانک ملی ایران', shortName: 'ملی', accent: '#d97706' },
  },
  {
    prefixes: ['610433', '991975'],
    info: { slug: 'mellat', name: 'بانک ملت', shortName: 'ملت', accent: '#e11d48' },
  },
  {
    prefixes: ['621986'],
    info: { slug: 'saman', name: 'بانک سامان', shortName: 'سامان', accent: '#0284c7' },
  },
  {
    prefixes: ['502229', '639347'],
    info: { slug: 'pasargad', name: 'بانک پاسارگاد', shortName: 'پاسارگاد', accent: '#ca8a04' },
  },
  {
    prefixes: ['622106', '639194', '627884'],
    info: { slug: 'parsian', name: 'بانک پارسیان', shortName: 'پارسیان', accent: '#b45309' },
  },
  {
    prefixes: ['589210'],
    info: { slug: 'sepah', name: 'بانک سپه', shortName: 'سپه', accent: '#ea580c' },
  },
  {
    prefixes: ['603770', '639217'],
    info: { slug: 'keshavarzi', name: 'بانک کشاورزی', shortName: 'کشاورزی', accent: '#16a34a' },
  },
  {
    prefixes: ['628023'],
    info: { slug: 'maskan', name: 'بانک مسکن', shortName: 'مسکن', accent: '#ea580c' },
  },
  {
    prefixes: ['603769'],
    info: { slug: 'saderat', name: 'بانک صادرات ایران', shortName: 'صادرات', accent: '#1d4ed8' },
  },
  {
    prefixes: ['585983', '627353'],
    info: { slug: 'tejarat', name: 'بانک تجارت', shortName: 'تجارت', accent: '#2563eb' },
  },
  {
    prefixes: ['627412'],
    info: { slug: 'eghtesad-novin', name: 'بانک اقتصاد نوین', shortName: 'اقتصاد نوین', accent: '#7c3aed' },
  },
  {
    prefixes: ['639346'],
    info: { slug: 'sina', name: 'بانک سینا', shortName: 'سینا', accent: '#1e40af' },
  },
  {
    prefixes: ['627488', '502910'],
    info: { slug: 'karafarin', name: 'بانک کارآفرین', shortName: 'کارآفرین', accent: '#15803d' },
  },
  {
    prefixes: ['505416'],
    info: { slug: 'gardeshgari', name: 'بانک گردشگری', shortName: 'گردشگری', accent: '#dc2626' },
  },
  {
    prefixes: ['636214'],
    info: { slug: 'ayandeh', name: 'بانک آینده', shortName: 'آینده', accent: '#92400e' },
  },
  {
    prefixes: ['502806', '504706'],
    info: { slug: 'shahr', name: 'بانک شهر', shortName: 'شهر', accent: '#dc2626' },
  },
  {
    prefixes: ['502938'],
    info: { slug: 'dey', name: 'بانک دی', shortName: 'دی', accent: '#0d9488' },
  },
  {
    prefixes: ['589463'],
    info: { slug: 'refah', name: 'بانک رفاه کارگران', shortName: 'رفاه', accent: '#1d4ed8' },
  },
  {
    prefixes: ['504172'],
    info: { slug: 'resalat', name: 'بانک قرض‌الحسنه رسالت', shortName: 'رسالت', accent: '#0891b2' },
  },
  {
    prefixes: ['606373'],
    info: { slug: 'mehr-iran', name: 'بانک قرض‌الحسنه مهر ایران', shortName: 'مهر ایران', accent: '#16a34a' },
  },
  {
    prefixes: ['627760'],
    info: { slug: 'postbank', name: 'پست بانک ایران', shortName: 'پست بانک', accent: '#15803d' },
  },
  {
    prefixes: ['502908'],
    info: { slug: 'tosee-taavon', name: 'بانک توسعه تعاون', shortName: 'توسعه تعاون', accent: '#0369a1' },
  },
  {
    prefixes: ['505785'],
    info: { slug: 'iran-zamin', name: 'بانک ایران زمین', shortName: 'ایران زمین', accent: '#7e22ce' },
  },
  {
    prefixes: ['606256'],
    info: { slug: 'melal', name: 'موسسه اعتباری ملل', shortName: 'ملل', accent: '#b45309' },
  },
];

export const detectIranBank = (cardNumber: string): IranBankInfo => {
  const digits = cleanCardNumber(cardNumber);
  for (const entry of BANK_PREFIXES) {
    if (entry.prefixes.some((p) => digits.startsWith(p))) {
      return entry.info;
    }
  }
  return {
    slug: 'shetab',
    name: 'شبکه بانکی شتاب',
    shortName: 'شتاب',
    accent: '#4f46e5',
  };
};
