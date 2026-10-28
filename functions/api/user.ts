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
import { createPhoneVerificationToken, syncPhoneGrantsToUser } from '../../lib/payment/gateway';

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

const mapSub = (r: any) => ({
  id: r.id,
  productId: r.product_id,
  productName: r.product_name,
  planId: r.plan_id,
  planName: r.plan_name,
  status: r.status,
  startDate: r.start_date,
  endDate: r.end_date,
  price: r.price || '',
  autoRenew: !!r.auto_renew,
  features: safeParse(r.features, []),
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
async function loadUserData(env: Env, uid: string) {
  const [savedRows, subRows, conRows, actRows] = await Promise.all([
    env.DB.prepare(`SELECT post_id, notes, is_read, saved_at, read_at FROM user_saved_articles WHERE user_id = ?1 ORDER BY saved_at DESC LIMIT ?2`).bind(uid, MAX_SAVED_ARTICLES).all(),
    env.DB.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?1 ORDER BY start_date DESC`).bind(uid).all(),
    env.DB.prepare(`SELECT * FROM user_consultations WHERE user_id = ?1 ORDER BY created_at DESC`).bind(uid).all(),
    env.DB.prepare(`SELECT * FROM user_activities WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
  ]);
  return {
    savedArticles: (savedRows.results || []).map(mapSaved),
    subscriptions: (subRows.results || []).map(mapSub),
    consultations: (conRows.results || []).map(mapConsultation),
    activities: (actRows.results || []).map(mapActivity),
  };
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
  const user = await requireUser(request, env);
  if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });

  if (user.phone && user.phone_verified_at) {
    await syncPhoneGrantsToUser(env, String(user.id), String(user.phone)).catch(() => {});
  }

  const data = await loadUserData(env, String(user.id));
  return json({
    ok: true,
    verified: Boolean(user.phone_verified_at),
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
      `SELECT id FROM users WHERE login_id = ?1 OR (?2 <> '' AND email = ?2) OR (?3 <> '' AND phone = ?3) LIMIT 1`
    ).bind(loginId, email, phone).first<{ id: string }>();
    if (existing) return json({ ok: false, error: 'این ایمیل یا شماره قبلاً ثبت نام کرده است. لطفاً وارد شوید.' }, { status: 409 });

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt, env.AUTH_SECRET || 'user-secret');
    const uid = newId();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (id, full_name, login_id, login_type, email, phone, password_hash, password_salt, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(uid, fullName, loginId, loginType, email, phone, hash, salt, now).run();

    // Welcome subscription (demo starter plan) so the profile isn't empty
    const subId = newId();
    const subEnd = new Date(Date.now() + 30 * 86400_000).toISOString();
    await env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, product_name, plan_name, status, price, features, auto_renew, start_date, end_date, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10)`
    ).bind(subId, uid, 'حساب کاربری امید عدلی', 'کاربر جدید', 'active', 'رایگان', JSON.stringify(['دسترسی به لیست مقالات ذخیره شده', 'ثبت درخواست مشاوره', 'پیگیری وضعیت درخواست‌ها']), now, subEnd, now).run();

    await logUserActivity(env, uid, 'subscription_started', 'حساب کاربری شما ایجاد شد');

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
    return json({ ok: true, profile, ...data }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt, secure }) },
    });
  }

  if (action === 'login') {
    const loginRaw = String(body.emailOrPhone || body.email || body.phone || body.username || '').trim();
    const password = String(body.password || '');
    if (!loginRaw || !password) return json({ ok: false, error: 'ایمیل/شماره و رمز عبور را وارد کنید.' }, { status: 400 });
    if (await tooManyAttempts(env, ip)) {
      return json({ ok: false, error: `تلاش‌های ناموفق زیاد. ${WINDOW_MINUTES} دقیقه دیگر دوباره امتحان کنید.` }, { status: 429 });
    }
    const { id: loginId } = normalizeLoginId(loginRaw);
    // Match the canonical id against login_id AND the email/phone columns so an
    // account registered with BOTH contacts can log in with either one. The
    // legacy fallback covers rows written before phone normalisation tightened up.
    const legacyId = loginRaw.toLowerCase();
    const row = await env.DB.prepare(
      `SELECT * FROM users WHERE login_id = ?1 OR email = ?1 OR phone = ?1 OR login_id = ?2 LIMIT 1`
    ).bind(loginId, legacyId).first<Record<string, any>>();
    if (!row) {
      await recordAttempt(env, ip, false);
      return json({ ok: false, error: 'کاربری با این ایمیل/شماره یافت نشد.' }, { status: 401 });
    }
    const expected = await hashPassword(password, String(row.password_salt), env.AUTH_SECRET || 'user-secret');
    const expectedBuf = new Uint8Array(expected.length / 2);
    for (let i = 0; i < expected.length; i += 2) expectedBuf[i / 2] = parseInt(expected.substr(i, 2), 16);
    const gotBuf = new Uint8Array(String(row.password_hash).length / 2);
    const ph = String(row.password_hash);
    for (let i = 0; i < ph.length; i += 2) gotBuf[i / 2] = parseInt(ph.substr(i, 2), 16);
    let diff = expectedBuf.length !== gotBuf.length ? 1 : 0;
    const len = Math.min(expectedBuf.length, gotBuf.length);
    for (let i = 0; i < len; i++) diff |= expectedBuf[i] ^ gotBuf[i];
    if (diff !== 0) {
      await recordAttempt(env, ip, false);
      return json({ ok: false, error: 'رمز عبور اشتباه است.' }, { status: 401 });
    }
    await recordAttempt(env, ip, true);
    const { token, expiresAt } = await createSession(env, String(row.id), request);
    const data = await loadUserData(env, String(row.id));
    return json({ ok: true, profile: publicUserShape(row), ...data }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt, secure }) },
    });
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

    let phone = String(user.phone || '');
    if (body.phone !== undefined) {
      const rawPhone = String(body.phone || '').trim();
      if (rawPhone === '') {
        phone = '';
      } else {
        phone = normalizePhone(rawPhone);
        if (!phone) return json({ ok: false, error: 'شماره موبایل باید با 09 شروع شود (مثل 09123456789).' }, { status: 400 });
        if (phone !== String(user.phone || '')) {
          const clash = await env.DB.prepare(
            `SELECT id FROM users WHERE phone = ?1 AND id <> ?2 LIMIT 1`
          ).bind(phone, user.id).first<{ id: string }>();
          if (clash) return json({ ok: false, error: 'این شماره موبایل متعلق به حساب دیگری است.' }, { status: 409 });
        }
      }
    }

    const phoneChanged = phone !== String(user.phone || '');
    const bio = body.bio !== undefined ? String(body.bio || '').slice(0, 600) : String(user.bio || '');
    if (phoneChanged) {
      await env.DB.prepare(
        `UPDATE users SET full_name = ?1, phone = ?2, bio = ?3, phone_verified_at = '', tg_user_id = '', tg_username = '' WHERE id = ?4`
      ).bind(fullName, phone, bio, user.id).run();
    } else {
      await env.DB.prepare(
        `UPDATE users SET full_name = ?1, phone = ?2, bio = ?3 WHERE id = ?4`
      ).bind(fullName, phone, bio, user.id).run();
    }
    const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(user.id).first<Record<string, any>>();
    return json({ ok: true, profile: publicUserShape(row!) });
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

    const { token, expiresAt } = await createPhoneVerificationToken(env, {
      userId: String(user.id),
      phone,
      purpose: 'verify_phone',
    });

    const botUsername = String(env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
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
