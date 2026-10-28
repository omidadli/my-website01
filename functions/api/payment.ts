/**
 * functions/api/payment.ts — Cloudflare Pages Function entry for the self-hosted
 * automated Card-to-Card SMS payment gateway (`/api/payment` & `/api/payment/*`).
 *
 * Subpaths (`/api/payment/...`) are dispatched here by `functions/_middleware.ts`
 * so we never need bracketed filenames in `functions/`.
 */

import { ensureCoreTablesSafe, requireAuth, requireUser, type Env } from './_shared';
import { loadPublicContent } from '../_seo';
import { handlePaymentRequest } from '../../lib/payment/http';

export const runPaymentEndpoint = async (request: Request, env: Env): Promise<Response> => {
  await ensureCoreTablesSafe(env);
  return handlePaymentRequest({
    request,
    env,
    isAdmin: async () => Boolean(await requireAuth(request, env)),
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
