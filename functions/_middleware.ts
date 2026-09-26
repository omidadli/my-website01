import type { Env } from './api/_shared';
import { loadPublicContent, resolveBaseUrl, type PublicSiteContent } from './_seo';
import { parsePath, pathForPage, postPath } from '../lib/routes';
import { resolveSeo, buildDocumentTitle, buildPostJsonLd, findPublishedPost, NOT_FOUND_TITLE, type SeoPostLike } from '../lib/seoDefaults';
import { BLOG_POSTS as DEFAULT_BLOG_POSTS } from '../src/data/content';

/**
 * Server-side <head> for the SPA.
 *
 * Every page/post has a real path now (/services, /blog/<slug>), but the HTML
 * Cloudflare Pages serves for those paths is the same index.html. Crawlers that
 * do not execute JavaScript — WhatsApp, Telegram, LinkedIn, X, Slack previews —
 * would all show the home-page title/description/photo for every link. This
 * middleware rewrites <title>, description, Open Graph, canonical and robots
 * per route from the CMS content (D1, falling back to the built-in defaults),
 * using the exact resolution rules the browser applies after hydration.
 * Unknown routes get a 404 status (no soft-404s in Search Console).
 *
 * Anything that is not an HTML navigation (API, assets, robots/sitemap) passes
 * through untouched; any failure falls back to the plain index.html.
 */

const escapeAttr = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const absolute = (url: string, baseUrl: string): string => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface HeadValues {
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  canonical: string;
  robots: string;
  status: number;
  /** JSON-LD for open blog posts (BlogPosting + BreadcrumbList [+ FAQPage]); '' otherwise. */
  jsonLd: string;
}

const headFor = (pathname: string, content: PublicSiteContent | null, baseUrl: string): HeadValues | null => {
  const customSlugs = (Array.isArray(content?.CUSTOM_PAGES) ? content.CUSTOM_PAGES : [])
    .filter((page) => page && typeof page === 'object')
    .map((cp) => String(cp?.slug || ''))
    .filter(Boolean);
  const route = parsePath(pathname, customSlugs);
  const globalSeo = content?.GLOBAL_SEO || null;
  const pageSeo = content?.PAGE_SEO || {};

  if (!route) {
    const seo = resolveSeo({ page: 'home', globalSeo });
    const title = buildDocumentTitle(NOT_FOUND_TITLE, globalSeo || {});
    return { ...seo, title, ogTitle: title, canonical: `${baseUrl}/`, robots: 'noindex, nofollow', status: 404, jsonLd: '' };
  }

  if (route.page === 'blog' && route.postId) {
    const posts = (Array.isArray(content?.BLOG_POSTS) ? content!.BLOG_POSTS : DEFAULT_BLOG_POSTS) as SeoPostLike[];
    const post = findPublishedPost(posts, route.postId);
    if (!post) {
      const seo = resolveSeo({ page: 'blog', globalSeo, pageSeo: pageSeo.blog });
      const title = buildDocumentTitle(NOT_FOUND_TITLE, globalSeo || {});
      return { ...seo, title, ogTitle: title, canonical: `${baseUrl}/blog`, robots: 'noindex, nofollow', status: 404, jsonLd: '' };
    }
    const seo = resolveSeo({ page: 'blog', post, globalSeo });
    return {
      ...seo,
      canonical: post.seo?.canonicalUrl || `${baseUrl}${postPath(post)}`,
      robots: seo.noIndex ? 'noindex, nofollow' : 'index, follow',
      status: 200,
      jsonLd: seo.noIndex
        ? ''
        : buildPostJsonLd(post, baseUrl, {
            categoryName: (post as { categoryFa?: string }).categoryFa || undefined,
            authorRole: (post as { authorRole?: string }).authorRole || undefined,
          }),
    };
  }

  const seo = resolveSeo({ page: route.page, globalSeo, pageSeo: pageSeo[route.page] });
  return {
    ...seo,
    canonical: pageSeo[route.page]?.canonicalUrl || `${baseUrl}${pathForPage(route.page)}`,
    robots: seo.noIndex ? 'noindex, nofollow' : 'index, follow',
    status: 200,
    jsonLd: '',
  };
};

const isNavigation = (request: Request, pathname: string): boolean => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (pathname.startsWith('/api/')) return false;
  // Files (assets, robots.txt, sitemap.xml, images …) are never app routes.
  if (/\.[a-z0-9]{1,8}$/i.test(pathname) && pathname !== '/index.html') return false;
  return true;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  if (!isNavigation(request, url.pathname)) return next();

  const upstream = await next();
  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return upstream;

  try {
    const { data } = await loadPublicContent(env);
    const baseUrl = resolveBaseUrl(request, data);
    const head = headFor(url.pathname, data, baseUrl);
    if (!head) return upstream;

    const ogImage = absolute(head.ogImage, baseUrl);
    const setContent = (value: string) => ({
      element(el: Element) {
        el.setAttribute('content', value);
      },
    });

    const rewriter = new HTMLRewriter()
      .on('title', {
        element(el) {
          el.setInnerContent(head.title);
        },
      })
      .on('meta[name="description"]', setContent(head.description))
      .on('meta[name="keywords"]', setContent(head.keywords))
      .on('meta[name="robots"]', setContent(head.robots))
      .on('meta[property="og:title"]', setContent(head.ogTitle))
      .on('meta[property="og:description"]', setContent(head.ogDescription))
      .on('meta[property="og:image"]', setContent(ogImage))
      .on('meta[property="og:type"]', setContent(head.ogType))
      .on('meta[property="og:url"]', setContent(head.canonical))
      .on('link[rel="canonical"]', {
        element(el) {
          el.setAttribute('href', head.canonical);
        },
      })
      .on('head', {
        element(el) {
          // Twitter cards fall back to og:* but are explicit here for older scrapers.
          el.append(
            `<meta name="twitter:title" content="${escapeAttr(head.ogTitle)}">` +
              `<meta name="twitter:description" content="${escapeAttr(head.ogDescription)}">` +
              (ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}">` : '') +
            (head.jsonLd
              ? `<script type="application/ld+json">${head.jsonLd.replace(/</g, '\u003c')}</script>`
              : ''),
            { html: true },
          );
        },
      });

    const headers = new Headers(upstream.headers);
    // The body now depends on the route + CMS content: no shared validators, short cache.
    headers.delete('etag');
    headers.delete('last-modified');
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
    headers.set('vary', 'Accept-Encoding');
    const rewritten = rewriter.transform(new Response(upstream.body, { status: head.status, headers }));
    return rewritten;
  } catch {
    return upstream;
  }
};
