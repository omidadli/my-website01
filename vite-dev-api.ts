import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { createHmac, randomBytes } from 'node:crypto';
import {
  buildDigest,
  buildSoulPrompt,
  buildSourcesBlock,
  localAnswer,
  retrieveSources,
  type SourceHit,
} from './lib/assistant';
import {
  TOOLS,
  getTool,
  buildToolSystemPrompt,
  resolveBehavior,
  callAiProvider,
  callAiProviderWithFailover,
  testSingleKey,
  localToolAnswer,
  normalizePhone,
  normalizeCode,
  isValidIranMobile,
  genCode,
  signAccessToken,
  verifyAccessToken,
  scopeCovers,
  maskKey,
  createDefaultProductKeys,
  type AiSettings,
  type ToolApiKeyEntry,
} from './lib/tools';
import { getPlan, resolveFreeTrial } from './lib/toolPlans';
import { publicContentView } from './lib/contentVisibility';
import {
  PERSONAL_INFO,
  SERVICES,
  CASE_STUDIES,
  PRODUCTS,
  PROJECTS_PAGE_DATA,
  BLOG_POSTS,
  CHAT_CONFIG,
  HOMEPAGE_HOW_I_WORK_STEPS,
  HOW_I_WORK_STEPS,
} from './src/data/content';

// Dev parity with production: when the CMS has not saved content to
// .dev-content.json yet, the chat brain falls back to the SAME seed content
// the dev site renders from (src/data/content.ts — see ContentContext).
const seedData = {
  PERSONAL_INFO,
  SERVICES,
  CASE_STUDIES,
  PRODUCTS,
  PROJECTS_PAGE_DATA,
  BLOG_POSTS,
  CHAT_CONFIG,
  HOMEPAGE_HOW_I_WORK_STEPS,
  HOW_I_WORK_STEPS,
};

// Local dev persistent storage files
const CONTENT_FILE = path.resolve(process.cwd(), '.dev-content.json');
const COMMENTS_FILE = path.resolve(process.cwd(), '.dev-comments.json');
const MEDIA_FILE = path.resolve(process.cwd(), '.dev-media.json');
const MEDIA_FILES_FILE = path.resolve(process.cwd(), '.dev-media-files.json');
const LEADS_FILE = path.resolve(process.cwd(), '.dev-leads.json');
const TOOL_ACCESS_FILE = path.resolve(process.cwd(), '.dev-tool-access.json');
const TOOL_MSGS_FILE = path.resolve(process.cwd(), '.dev-tool-msgs.json');
const TOOL_SETTINGS_FILE = path.resolve(process.cwd(), '.dev-tool-settings.json');
const TOOL_TRIALS_FILE = path.resolve(process.cwd(), '.dev-tool-trials.json');
const USERS_FILE = path.resolve(process.cwd(), '.dev-users.json');
const USER_SESSIONS_FILE = path.resolve(process.cwd(), '.dev-user-sessions.json');
// Dev-only signing secret for AI-tool access tokens (prod uses env.AUTH_SECRET).
const DEV_TOOL_SECRET = process.env.AUTH_SECRET || 'dev-tool-secret-v1';
const DEV_USER_SECRET = process.env.AUTH_SECRET || 'dev-user-secret-v1';
const devAdminTokens = new Map<string, number>();
// Mirror of MAX_CONTENT_BYTES in functions/api/_shared.ts. D1 caps a row at 2 MB, so the live API
// answers 413 above this. The emulator must refuse the same payloads, otherwise an oversized save
// "works" in dev and then silently fails on the real site.
const MAX_CONTENT_BYTES = 1_900_000;
const CONTENT_TOO_LARGE_MESSAGE =
  'حجم محتوا بیش از حد مجاز (حدود ۱.۹ مگابایت) است. تصاویر را به‌جای درج مستقیم (base64) از «کتابخانهٔ رسانه» آپلود کنید و متن‌های خیلی بلند را کوتاه کنید.';
const USER_SESSION_COOKIE = 'nd_session';
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isDevAdminRequest = (req: import('http').IncomingMessage): boolean => {
  const authorization = String(req.headers['authorization'] || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7).trim();
  if (token === 'dev-admin') return true;
  const expiresAt = devAdminTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    devAdminTokens.delete(token);
    return false;
  }
  return true;
};

const issueDevAdminToken = (): { token: string; expiresAt: number } => {
  const expiresAt = Date.now() + 7 * 86400_000;
  const token = `dev-${crypto.randomUUID()}`;
  devAdminTokens.set(token, expiresAt);
  return { token, expiresAt };
};

/* ---------------------- Dev user auth helpers ---------------------- */
interface DevUser {
  id: string;
  fullName: string;
  loginId: string;
  loginType: 'email' | 'phone';
  email: string;
  phone: string;
  passwordHash: string;
  passwordSalt: string;
  avatarUrl: string;
  bio: string;
  createdAt: string;
  lastLoginAt?: string;
}
interface DevSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: number;
}

const randomHex = (bytes = 32): string => randomBytes(bytes).toString('hex');

const normalizeLoginId = (raw: string): { id: string; type: 'email' | 'phone' } => {
  const v = String(raw || '').trim();
  const digits = v.replace(/[^\d+]/g, '');
  if (/^(\+98|0)?9\d{9}$/.test(digits)) {
    return { id: digits.replace(/^\+98/, '0'), type: 'phone' };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { id: v.toLowerCase(), type: 'email' };
  return { id: v.toLowerCase(), type: /@/.test(v) ? 'email' : 'phone' };
};

const devHashPassword = (password: string, salt: string): string => {
  // Iterated HMAC-SHA256 — for dev-only persistent storage. Prod uses PBKDF2-SHA256 via WebCrypto.
  let h = salt + ':' + DEV_USER_SECRET;
  for (let i = 0; i < 5000; i++) h = createHmac('sha256', DEV_USER_SECRET).update(h + password).digest('hex');
  return h;
};

const newDevId = () => `${Date.now().toString(36)}-${randomHex(6)}`;

const loadDevUsers = (): DevUser[] => safeReadJson<DevUser[]>(USERS_FILE, []);
const saveDevUsers = (u: DevUser[]) => safeWriteJson(USERS_FILE, u);
const loadDevSessions = (): DevSession[] => {
  const arr = safeReadJson<DevSession[]>(USER_SESSIONS_FILE, []);
  // GC expired
  const now = Date.now();
  const alive = arr.filter((s) => s.expiresAt > now);
  if (alive.length !== arr.length) saveDevSessions(alive);
  return alive;
};
const saveDevSessions = (s: DevSession[]) => safeWriteJson(USER_SESSIONS_FILE, s);

const getDevSessionUser = (req: import('http').IncomingMessage): DevUser | null => {
  const cookie = String(req.headers.cookie || '');
  const m = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${USER_SESSION_COOKIE}=`));
  if (!m) return null;
  const token = decodeURIComponent(m.split('=').slice(1).join('='));
  const sessions = loadDevSessions();
  const s = sessions.find((x) => x.token === token && x.expiresAt > Date.now());
  if (!s) return null;
  return loadDevUsers().find((u) => u.id === s.userId) || null;
};

const setSessionCookie = (res: import('http').ServerResponse, token: string, expiresAt: number) => {
  const val = encodeURIComponent(token);
  const expires = new Date(expiresAt).toUTCString();
  res.setHeader('Set-Cookie', `${USER_SESSION_COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}; Max-Age=${Math.floor(USER_SESSION_TTL_MS / 1000)}`);
};

const clearSessionCookie = (res: import('http').ServerResponse) => {
  res.setHeader('Set-Cookie', `${USER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`);
};

const safeReadJson = <T>(file: string, fallback: T): T => {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8');
      return JSON.parse(data) as T;
    }
  } catch {
    /* ignore corrupted files */
  }
  return fallback;
};

const safeWriteJson = (file: string, data: unknown) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[dev-api] Failed to save state to', file, err);
  }
};

const FA_MAP: Record<string, string> = {
  'آ': 'a', 'ا': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'و': 'o', 'ه': 'h', 'ة': 'h', 'ی': 'i', 'ي': 'i', 'ئ': 'i', 'ؤ': 'o',
  '‌': '-', ' ': '-',
};

const transliterate = (input: string): string =>
  Array.from(input || '')
    .map((ch) => FA_MAP[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '-'))
    .join('');

const cleanSlug = (input: string): string =>
  (input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 7)
    .join('-');

/**
 * NOTE: the assistant's brain (digest, article RAG, soul prompt, act protocol,
 * local matcher) lives in ./lib/assistant.ts — shared with functions/api/chat.ts
 * so local dev and production behave identically.
 */

export function cmsDevApiPlugin(): Plugin {
  return {
    name: 'cms-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url || '';
        if (!reqUrl.startsWith('/api')) {
          return next();
        }

        const url = new URL(reqUrl, 'http://localhost:3000');
        const pathname = url.pathname;
        const method = req.method?.toUpperCase() || '';

        const sendJson = (body: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          // Lets the admin UI say plainly that this is the local emulator, not the live site.
          res.setHeader('X-CMS-Backend', 'dev-emulator');
          res.end(JSON.stringify(body));
        };

        const readRawBody = async (): Promise<Buffer> => new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          let size = 0;
          req.on('data', (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.length;
            if (size > 12 * 1024 * 1024) {
              reject(new Error('Request body too large'));
              req.destroy();
              return;
            }
            chunks.push(bytes);
          });
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
        });

        const readBody = async (): Promise<any> => {
          try {
            const data = await readRawBody();
            return data.length ? JSON.parse(data.toString('utf8')) : {};
          } catch {
            return {};
          }
        };

        const readFormData = async (): Promise<FormData> => {
          const contentType = req.headers['content-type'];
          if (!contentType || !String(contentType).toLowerCase().startsWith('multipart/form-data')) {
            throw new Error('Expected multipart form data');
          }
          const body = await readRawBody();
          const headers = new Headers({ 'Content-Type': String(contentType) });
          return new Request(url.href, { method: 'POST', headers, body }).formData();
        };

        try {
          // --- 1. /api/content ---
          if (pathname === '/api/content') {
            if (method === 'GET') {
              const saved = safeReadJson<{ data: any; updatedAt: string } | null>(CONTENT_FILE, null);
              const isAdmin = isDevAdminRequest(req);
              const raw = saved?.data;
              const localComments = safeReadJson<any[]>(COMMENTS_FILE, []);
              const merged = raw && typeof raw === 'object' && !Array.isArray(raw)
                ? { ...raw, BLOG_COMMENTS: [
                    ...(Array.isArray(raw.BLOG_COMMENTS) ? raw.BLOG_COMMENTS.filter((c: any) => c && !String(c.id || '').startsWith('c-')) : []),
                    ...localComments,
                  ] }
                : raw;
              return sendJson({ ok: true, data: isAdmin ? merged : publicContentView(merged), updatedAt: saved?.updatedAt || null });
            }
            if (method === 'PUT') {
              if (!isDevAdminRequest(req)) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const body = await readBody();
              if (typeof body.baseUpdatedAt === 'string') {
                // Optimistic concurrency (mirrors functions/api/content.ts).
                const saved = safeReadJson<{ data: any; updatedAt: string } | null>(CONTENT_FILE, null);
                const current = saved?.updatedAt || '';
                if (current !== body.baseUpdatedAt) {
                  return sendJson({ ok: false, code: 'conflict', error: 'محتوا از زمانی که آن را خوانده‌اید تغییر کرده است؛ دوباره بخوانید و تغییر را اعمال کنید.', updatedAt: current || null }, 409);
                }
              }
              const now = new Date().toISOString();
              const nextData = body.data && typeof body.data === 'object'
                ? { ...body.data, BLOG_COMMENTS: Array.isArray(body.data.BLOG_COMMENTS)
                    ? body.data.BLOG_COMMENTS.filter((comment: any) => !String(comment?.id || '').startsWith('c-'))
                    : [] }
                : null;
              if (nextData && Buffer.byteLength(JSON.stringify(nextData), 'utf8') > MAX_CONTENT_BYTES) {
                return sendJson({ ok: false, error: CONTENT_TOO_LARGE_MESSAGE }, 413);
              }
              const payload = { data: nextData, updatedAt: now };
              safeWriteJson(CONTENT_FILE, payload);
              return sendJson({ ok: true, updatedAt: now });
            }
          }

          // --- 2. /api/auth ---
          if (pathname === '/api/auth') {
            if (method === 'POST') {
              const body = await readBody();
              const username = String(body.username || '').trim();
              const password = String(body.password || '');
              const expectedUser = process.env.ADMIN_USERNAME || 'admin';
              const expectedPass = process.env.ADMIN_PASSWORD || 'admin';
              if (username === expectedUser && (password === expectedPass || password === '1234')) {
                return sendJson({ ok: true, ...issueDevAdminToken() });
              }
              return sendJson({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است.' }, 401);
            }
            if (method === 'GET') {
              if (isDevAdminRequest(req)) return sendJson({ ok: true, username: 'admin' });
              return sendJson({ ok: false, error: 'جلسه نامعتبر است.' }, 401);
            }
          }

          // --- 2b. /api/user?action=...  (public site user accounts) ---
          if (pathname === '/api/user') {
            if (method === 'GET') {
              const u = getDevSessionUser(req);
              if (!u) return sendJson({ ok: false, error: 'not_authenticated' }, 401);
              return sendJson({
                ok: true,
                profile: { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, avatarUrl: u.avatarUrl, bio: u.bio, joinedAt: u.createdAt },
                savedArticles: safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-saved.json'), []).filter((x) => x.userId === u.id),
                subscriptions: safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-subs.json'), []).filter((x) => x.userId === u.id),
                consultations: safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-consults.json'), []).filter((x) => x.userId === u.id),
                activities: safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-activities.json'), []).filter((x) => x.userId === u.id).slice(0, 50),
              });
            }
            if (method === 'POST') {
              const body = await readBody();
              const action = url.searchParams.get('action') || 'login';

              if (action === 'logout') {
                const cookie = String(req.headers.cookie || '');
                const m = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${USER_SESSION_COOKIE}=`));
                if (m) {
                  const token = decodeURIComponent(m.split('=').slice(1).join('='));
                  const sessions = loadDevSessions().filter((s) => s.token !== token);
                  saveDevSessions(sessions);
                }
                clearSessionCookie(res);
                return sendJson({ ok: true });
              }

              if (action === 'register') {
                const fullName = String(body.fullName || '').trim();
                // Support both separate email/phone fields AND the combined emailOrPhone field.
                const emailVal = String(body.email || '').trim();
                const phoneVal = String(body.phone || '').trim();
                const loginRaw = String(body.emailOrPhone || emailVal || phoneVal || '').trim();
                const password = String(body.password || '');
                if (!fullName || fullName.length < 2) return sendJson({ ok: false, error: 'لطفاً نام و نام خانوادگی را وارد کنید.' }, 400);
                if (!loginRaw) return sendJson({ ok: false, error: 'لطفاً ایمیل یا شماره تلفن را وارد کنید.' }, 400);
                if (!password || password.length < 6) return sendJson({ ok: false, error: 'رمز ورود باید حداقل ۶ کاراکتر باشد.' }, 400);
                const { id: loginId, type: loginType } = normalizeLoginId(loginRaw);
                const users = loadDevUsers();
                if (users.some((u) => u.loginId === loginId)) {
                  return sendJson({ ok: false, error: 'این ایمیل یا شماره قبلاً ثبت نام کرده است. لطفاً وارد شوید.' }, 409);
                }
                const salt = randomHex(16);
                const uid = newDevId();
                const now = new Date().toISOString();
                const user: DevUser = {
                  id: uid,
                  fullName,
                  loginId,
                  loginType,
                  email: loginType === 'email' ? loginId : '',
                  phone: loginType === 'phone' ? loginId : '',
                  passwordHash: devHashPassword(password, salt),
                  passwordSalt: salt,
                  avatarUrl: '',
                  bio: '',
                  createdAt: now,
                };
                users.push(user);
                saveDevUsers(users);
                // Seed demo sub
                const subs = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-subs.json'), []);
                subs.unshift({
                  id: newDevId(),
                  userId: uid,
                  productName: 'حساب کاربری امید عدلی',
                  planName: 'کاربر جدید',
                  status: 'active',
                  price: 'رایگان',
                  startDate: now,
                  endDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
                  autoRenew: true,
                  features: ['دسترسی به لیست مقالات ذخیره شده', 'ثبت درخواست مشاوره', 'پیگیری وضعیت درخواست‌ها'],
                });
                safeWriteJson(path.resolve(process.cwd(), '.dev-user-subs.json'), subs);
                const acts = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-activities.json'), []);
                acts.unshift({ id: newDevId(), userId: uid, type: 'subscription_started', description: 'حساب کاربری شما ایجاد شد', timestamp: now });
                safeWriteJson(path.resolve(process.cwd(), '.dev-user-activities.json'), acts);
                const expiresAt = Date.now() + USER_SESSION_TTL_MS;
                const token = randomHex(32);
                const sessions = loadDevSessions();
                sessions.push({ token, userId: uid, createdAt: now, expiresAt });
                saveDevSessions(sessions);
                setSessionCookie(res, token, expiresAt);
                const saved = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-saved.json'), []).filter((x) => x.userId === uid);
                const userSubs = subs.filter((x) => x.userId === uid);
                const userActs = acts.filter((x) => x.userId === uid);
                const cons = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-consults.json'), []).filter((x) => x.userId === uid);
                return sendJson({
                  ok: true,
                  profile: { id: uid, fullName, email: user.email, phone: user.phone, avatarUrl: '', bio: '', joinedAt: now },
                  savedArticles: saved,
                  subscriptions: userSubs.map((s) => ({
                    id: s.id, productId: s.productId || '', productName: s.productName, planId: s.planId || '', planName: s.planName,
                    status: s.status, startDate: s.startDate, endDate: s.endDate, price: s.price || '', autoRenew: !!s.autoRenew, features: s.features || [],
                  })),
                  consultations: cons.map((c) => ({
                    id: c.id, subject: c.subject, message: c.message, serviceId: c.serviceId || '', serviceName: c.serviceName || '',
                    status: c.status, adminNotes: c.adminNotes || '', scheduledDate: c.scheduledDate || '', scheduledTime: c.scheduledTime || '',
                    createdAt: c.createdAt, updatedAt: c.updatedAt,
                  })),
                  activities: userActs.map((a) => ({ id: a.id, type: a.type, description: a.description, relatedId: a.relatedId || '', timestamp: a.timestamp })),
                });
              }

              if (action === 'login') {
                const loginRaw = String(body.emailOrPhone || body.email || body.phone || body.username || '').trim();
                const password = String(body.password || '');
                if (!loginRaw || !password) return sendJson({ ok: false, error: 'ایمیل/شماره و رمز عبور را وارد کنید.' }, 400);
                const { id: loginId } = normalizeLoginId(loginRaw);
                const users = loadDevUsers();
                const user = users.find((u) => u.loginId === loginId);
                if (!user) return sendJson({ ok: false, error: 'کاربری با این ایمیل/شماره یافت نشد.' }, 401);
                const hash = devHashPassword(password, user.passwordSalt);
                let diff = 0;
                const a = hash, b = user.passwordHash;
                if (a.length !== b.length) diff = 1;
                const len = Math.min(a.length, b.length);
                for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
                if (diff !== 0) return sendJson({ ok: false, error: 'رمز عبور اشتباه است.' }, 401);
                user.lastLoginAt = new Date().toISOString();
                saveDevUsers(users);
                const expiresAt = Date.now() + USER_SESSION_TTL_MS;
                const token = randomHex(32);
                const sessions = loadDevSessions();
                sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt });
                saveDevSessions(sessions);
                setSessionCookie(res, token, expiresAt);
                const saved = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-saved.json'), []).filter((x) => x.userId === user.id);
                const subs = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-subs.json'), []).filter((x) => x.userId === user.id);
                const cons = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-consults.json'), []).filter((x) => x.userId === user.id);
                const acts = safeReadJson<any[]>(path.resolve(process.cwd(), '.dev-user-activities.json'), []).filter((x) => x.userId === user.id).slice(0, 50);
                return sendJson({
                  ok: true,
                  profile: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, bio: user.bio, joinedAt: user.createdAt },
                  savedArticles: saved,
                  subscriptions: subs.map((s) => ({
                    id: s.id, productId: s.productId || '', productName: s.productName, planId: s.planId || '', planName: s.planName,
                    status: s.status, startDate: s.startDate, endDate: s.endDate, price: s.price || '', autoRenew: !!s.autoRenew, features: s.features || [],
                  })),
                  consultations: cons.map((c) => ({
                    id: c.id, subject: c.subject, message: c.message, serviceId: c.serviceId || '', serviceName: c.serviceName || '',
                    status: c.status, adminNotes: c.adminNotes || '', scheduledDate: c.scheduledDate || '', scheduledTime: c.scheduledTime || '',
                    createdAt: c.createdAt, updatedAt: c.updatedAt,
                  })),
                  activities: acts.map((a) => ({ id: a.id, type: a.type, description: a.description, relatedId: a.relatedId || '', timestamp: a.timestamp })),
                });
              }

              if (action === 'update') {
                const u = getDevSessionUser(req);
                if (!u) return sendJson({ ok: false, error: 'not_authenticated' }, 401);
                const users = loadDevUsers();
                const idx = users.findIndex((x) => x.id === u.id);
                if (idx < 0) return sendJson({ ok: false, error: 'user_not_found' }, 404);
                users[idx].fullName = String(body.fullName ?? u.fullName).trim();
                users[idx].phone = body.phone !== undefined ? String(body.phone || '').trim() : u.phone;
                users[idx].bio = body.bio !== undefined ? String(body.bio || '') : u.bio;
                saveDevUsers(users);
                return sendJson({ ok: true, profile: { id: users[idx].id, fullName: users[idx].fullName, email: users[idx].email, phone: users[idx].phone, avatarUrl: users[idx].avatarUrl, bio: users[idx].bio, joinedAt: users[idx].createdAt } });
              }
            }
          }

          // --- 3. /api/chat ---
          if (pathname === '/api/chat') {
            if (method === 'GET') {
              return sendJson({ ok: true, items: [] });
            }
            if (method === 'POST') {
              const body = await readBody();
              const messages: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages : [];
              const question = String(messages[messages.length - 1]?.content || '').trim();
              if (!question) {
                return sendJson({ ok: false, error: 'سوال خالی است.' }, 400);
              }

              const mc = body?.mascot || {};
              const mcName = String(mc.name || '').trim().slice(0, 40);
              const mcPage = String(mc.page || 'home').slice(0, 30);
              const mcDaypart = String(mc.daypart || '').slice(0, 12);
              const mcBody = String(mc.bodyState || '').slice(0, 300);

              const saved = safeReadJson<{ data: any } | null>(CONTENT_FILE, null);
              const data = saved?.data || seedData;
              const cfg = {
                persona: data?.CHAT_CONFIG?.persona || 'شما مسکات هوشمند و منتور ارشد پرفورمنس مارکتینگ و CRO امید عدلی هستید؛ با لحن بسیار حرفه‌ای، خوش‌برخورد، داده‌محور و راهگشا پاسخ دهید.',
                ctaText: data?.CHAT_CONFIG?.ctaText || 'برای مشاوره مستقیم یا بررسی پروژه، از منوی بالای سایت با امید عدلی تماس بگیرید.',
                fallbackMessage: data?.CHAT_CONFIG?.fallbackMessage || 'پاسخ دقیقی در محتوای سایت برای این مورد نیافتم؛ لطفاً مستقیماً از بخش تماس پیام دهید.',
              };

              // The AI's ground truth: digest of ALL site content…
              const digest = buildDigest(data);
              // …plus RAG: full text of the articles this question touches.
              const sources: SourceHit[] = retrieveSources(data, question, 3);
              const sourcesBlock = buildSourcesBlock(sources);

              const soulPrompt = buildSoulPrompt({
                persona: cfg.persona,
                name: mcName,
                page: mcPage,
                daypart: mcDaypart,
                bodyState: mcBody,
                digest,
                sources: sourcesBlock || undefined,
              });

              let answer = '';
              let mode: 'ai' | 'local' = 'local';

              const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
              if (geminiKey) {
                const history = messages.slice(0, -1).filter((m) => m.role === 'user' || m.role === 'model').map((m) => ({
                  role: m.role === 'user' ? 'user' : 'model',
                  parts: [{ text: String(m.content || '').slice(0, 800) }],
                }));

                const headers: Record<string, string> = {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': geminiKey,
                };

                const candidateModels = [
                  'gemini-2.5-flash',
                  'gemini-flash-latest',
                  'gemini-3.5-flash',
                  'gemini-3.1-flash-lite',
                ];

                for (const model of candidateModels) {
                  try {
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                    const gRes = await fetch(geminiUrl, {
                      method: 'POST',
                      headers,
                      signal: AbortSignal.timeout(20000),
                      body: JSON.stringify({
                        systemInstruction: { parts: [{ text: soulPrompt }] },
                        contents: [...history, { role: 'user', parts: [{ text: question }] }],
                        generationConfig: {
                          temperature: 0.6,
                          maxOutputTokens: 600,
                          thinkingConfig: {
                            thinkingBudget: 0,
                          },
                        },
                      }),
                    });

                    if (gRes.ok) {
                      const gj: any = await gRes.json();
                      const parts = gj?.candidates?.[0]?.content?.parts || [];
                      const text = parts.find((p: any) => p?.text && !p?.thought)?.text || parts.find((p: any) => p?.text)?.text || parts[0]?.text;
                      if (text) {
                        answer = text.trim();
                        mode = 'ai';
                        break;
                      }
                    }
                  } catch {
                    // Gracefully continue to fallback model or local engine without raising warnings
                  }
                }
              }

              if (!answer) {
                answer = localAnswer(question, digest, cfg.ctaText, sources);
              }
              if (!answer) {
                answer = `${cfg.fallbackMessage}\n\n${cfg.ctaText}`;
              }
              if (!answer.includes('[[act:')) {
                answer += ' [[act:{"pose":"talking"}]]';
              }

              // Extract the act directive (if any)
              let act: { pose?: string; hold?: number; bubble?: string; then?: string } | undefined;
              try {
                const m = answer.match(/\[\[act:\s*(\{[\s\S]*?\})\s*\]\]/i);
                if (m) {
                  const parsed = JSON.parse(m[1]);
                  act = {
                    pose: typeof parsed.pose === 'string' ? parsed.pose : undefined,
                    hold: typeof parsed.hold === 'number' ? parsed.hold : undefined,
                    bubble: typeof parsed.bubble === 'string' ? parsed.bubble : undefined,
                    then: typeof parsed.then === 'string' ? parsed.then : undefined,
                  };
                  if (!act.pose && !act.bubble) act = undefined;
                }
              } catch {
                act = undefined;
              }

              return sendJson({ ok: true, answer, act, mode, sources: sources.map(({ title, url }) => ({ title, url })) });
            }
          }

          // --- 3b. /api/tools --- (dev mirror of functions/api/tools.ts)
          if (pathname === '/api/tools') {
            const isAdmin = isDevAdminRequest(req);
            type DevGrant = { id: string; phone: string; productId: string; code: string; status: string; maxDevices: number; messageQuota?: number; devices: string[]; note: string; createdAt: string; expiresAt: string };
            const grants = safeReadJson<DevGrant[]>(TOOL_ACCESS_FILE, []);
            type DevTrial = { deviceId: string; productId: string; count: number };
            const usageSinceDev = (phone: string, productId: string, sinceIso: string) => {
              const since = new Date(sinceIso).getTime();
              return safeReadJson<any[]>(TOOL_MSGS_FILE, []).filter((m) => m.phone === phone && m.productId === productId && new Date(m.createdAt).getTime() >= since).length;
            };
            type DevKeyEntry = { id: string; label: string; provider: 'gemini' | 'openai'; baseUrl: string; model: string; apiKey: string; enabled: boolean };
            type DevSettings = { productId: string; provider?: string; baseUrl?: string; model?: string; apiKey?: string; keys?: DevKeyEntry[] };
            const readSettings = () => safeReadJson<DevSettings[]>(TOOL_SETTINGS_FILE, []);
            const contentData = () => (safeReadJson<{ data: any } | null>(CONTENT_FILE, null)?.data || seedData);
            const publicTool = (id: string) => {
              const t = getTool(id);
              if (!t) return null;
              const b = resolveBehavior(t, contentData());
              return { id: t.id, name: t.name, welcome: b.welcome, suggestions: b.suggestions, placeholder: b.placeholder };
            };

            const getProductKeys = (productId: string): DevKeyEntry[] => {
              const rows = readSettings();
              const row = rows.find((s) => s.productId === productId);
              const defaults: DevKeyEntry[] = [
                { id: 'key-1', label: 'کلید اصلی (Primary)', provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: '', apiKey: '', enabled: true },
                { id: 'key-2', label: 'کلید پشتیبان اول (Backup 1)', provider: 'gemini', model: 'gemini-flash-latest', baseUrl: '', apiKey: '', enabled: true },
                { id: 'key-3', label: 'کلید پشتیبان دوم (Backup 2)', provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', apiKey: '', enabled: true },
              ];
              if (row?.keys && Array.isArray(row.keys) && row.keys.length > 0) {
                const res: DevKeyEntry[] = [];
                for (let i = 0; i < 3; i++) {
                  const item = row.keys.find((k) => k.id === `key-${i + 1}`) || row.keys[i];
                  res.push({
                    id: `key-${i + 1}`,
                    label: item?.label || defaults[i].label,
                    provider: item?.provider === 'openai' ? 'openai' : 'gemini',
                    baseUrl: String(item?.baseUrl || defaults[i].baseUrl || '').trim(),
                    model: String(item?.model || defaults[i].model || '').trim(),
                    apiKey: String(item?.apiKey || '').trim(),
                    enabled: item?.enabled !== false,
                  });
                }
                return res;
              }
              // Legacy single key migration
              if (row && (row.apiKey || row.provider || row.model)) {
                return [
                  {
                    id: 'key-1',
                    label: 'کلید اصلی (Primary)',
                    provider: row.provider === 'openai' ? 'openai' : 'gemini',
                    baseUrl: row.baseUrl || '',
                    model: row.model || (row.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'),
                    apiKey: row.apiKey || '',
                    enabled: true,
                  },
                  defaults[1],
                  defaults[2],
                ];
              }
              return defaults;
            };

            if (method === 'GET') {
              if (!isAdmin) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const view = url.searchParams.get('view');
              if (view === 'messages') {
                const msgs = safeReadJson<any[]>(TOOL_MSGS_FILE, []);
                return sendJson({ ok: true, items: msgs.slice(0, 200).map((m) => ({ id: m.id, phone: m.phone, product_id: m.productId, question: m.question, answer: m.answer, created_at: m.createdAt })) });
              }
              if (view === 'settings') {
                const rows = readSettings();
                const envKey = (process.env.GEMINI_API_KEY || '').trim();
                const items = TOOLS.map((t) => {
                  const row = rows.find((x) => x.productId === t.id);
                  const keys = getProductKeys(t.id);
                  const publicKeys = keys.map((k) => ({
                    id: k.id,
                    label: k.label,
                    provider: k.provider,
                    baseUrl: k.baseUrl,
                    model: k.model,
                    hasKey: !!(k.apiKey || '').trim(),
                    keyMask: maskKey(k.apiKey || ''),
                    enabled: k.enabled,
                  }));
                  const hasAnyKey = publicKeys.some((k) => k.hasKey && k.enabled);
                  return {
                    productId: t.id,
                    name: t.name,
                    provider: keys[0]?.provider || 'gemini',
                    baseUrl: keys[0]?.baseUrl || '',
                    model: keys[0]?.model || '',
                    hasKey: hasAnyKey,
                    keyMask: publicKeys[0]?.keyMask || '',
                    usingEnvFallback: !hasAnyKey && !!envKey,
                    keys: publicKeys,
                  };
                });
                return sendJson({ ok: true, items, envKeyPresent: !!envKey });
              }
              return sendJson({ ok: true, items: grants.map((g) => ({ ...g, devicesUsed: g.devices.length })) });
            }

            if (method === 'POST') {
              const body = await readBody();
              const action = String(body?.action || '');

              // ---- ADMIN ----
              if (action === 'grant' || action === 'revoke' || action === 'resetDevices' || action === 'setKey' || action === 'setProductKeys' || action === 'testKey' || action === 'clearKey') {
                if (!isAdmin) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);

                if (action === 'testKey') {
                  const productId = String(body.productId || '');
                  const keyIndex = parseInt(String(body.keyIndex ?? '0'), 10);
                  const existingKeys = getProductKeys(productId);
                  const currentKey = existingKeys[keyIndex] || existingKeys[0];
                  const provider = body.provider === 'openai' ? 'openai' : (body.provider === 'gemini' ? 'gemini' : (currentKey?.provider || 'gemini'));
                  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : currentKey?.baseUrl;
                  const model = typeof body.model === 'string' ? body.model.trim() : currentKey?.model;
                  const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) ? body.apiKey.trim() : (currentKey?.apiKey || '');

                  if (!apiKey) {
                    return sendJson({ ok: false, error: 'کلید API برای این اسلات تنظیم نشده است.' }, 400);
                  }
                  const result = await testSingleKey({ provider, apiKey, baseUrl, model });
                  return sendJson(result);
                }

                if (action === 'setProductKeys') {
                  const productId = String(body.productId || '');
                  if (!getTool(productId)) return sendJson({ ok: false, error: 'محصول نامعتبر است.' }, 400);
                  const incomingKeys: any[] = Array.isArray(body.keys) ? body.keys : [];
                  const existingKeys = getProductKeys(productId);
                  const nextKeys: DevKeyEntry[] = [];
                  for (let i = 0; i < 3; i++) {
                    const inc: any = incomingKeys.find((k: any) => k.id === `key-${i + 1}`) || incomingKeys[i] || {};
                    const ext: Partial<DevKeyEntry> = existingKeys[i] || {};
                    const newKey = typeof inc.apiKey === 'string' ? inc.apiKey.trim() : '';
                    const apiKey = inc.clearKey ? '' : (newKey || ext.apiKey || '');
                    nextKeys.push({
                      id: `key-${i + 1}`,
                      label: String(inc.label || ext.label || (i === 0 ? 'کلید اصلی (Primary)' : `کلید پشتیبان ${i}`)),
                      provider: inc.provider === 'openai' ? 'openai' : 'gemini',
                      baseUrl: String(inc.baseUrl ?? ext.baseUrl ?? '').trim().slice(0, 200),
                      model: String(inc.model ?? ext.model ?? '').trim().slice(0, 80),
                      apiKey,
                      enabled: inc.enabled !== false,
                    });
                  }
                  const rows = readSettings();
                  const idx = rows.findIndex((s) => s.productId === productId);
                  const next: DevSettings = {
                    productId,
                    provider: nextKeys[0].provider,
                    baseUrl: nextKeys[0].baseUrl,
                    model: nextKeys[0].model,
                    apiKey: nextKeys[0].apiKey,
                    keys: nextKeys,
                  };
                  if (idx >= 0) rows[idx] = next; else rows.push(next);
                  safeWriteJson(TOOL_SETTINGS_FILE, rows);
                  return sendJson({
                    ok: true,
                    keys: nextKeys.map((k) => ({
                      id: k.id,
                      label: k.label,
                      provider: k.provider,
                      baseUrl: k.baseUrl,
                      model: k.model,
                      hasKey: !!k.apiKey,
                      keyMask: maskKey(k.apiKey || ''),
                      enabled: k.enabled,
                    })),
                  });
                }

                if (action === 'setKey') {
                  const productId = String(body.productId || '');
                  if (!getTool(productId)) return sendJson({ ok: false, error: 'محصول نامعتبر است.' }, 400);
                  const keyIndex = Math.max(0, Math.min(2, parseInt(String(body.keyIndex ?? '0'), 10)));
                  const existingKeys = getProductKeys(productId);
                  const provider = body.provider === 'openai' ? 'openai' : 'gemini';
                  const baseUrl = String(body.baseUrl || '').trim().slice(0, 200);
                  const model = String(body.model || '').trim().slice(0, 80);
                  const newKey = String(body.apiKey || '').trim();
                  const target = existingKeys[keyIndex];
                  const apiKey = newKey || target.apiKey || '';
                  target.provider = provider;
                  target.baseUrl = baseUrl;
                  target.model = model;
                  target.apiKey = apiKey;
                  if (typeof body.enabled === 'boolean') target.enabled = body.enabled;
                  if (body.label) target.label = String(body.label);

                  const rows = readSettings();
                  const idx = rows.findIndex((s) => s.productId === productId);
                  const next: DevSettings = {
                    productId,
                    provider: existingKeys[0].provider,
                    baseUrl: existingKeys[0].baseUrl,
                    model: existingKeys[0].model,
                    apiKey: existingKeys[0].apiKey,
                    keys: existingKeys,
                  };
                  if (idx >= 0) rows[idx] = next; else rows.push(next);
                  safeWriteJson(TOOL_SETTINGS_FILE, rows);
                  return sendJson({ ok: true, hasKey: !!apiKey, keyMask: maskKey(apiKey) });
                }
                if (action === 'clearKey') {
                  const productId = String(body.productId || '');
                  const keyIndex = body.keyIndex !== undefined ? parseInt(String(body.keyIndex), 10) : -1;
                  if (keyIndex >= 0 && keyIndex < 3) {
                    const existingKeys = getProductKeys(productId);
                    existingKeys[keyIndex].apiKey = '';
                    const rows = readSettings();
                    const idx = rows.findIndex((s) => s.productId === productId);
                    const next: DevSettings = {
                      productId,
                      provider: existingKeys[0].provider,
                      baseUrl: existingKeys[0].baseUrl,
                      model: existingKeys[0].model,
                      apiKey: existingKeys[0].apiKey,
                      keys: existingKeys,
                    };
                    if (idx >= 0) rows[idx] = next; else rows.push(next);
                    safeWriteJson(TOOL_SETTINGS_FILE, rows);
                    return sendJson({ ok: true });
                  }
                  safeWriteJson(TOOL_SETTINGS_FILE, readSettings().filter((s) => s.productId !== productId));
                  return sendJson({ ok: true });
                }
                if (action === 'grant') {
                  const phone = normalizePhone(String(body.phone || ''));
                  if (!isValidIranMobile(phone)) return sendJson({ ok: false, error: 'شماره موبایل معتبر نیست (مثال: 09xxxxxxxxx).' }, 400);
                  const productId = String(body.productId || 'all');
                  if (productId !== 'all' && !getTool(productId)) return sendJson({ ok: false, error: 'محصول نامعتبر است.' }, 400);
                  const plan = productId !== 'all' ? getPlan(productId, String(body.planId || '')) : undefined;
                  const days = Math.max(1, Math.min(3650, parseInt(String(body.days ?? plan?.durationDays ?? 30), 10) || 30));
                  const maxDevices = Math.max(1, Math.min(20, parseInt(String(body.maxDevices ?? plan?.maxDevices ?? 1), 10) || 1));
                  const messageQuota = Math.max(0, parseInt(String(body.messageQuota ?? plan?.messageQuota ?? 0), 10) || 0);
                  const note = String(body.note || '').slice(0, 200);
                  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
                  const existing = grants.find((g) => g.phone === phone && g.productId === productId);
                  const code = existing && !body.newCode ? existing.code : genCode();
                  if (existing) {
                    existing.code = code; existing.status = 'active'; existing.maxDevices = maxDevices; existing.messageQuota = messageQuota; existing.note = note; existing.expiresAt = expiresAt; existing.createdAt = new Date().toISOString();
                    if (body.newCode) existing.devices = [];
                    safeWriteJson(TOOL_ACCESS_FILE, grants);
                    return sendJson({ ok: true, id: existing.id, phone, productId, code, maxDevices, messageQuota, expiresAt, refreshed: true });
                  }
                  const id = `ta-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
                  grants.unshift({ id, phone, productId, code, status: 'active', maxDevices, messageQuota, devices: [], note, createdAt: new Date().toISOString(), expiresAt });
                  safeWriteJson(TOOL_ACCESS_FILE, grants);
                  return sendJson({ ok: true, id, phone, productId, code, maxDevices, messageQuota, expiresAt });
                }
                if (action === 'revoke') {
                  const g = grants.find((x) => x.id === String(body.id || '')); if (g) g.status = 'revoked';
                  safeWriteJson(TOOL_ACCESS_FILE, grants); return sendJson({ ok: true });
                }
                if (action === 'resetDevices') {
                  const g = grants.find((x) => x.id === String(body.id || '')); if (g) g.devices = [];
                  safeWriteJson(TOOL_ACCESS_FILE, grants); return sendJson({ ok: true });
                }
              }

              // ---- unlock ----
              if (action === 'unlock') {
                const phone = normalizePhone(String(body.phone || ''));
                const code = normalizeCode(String(body.code || ''));
                const productId = String(body.productId || '');
                const deviceId = String(body.deviceId || '').slice(0, 80);
                if (!isValidIranMobile(phone)) return sendJson({ ok: false, error: 'شماره موبایل معتبر نیست.' }, 400);
                if (!code) return sendJson({ ok: false, error: 'کد دسترسی را وارد کنید.' }, 400);
                if (!deviceId) return sendJson({ ok: false, error: 'شناسه دستگاه نامعتبر است.' }, 400);
                if (!getTool(productId)) return sendJson({ ok: false, error: 'محصول نامعتبر است.' }, 400);
                const grant = grants.find((g) => g.phone === phone && g.code === code && g.status === 'active' && scopeCovers(g.productId, productId));
                if (!grant) return sendJson({ ok: false, error: 'شماره یا کد دسترسی درست نیست. اگر خرید کرده‌ای، از پشتیبانی کمک بگیر.' }, 403);
                if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) return sendJson({ ok: false, error: 'دسترسی شما منقضی شده است. برای تمدید پیام بده.' }, 403);
                if (!grant.devices.includes(deviceId)) {
                  if (grant.devices.length >= grant.maxDevices) return sendJson({ ok: false, error: `این دسترسی روی حداکثر تعداد مجازِ دستگاه (${grant.maxDevices}) فعال شده است. برای دستگاه جدید با پشتیبانی هماهنگ کن.` }, 403);
                  grant.devices.push(deviceId); safeWriteJson(TOOL_ACCESS_FILE, grants);
                }
                const exp = grant.expiresAt ? Math.min(new Date(grant.expiresAt).getTime(), Date.now() + 30 * 86400_000) : Date.now() + 30 * 86400_000;
                const token = await signAccessToken({ phone, scope: grant.productId, did: deviceId, gid: grant.id, exp }, DEV_TOOL_SECRET);
                return sendJson({ ok: true, token, expiresAt: new Date(exp).toISOString(), tool: publicTool(productId) });
              }

              // ---- session ----
              if (action === 'session') {
                const productId = String(body.productId || '');
                const deviceId = String(body.deviceId || '');
                const payload = await verifyAccessToken(String(body.token || ''), DEV_TOOL_SECRET);
                if (!payload || !scopeCovers(payload.scope, productId) || (deviceId && payload.did !== deviceId)) return sendJson({ ok: false, error: 'نشست نامعتبر است.' }, 401);
                const grant = grants.find((g) => g.id === payload.gid);
                if (!grant || grant.status !== 'active' || !grant.devices.includes(payload.did)) return sendJson({ ok: false, error: 'دسترسی لغو شده است.' }, 403);
                return sendJson({ ok: true, tool: publicTool(productId) });
              }

              // ---- chat (paid via token, or free-trial via device) ----
              if (action === 'chat') {
                const productId = String(body.productId || '');
                const deviceId = String(body.deviceId || '').slice(0, 80);
                const tool = getTool(productId);
                if (!tool) return sendJson({ ok: false, error: 'محصول نامعتبر است.' }, 400);

                const messages: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
                const question = String(messages[messages.length - 1]?.content || '').trim().slice(0, 2000);
                if (!question) return sendJson({ ok: false, error: 'پیام خالی است.' }, 400);

                const saved = safeReadJson<{ data: any } | null>(CONTENT_FILE, null);
                const data = saved?.data || seedData;

                const payload = await verifyAccessToken(String(body.token || ''), DEV_TOOL_SECRET);
                const paid = !!(payload && scopeCovers(payload.scope, productId) && (!deviceId || payload.did === deviceId));

                let trialInfo: { used: number; remaining: number; limit: number } | undefined;
                let coinInfo: { balance: number; cost: number; initial: number } | undefined;
                let grant: DevGrant | undefined;
                if (!paid) {
                  const limit = resolveFreeTrial(data);
                  const INITIAL_COINS = 500;
                  const COINS_PER_MSG = 150;
                  if (limit <= 0 || !deviceId) return sendJson({ ok: false, error: 'برای استفاده از این ابزار، یکی از پلن‌ها را فعال کن.', code: 'locked' }, 401);
                  const trials = safeReadJson<DevTrial[]>(TOOL_TRIALS_FILE, []);
                  const t = trials.find((x) => x.deviceId === deviceId && x.productId === productId);
                  const used = t?.count || 0;
                  const currentCoins = Math.max(0, INITIAL_COINS - (used * COINS_PER_MSG));

                  if (currentCoins < COINS_PER_MSG) {
                    return sendJson({
                      ok: false,
                      error: `سکه‌های رایگان شما تمام شد (تنها ${currentCoins} سکه در کیف پول باقی مانده است). برای شارژ کیف پول و ارسال پیام، یکی از پلن‌ها را فعال کن.`,
                      code: 'trial_ended',
                      coins: { balance: currentCoins, cost: COINS_PER_MSG, initial: INITIAL_COINS },
                      trial: { used, remaining: 0, limit }
                    }, 402);
                  }
                  const nextCoins = currentCoins - COINS_PER_MSG;
                  coinInfo = { balance: nextCoins, cost: COINS_PER_MSG, initial: INITIAL_COINS };
                  trialInfo = { used: used + 1, remaining: nextCoins >= COINS_PER_MSG ? Math.floor(nextCoins / COINS_PER_MSG) : 0, limit };
                } else {
                  grant = grants.find((g) => g.id === payload!.gid);
                  if (!grant || grant.status !== 'active' || !grant.devices.includes(payload!.did)) return sendJson({ ok: false, error: 'دسترسی شما فعال نیست. با پشتیبانی هماهنگ کن.', code: 'locked' }, 403);
                  if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) return sendJson({ ok: false, error: 'دسترسی شما منقضی شده است.', code: 'expired' }, 403);
                  if (grant.messageQuota && grant.messageQuota > 0) {
                    const used = usageSinceDev(payload!.phone, productId, grant.createdAt);
                    if (used >= grant.messageQuota) return sendJson({ ok: false, error: 'سهمیه‌ی پیام این پلن تمام شد. برای ادامه، پلن را ارتقا بده یا تمدید کن.', code: 'quota', quota: { limit: grant.messageQuota, used, remaining: 0 } }, 402);
                  }
                }

                const behavior = resolveBehavior(tool, data);
                const systemPrompt = buildToolSystemPrompt(tool, data);
                const productKeys = getProductKeys(productId);
                const envKey = (process.env.GEMINI_API_KEY || '').trim();
                const history = messages.slice(0, -1)
                  .filter((m) => m.role === 'user' || m.role === 'model')
                  .map((m) => ({ role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model', content: String(m.content || '') }));
                let answer = '';
                let mode: 'ai' | 'local' = 'local';
                const aiResult = await callAiProviderWithFailover({
                  systemPrompt,
                  history,
                  question,
                  temperature: behavior.temperature,
                  keys: productKeys,
                  preferredModel: behavior.model,
                  envFallbackKey: envKey,
                });
                if (aiResult.text) { answer = aiResult.text; mode = 'ai'; }
                if (!answer) answer = localToolAnswer(tool, question);

                if (!paid && deviceId) {
                  const trials = safeReadJson<DevTrial[]>(TOOL_TRIALS_FILE, []);
                  const idx = trials.findIndex((x) => x.deviceId === deviceId && x.productId === productId);
                  if (idx >= 0) trials[idx].count += 1; else trials.push({ deviceId, productId, count: 1 });
                  safeWriteJson(TOOL_TRIALS_FILE, trials);
                }
                const msgs = safeReadJson<any[]>(TOOL_MSGS_FILE, []);
                msgs.unshift({ id: `tm-${Date.now()}`, phone: paid ? payload!.phone : `trial:${deviceId}`.slice(0, 60), productId, question, answer, createdAt: new Date().toISOString() });
                safeWriteJson(TOOL_MSGS_FILE, msgs.slice(0, 500));

                let quotaInfo: { limit: number; used: number; remaining: number } | undefined;
                if (paid && grant && grant.messageQuota && grant.messageQuota > 0) {
                  const used = usageSinceDev(payload!.phone, productId, grant.createdAt);
                  quotaInfo = { limit: grant.messageQuota, used, remaining: Math.max(0, grant.messageQuota - used) };
                }
                return sendJson({ ok: true, answer, mode, trial: trialInfo, coins: coinInfo, quota: quotaInfo });
              }

              return sendJson({ ok: false, error: 'اکشن نامعتبر است.' }, 400);
            }
          }

          // --- 4. /api/slug ---
          if (pathname === '/api/slug' && method === 'POST') {
            const body = await readBody();
            const title = String(body.title || '').trim();
            if (!title) return sendJson({ ok: false, error: 'عنوان خالی است.' }, 400);

            const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
            if (geminiKey) {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-goog-api-key': geminiKey,
              };

              const candidateModels = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

              for (const model of candidateModels) {
                try {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                  const gRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers,
                    signal: AbortSignal.timeout(8000),
                    body: JSON.stringify({
                      contents: [
                        {
                          role: 'user',
                          parts: [
                            {
                              text: `Translate this Persian page or post title into a short, concise, URL-safe English slug (lowercase English words joined by dashes, max 5 words, no punctuation, no explanations). Reply with ONLY the slug itself:\n\nTitle: ${title}`,
                            },
                          ],
                        },
                      ],
                      generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 150,
                        thinkingConfig: {
                          thinkingBudget: 0,
                        },
                      },
                    }),
                  });
                  if (gRes.ok) {
                    const gj: any = await gRes.json();
                    const parts = gj?.candidates?.[0]?.content?.parts || [];
                    const slugCandidate = parts.find((p: any) => p?.text)?.text?.trim();
                    const cleaned = cleanSlug(slugCandidate || '');
                    if (cleaned) {
                      return sendJson({ ok: true, slug: cleaned, source: 'gemini' });
                    }
                  }
                } catch {
                  // Fall back smoothly to next model or transliteration without console noise
                }
              }
            }

            const fallbackSlug = cleanSlug(transliterate(title)) || 'post';
            return sendJson({ ok: true, slug: fallbackSlug, source: 'translit' });
          }

          // --- 5. /api/leads --- (dev mirror of functions/api/leads.ts)
          if (pathname === '/api/leads') {
            const leads = safeReadJson<any[]>(LEADS_FILE, []);
            if (method === 'GET') {
              if (!isDevAdminRequest(req)) {
                return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              }
              return sendJson({ ok: true, items: leads });
            }
            if (method === 'POST') {
              const body = await readBody();
              if (body?.homepage) {
                return sendJson({ ok: true, id: 'ignored' }); // honeypot
              }
              const name = String(body?.name || '').trim().slice(0, 80);
              const email = String(body?.email || '').trim().slice(0, 160);
              const contact = String(body?.contact || '').trim().slice(0, 40);
              if (!name || (!email && !contact) || !String(body?.details || '').trim()) {
                return sendJson({ ok: false, error: 'لطفاً نام و حداقل ایمیل یا شماره تماس و توضیحات را تکمیل کنید.' }, 400);
              }
              const lead = {
                id: `lead-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                source: String(body?.source || 'contact').slice(0, 20),
                name,
                email,
                contact,
                website: String(body?.website || '').trim().slice(0, 200),
                goal: String(body?.goal || '').trim().slice(0, 200),
                service: String(body?.service || '').trim().slice(0, 200),
                details: String(body?.details || '').trim().slice(0, 2000),
                booking_date: String(body?.bookingDate || '').trim().slice(0, 40),
                booking_time: String(body?.bookingTime || '').trim().slice(0, 40),
                created_at: new Date().toISOString(),
                ip: 'localhost',
              };
              leads.unshift(lead);
              safeWriteJson(LEADS_FILE, leads.slice(0, 500));
              return sendJson({ ok: true, id: lead.id });
            }
          }

          // --- 8. /api/comments ---
          if (pathname === '/api/comments') {
            const comments = safeReadJson<any[]>(COMMENTS_FILE, []);
            if (method === 'GET') {
              const isAdmin = isDevAdminRequest(req);
              const items = isAdmin ? comments : comments
                .filter((comment) => comment?.isApproved === true)
                .map((comment) => ({ ...comment, authorEmail: '' }));
              return sendJson({ ok: true, items });
            }
            if (method === 'POST') {
              const body = await readBody();
              const postId = String(body?.postId || '').trim();
              const authorName = String(body?.authorName || '').trim().slice(0, 80);
              const authorEmail = String(body?.authorEmail || '').trim().slice(0, 160);
              const content = String(body?.content || '').trim().slice(0, 3000);
              if (body?.website) return sendJson({ ok: true, id: 'ignored' });
              if (!postId || !authorName || !authorEmail || content.length < 3) return sendJson({ ok: false, error: 'لطفاً تمام فیلدهای دیدگاه را تکمیل کنید.' }, 400);
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) return sendJson({ ok: false, error: 'آدرس ایمیل معتبر نیست.' }, 400);
              const newComment = {
                id: `c-${Date.now()}-${crypto.randomUUID()}`,
                postId, authorName, authorEmail, content,
                date: new Date().toLocaleString('fa-IR'),
                createdAt: new Date().toISOString(),
                isApproved: false,
                reply: '',
              };
              comments.unshift(newComment);
              safeWriteJson(COMMENTS_FILE, comments.slice(0, 1000));
              return sendJson({ ok: true, id: newComment.id });
            }
            if (method === 'PATCH') {
              if (!isDevAdminRequest(req)) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const body = await readBody();
              const idx = comments.findIndex((comment) => comment.id === body.id);
              if (idx >= 0) {
                if (typeof body.isApproved === 'boolean') comments[idx].isApproved = body.isApproved;
                if (typeof body.reply === 'string') comments[idx].reply = String(body.reply).slice(0, 2000);
                safeWriteJson(COMMENTS_FILE, comments);
              }
              return sendJson({ ok: true });
            }
            if (method === 'DELETE') {
              if (!isDevAdminRequest(req)) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const id = url.searchParams.get('id');
              const filtered = comments.filter((comment) => comment.id !== id);
              safeWriteJson(COMMENTS_FILE, filtered);
              return sendJson({ ok: true });
            }
          }

          // --- 7. /api/media ---
          if (pathname === '/api/media/file' && method === 'GET') {
            const key = url.searchParams.get('key') || '';
            const files = safeReadJson<Record<string, { data: string; contentType: string }>>(MEDIA_FILES_FILE, {});
            const stored = files[key];
            if (!stored) return sendJson({ ok: false, error: 'فایل پیدا نشد.' }, 404);
            res.statusCode = 200;
            res.setHeader('Content-Type', stored.contentType);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (stored.contentType.includes('svg')) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(Buffer.from(stored.data, 'base64'));
            return;
          }
          if (pathname === '/api/media') {
            const mediaList = safeReadJson<any[]>(MEDIA_FILE, []);
            if (method === 'GET') return sendJson({ ok: true, items: mediaList });
            if (method === 'POST') {
              if (!isDevAdminRequest(req)) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const declaredLength = Number(req.headers['content-length'] || 0);
              if (declaredLength > 11 * 1024 * 1024) return sendJson({ ok: false, error: 'حجم فایل بیش از حد مجاز است.' }, 413);
              const form = await readFormData();
              const file = form.get('file');
              if (!(file instanceof File)) return sendJson({ ok: false, error: 'فایل ارسال نشده است.' }, 400);
              const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'application/pdf'];
              if (!allowedTypes.includes(file.type)) return sendJson({ ok: false, error: 'نوع فایل پشتیبانی نمی‌شود.' }, 415);
              if (!file.size || file.size > 10 * 1024 * 1024) return sendJson({ ok: false, error: 'حجم فایل بیش از حد مجاز است.' }, 413);
              const key = `dev/${crypto.randomUUID()}`;
              const title = String(form.get('title') || file.name || '').slice(0, 160);
              const alt = String(form.get('alt') || title).slice(0, 240);
              const now = new Date().toISOString();
              const files = safeReadJson<Record<string, { data: string; contentType: string }>>(MEDIA_FILES_FILE, {});
              files[key] = { data: Buffer.from(await file.arrayBuffer()).toString('base64'), contentType: file.type };
              safeWriteJson(MEDIA_FILES_FILE, files);
              const item = { id: key, key, url: `/api/media/file?key=${encodeURIComponent(key)}`, title, alt, sizeKb: Math.ceil(file.size / 1024), contentType: file.type, createdAt: now };
              mediaList.unshift(item);
              safeWriteJson(MEDIA_FILE, mediaList);
              return sendJson({ ok: true, item });
            }
            if (method === 'DELETE') {
              if (!isDevAdminRequest(req)) return sendJson({ ok: false, error: 'فقط ادمین.' }, 401);
              const key = url.searchParams.get('key');
              const filtered = mediaList.filter((m) => m.key !== key);
              safeWriteJson(MEDIA_FILE, filtered);
              const files = safeReadJson<Record<string, { data: string; contentType: string }>>(MEDIA_FILES_FILE, {});
              if (key) delete files[key];
              safeWriteJson(MEDIA_FILES_FILE, files);
              return sendJson({ ok: true });
            }
          }

          // Unknown API routes should be real 404s, not false-positive successes.
          return sendJson({ ok: false, error: 'API endpoint not found.' }, 404);
        } catch (err: any) {
          return sendJson({ ok: false, error: err?.message || 'Server error' }, 500);
        }
      });
    },
  };
}
