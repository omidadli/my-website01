import { CANONICAL_SITE_URL, resolveCanonicalOrigin, type SeoGlobalLike, type SeoPageLike, type SeoPostLike } from '../lib/seoDefaults';
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
    return { data: parsed && typeof parsed === 'object' ? (parsed as PublicSiteContent) : null, updatedAt: row.updated_at || null };
  } catch {
    // Missing table / D1 hiccup: fall back to defaults rather than failing the crawler.
    return { data: null, updatedAt: null };
  }
};

/** Canonical origin: CMS setting → request origin (custom domain) → default. */
export const resolveBaseUrl = (request: Request, content: PublicSiteContent | null): string => {
  let host = '';
  try {
    host = new URL(request.url).host;
  } catch { /* ignore */ }
  return resolveCanonicalOrigin(content?.GLOBAL_SEO?.canonicalBaseUrl, host);
};

export const defaultRobotsTxt = (baseUrl: string): string =>
  ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${baseUrl}/sitemap.xml`, ''].join('\n');

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
