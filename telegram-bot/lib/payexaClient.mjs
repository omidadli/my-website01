/**
 * Zero-dependency client & HMAC webhook verifier for the Website's self-hosted
 * Payexa-compatible SMS Card-to-Card Gateway (`/api/payment/v2/*`).
 */
import crypto from 'node:crypto';

/**
 * Verifies `X-Payexa-Signature: t=<unix_sec>,v1=<hmac_sha256_hex>` within `toleranceSec` (default 300s).
 */
export function verifyPayexaWebhookSignature(apiKey, rawBody, signatureHeader, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!apiKey || !signatureHeader) return false;
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((p) => p.length === 2)
  );
  const ts = Number(parts.t);
  const sigHex = String(parts.v1 || '');
  if (!Number.isFinite(ts) || !/^[a-f0-9]{64}$/i.test(sigHex)) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const expectedHex = crypto
    .createHmac('sha256', String(apiKey))
    .update(`${ts}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(sigHex.toLowerCase(), 'utf8');
  const b = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Builds an `X-Payexa-Signature` header (useful for tests and local tools).
 */
export function buildPayexaWebhookSignature(apiKey, rawBody, unixSec = Math.floor(Date.now() / 1000)) {
  const hex = crypto
    .createHmac('sha256', String(apiKey))
    .update(`${unixSec}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${unixSec},v1=${hex}`;
}

export function createPayexaClient({ baseUrl, apiKey, fetchImpl = globalThis.fetch }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');

  async function request(method, subPath, body) {
    if (!apiKey) {
      return { ok: false, status: 503, error: { code: 'NO_API_KEY', message: 'GATEWAY_API_KEY تنظیم نشده است.' } };
    }
    const res = await fetchImpl(`${root}/api/payment${subPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: Boolean(res.ok && json?.ok), status: res.status, ...json };
  }

  return {
    /** POST /api/payment/v2/payments */
    createPayment(payload) {
      return request('POST', '/v2/payments', payload);
    },
    /** POST /api/payment/v2/payments/:id/verify */
    verifyPayment(paymentId, amountRial) {
      return request('POST', `/v2/payments/${encodeURIComponent(paymentId)}/verify`, amountRial ? { amount: amountRial } : {});
    },
    /** GET /api/payment/v2/payments/:id */
    getPayment(paymentId) {
      return request('GET', `/v2/payments/${encodeURIComponent(paymentId)}`);
    },
  };
}
