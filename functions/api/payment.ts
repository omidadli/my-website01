/**
 * functions/api/payment.ts — Cloudflare Pages Function entry for the self-hosted
 * automated Card-to-Card SMS payment gateway (`/api/payment/*` & `/sms-bridge`).
 *
 * Subpaths are dispatched here by `functions/_middleware.ts` so we never need
 * bracketed filenames in `functions/`.
 */

import { ensureCoreTablesSafe, getClientIp, requireAuth, requireUser, safeEqual, type Env } from './_shared';
import { loadPublicContent } from '../_seo';
import { handlePaymentRequest } from '../../lib/payment/http';

const SETUP_WINDOW_MINUTES = 15;
const SETUP_MAX_FAILURES = 8;

export const runPaymentEndpoint = async (request: Request, env: Env): Promise<Response> => {
  await ensureCoreTablesSafe(env);
  return handlePaymentRequest({
    request,
    env: {
      ...env,
      SITE_URL: env.SITE_BASE_URL || new URL(request.url).origin,
    },
    isAdmin: async () => Boolean(await requireAuth(request, env)),
    verifyAdminPassword: async (password: string) => {
      if (!env.ADMIN_PASSWORD) return false;
      const ip = getClientIp(request);
      try {
        const since = new Date(Date.now() - SETUP_WINDOW_MINUTES * 60 * 1000).toISOString();
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ?1 AND success = 0 AND attempted_at > ?2`
        )
          .bind(ip, since)
          .first<{ c: number }>();
        if ((row?.c || 0) >= SETUP_MAX_FAILURES) return false;
      } catch {
        /* ignore */
      }

      const ok = await safeEqual(String(password || ''), env.ADMIN_PASSWORD, env.AUTH_SECRET || 'omidpay-setup');
      try {
        await env.DB.prepare(`INSERT INTO login_attempts (ip, attempted_at, success) VALUES (?1, ?2, ?3)`)
          .bind(ip, new Date().toISOString(), ok ? 1 : 0)
          .run();
      } catch {
        /* ignore */
      }
      return ok;
    },
    getCurrentUser: async () => {
      const u = await requireUser(request, env);
      if (!u) return null;
      return {
        id: String(u.id),
        phone: String(u.phone || ''),
        phone_verified_at: String(u.phone_verified_at || ''),
        full_name: String(u.full_name || ''),
      };
    },
    loadCmsData: async () => {
      const { data } = await loadPublicContent(env);
      return data;
    },
  });
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return runPaymentEndpoint(request, env);
};
