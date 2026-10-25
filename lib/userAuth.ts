/**
 * Shared helpers for public user accounts (site auth, dev API and the Telegram bot).
 *
 * Dependency-free and side-effect-free so every layer (Cloudflare Pages Functions,
 * the vite dev API, the React app and the Node bot) applies the exact same rules:
 *  - phones normalise to the Iranian MSISDN form `09xxxxxxxxx`
 *  - emails are lower-cased
 *  - `login_id` (the unique identifier of an account) is the normalised phone or email
 *
 * NOTE: result types are intentionally flat (no discriminated unions) because the
 * repo compiles without `strict` and union narrowing is unreliable there.
 */

export type LoginType = 'email' | 'phone';

export interface LoginCheck {
  ok: boolean;
  error: string;
  /** Normalised identifier on success; '' on failure. */
  id: string;
  type: LoginType;
}

export interface AccountContacts {
  ok: boolean;
  error: string;
  email: string;
  phone: string;
  loginId: string;
  loginType: LoginType;
}

export const isValidEmail = (raw: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw || '').trim());

/**
 * Normalise an Iranian mobile number to `09xxxxxxxxx`.
 * Accepts Persian/Arabic digits and separators, plus: 09xx… / +989xx… / 00989xx… / 989xx… / 9xx… (10 digits).
 * Returns '' when the input is not a valid Iranian mobile.
 */
export const normalizePhone = (raw: string): string => {
  const digitMap: Record<string, string> = {
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
};

export const isValidPhone = (raw: string): boolean => normalizePhone(raw) !== '';

/**
 * Resolve any login input (email or phone) to the canonical `login_id`.
 * Unknown input keeps the old lenient behaviour (lower-cased, guessed type) so
 * legacy rows still resolve — use `validateLoginInput` on register to reject it.
 */
export const normalizeLoginId = (raw: string): { id: string; type: LoginType } => {
  const v = String(raw || '').trim();
  const phone = normalizePhone(v);
  if (phone) return { id: phone, type: 'phone' };
  if (isValidEmail(v)) return { id: v.toLowerCase(), type: 'email' };
  return { id: v.toLowerCase(), type: /@/.test(v) ? 'email' : 'phone' };
};

/** Strict validation for registration / login identifiers — Persian error messages. */
export const validateLoginInput = (raw: string): LoginCheck => {
  const v = String(raw || '').trim();
  if (!v) return { ok: false, error: 'لطفاً ایمیل یا شماره تلفن را وارد کنید.', id: '', type: 'email' };
  const phone = normalizePhone(v);
  if (phone) return { ok: true, error: '', id: phone, type: 'phone' };
  if (isValidEmail(v)) return { ok: true, error: '', id: v.toLowerCase(), type: 'email' };
  return { ok: false, error: 'ایمیل یا شماره موبایل معتبر نیست. شماره موبایل باید مثل 09123456789 باشد.', id: '', type: 'email' };
};

/** Validate a display name (registration + profile update). */
export const validateFullName = (raw: string): LoginCheck => {
  const v = String(raw || '').trim();
  if (v.length < 2) return { ok: false, error: 'لطفاً نام و نام خانوادگی را وارد کنید.', id: '', type: 'email' };
  if (v.length > 80) return { ok: false, error: 'نام و نام خانوادگی حداکثر ۸۰ کاراکتر است.', id: '', type: 'email' };
  return { ok: true, error: '', id: v, type: 'email' };
};

/**
 * Resolve the registration identity from the two optional fields (email / phone)
 * plus the optional combined single-input fallback. Either field alone is enough;
 * both may be supplied — neither contact is ever dropped.
 */
export const resolveAccountContacts = (emailRaw: string, phoneRaw: string, combinedRaw = ''): AccountContacts => {
  const emailVal = String(emailRaw || '').trim();
  const phoneVal = String(phoneRaw || '').trim();
  const combined = String(combinedRaw || '').trim();
  const fail = (error: string): AccountContacts => ({ ok: false, error, email: '', phone: '', loginId: '', loginType: 'email' });

  if (!emailVal && !phoneVal && !combined) return fail('لطفاً حداقل ایمیل یا شماره تلفن را وارد کنید.');

  // Two separate fields are validated strictly (both contacts are stored).
  if (emailVal || phoneVal) {
    let email = '';
    if (emailVal) {
      if (!isValidEmail(emailVal)) return fail('فرمت ایمیل صحیح نیست.');
      email = emailVal.toLowerCase();
    }
    let phone = '';
    if (phoneVal) {
      phone = normalizePhone(phoneVal);
      if (!phone) return fail('شماره موبایل باید با 09 شروع شود (مثل 09123456789).');
    }
    const loginId = phone || email;
    const loginType: LoginType = phone ? 'phone' : 'email';
    return { ok: true, error: '', email, phone, loginId, loginType };
  }

  // Fallback: a single "email or phone" input.
  const check = validateLoginInput(combined);
  if (!check.ok) return fail(check.error);
  return {
    ok: true,
    error: '',
    email: check.type === 'email' ? check.id : '',
    phone: check.type === 'phone' ? check.id : '',
    loginId: check.id,
    loginType: check.type,
  };
};
