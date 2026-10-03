/**
 * Domain / SEO regression cover.
 *
 * Production bug this pins down: the D1 content row still carried the very first SEO seed —
 * `canonicalBaseUrl: https://omidadli.com` (a domain that does not resolve), a robots.txt that advertised
 * `https://omidadli.com/sitemap.xml`, a stock Unsplash portrait as the link-preview image and a
 * `/favicon.ico` that was never shipped. The CMS value always won over the code defaults, so
 * https://omidadli.site/robots.txt and /sitemap.xml pointed every crawler at the dead host.
 *
 * Run: npx tsx scripts/seo-domain.test.ts
 */
import assert from 'node:assert/strict';
import {
  CANONICAL_SITE_URL,
  defaultGlobalSeo,
  isLegacySiteUrl,
  migrateGlobalSeo,
  migrateLegacySiteHost,
  normalizeCanonicalBase,
  rewriteLegacyOrigins,
} from '../lib/seoDefaults';
import { buildRobotsTxt, buildSitemapXml, loadPublicContent, resolveBaseUrl, sanitizeRobotsTxt } from '../functions/_seo';

assert.equal(CANONICAL_SITE_URL, 'https://omidadli.site', 'the canonical origin is the live domain');
assert.equal(defaultGlobalSeo.canonicalBaseUrl, CANONICAL_SITE_URL);
assert.ok(defaultGlobalSeo.robotsTxt.includes(`${CANONICAL_SITE_URL}/sitemap.xml`));

// ---- legacy detection ----
for (const url of ['https://omidadli.com', 'http://www.omidadli.com/', 'omidadli01.site', 'https://www.omidadli01.site/x', 'https://www.omidadli.site']) {
  assert.ok(isLegacySiteUrl(url), `${url} is a legacy host`);
}
for (const url of ['https://omidadli.site', 'omidadli.site', 'https://omidadli.community', 'https://example.org', '']) {
  assert.ok(!isLegacySiteUrl(url), `${url || '(empty)'} is not a legacy host`);
}
assert.equal(migrateLegacySiteHost('omidadli01.site'), 'omidadli.site', 'footer "website" field follows');
assert.equal(migrateLegacySiteHost('example.org'), 'example.org', 'foreign hosts are untouched');

// ---- text rewriting keeps look-alike hosts intact ----
assert.equal(
  rewriteLegacyOrigins('Sitemap: https://omidadli.com/sitemap.xml\nSee https://omidadli.community/a and http://www.omidadli01.site/b'),
  'Sitemap: https://omidadli.site/sitemap.xml\nSee https://omidadli.community/a and https://omidadli.site/b',
);

// ---- base URL normalisation ----
assert.equal(normalizeCanonicalBase('https://omidadli.com'), CANONICAL_SITE_URL, 'dead host → canonical');
assert.equal(normalizeCanonicalBase(''), CANONICAL_SITE_URL, 'empty → canonical');
assert.equal(normalizeCanonicalBase('not a url'), CANONICAL_SITE_URL, 'garbage → canonical');
assert.equal(normalizeCanonicalBase('https://new-brand.example/'), 'https://new-brand.example', 'a deliberate new domain wins, trailing slash dropped');

// ---- the stored production block ----
const STALE = {
  siteTitle: 'امید عدلی | مشاور و مجری پرفورمنس مارکتینگ و CRO',
  titleTemplate: '%s | امید عدلی',
  defaultMetaDesc: 'x',
  defaultKeywords: 'y',
  faviconUrl: '/favicon.ico',
  ogImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80',
  canonicalBaseUrl: 'https://omidadli.com',
  robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://omidadli.com/sitemap.xml',
};
const fixed = migrateGlobalSeo(STALE);
assert.equal(fixed.canonicalBaseUrl, CANONICAL_SITE_URL);
assert.equal(fixed.robotsTxt, `User-agent: *\nAllow: /\nSitemap: ${CANONICAL_SITE_URL}/sitemap.xml`);
assert.equal(fixed.faviconUrl, defaultGlobalSeo.faviconUrl);
assert.equal(fixed.ogImage, defaultGlobalSeo.ogImage);
assert.equal(fixed.siteTitle, STALE.siteTitle, 'untouched fields stay');

// a genuine owner edit is never overwritten
const edited = { ...STALE, faviconUrl: '/my-icon.png', ogImage: 'https://cdn.example/og.jpg', canonicalBaseUrl: 'https://new-brand.example' };
const keep = migrateGlobalSeo(edited);
assert.equal(keep.faviconUrl, '/my-icon.png');
assert.equal(keep.ogImage, 'https://cdn.example/og.jpg');
assert.equal(keep.canonicalBaseUrl, 'https://new-brand.example');

// ---- end to end through the Pages Functions, against a D1 holding the stale block ----
const fakeEnv = (data: unknown) => ({
  DB: { prepare: () => ({ first: async () => ({ data: JSON.stringify(data), updated_at: '2026-09-30T14:23:28.484Z' }) }) },
});
const stored = { GLOBAL_SEO: STALE, BLOG_POSTS: [{ id: 'p1', slug: 'p1', title: 'T' }], CUSTOM_PAGES: [] };

const { data } = await loadPublicContent(fakeEnv(stored) as any);
assert.equal(data?.GLOBAL_SEO?.canonicalBaseUrl, CANONICAL_SITE_URL, 'loadPublicContent repairs the stored SEO block');

// every host the same deployment answers on must canonicalize to the real domain
for (const host of ['https://omidadli.site', 'https://my-website-8a2.pages.dev', 'https://abc123.my-website-8a2.pages.dev', 'http://localhost:8788']) {
  assert.equal(resolveBaseUrl(new Request(`${host}/x`), data), CANONICAL_SITE_URL, `canonical base on ${host}`);
}

const base = resolveBaseUrl(new Request('https://omidadli.site/robots.txt'), data);
const robots = buildRobotsTxt(base, data);
assert.ok(robots.includes(`Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`), 'robots.txt advertises the live sitemap');
assert.ok(!/omidadli\.com|omidadli01/.test(robots), 'robots.txt mentions no dead host');
assert.equal(sanitizeRobotsTxt('Sitemap: https://omidadli.com/sitemap.xml'), `Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`);
// no CMS robots text at all → the default one, still with the Sitemap line
assert.ok(buildRobotsTxt(base, { GLOBAL_SEO: { robotsTxt: '' } }).includes(`Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`));
// custom text without a Sitemap line gets one appended
assert.ok(buildRobotsTxt(base, { GLOBAL_SEO: { robotsTxt: 'User-agent: *\nDisallow: /private' } }).trim().endsWith(`Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`));

const sitemap = buildSitemapXml(base, data, '2026-09-30T14:23:28.484Z');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.ok(locs.length >= 9, 'home + static pages + the post');
assert.ok(locs.every((l) => l.startsWith(`${CANONICAL_SITE_URL}/`)), `every <loc> is on ${CANONICAL_SITE_URL}`);
assert.ok(locs.includes(`${CANONICAL_SITE_URL}/blog/p1`));

// an empty database falls back to the same origin
assert.equal(resolveBaseUrl(new Request('https://omidadli.site/'), null), CANONICAL_SITE_URL);
assert.ok(buildSitemapXml(resolveBaseUrl(new Request('https://omidadli.site/'), null), null, null).includes(`<loc>${CANONICAL_SITE_URL}/</loc>`));

console.log('seo-domain.test.ts: all assertions passed');
