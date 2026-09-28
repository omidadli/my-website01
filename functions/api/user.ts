import {
  Env,
  json,
  getClientIp,
  ensureCoreTablesSafe,
  hashPassword,
  randomHex,
  normalizeLoginId,
  newId,
  requireUser,
  sessionCookie,
  publicUserShape,
  USER_SESSION_TTL_MS,
} from './_shared';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;

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

function scrubUserData(row: any) {
  if (!row) return null;
  const { password_hash, password_salt, ...rest } = row;
  return rest;
}

// ---- GET /api/user -> current session profile ----
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureCoreTablesSafe(env);
  const user = await requireUser(request, env);
  if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });

  // Load associated data
  const [savedRows, subRows, conRows, actRows] = await Promise.all([
    env.DB.prepare(`SELECT post_id, notes, is_read, saved_at, read_at FROM user_saved_articles WHERE user_id = ?1 ORDER BY saved_at DESC`).bind(user.id).all(),
    env.DB.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?1 ORDER BY start_date DESC`).bind(user.id).all(),
    env.DB.prepare(`SELECT * FROM user_consultations WHERE user_id = ?1 ORDER BY created_at DESC`).bind(user.id).all(),
    env.DB.prepare(`SELECT * FROM user_activities WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(user.id).all(),
  ]);

  return json({
    ok: true,
    profile: publicUserShape(user),
    savedArticles: (savedRows.results || []).map((r: any) => ({
      postId: r.post_id,
      notes: r.notes || '',
      read: !!r.is_read,
      savedAt: r.saved_at,
      readAt: r.read_at || null,
    })),
    subscriptions: (subRows.results || []).map((r: any) => ({
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
    })),
    consultations: (conRows.results || []).map((r: any) => ({
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
    })),
    activities: (actRows.results || []).map((r: any) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      relatedId: r.related_id || '',
      timestamp: r.created_at,
    })),
  });
};

function safeParse(json: any, fallback: any): any {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
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

// ---- POST /api/user with ?action=register|login|logout|update ----
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureCoreTablesSafe(env);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'login';
  const ip = getClientIp(request);

  let body: any = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 }); }

  if (action === 'logout') {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('nd_session='));
    const token = match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
    if (token) await env.DB.prepare(`DELETE FROM user_sessions WHERE token = ?1`).bind(token).run().catch(() => {});
    return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie({ token: '', expiresAt: 0, delete: true }) } });
  }

  if (action === 'register') {
    const fullName = String(body.fullName || '').trim();
    const emailVal = String(body.email || '').trim();
    const phoneVal = String(body.phone || '').trim();
    const loginRaw = String(body.emailOrPhone || emailVal || phoneVal || '').trim();
    const password = String(body.password || '');
    if (!fullName || fullName.length < 2) return json({ ok: false, error: 'لطفاً نام و نام خانوادگی را وارد کنید.' }, { status: 400 });
    if (!loginRaw) return json({ ok: false, error: 'لطفاً ایمیل یا شماره تلفن را وارد کنید.' }, { status: 400 });
    if (!password || password.length < 6) return json({ ok: false, error: 'رمز ورود باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });
    const { id: loginId, type: loginType } = normalizeLoginId(loginRaw);
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first<{ id: string }>();
    if (existing) return json({ ok: false, error: 'این ایمیل یا شماره قبلاً ثبت نام کرده است. لطفاً وارد شوید.' }, { status: 409 });

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt, env.AUTH_SECRET || 'user-secret');
    const uid = newId();
    const now = new Date().toISOString();
    const email = loginType === 'email' ? loginId : '';
    const phone = loginType === 'phone' ? loginId : '';
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

    await env.DB.prepare(
      `INSERT INTO user_activities (id, user_id, type, description, related_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(newId(), uid, 'subscription_started', 'حساب کاربری شما ایجاد شد', '', now).run();

    const { token, expiresAt } = await createSession(env, uid, request);
    const profile = { id: uid, fullName, email, phone, avatarUrl: '', bio: '', joinedAt: now };
    // Load associated state to avoid a second round-trip
    const [savedRows, subRows, conRows, actRows] = await Promise.all([
      env.DB.prepare(`SELECT post_id, notes, is_read, saved_at, read_at FROM user_saved_articles WHERE user_id = ?1 ORDER BY saved_at DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?1 ORDER BY start_date DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_consultations WHERE user_id = ?1 ORDER BY created_at DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_activities WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
    ]);
    return json({
      ok: true,
      profile,
      savedArticles: (savedRows.results || []).map((r: any) => ({
        postId: r.post_id, notes: r.notes || '', read: !!r.is_read, savedAt: r.saved_at, readAt: r.read_at || null,
      })),
      subscriptions: (subRows.results || []).map((r: any) => ({
        id: r.id, productId: r.product_id, productName: r.product_name, planId: r.plan_id, planName: r.plan_name,
        status: r.status, startDate: r.start_date, endDate: r.end_date, price: r.price || '', autoRenew: !!r.auto_renew,
        features: (() => { try { return JSON.parse(r.features); } catch { return []; } })(),
      })),
      consultations: (conRows.results || []).map((r: any) => ({
        id: r.id, subject: r.subject, message: r.message, serviceId: r.service_id || '', serviceName: r.service_name || '',
        status: r.status, adminNotes: r.admin_notes || '', scheduledDate: r.scheduled_date || '', scheduledTime: r.scheduled_time || '',
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      activities: (actRows.results || []).map((r: any) => ({
        id: r.id, type: r.type, description: r.description, relatedId: r.related_id || '', timestamp: r.created_at,
      })),
    }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt }) },
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
    const row = await env.DB.prepare(`SELECT * FROM users WHERE login_id = ?1`).bind(loginId).first<Record<string, any>>();
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
    const uid = String(row.id);
    const [savedRows, subRows, conRows, actRows] = await Promise.all([
      env.DB.prepare(`SELECT post_id, notes, is_read, saved_at, read_at FROM user_saved_articles WHERE user_id = ?1 ORDER BY saved_at DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?1 ORDER BY start_date DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_consultations WHERE user_id = ?1 ORDER BY created_at DESC`).bind(uid).all(),
      env.DB.prepare(`SELECT * FROM user_activities WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
    ]);
    return json({
      ok: true,
      profile: publicUserShape(row),
      savedArticles: (savedRows.results || []).map((r: any) => ({
        postId: r.post_id, notes: r.notes || '', read: !!r.is_read, savedAt: r.saved_at, readAt: r.read_at || null,
      })),
      subscriptions: (subRows.results || []).map((r: any) => ({
        id: r.id, productId: r.product_id, productName: r.product_name, planId: r.plan_id, planName: r.plan_name,
        status: r.status, startDate: r.start_date, endDate: r.end_date, price: r.price || '', autoRenew: !!r.auto_renew,
        features: (() => { try { return JSON.parse(r.features); } catch { return []; } })(),
      })),
      consultations: (conRows.results || []).map((r: any) => ({
        id: r.id, subject: r.subject, message: r.message, serviceId: r.service_id || '', serviceName: r.service_name || '',
        status: r.status, adminNotes: r.admin_notes || '', scheduledDate: r.scheduled_date || '', scheduledTime: r.scheduled_time || '',
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      activities: (actRows.results || []).map((r: any) => ({
        id: r.id, type: r.type, description: r.description, relatedId: r.related_id || '', timestamp: r.created_at,
      })),
    }, {
      headers: { 'Set-Cookie': sessionCookie({ token, expiresAt }) },
    });
  }

  if (action === 'update') {
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'not_authenticated' }, { status: 401 });
    const fullName = String(body.fullName || user.full_name).trim();
    const phone = body.phone !== undefined ? String(body.phone || '').trim() : user.phone;
    const bio = body.bio !== undefined ? String(body.bio || '') : user.bio;
    await env.DB.prepare(
      `UPDATE users SET full_name = ?1, phone = ?2, bio = ?3 WHERE id = ?4`
    ).bind(fullName, phone, bio, user.id).run();
    const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(user.id).first<Record<string, any>>();
    return json({ ok: true, profile: publicUserShape(row!) });
  }

  return json({ ok: false, error: 'اکشن نامعتبر است.' }, { status: 400 });
};
