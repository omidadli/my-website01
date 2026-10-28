/**
 * Phone / input normalisation — the SAME rules as lib/userAuth.ts on the website,
 * so a phone verified in Telegram matches the website account exactly.
 * (Kept in sync by hand; scripts/user-auth.test.ts covers the TS original.)
 */

/** Normalise an Iranian mobile to `09xxxxxxxxx` — '' when invalid. */
export function normalizePhone(raw) {
  const digitMap = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };
  let d = String(raw || '')
    .replace(/[۰-۹٠-٩]/g, (x) => digitMap[x] || x)
    .replace(/[^\d+]/g, '')
    .replace(/^\+/, '');
  if (/^00989\d{9}$/.test(d)) d = d.slice(4); // 00989… -> 9…
  if (/^989\d{9}$/.test(d)) d = d.slice(2); // 989… -> 9…
  if (/^9\d{9}$/.test(d)) d = `0${d}`; // 9… -> 09…
  return /^09\d{9}$/.test(d) ? d : '';
}

export const isValidPhone = (raw) => normalizePhone(raw) !== '';

export const isValidEmail = (raw) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw || '').trim());

/** Pretty phone for messages: 0912 345 6789 */
export const displayPhone = (phone) => {
  const p = normalizePhone(phone);
  return p ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : String(phone || '');
};

/** 6-digit OTP with Persian-safe digits (always Latin). */
export const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

/** Short unique id for orders/deliveries. */
export const genId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
