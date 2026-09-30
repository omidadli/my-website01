/**
 * site-client.mjs — a tiny, dependency-free client for the site's admin API.
 *
 * Shared by scripts/sync-content.mjs and the MCP server (mcp/server.mjs).
 * Auth model: POST /api/auth { username, password } → { token }; the token is
 * then sent as `Authorization: Bearer <token>` on every admin call.
 *
 * Configure via environment variables:
 *   SITE_URL        base URL of the live site   (e.g. https://omidadli01.site)
 *   ADMIN_USERNAME  admin username              (same as the Cloudflare secret)
 *   ADMIN_PASSWORD  admin password              (same as the Cloudflare secret)
 */

/** Return this from an updateContent() mutator to skip the write entirely. */
export const NO_CHANGE = Symbol('no-change');

export class SiteClient {
  constructor({ baseUrl, username, password } = {}) {
    this.baseUrl = (baseUrl || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    this.username = username || process.env.ADMIN_USERNAME || '';
    this.password = password || process.env.ADMIN_PASSWORD || '';
    this._token = null;
  }

  async _req(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      if (!this._token) await this.login();
      headers.Authorization = `Bearer ${this._token}`;
    }
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // Node's undici only says "fetch failed"; the useful part (ENOTFOUND, ECONNREFUSED, a TLS
      // error …) is on `cause`. Surface it — "fetch failed" alone hid an expired domain for days.
      const cause = e?.cause?.code || e?.cause?.message || e?.message || 'unknown error';
      const hint = /ENOTFOUND|EAI_AGAIN/.test(String(cause))
        ? ' — the host name does not resolve: check SITE_URL and that the domain is still registered / its DNS points to Cloudflare Pages'
        : '';
      const err = new Error(`${method} ${this.baseUrl}${path} → network error (${cause})${hint}`);
      err.code = 'network';
      err.cause = e;
      throw err;
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok || data?.ok === false) {
      const err = new Error(`${method} ${path} → ${res.status}: ${data?.error || text || 'request failed'}`);
      err.status = res.status;
      err.code = data?.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** Authenticate and cache the bearer token. */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('Missing ADMIN_USERNAME / ADMIN_PASSWORD (set them as env vars).');
    }
    const data = await this._req('/api/auth', {
      method: 'POST',
      auth: false,
      body: { username: this.username, password: this.password },
    });
    if (!data?.token) throw new Error('Login succeeded but no token was returned.');
    this._token = data.token;
    return this._token;
  }

  /** Read the entire content state (the CMS blob). */
  async getContent() {
    const data = await this._req('/api/content', { method: 'GET' });
    return data.data; // { ...ContentState }
  }

  /** Read the content together with its version stamp: { data, updatedAt }. */
  async getContentWithMeta() {
    const data = await this._req('/api/content', { method: 'GET' });
    return { data: data.data, updatedAt: data.updatedAt || '' };
  }

  /**
   * Overwrite the entire content state. `content` is the ContentState object.
   * Pass `baseUpdatedAt` (from getContentWithMeta) to make the save conditional:
   * the API answers 409 (err.code === 'conflict') if someone else saved in between.
   */
  async putContent(content, { baseUpdatedAt } = {}) {
    const body = { data: content };
    if (typeof baseUpdatedAt === 'string') body.baseUpdatedAt = baseUpdatedAt;
    return this._req('/api/content', { method: 'PUT', body });
  }

  /**
   * Safe read → modify → write. `mutate(content, meta)` edits the object in place
   * (or returns a replacement). On a 409 conflict the content is re-read and the
   * mutation re-applied, so concurrent editors (admin panel, Claude, CI) never
   * silently overwrite each other. `fallback()` supplies a base document when
   * the live content is empty (fresh site); without it, empty content is passed
   * to `mutate` as `null`.
   */
  async updateContent(mutate, { retries = 3, fallback } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { data, updatedAt } = await this.getContentWithMeta();
      const empty = !data || typeof data !== 'object' || Object.keys(data).length === 0;
      let content = empty ? (fallback ? await fallback() : null) : data;
      const seeded = empty && !!content;
      const out = await mutate(content, { seeded, updatedAt });
      if (out === NO_CHANGE) return { ok: true, skipped: true, updatedAt, seeded: false };
      if (out && typeof out === 'object') content = out;
      try {
        const r = await this.putContent(content, { baseUpdatedAt: updatedAt });
        return { ...r, seeded };
      } catch (e) {
        lastErr = e;
        if (e?.code !== 'conflict' && e?.status !== 409) throw e;
      }
    }
    throw new Error(`Content changed concurrently ${retries + 1} times in a row; giving up. Last error: ${lastErr?.message}`);
  }

  // --- Paid AI tools (محصولات هوشمند) -------------------------------------
  async listGrants() {
    const data = await this._req('/api/tools', { method: 'GET' });
    return data.items || [];
  }
  async listToolMessages() {
    const data = await this._req('/api/tools?view=messages', { method: 'GET' });
    return data.items || [];
  }
  async grant({ phone, productId = 'all', planId, days, maxDevices, messageQuota, note, newCode }) {
    return this._req('/api/tools', {
      method: 'POST',
      body: { action: 'grant', phone, productId, planId, days, maxDevices, messageQuota, note, newCode },
    });
  }
  async revoke(id) {
    return this._req('/api/tools', { method: 'POST', body: { action: 'revoke', id } });
  }
  async resetDevices(id) {
    return this._req('/api/tools', { method: 'POST', body: { action: 'resetDevices', id } });
  }
}

/**
 * Set a value at a dot-path inside an object, creating intermediate objects.
 * Handles hyphenated keys (e.g. AI_TOOLS_CONFIG.tools.business-therapist.enabled).
 * Numeric segments create/index arrays.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Set a value at a dot-path, creating intermediate objects/arrays as needed.
 * Throws (instead of silently corrupting the content) on:
 *  - an empty path or a prototype-polluting segment (`__proto__`, …);
 *  - a non-numeric key on an array (e.g. `PRODUCTS.title` — use `PRODUCTS.0.title`);
 *  - an array index past the end (`PRODUCTS.7` when only 3 items exist — append with index 3).
 */
export function setByPath(root, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Path is empty.');
  for (const key of parts) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Invalid path segment "${key}".`);
  }
  const checkArrayKey = (node, key, prefix) => {
    if (!Array.isArray(node)) return;
    if (!/^\d+$/.test(key)) throw new Error(`"${prefix}" is an array — use a numeric index (e.g. "${prefix}.0"), not "${key}".`);
    if (Number(key) > node.length) throw new Error(`Index ${key} is past the end of "${prefix}" (${node.length} items) — use ${node.length} to append.`);
  };
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    checkArrayKey(node, key, parts.slice(0, i).join('.'));
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (node[key] === undefined || node[key] === null || typeof node[key] !== 'object') {
      node[key] = nextIsIndex ? [] : {};
    }
    node = node[key];
  }
  const last = parts[parts.length - 1];
  checkArrayKey(node, last, parts.slice(0, -1).join('.'));
  node[last] = value;
  return root;
}

/** Read a value at a dot-path (undefined if any segment is missing). */
export function getByPath(root, path) {
  return String(path).split('.').filter(Boolean).reduce((n, k) => (n == null ? undefined : n[k]), root);
}
