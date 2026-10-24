import { Env, json, getClientIp } from './_shared';

/** GET /api/health — public health endpoint.
 *
 * Returns only public, non-secret information:
 *  - ok: the function runtime is reachable.
 *  - ready: core D1 tables exist (best effort).
 *  - auth.configured: whether admin credentials are set.
 *  - bindings.d1: whether D1 binding is present.
 *  - login.locked: whether this IP is currently rate-limited.
 *
 * Never reveals secret names or values.
 */
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const ip = getClientIp(request);

  let ready = false;
  try {
    await env.DB.prepare(`SELECT 1 FROM content LIMIT 1`).run();
    ready = true;
  } catch {
    /* table may not exist yet */
  }

  const authConfigured = !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.AUTH_SECRET);

  let loginLocked = false;
  try {
    const WINDOW_MINUTES = 15;
    const MAX_FAILURES = 8;
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ?1 AND success = 0 AND attempted_at > ?2`
    ).bind(ip, since).first<{ c: number }>();
    if ((row?.c || 0) >= MAX_FAILURES) {
      loginLocked = true;
    }
  } catch {
    /* table may not exist — fail open */
  }

  return json({
    ok: true,
    ready,
    auth: { configured: authConfigured },
    bindings: { d1: !!env.DB },
    login: { locked: loginLocked },
  }, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
