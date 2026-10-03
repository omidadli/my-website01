import type { Env } from './api/_shared';
import { buildRobotsTxt, loadPublicContent, resolveBaseUrl } from './_seo';

/** GET /robots.txt — CMS text (GLOBAL_SEO.robotsTxt) or a sane default. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { data } = await loadPublicContent(env);
  const body = buildRobotsTxt(resolveBaseUrl(request, data), data);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
