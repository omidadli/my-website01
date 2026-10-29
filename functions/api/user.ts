import {
  Env,
  json,
  getClientIp,
  ensureCoreTablesSafe,
  hashPassword,
  randomHex,
  normalizeLoginId,
  normalizePhone,
  validateLoginInput,
  validateFullName,
  resolveAccountContacts,
  newId,
  requireUser,
  sessionCookie,
  publicUserShape,
  USER_SESSION_TTL_MS,
} from './_shared';
import { constantTimeEqualStr, isValidEmail } from '../../lib/userAuth';
import {
  consumeWebMagicLoginToken,
  createPhoneVerificationToken,
  createWebMagicLoginToken,
  ensurePaymentTables,
  findSiteUserByPhone,
  hydratePaymentEnv,
  linkExistingSiteUserFromTelegram,
  registerSiteUserFromTelegram,
  syncUserAccountGrants,
} from '../../lib/payment/gateway';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;
const MAX_SAVED_ARTICLES = 200;

async function recordAttempt(env: Env, ip: string, success: boolean) {
  try {
    await env.DB.prepare(
      `INSERT INTO login_attempts (ip, attempted_at, success) VALUES (?1, ?2, ?3)`
    ).bind(ip, new Date().toISOString(), success ? 1 : 0).run();
  } catch { /* ignore */ }
}

async function tooManyAttempts(env: Env, ip: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ?1 AND success = 0 AND attempted_at > ?2`
    ).bind(ip, since).first<{ c: number }>();
    return (row?.c || 0) >= MAX_FAILURES;
  } catch {
    return false;
  }
}

function safeParse(json: any, fallback: any): any {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

const mapSaved = (r: any) => ({
  postId: r.post_id,
  notes: r.notes || '',
  read: !!r.is_read,
  savedAt: r.saved_at,
  readAt: r.read_at || null,
});

const mapSub = (r: any) => {
  const endMs = r.end_date ? Date.parse(String(r.end_date)) : NaN;
  const computedExpired = Number.isFinite(endMs) && endMs < Date.now();
  return {
    id: r.id,
    productId: r.product_id || '',
    productName: r.product_name,
    planId: r.plan_id || '',
    planName: r.plan_name,
    status: computedExpired && r.status === 'active' ? 'expired' : r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    price: r.price || '',
    autoRenew: !!r.auto_renew,
    features: safeParse(r.features, []),
  };
};

const mapOrder = (r: any) => ({
  id: r.id,
  orderId: r.order_id || '',
  productId: r.product_id || '',
  productName: r.product_name || r.description || '',
  planId: r.plan_id || '',
  planName: r.plan_name || '',
  amountToman: Math.floor(Number(r.amount_rial || 0) / 10),
  payableToman: Math.floor(Number(r.payable_amount_rial || 0) / 10),
  status: r.status || 'pending',
  source: r.source || 'website',
  accessCode: r.access_code || '',
  createdAt: r.created_at || '',
  paidAt: r.paid_at || '',
});

const mapConsultation = (r: any) => ({
  id: r.id,
  subject: r.subject,
  message: r.message,
  serviceId: r.service_id || '',
  serviceName: r.service_name || '',
  status: r.status,
  adminNotes: r.admin_notes || '',
  scheduledDate: r.scheduled_date || '',
  scheduledTime: r.scheduled_time || '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapActivity = (r: any) => ({
  id: r.id,
  type: r.type,
  description: r.description,
  relatedId: r.related_id || '',
  timestamp: r.created_at,
});

/** Everything the profile dashboard hydrates from. */
async function loadUserData(env: Env, uid: string, verifiedPhone = '') {
  const cleanPhone = verifiedPhone ? normalizePhone(verifiedPhone) : '';
  const [savedRows, subRows, conRows, actRows, orderRows] = await Promise.all([
    env.DB.prepare(`SELECT post_id, notes, is_read, saved_at, read_at FROM user_saved_articles WHERE user_id = ?1 ORDER BY saved_at DESC LIMIT ?2`).bind(uid, MAX_SAVED_ARTICLES).all(),
    env.DB.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?1 ORDER BY start_date DESC`).bind(uid).all(),
    env.DB.prepare(`SELECT * FROM user_consultations WHERE user_id = ?1 ORDER BY created_at DESC`).bind(uid).all(),
    env.DB.prepare(`SELECT * FROM user_activities WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
    cleanPhone
      ? env.DB.prepare(`SELECT * FROM payment_orders WHERE user_id = ?1 OR phone = ?2 ORDER BY created_at DESC LIMIT 25`).bind(uid, cleanPhone).all().catch(() => ({ results: [] }))
      : env.DB.prepare(`SELECT * FROM payment_orders WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 25`).bind(uid).all().catch(() => ({ results: [] })),
  ]);
  return {
    savedArticles: (savedRows.results || []).map(mapSaved),
    subscriptions: (subRows.results || [])
      .filter((r: any) => String(r.product_id || '').trim() !== '')
      .map(mapSub),
    consultations: (conRows.results || []).map(mapConsultation),
    activities: (actRows.results || []).map(mapActivity),
    orders: (orderRows.results || []).map(mapOrder),
  };
}

async function resolveBotUsername(env: Env): Promise<string> {
  const hydratedEnv = await hydratePaymentEnv(env as any).catch(() => env as any);
  return String(hydratedEnv.TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || '')
    .replace(/^@/, '')
    .trim();
}

async function logUserActivity(env: Env, userId: string, type: string, description: string, relatedId = '') {
  try {
    await env.DB.prepare(
      `INSERT INTO user_activities (id, user_id, type, description, related_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(newId(), userId, type, description, relatedId, new Date().toISOString()).run();
  } catch { /* non-fatal */ }
}

async function createSession(env: Env, userId: string, request: Request): Promise<{ token: string; expiresAt: number }> {
  const token = randomHex(32);
  const expiresAt = Date.now() + USER_SESSION_TTL_MS;
  const ip = getClientIp(request);
  const ua = String(request.headers.get('User-Agent') || '').slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO user_sessions (token, user_id, ip, user_agent, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(token, userId, ip, ua, new Date().toISOString(), new Date(expiresAt).toISOString()).run();
  await env.DB.prepare(`UPDATE users SET last_login_at = ?1 WHERE id = ?2`).bind(new Date().toISOString(), userId).run().catch(() => {});
  return { token, expiresAt };
}

const isSecureRequest = (request: Request): boolean => {
  const url = new URL(request.url);
  return url.protocol === 'https:' || String(request.headers.get('X-Forwarded-Proto') || '').toLowerCase() === 'https';
};

// ---- GET /api/user -> current session profile (+ ?action=check_phone_verify) ----
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureCoreTablesSafe(env);
  await ensurePaymentTables(env as any).catch(() => {});
  const botUsername = await resolveBotUsername(env);
  const user = await requireUser(request, env);
  if (!user) return json({ ok: false, error: 'not_authenticated', botUsername }, { status: 401 });

  const isPhoneVerified = Boolean(user.phone && user.phone_verified_at);
  await syncUserAccountGrants(env, String(user.id), String(user.phone || ''), isPhoneVerified).catch(() => {});

  const data = await loadUserData(env, String(user.id), isPhoneVerified ? String(user.phone || '') : '');
  return json({
    ok: true,
    verified: isPhoneVerified,
    botUsername,
    profile: publicUserShape(user),
    ...data,
  });
};

// ---- POST /api/user with ?action=register|login|logout|update|save_article|unsave_article|mark_read|consult ----
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureCoreTablesSafe(env);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'login';
  const ip = getClientIp(request);
  const secure = isSecureRequest(request);

  let body: any = {};
  let parsed = true;
  try { body = await request.json(); } catch { parsed = false; body = {}; }
  if (!parsed && action !== 'logout') return json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });

  if (action === 'logout') {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('nd_session='));
    const token = match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
    if (token) await env.DB.prepare(`DELETE FROM user_sessions WHERE token = ?1`).bind(token).run().catch(() => {});
    return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie({ token: '', expiresAt: 0, delete: true, secure }) } });
  }

  if (action === 'register') {
    const fullName = String(body.fullName || '').trim();
    const emailVal = String(body.email || '').trim();
    const phoneVal = String(body.phone || '').trim();
    const combined = String(body.emailOrPhone || '').trim();
    const password = String(body.password || '');

    const nameCheck = validateFullName(fullName);
    if (!nameCheck.ok) return json({ ok: false, error: nameCheck.error }, { status: 400 });

    // Two separate fields are validated strictly (both contacts are stored — the
    // phone is never dropped just because the account also has an email). The
    // combined single-input field is the fallback.
    const contacts = resolveAccountContacts(emailVal, phoneVal, combined);
    if (!contacts.ok) return json({ ok: false, error: contacts.error }, { status: 400 });

    if (!password || password.length < 6) return json({ ok: false, error: 'رمز ورود باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });

    const { loginId, loginType, email, phone } = contacts;
    // One account per identifier: the login id AND any stored email/phone must be unique.
    const existing = await env.DB.prepare(
      `SELECT id FROM users WHERE login_id = ?1 OR (?2 <> '' AND email = ?3) OR (?4 <> '' AND phone = ?5) LIMIT 1`
    ).bind(loginId, email, email, phone, phone).first<{ id: string }>();
    if (existing) return json({ ok: false, error: 'این ایمیل یا شماره قبلاً ثبت نام کرده است. لطفاً وارد شوید.' }, { status: 409 });

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt, env.AUTH_SECRET || 'user-secret');
    const uid = newId();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (id, full_name, login_id, login_type, email, phone, password_hash, password_salt, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(uid, fullName, loginId, loginType, email, phone, hash, salt, now).run();

    await logUserActivity(env, uid, 'account_created', 'حساب کاربری شما ایجاد شد');

    const { token, expiresAt } = await createSession(env, uid, request);
    const profile = {
      id: uid,
      fullName,
      email,
      phone,
      phoneVerified: false,
      phoneVerifiedAt: '',
      tgUserId: '',
      tgUsername: '',
      avatarUrl: '',
      bio: '',
      joinedAt: now,
    };
    const data = await loadUserData(env, uid);
    const botUsername = await resolveBotUsername(env);
    return json({ ok: true, botUsername, profile, ...data }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt, secure }) },
    });
  }

  if (action === 'login') {
    const loginRaw = String(body.emailOrPhone || body.loginId || body.email || body.phone || body.username || '').trim();
    const password = String(body.password || '');
    if (!loginRaw || !password) return json({ ok: false, error: 'ایمیل/شماره و رمز عبور را وارد کنید.' }, { status: 400 });
    if (await tooManyAttempts(env, ip)) {
      return json({ ok: false, error: `تلاش‌های ناموفق زیاد. ${WINDOW_MINUTES} دقیقه دیگر دوباره امتحان کنید.` }, { status: 429 });
    }
    const { id: loginId } = normalizeLoginId(loginRaw);
    const legacyId = loginRaw.toLowerCase();
    const row = await env.DB.prepare(
      `SELECT * FROM users WHERE login_id = ?1 OR email = ?2 OR phone = ?3 OR login_id = ?4 LIMIT 1`
    ).bind(loginId, loginId, loginId, legacyId).first<Record<string, any>>();
    if (!row) {
      await recordAttempt(env, ip, false);
      return json({ ok: false, error: 'کاربری با این ایمیل/شماره یافت نشد.' }, { status: 401 });
    }
    const expected = await hashPassword(password, String(row.password_salt), env.AUTH_SECRET || 'user-secret');
    if (!constantTimeEqualStr(expected, String(row.password_hash || ''))) {
      await recordAttempt(env, ip, false);
      return json({ ok: false, error: 'رمز عبور اشتباه است.' }, { status: 401 });
    }
    await recordAttempt(env, ip, true);
    const isPhoneVerified = Boolean(row.phone && row.phone_verified_at);
    await syncUserAccountGrants(env, String(row.id), String(row.phone || ''), isPhoneVerified).catch(() => {});
    const { token, expiresAt } = await createSession(env, String(row.id), request);
    const data = await loadUserData(env, String(row.id), isPhoneVerified ? String(row.phone || '') : '');
    const botUsername = await resolveBotUsername(env);
    return json({ ok: true, botUsername, profile: publicUserShape(row), ...data }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt, secure }) },
    });
  }

  if (action === 'tg_token_login') {
    const rawToken = String(body.token || '').trim();
    if (!rawToken) return json({ ok: false, error: 'توکن ورود ارسال نشده است.' }, { status: 400 });
    const hydratedEnv = await hydratePaymentEnv(env as any).catch(() => env as any);
    const consumed = await consumeWebMagicLoginToken(hydratedEnv, rawToken);
    if (!consumed.ok || !consumed.userId) {
      return json({ ok: false, error: consumed.error || 'لینک ورود نامعتبر یا منقضی شده است.' }, { status: 401 });
    }
    const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1 LIMIT 1`)
      .bind(consumed.userId)
      .first<Record<string, any>>();
    if (!row) {
      return json({ ok: false, error: 'حساب کاربری یافت نشد.' }, { status: 404 });
    }
    const isPhoneVerified = Boolean(row.phone && row.phone_verified_at);
    await syncUserAccountGrants(env, String(row.id), String(row.phone || ''), isPhoneVerified).catch(() => {});
    const { token, expiresAt } = await createSession(env, String(row.id), request);
    const data = await loadUserData(env, String(row.id), isPhoneVerified ? String(row.phone || '') : '');
    const botUsername = String(hydratedEnv.TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
    return json({ ok: true, botUsername, profile: publicUserShape(row), ...data }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt, secure }) },
    });
  }

  if (action === 'bot_sync_user') {
    const hydratedEnv = await hydratePaymentEnv(env as any).catch(() => env as any);
    const expectedSecret = String(hydratedEnv.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET || env.AUTH_SECRET || '').trim();
    const sentSecret = String(request.headers.get('X-Bot-Webhook-Secret') || body.secret || '').trim();
    if (!expectedSecret || !constantTimeEqualStr(sentSecret, expectedSecret)) {
      return json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const op = String(body.op || 'check');
    const phone = normalizePhone(String(body.phone || ''));
    if (!phone) return json({ ok: false, error: 'invalid_phone' }, { status: 400 });

    if (op === 'check') {
      const existingUser = await findSiteUserByPhone(hydratedEnv, phone, String(body.tgUserId || ''));
      if (existingUser) {
        const linked = await linkExistingSiteUserFromTelegram(hydratedEnv, {
          userId: existingUser.id,
          phone,
          tgUserId: String(body.tgUserId || ''),
          tgUsername: String(body.tgUsername || ''),
        });
        const magic = await createWebMagicLoginToken(hydratedEnv, existingUser.id, phone).catch(() => '');
        return json({ ok: true, exists: true, user: publicUserShape(linked || existingUser), magicToken: magic });
      }
      return json({ ok: true, exists: false });
    }

    if (op === 'register') {
      const reg = await registerSiteUserFromTelegram(hydratedEnv, {
        tgUserId: String(body.tgUserId || ''),
        tgUsername: String(body.tgUsername || ''),
        phone,
        fullName: String(body.fullName || ''),
        email: String(body.email || ''),
        password: String(body.password || ''),
      });
      if (!reg.ok || !reg.user) {
        return json({ ok: false, error: reg.error || 'registration_failed' }, { status: 400 });
      }
      const magic = await createWebMagicLoginToken(hydratedEnv, reg.user.id, phone).catch(() => '');
      return json({ ok: true, created: reg.created, user: publicUserShape(reg.user), magicToken: magic });
    }

    return json({ ok: false, error: 'unknown_op' }, { status: 400 });
  }

  if (action === 'update') {
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });

    const hasName = body.fullName !== undefined;
    const fullName = hasName ? String(body.fullName || '').trim() : String(user.full_name || '');
    if (hasName) {
      const nameCheck = validateFullName(fullName);
      if (!nameCheck.ok) return json({ ok: false, error: nameCheck.error }, { status: 400 });
    }

    let email = String(user.email || '');
    if (body.email !== undefined) {
      const rawEmail = String(body.email || '').trim().toLowerCase();
      if (rawEmail === '') {
        if (!String(user.phone || '').trim() && body.phone === undefined) {
          return json({ ok: false, error: 'حساب شما باید حداقل ایمیل یا شماره موبایل داشته باشد.' }, { status: 400 });
        }
        email = '';
      } else {
        if (!isValidEmail(rawEmail)) {
          return json({ ok: false, error: 'فرمت ایمیل واردشده صحیح نیست.' }, { status: 400 });
        }
        if (rawEmail !== String(user.email || '').toLowerCase()) {
          const emailClash = await env.DB.prepare(
            `SELECT id FROM users WHERE (email = ?1 OR login_id = ?2) AND id <> ?3 LIMIT 1`
          )
            .bind(rawEmail, rawEmail, user.id)
            .first<{ id: string }>();
          if (emailClash) {
            return json({ ok: false, error: 'این ایمیل متعلق به حساب کاربری دیگری است.' }, { status: 409 });
          }
        }
        email = rawEmail;
      }
    }

    let phone = String(user.phone || '');
    if (body.phone !== undefined) {
      const rawPhone = String(body.phone || '').trim();
      if (rawPhone === '') {
        if (!email) {
          return json({ ok: false, error: 'حساب شما باید حداقل ایمیل یا شماره موبایل داشته باشد.' }, { status: 400 });
        }
        phone = '';
      } else {
        phone = normalizePhone(rawPhone);
        if (!phone) return json({ ok: false, error: 'شماره موبایل باید با 09 شروع شود (مثل 09123456789).' }, { status: 400 });
        if (phone !== String(user.phone || '')) {
          const clash = await env.DB.prepare(
            `SELECT id FROM users WHERE (phone = ?1 OR login_id = ?2) AND id <> ?3 LIMIT 1`
          ).bind(phone, phone, user.id).first<{ id: string }>();
          if (clash) return json({ ok: false, error: 'این شماره موبایل متعلق به حساب دیگری است.' }, { status: 409 });
        }
      }
    }

    const phoneChanged = phone !== String(user.phone || '');
    const bio = body.bio !== undefined ? String(body.bio || '').slice(0, 600) : String(user.bio || '');
    const nextLoginId = phone || email || String(user.login_id || '');
    const nextLoginType = phone ? 'phone' : 'email';

    if (phoneChanged) {
      await env.DB.prepare(
        `UPDATE users SET full_name = ?1, email = ?2, phone = ?3, login_id = ?4, login_type = ?5, bio = ?6, phone_verified_at = '', tg_user_id = '', tg_username = '' WHERE id = ?7`
      ).bind(fullName, email, phone, nextLoginId, nextLoginType, bio, user.id).run();
    } else {
      await env.DB.prepare(
        `UPDATE users SET full_name = ?1, email = ?2, phone = ?3, login_id = ?4, login_type = ?5, bio = ?6 WHERE id = ?7`
      ).bind(fullName, email, phone, nextLoginId, nextLoginType, bio, user.id).run();
    }
    const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(user.id).first<Record<string, any>>();
    return json({ ok: true, profile: publicUserShape(row!) });
  }

  if (action === 'change_password') {
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });

    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!newPassword || newPassword.length < 6) {
      return json({ ok: false, error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });
    }

    if (user.password_hash && user.password_salt) {
      if (!currentPassword) {
        return json({ ok: false, error: 'لطفاً رمز عبور فعلی خود را وارد کنید.' }, { status: 400 });
      }
      const expected = await hashPassword(currentPassword, String(user.password_salt), env.AUTH_SECRET || 'user-secret');
      if (!constantTimeEqualStr(expected, String(user.password_hash))) {
        return json({ ok: false, error: 'رمز عبور فعلی اشتباه است.' }, { status: 401 });
      }
    }

    const newSalt = randomHex(16);
    const newHash = await hashPassword(newPassword, newSalt, env.AUTH_SECRET || 'user-secret');
    await env.DB.prepare(`UPDATE users SET password_hash = ?1, password_salt = ?2 WHERE id = ?3`)
      .bind(newHash, newSalt, user.id)
      .run();
    await logUserActivity(env, String(user.id), 'password_changed', 'رمز عبور حساب کاربری تغییر یافت');
    return json({ ok: true });
  }

  if (action === 'start_phone_verify') {
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });

    let phone = normalizePhone(String(body.phone || user.phone || ''));
    if (!phone) {
      return json({ ok: false, error: 'لطفاً ابتدا شماره موبایل معتبر (مثلاً 09123456789) وارد کنید.' }, { status: 400 });
    }

    if (phone !== String(user.phone || '')) {
      const clash = await env.DB.prepare(`SELECT id FROM users WHERE phone = ?1 AND id <> ?2 LIMIT 1`)
        .bind(phone, user.id)
        .first<{ id: string }>();
      if (clash) {
        return json({ ok: false, error: 'این شماره موبایل متعلق به حساب کاربری دیگری است.' }, { status: 409 });
      }
      await env.DB.prepare(
        `UPDATE users SET phone = ?1, phone_verified_at = '', tg_user_id = '', tg_username = '' WHERE id = ?2`
      )
        .bind(phone, user.id)
        .run();
    }

    const hydratedEnv = await hydratePaymentEnv(env as any).catch(() => env as any);
    const { token, expiresAt } = await createPhoneVerificationToken(hydratedEnv, {
      userId: String(user.id),
      phone,
      purpose: 'verify_phone',
    });

    const botUsername = String(hydratedEnv.TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
    const verifyUrl = botUsername ? `https://t.me/${botUsername}?start=verify_${token}` : '';
    const command = `/start verify_${token}`;

    return json({
      ok: true,
      token,
      phone,
      botUsername,
      verifyUrl,
      command,
      expiresAt,
    });
  }

  // ---- Profile dashboard persistence (saved articles / consultations) ----

  const withUser = async (fn: (userId: string) => Promise<Response>) => {
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });
    return fn(String(user.id));
  };

  if (action === 'save_article') {
    return withUser(async (uid) => {
      const postId = String(body.postId || '').trim().slice(0, 200);
      if (!postId) return json({ ok: false, error: 'شناسه مقاله نامعتبر است.' }, { status: 400 });
      const notes = String(body.notes || '').slice(0, 500);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO user_saved_articles (user_id, post_id, notes, is_read, saved_at, read_at)
         VALUES (?1, ?2, ?3, 0, ?4, '')
         ON CONFLICT(user_id, post_id) DO UPDATE SET notes = excluded.notes`
      ).bind(uid, postId, notes, now).run();
      await logUserActivity(env, uid, 'article_saved', 'مقاله جدیدی ذخیره کردید', postId);
      const data = await loadUserData(env, uid);
      return json({ ok: true, ...data });
    });
  }

  if (action === 'unsave_article') {
    return withUser(async (uid) => {
      const postId = String(body.postId || '').trim().slice(0, 200);
      if (!postId) return json({ ok: false, error: 'شناسه مقاله نامعتبر است.' }, { status: 400 });
      await env.DB.prepare(`DELETE FROM user_saved_articles WHERE user_id = ?1 AND post_id = ?2`).bind(uid, postId).run();
      await logUserActivity(env, uid, 'article_removed', 'مقاله‌ای را از لیست ذخیره حذف کردید', postId);
      const data = await loadUserData(env, uid);
      return json({ ok: true, ...data });
    });
  }

  if (action === 'mark_read') {
    return withUser(async (uid) => {
      const postId = String(body.postId || '').trim().slice(0, 200);
      if (!postId) return json({ ok: false, error: 'شناسه مقاله نامعتبر است.' }, { status: 400 });
      const read = body.read === undefined ? true : !!body.read;
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE user_saved_articles SET is_read = ?1, read_at = ?2 WHERE user_id = ?3 AND post_id = ?4`
      ).bind(read ? 1 : 0, read ? now : '', uid, postId).run();
      if (read) await logUserActivity(env, uid, 'article_read', 'یک مقاله را مطالعه کردید', postId);
      const data = await loadUserData(env, uid);
      return json({ ok: true, ...data });
    });
  }

  if (action === 'consult') {
    return withUser(async (uid) => {
      const subject = String(body.subject || '').trim().slice(0, 200);
      const message = String(body.message || '').trim().slice(0, 2000);
      if (!subject || !message) return json({ ok: false, error: 'موضوع و متن درخواست مشاوره را وارد کنید.' }, { status: 400 });
      const id = newId();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO user_consultations (id, user_id, subject, message, service_id, service_name, status, admin_notes, scheduled_date, scheduled_time, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', '', '', '', ?7, ?7)`
      ).bind(id, uid, subject, message, String(body.serviceId || '').slice(0, 100), String(body.serviceName || '').slice(0, 200), now).run();
      await logUserActivity(env, uid, 'consultation_sent', `درخواست مشاوره جدید: ${subject}`, id);
      const data = await loadUserData(env, uid);
      return json({ ok: true, ...data });
    });
  }

  return json({ ok: false, error: 'اکشن نامعتبر است.' }, { status: 400 });
};
