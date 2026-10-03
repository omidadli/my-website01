/**
 * CMS API client — talks to the Cloudflare Pages Functions in /functions/api.
 *
 * Graceful degradation:
 *  - If the API is not deployed (local dev without wrangler), `probe()` returns false
 *    and the app falls back to localStorage-only mode.
 *  - Auth token is kept in localStorage and sent as `Authorization: Bearer …`.
 */

import { compressImage } from '../utils/image';
import type { AiKeyHealth, AiSectionDef, SectionStatus } from '../../lib/aiKeys';

const TOKEN_KEY = 'nd_admin_token';

const USER_DATA_CACHE_KEY = 'nd-user-data-cache';

let cloudAvailable: boolean | null = null;
/** Body of the probe response, handed to the first getContent() so boot needs one round-trip, not two. */
let primedContent: { data: any; updatedAt: string | null } | null | undefined;

export interface CloudMediaItem {
  id: string;
  key: string;
  url: string;
  title: string;
  alt: string;
  sizeKb?: number;
  contentType?: string;
  createdAt: string;
}

const headers = (auth = true): Record<string, string> => {
  const h: Record<string, string> = {};
  if (auth) {
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
  }
  return h;
};

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token?: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

/** True when the Cloudflare Functions API responds on /api/content. */
export const probe = async (): Promise<boolean> => {
  if (cloudAvailable !== null) return cloudAvailable;
  try {
    const r = await fetch('/api/content', { method: 'GET', cache: 'no-store', headers: headers() });
    // Any real API response (200/401/500) means functions exist; a Vite/SPA 404 HTML page means they don't.
    const ct = r.headers.get('Content-Type') || '';
    cloudAvailable = ct.includes('application/json');
    if (cloudAvailable && r.ok) {
      const j = await r.json().catch(() => null);
      primedContent = j?.ok ? { data: j.data, updatedAt: j.updatedAt ?? null } : null;
    }
  } catch {
    cloudAvailable = false;
  }
  return cloudAvailable;
};

export const api = {
  probe,
  getToken,
  setToken,

  async getContent(): Promise<{ data: any; updatedAt: string | null } | null> {
    if (primedContent !== undefined) {
      const primed = primedContent;
      primedContent = undefined;
      return primed;
    }
    try {
      const r = await fetch('/api/content', { cache: 'no-store', headers: headers() });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.ok ? { data: j.data, updatedAt: j.updatedAt } : null;
    } catch {
      return null;
    }
  },

  /**
   * Save the whole content state. Pass `baseUpdatedAt` (the `updatedAt` of the
   * version this tab last read/saved) to make the save conditional: if the site
   * was edited elsewhere in the meantime (Claude MCP, another tab, CI sync) the
   * API answers 409 and `conflict: true` is returned instead of overwriting it.
   */
  async saveContent(
    data: any,
    baseUpdatedAt?: string | null
  ): Promise<{ ok: boolean; updatedAt?: string | null; conflict?: boolean; error?: string }> {
    try {
      const body: Record<string, unknown> = { data };
      if (typeof baseUpdatedAt === 'string') body.baseUpdatedAt = baseUpdatedAt;
      const r = await fetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) return { ok: true, updatedAt: j.updatedAt || null };
      if (r.status === 409) return { ok: false, conflict: true, updatedAt: j?.updatedAt || null, error: j?.error || 'محتوا در جای دیگری تغییر کرده است.' };
      return { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  async login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok && j.token) {
        setToken(j.token);
        return { ok: true };
      }
      return { ok: false, error: j?.error || 'ورود ناموفق بود.' };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  async verify(): Promise<boolean> {
    if (!getToken()) return false;
    try {
      const r = await fetch('/api/auth', { headers: headers() });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return !!j?.ok;
      }
      if (r.status === 401) setToken(null);
      return false;
    } catch {
      return false;
    }
  },

  logout() {
    setToken(null);
  },

  async listMedia(): Promise<CloudMediaItem[] | null> {
    try {
      const r = await fetch('/api/media', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.ok ? j.items : null;
    } catch {
      return null;
    }
  },

  async uploadMedia(file: File, title?: string, alt?: string): Promise<CloudMediaItem | null> {
    try {
      // Compress images client-side (fits the free D1 storage path + faster site).
      const prepared = await compressImage(file);
      const form = new FormData();
      form.append('file', prepared);
      if (title) form.append('title', title);
      if (alt) form.append('alt', alt);
      const r = await fetch('/api/media', { method: 'POST', headers: headers(), body: form });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? j.item : null;
    } catch {
      return null;
    }
  },

  async deleteMedia(key: string): Promise<boolean> {
    try {
      const r = await fetch(`/api/media?key=${encodeURIComponent(key)}`, { method: 'DELETE', headers: headers() });
      return r.ok;
    } catch {
      return false;
    }
  },

  /** Public comment submission (held for moderation server-side). */
  async postComment(comment: { postId: string; authorName: string; authorEmail: string; content: string }): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin moderation of cloud comments. */
  async patchComment(id: string, patch: { isApproved?: boolean; reply?: string }): Promise<boolean> {
    try {
      const r = await fetch('/api/comments', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ id, ...patch }) });
      return r.ok;
    } catch {
      return false;
    }
  },

  async deleteComment(id: string): Promise<boolean> {
    try {
      const r = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
      return r.ok;
    } catch {
      return false;
    }
  },

  /** AI consultant conversation. */
  async sendChat(
    messages: { role: 'user' | 'model'; content: string }[],
    mascotContext?: { name?: string; page?: string; daypart?: string; bodyState?: string },
    sessionId?: string
  ): Promise<{ ok: boolean; answer?: string; act?: { pose?: string; hold?: number; bubble?: string; then?: string }; mode?: 'ai' | 'local'; error?: string }> {
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, mascot: mascotContext, sessionId }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true, answer: j.answer, act: j.act, mode: j.mode } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin: conversation history (behavior monitoring). */
  async listChats(): Promise<{ id: string; question: string; answer: string; mode: string; created_at: string; ip: string }[]> {
    try {
      const r = await fetch('/api/chat', { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      return j?.ok ? j.items : [];
    } catch {
      return [];
    }
  },

  /** Lead capture — contact form + booking calendar. Never let a lead vanish. */
  async postLead(lead: {
    source: string;
    name: string;
    email?: string;
    contact?: string;
    website?: string;
    goal?: string;
    service?: string;
    details: string;
    bookingDate?: string;
    bookingTime?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin: lead list (contact + bookings). */
  async listLeads(): Promise<
    Array<{
      id: string;
      source: string;
      name: string;
      email: string;
      contact: string;
      website: string;
      goal: string;
      service: string;
      details: string;
      booking_date: string;
      booking_time: string;
      created_at: string;
      ip: string;
    }>
  > {
    try {
      const r = await fetch('/api/leads', { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      return j?.ok ? j.items : [];
    } catch {
      return [];
    }
  },

  // ---------------------------------------------------------------------------
  // Paid AI tools (محصولات هوشمند)
  // ---------------------------------------------------------------------------

  /** Public: unlock a tool with phone + access code, bound to this device. */
  async unlockTool(payload: { phone: string; code: string; productId: string; deviceId: string }): Promise<{ ok: boolean; token?: string; expiresAt?: string; tool?: any; error?: string }> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlock', ...payload }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true, token: j.token, expiresAt: j.expiresAt, tool: j.tool } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Public: re-validate a stored session token. */
  async toolSession(payload: { token: string; productId: string; deviceId: string }): Promise<{ ok: boolean; tool?: any; error?: string }> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'session', ...payload }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true, tool: j.tool } : { ok: false, error: j?.error };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Public: send a message to a tool. With a token → paid; without → free trial (device-based). */
  async toolChat(payload: { token?: string; productId: string; deviceId: string; sessionId?: string; messages: { role: 'user' | 'model'; content: string }[] }): Promise<{ ok: boolean; answer?: string; mode?: 'ai' | 'local'; error?: string; code?: string; trial?: { used: number; remaining: number; limit: number }; coins?: { balance: number; cost: number; initial: number }; quota?: { limit: number; used: number; remaining: number }; key?: { slot?: number; label?: string; provider?: string; switched?: boolean; recalled?: number } }> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat', ...payload }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok
        ? { ok: true, answer: j.answer, mode: j.mode, trial: j.trial, coins: j.coins, quota: j.quota, key: j.key }
        : { ok: false, error: j?.error || `خطای سرور (${r.status})`, code: j?.code, trial: j?.trial, coins: j?.coins, quota: j?.quota };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin: list all tool-access grants. */
  async listToolAccess(): Promise<Array<{ id: string; phone: string; productId: string; code: string; status: string; maxDevices: number; messageQuota?: number; devicesUsed: number; note: string; createdAt: string; expiresAt: string }>> {
    try {
      const r = await fetch('/api/tools', { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      return j?.ok ? j.items : [];
    } catch {
      return [];
    }
  },

  /** Admin: AI sections (site assistant, SEO slug, 4 products) with 5 key slots each. */
  async listToolSettings(): Promise<{
    items: Array<{
      productId: string;
      name: string;
      provider: string;
      baseUrl: string;
      model: string;
      hasKey: boolean;
      keyMask: string;
      usingEnvFallback: boolean;
      keys?: Array<{
        id: string;
        label: string;
        provider: 'gemini' | 'openai';
        baseUrl: string;
        model: string;
        hasKey: boolean;
        keyMask: string;
        enabled: boolean;
      }>;
    }>;
    /** the full 5-slot state of every section (health, cooldowns, stats, masked keys) */
    sections: SectionStatus[];
    envKeyPresent: boolean;
    keysPerSection: number;
    sectionsMeta: AiSectionDef[];
  }> {
    const empty = { items: [], sections: [], envKeyPresent: false, keysPerSection: 5, sectionsMeta: [] as AiSectionDef[] };
    try {
      const r = await fetch('/api/tools?view=settings', { headers: headers() });
      if (!r.ok) return empty;
      const j = await r.json();
      return j?.ok
        ? {
            items: j.items || [],
            sections: j.sections || [],
            envKeyPresent: !!j.envKeyPresent,
            keysPerSection: j.keysPerSection || 5,
            sectionsMeta: j.sectionsMeta || [],
          }
        : empty;
    } catch {
      return empty;
    }
  },

  /** Admin: save all 5 key slots of one section at once. */
  async setSectionKeys(payload: {
    sectionId: string;
    keys: Array<{
      id: string;
      label?: string;
      provider?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      enabled?: boolean;
      clearKey?: boolean;
    }>;
  }): Promise<{ ok: boolean; keys?: any[]; error?: string }> {
    try {
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'setProductKeys', ...payload }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true, keys: j.keys } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Backwards-compatible alias of setSectionKeys (product sections). */
  async setProductKeys(payload: {
    productId: string;
    keys: Array<{ id: string; label?: string; provider?: string; baseUrl?: string; model?: string; apiKey?: string; enabled?: boolean; clearKey?: boolean }>;
  }): Promise<{ ok: boolean; keys?: any[]; error?: string }> {
    return this.setSectionKeys({ sectionId: payload.productId, keys: payload.keys });
  },

  /** Admin: test every key slot of a section (live, sequential). */
  async testAllSectionKeys(sectionId: string): Promise<{
    ok: boolean;
    results?: Array<{ id: string; slot: number; label: string; hasKey: boolean; ok: boolean; provider?: string; model?: string; latencyMs?: number; reply?: string; error?: string }>;
    passed?: number;
    total?: number;
    error?: string;
  }> {
    try {
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'testAllKeys', sectionId }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? j : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin: clear the cooldown/health of one slot (or a whole section). */
  async resetSectionKeyState(sectionId: string, keyIndex?: number): Promise<boolean> {
    try {
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'resetKeyState', sectionId, keyIndex }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok;
    } catch {
      return false;
    }
  },

  /** Admin: audit trail of rate-limit hits / key hand-offs. */
  async listKeyEvents(limit = 60): Promise<Array<{ id: string; section_id: string; key_id: string; code: string; status: number; message: string; created_at: string }>> {
    try {
      const r = await fetch(`/api/tools?view=keyEvents&limit=${limit}`, { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      return j?.ok ? j.items : [];
    } catch {
      return [];
    }
  },

  /** Admin: test an AI connection key live. */
  async testToolKey(payload: {
    sectionId?: string;
    productId: string;
    keyIndex?: number;
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  }): Promise<{ ok: boolean; latencyMs?: number; model?: string; reply?: string; error?: string }> {
    try {
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'testKey', ...payload }),
      });
      const j = await r.json().catch(() => ({}));
      return j;
    } catch {
      return { ok: false, error: 'اتصال به سرور جهت تست کلید برقرار نشد.' };
    }
  },

  /** Admin: clear one key slot (keyIndex) or all of them (omit it) — falls back to GEMINI_API_KEY. */
  async clearToolKey(productId: string, keyIndex?: number): Promise<boolean> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ action: 'clearKey', productId, keyIndex }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok;
    } catch {
      return false;
    }
  },

  /** Admin: recent AI-tool usage log (monitoring). */
  async listToolMessages(): Promise<Array<{ id: string; phone: string; product_id: string; question: string; answer: string; created_at: string }>> {
    try {
      const r = await fetch('/api/tools?view=messages', { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      return j?.ok ? j.items : [];
    } catch {
      return [];
    }
  },

  /** Admin: grant (or refresh) access for a phone number. */
  async grantToolAccess(payload: { phone: string; productId: string; days?: number; maxDevices?: number; messageQuota?: number; planId?: string; note?: string; newCode?: boolean }): Promise<{ ok: boolean; code?: string; expiresAt?: string; error?: string }> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ action: 'grant', ...payload }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? { ok: true, code: j.code, expiresAt: j.expiresAt } : { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  /** Admin: revoke a grant. */
  async revokeToolAccess(id: string): Promise<boolean> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ action: 'revoke', id }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok;
    } catch {
      return false;
    }
  },

  /** Admin: reset the bound devices of a grant. */
  async resetToolDevices(id: string): Promise<boolean> {
    try {
      const r = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ action: 'resetDevices', id }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok;
    } catch {
      return false;
    }
  },

  /** English slug for a Persian title — Gemini translation on the server, transliteration fallback. */
  async makeSlug(title: string): Promise<string | null> {
    try {
      const r = await fetch('/api/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ title }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j?.ok ? String(j.slug) : null;
    } catch {
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // User accounts (site visitors) — register / login / logout / sync.
  // Session lives in an HttpOnly cookie set by the server; the client never sees
  // the token. We just mirror user data to localStorage for instant hydration.
  // ---------------------------------------------------------------------------

  async getMe(): Promise<{
    ok: boolean;
    profile?: any;
    savedArticles?: any[];
    subscriptions?: any[];
    consultations?: any[];
    activities?: any[];
    error?: string;
  }> {
    try {
      const r = await fetch('/api/user', { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
      const ct = r.headers.get('Content-Type') || '';
      // If the server returned HTML (e.g. dev server not ready, SPA fallback), treat as "not reachable"
      // instead of showing a scary error — we'll silently fall back to anonymous state.
      if (!ct.includes('application/json')) {
        try { localStorage.removeItem(USER_DATA_CACHE_KEY); } catch {}
        return { ok: false, error: 'not_authenticated' };
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        try { localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(j)); } catch {}
        return { ok: true, profile: j.profile, savedArticles: j.savedArticles, subscriptions: j.subscriptions, consultations: j.consultations, activities: j.activities };
      }
      if (r.status === 401 || !r.ok) {
        try { localStorage.removeItem(USER_DATA_CACHE_KEY); } catch {}
        return { ok: false, error: 'not_authenticated' };
      }
      return { ok: false, error: j?.error || 'not_authenticated' };
    } catch {
      return { ok: false, error: 'not_authenticated' };
    }
  },

  async userRegister(payload: { fullName: string; email?: string; phone?: string; password: string }) {
    const body: Record<string, string> = { fullName: payload.fullName, password: payload.password };
    if (payload.email) body.email = payload.email;
    if (payload.phone) body.phone = payload.phone;
    const loginValue = payload.email || payload.phone || '';
    if (loginValue) body.emailOrPhone = loginValue;
    try {
      const r = await fetch('/api/user?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const ct = r.headers.get('Content-Type') || '';
      if (!ct.includes('application/json')) {
        return { ok: false, error: 'سرور در حال راه‌اندازی است، چند لحظه دیگر دوباره تلاش کنید.' };
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        if (j.profile && Array.isArray(j.savedArticles)) {
          try { localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(j)); } catch {}
          return { ok: true, profile: j.profile, savedArticles: j.savedArticles, subscriptions: j.subscriptions, consultations: j.consultations, activities: j.activities };
        }
        return await this.getMe();
      }
      return { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  async userLogin(payload: { email?: string; phone?: string; password: string }) {
    const body: Record<string, string> = { password: payload.password };
    if (payload.email) body.email = payload.email;
    if (payload.phone) body.phone = payload.phone;
    const loginValue = payload.email || payload.phone || '';
    if (loginValue) body.emailOrPhone = loginValue;
    try {
      const r = await fetch('/api/user?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const ct = r.headers.get('Content-Type') || '';
      if (!ct.includes('application/json')) {
        return { ok: false, error: 'سرور در حال راه‌اندازی است، چند لحظه دیگر دوباره تلاش کنید.' };
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        if (j.profile && Array.isArray(j.savedArticles)) {
          try { localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(j)); } catch {}
          return { ok: true, profile: j.profile, savedArticles: j.savedArticles, subscriptions: j.subscriptions, consultations: j.consultations, activities: j.activities };
        }
        return await this.getMe();
      }
      return { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  async userLogout() {
    try {
      await fetch('/api/user?action=logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* ignore */ }
    try { localStorage.removeItem(USER_DATA_CACHE_KEY); } catch {}
    return { ok: true };
  },

  async userUpdateProfile(payload: Partial<{ fullName: string; phone: string; bio: string }>) {
    try {
      const r = await fetch('/api/user?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) return { ok: true, profile: j.profile };
      return { ok: false, error: j?.error || `خطای سرور (${r.status})` };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    }
  },

  getCachedMe(): any | null {
    try {
      const raw = localStorage.getItem(USER_DATA_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
};

