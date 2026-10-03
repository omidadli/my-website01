import {
  CANONICAL_SITE_URL,
  migrateGlobalSeo,
  normalizeCanonicalBase,
  rewriteLegacyOrigins,
  type SeoGlobalLike,
  type SeoPageLike,
  type SeoPostLike,
} from '../lib/seoDefaults';
import { BLOG_POSTS as DEFAULT_BLOG_POSTS } from '../src/data/content';

/**
 * Shared helpers for the crawler endpoints (`/robots.txt`, `/sitemap.xml`).
 *
 * Before these existed, Cloudflare Pages answered both paths with the SPA's
 * index.html (status 200, text/html) — crawlers saw an unparsable robots file
 * and an invalid sitemap. Both files are now generated from the CMS content
 * stored in D1 (GLOBAL_SEO, BLOG_POSTS, CUSTOM_PAGES) with the same rules the
 * admin panel's "ساخت sitemap.xml / robots.txt" buttons use, so what the admin
 * previews is what crawlers get.
 */

export const DEFAULT_SITE_URL = CANONICAL_SITE_URL;

/** Routes of the built-in pages (`/services`, …). */
export const STATIC_ROUTES = ['services', 'portfolio', 'about', 'projects', 'blog', 'products', 'contact'];

export interface PublicSiteContent {
  GLOBAL_SEO?: SeoGlobalLike | null;
  BLOG_POSTS?: SeoPostLike[] | null;
  CUSTOM_PAGES?: Array<{ slug?: string }> | null;
  PAGE_SEO?: Record<string, SeoPageLike | undefined> | null;
}

/**
 * The slice of the Workers environment this module needs.
 *
 * Declared structurally instead of importing `Env` from `./api/_shared` so the
 * sitemap/robots logic stays free of `@cloudflare/workers-types` globals — which
 * lets `scripts/sitemap.test.ts` exercise the real function from plain Node
 * without pulling Workers types into the root type-check.
 */
export interface SeoEnv {
  DB: {
    prepare: (query: string) => { first: <T>() => Promise<T | null> };
  };
}

/** Loads the published content blob; `null` when nothing was saved yet (site runs on its defaults). */
export const loadPublicContent = async (env: SeoEnv): Promise<{ data: PublicSiteContent | null; updatedAt: string | null }> => {
  try {
    const row = await env.DB.prepare(`SELECT data, updated_at FROM content WHERE id = 1`).first<{ data: string; updated_at: string }>();
    if (!row?.data) return { data: null, updatedAt: null };
    const parsed = JSON.parse(row.data);
    if (!parsed || typeof parsed !== 'object') return { data: null, updatedAt: row.updated_at || null };
    const data = parsed as PublicSiteContent;
    // The stored SEO block may still hold the very first seed (dead canonical host, a stock photo as the
    // link preview, a favicon that was never shipped). Repair it once here so robots.txt, sitemap.xml and the
    // per-route <head> all agree — without waiting for the owner to open the SEO box and re-save.
    if (data.GLOBAL_SEO && typeof data.GLOBAL_SEO === 'object') data.GLOBAL_SEO = migrateGlobalSeo(data.GLOBAL_SEO);
    return { data, updatedAt: row.updated_at || null };
  } catch {
    // Missing table / D1 hiccup: fall back to defaults rather than failing the crawler.
    return { data: null, updatedAt: null };
  }
};

/**
 * Canonical origin: the CMS setting (GLOBAL_SEO.canonicalBaseUrl) when it is a real origin, the site's
 * canonical constant otherwise.
 *
 * Deliberately NOT the request origin: the same deployment answers on `<project>.pages.dev` and on every
 * preview URL, and those must canonicalize to the real domain instead of advertising themselves as a
 * second copy of the site. Known-dead hosts typed into the CMS long ago are replaced by the constant.
 */
export const resolveBaseUrl = (_request: Request, content: PublicSiteContent | null): string =>
  normalizeCanonicalBase(content?.GLOBAL_SEO?.canonicalBaseUrl);

/** robots.txt text from the CMS with any legacy origin (the sitemap line!) rewritten to the canonical one. */
export const sanitizeRobotsTxt = (text: string): string => rewriteLegacyOrigins(text);

export const defaultRobotsTxt = (baseUrl: string): string =>
  ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${baseUrl}/sitemap.xml`, ''].join('\n');

/**
 * Body of GET /robots.txt: the CMS text (legacy hosts rewritten) or a sane default, always with a Sitemap line.
 * Pure on purpose — the Pages Function is a thin wrapper, and this is what the tests exercise.
 */
export const buildRobotsTxt = (baseUrl: string, content: PublicSiteContent | null): string => {
  const custom = sanitizeRobotsTxt(String(content?.GLOBAL_SEO?.robotsTxt || '')).trim();
  let body = custom ? `${custom}\n` : defaultRobotsTxt(baseUrl);
  // Always advertise the (now real) sitemap so crawlers discover posts and pages.
  if (!/^\s*sitemap\s*:/im.test(body)) body += `\nSitemap: ${baseUrl}/sitemap.xml\n`;
  return body;
};

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const isValidSlug = (s: unknown): s is string => typeof s === 'string' && /^[\w\u0600-\u06FF-]{1,120}$/.test(s);

export const buildSitemapXml = (baseUrl: string, content: PublicSiteContent | null, lastmodIso: string | null): string => {
  const url = (path: string) => `${baseUrl}/${path}`;
  const pageSeo = content?.PAGE_SEO || {};
  const entries: Array<{ loc: string; priority: string }> = [{ loc: `${baseUrl}/`, priority: '1.0' }];

  for (const route of STATIC_ROUTES) {
    if (pageSeo[route]?.noIndex) continue;
    entries.push({ loc: url(route), priority: '0.8' });
  }
  for (const cp of (Array.isArray(content?.CUSTOM_PAGES) ? content.CUSTOM_PAGES : [])) {
    if (isValidSlug(cp?.slug)) entries.push({ loc: url(cp.slug), priority: '0.8' });
  }
  // Same source of truth as the edge middleware (`_middleware.ts`): when D1 has
  // no content row yet — or its payload carries no posts — the site itself runs
  // on the built-in defaults, so the sitemap has to list those posts too. Without
  // this fallback a fresh database produced a sitemap with only the 8 static
  // pages while every /blog/<id> URL was live and indexable.
  // Deliberately the same condition the middleware uses: an *empty* array means
  // the CMS really has no posts (and /blog/<id> answers 404), so the sitemap must
  // not advertise URLs that do not exist. Only a missing/null list means "no
  // content row yet" → the bundled defaults are what the site serves.
  const posts: SeoPostLike[] = Array.isArray(content?.BLOG_POSTS)
    ? (content!.BLOG_POSTS as SeoPostLike[])
    : (DEFAULT_BLOG_POSTS as unknown as SeoPostLike[]);

  for (const post of posts) {
    if (!post || post.status === 'draft' || post.seo?.noIndex) continue;
    const slug = isValidSlug(post.slug) ? post.slug : isValidSlug(post.id) ? post.id : null;
    if (slug) entries.push({ loc: url(`blog/${slug}`), priority: '0.7' });
  }

  const lastmod = lastmodIso && !Number.isNaN(Date.parse(lastmodIso)) ? `\n    <lastmod>${lastmodIso.slice(0, 10)}</lastmod>` : '';
  const seen = new Set<string>();
  const body = entries
    .filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)))
    .map((e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};
