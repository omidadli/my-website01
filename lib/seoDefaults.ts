/**
 * SEO defaults + title/description resolution shared by the browser (SEOHead,
 * ContentContext) and the edge (functions/_middleware.ts, sitemap), so the
 * <title>/<meta> a crawler or a WhatsApp/Telegram link preview receives from the
 * server is exactly what the SPA renders after hydration.
 */

export interface SeoGlobalLike {
  siteTitle?: string;
  titleTemplate?: string;
  defaultMetaDesc?: string;
  defaultKeywords?: string;
  faviconUrl?: string;
  ogImage?: string;
  canonicalBaseUrl?: string;
  robotsTxt?: string;
}

export interface SeoPageLike {
  title?: string;
  metaDescription?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export interface SeoPostFaqLike {
  question?: string;
  answer?: string;
}

export interface SeoPostLike {
  id: string;
  title: string;
  excerpt?: string;
  slug?: string;
  status?: string;
  coverImage?: string;
  tags?: string[];
  date?: string;
  updatedAt?: string;
  /** ISO publish/modify dates for machine-readable schema (the display `date` is localized). */
  dateIso?: string;
  updatedIso?: string;
  author?: string;
  faq?: SeoPostFaqLike[] | null;
  seo?: SeoPageLike;
}

/**
 * The one and only canonical origin of the site.
 *
 * It used to be spelled out literally in the edge helpers, the SPA context, the
 * SEO box and this file — which is how the docs and the code drifted apart
 * (`omidadli.site`, `omidadli01.site`, `omidadli.com` all appeared as "the"
 * domain, two of which do not even resolve). Change it here and every consumer
 * follows.
 */
export const CANONICAL_SITE_URL = 'https://omidadli.site';

/**
 * Hosts that were once written down as the site's address — dead domains from
 * old seeds/docs and the `www` alias of the real one. They must never reach a
 * canonical tag, sitemap, robots.txt, OG tag or the visible footer.
 */
export const LEGACY_SITE_HOSTS: readonly string[] = [
  'omidadli.com',
  'www.omidadli.com',
  'omidadli01.site',
  'www.omidadli01.site',
  'omidadli.ir',
  'www.omidadli.ir',
  'www.omidadli.site',
];

const canonicalOrigin = (): string => CANONICAL_SITE_URL.replace(/\/+$/, '');
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEGACY_ORIGIN_RE = new RegExp(`https?://(?:${LEGACY_SITE_HOSTS.map(escapeRe).join('|')})(?![\\w.-])`, 'gi');

/** Replace every legacy origin inside free text (robots.txt, descriptions…) with the canonical one. */
export const rewriteLegacyOrigins = (text: string): string => String(text ?? '').replace(LEGACY_ORIGIN_RE, canonicalOrigin());

/** `true` when `url` points at a legacy host (with or without a scheme). */
export const isLegacySiteUrl = (url: string): boolean => {
  const host = String(url || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0];
  return LEGACY_SITE_HOSTS.includes(host);
};

/** A bare host such as the footer's "website" field: legacy → canonical host, anything else untouched. */
export const migrateLegacySiteHost = (value: string): string => {
  const raw = String(value ?? '');
  return isLegacySiteUrl(raw) ? new URL(CANONICAL_SITE_URL).host : raw;
};

/**
 * Base URL for canonical/OG/sitemap: the CMS value when it is a usable http(s)
 * origin that is not a legacy host, the canonical constant otherwise. Trailing
 * slashes are dropped.
 */
export const normalizeCanonicalBase = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(raw) || isLegacySiteUrl(raw)) return canonicalOrigin();
  return raw.replace(/\/+$/, '');
};

/** Resolve a public post by ID or slug; drafts are never routable by public crawlers. */
export const findPublishedPost = <T extends SeoPostLike>(posts: readonly T[], idOrSlug: string): T | null =>
  posts.find((post) => post && post.status !== 'draft' && (post.id === idOrSlug || post.slug === idOrSlug)) || null;

export const defaultGlobalSeo = {
  siteTitle: 'امید عدلی | مشاور و مجری پرفورمنس مارکتینگ و CRO',
  titleTemplate: '%s | امید عدلی',
  defaultMetaDesc: 'خدمات تخصصی پرفورمنس مارکتینگ، بهینه‌سازی نرخ تبدیل (CRO)، کمپین‌های گوگل ادز و آنالیز پیشرفته رفتار کاربر.',
  defaultKeywords: 'پرفورمنس مارکتینگ, CRO, دیجیتال مارکتینگ, گوگل ادز, امید عدلی, بهینه‌سازی نرخ تبدیل',
  // Only files that really exist in /public — /favicon.ico never shipped, so browsers got the SPA's HTML.
  faviconUrl: '/logo.svg',
  // Own photo instead of a stock portrait of a stranger in link previews (WhatsApp/Telegram/LinkedIn).
  ogImage: `${CANONICAL_SITE_URL}/profile-photo-web.jpg`,
  canonicalBaseUrl: CANONICAL_SITE_URL,
  robotsTxt: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${CANONICAL_SITE_URL}/sitemap.xml`,
};

/** Values the very first CMS seed wrote that were never a real choice of the owner. */
const STALE_FAVICON = '/favicon.ico'; // never shipped in /public — browsers got the SPA's HTML
const STALE_STOCK_OG_IMAGE = /images\.unsplash\.com\/photo-1507003211169-0a1dd7228f2d/; // a stranger's stock portrait

/**
 * Repair the stale seed values of a stored GLOBAL_SEO block. The production
 * database still holds the first seed (dead canonical host, robots.txt that
 * advertises the dead sitemap, a stock photo as the link-preview image and a
 * favicon path that does not exist), and the CMS value always wins over the
 * defaults — so without this the crawlers keep getting them. Genuine edits are
 * left alone: only the known-bad values are replaced.
 */
export const migrateGlobalSeo = <T extends SeoGlobalLike>(seo: T): T => {
  const out: T = { ...seo };
  out.canonicalBaseUrl = normalizeCanonicalBase(out.canonicalBaseUrl);
  if (typeof out.robotsTxt === 'string') out.robotsTxt = rewriteLegacyOrigins(out.robotsTxt);
  if (typeof out.faviconUrl === 'string' && out.faviconUrl.trim() === STALE_FAVICON) out.faviconUrl = defaultGlobalSeo.faviconUrl;
  if (typeof out.ogImage === 'string' && STALE_STOCK_OG_IMAGE.test(out.ogImage)) out.ogImage = defaultGlobalSeo.ogImage;
  return out;
};

export const PAGE_DEFAULT_TITLES: Record<string, string> = {
  home: 'صفحه اصلی',
  services: 'خدمات تخصصی و مشاوره',
  portfolio: 'نمونه‌کارها و کیس‌استادی‌ها',
  about: 'درباره من',
  projects: 'پروژه‌ها و وضعیت پذیرش',
  blog: 'مقالات و آموزش‌ها',
  products: 'محصولات و دوره‌های آموزشی',
  contact: 'تماس و رزرو جلسه مشاوره',
  admin: 'پیشخوان مدیریت CMS',
};

export const pageDefaultTitle = (page: string): string => PAGE_DEFAULT_TITLES[page] || page;

/** Title used by the SPA and the edge for URLs that match no route. */
export const NOT_FOUND_TITLE = 'صفحه پیدا نشد';

/** Apply the CMS title template ("%s | برند"); the home page uses the site title itself. */
export const buildDocumentTitle = (baseTitle: string, globalSeo: SeoGlobalLike, opts: { isHome?: boolean; explicit?: boolean } = {}): string => {
  const siteTitle = globalSeo.siteTitle || defaultGlobalSeo.siteTitle;
  if (opts.isHome && !opts.explicit) return siteTitle;
  const template = globalSeo.titleTemplate ?? defaultGlobalSeo.titleTemplate;
  return template ? template.replace('%s', baseTitle) : `${baseTitle} | ${siteTitle}`;
};

export interface ResolvedSeo {
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: 'website' | 'article';
  noIndex: boolean;
}

/**
 * Resolve the effective SEO fields for a page or a post (global → page → post),
 * mirroring the precedence the admin panel documents.
 */
export const resolveSeo = (args: {
  page: string;
  post?: SeoPostLike | null;
  globalSeo?: SeoGlobalLike | null;
  pageSeo?: SeoPageLike | null;
  /** admins preview drafts; crawlers never index them */
  isAdmin?: boolean;
}): ResolvedSeo => {
  const globalSeo: SeoGlobalLike = { ...defaultGlobalSeo, ...(args.globalSeo || {}) };
  const pageSeo: SeoPageLike = args.pageSeo || {};
  const post = args.post || null;

  if (post) {
    const baseTitle = post.seo?.title || post.title;
    const title = buildDocumentTitle(baseTitle, globalSeo);
    const description = post.seo?.metaDescription || post.excerpt || globalSeo.defaultMetaDesc || '';
    return {
      title,
      description,
      keywords: post.seo?.keywords || (post.tags || []).join(', ') || globalSeo.defaultKeywords || '',
      ogTitle: post.seo?.ogTitle || title,
      ogDescription: post.seo?.ogDescription || description,
      ogImage: post.seo?.ogImage || post.coverImage || globalSeo.ogImage || '',
      ogType: 'article',
      noIndex: (!args.isAdmin && post.status === 'draft') || post.seo?.noIndex === true,
    };
  }

  const isHome = args.page === 'home';
  const baseTitle = pageSeo.title || pageDefaultTitle(args.page);
  const title = buildDocumentTitle(baseTitle, globalSeo, { isHome, explicit: !!pageSeo.title });
  const description = pageSeo.metaDescription || globalSeo.defaultMetaDesc || '';
  return {
    title,
    description,
    keywords: pageSeo.keywords || globalSeo.defaultKeywords || '',
    ogTitle: pageSeo.ogTitle || title,
    ogDescription: pageSeo.ogDescription || description,
    ogImage: pageSeo.ogImage || globalSeo.ogImage || '',
    ogType: 'website',
    noIndex: pageSeo.noIndex === true || args.page === 'admin',
  };
};

/**
 * JSON-LD for a blog post — `BlogPosting` + `BreadcrumbList`, plus `FAQPage`
 * when the post carries real Q&A pairs (the master prompt's schema rule:
 * propose structured data only when it matches the visible content).
 *
 * Shared by the SPA head (SEOHead) and the edge middleware so the schema a
 * crawler reads without JavaScript matches what the hydrated page shows.
 */
export const buildPostJsonLd = (
  post: SeoPostLike,
  baseUrl: string,
  opts: { categoryName?: string; authorRole?: string } = {},
): string => {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const postUrl = `${base}${post.slug || post.id ? `/blog/${post.slug || post.id}` : '/blog'}`;
  const abs = (u?: string) => (!u ? undefined : /^https?:\/\//i.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);

  const faqItems = Array.isArray(post.faq)
    ? post.faq.filter((q): q is Required<SeoPostFaqLike> => !!q && typeof q.question === 'string' && typeof q.answer === 'string' && !!q.question.trim() && !!q.answer.trim())
    : [];

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'BlogPosting',
      '@id': `${postUrl}#article`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
      headline: post.seo?.title || post.title,
      description: post.seo?.metaDescription || post.excerpt || undefined,
      image: abs(post.seo?.ogImage || post.coverImage) || undefined,
      inLanguage: 'fa-IR',
      keywords: post.seo?.keywords || (post.tags || []).join(', ') || undefined,
      author: {
        '@type': 'Person',
        name: post.author || 'امید عدلی',
        jobTitle: opts.authorRole || 'متخصص پرفورمنس مارکتینگ، ترکینگ و CRO',
        url: `${base}/about`,
      },
      datePublished: post.dateIso || undefined,
      dateModified: post.updatedIso || post.dateIso || undefined,
      publisher: {
        '@type': 'Person',
        name: post.author || 'امید عدلی',
        url: base || undefined,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: 'مقالات', item: `${base}/blog` },
        ...(opts.categoryName ? [{ '@type': 'ListItem', position: 3, name: opts.categoryName, item: undefined }] : []),
        { '@type': 'ListItem', position: opts.categoryName ? 4 : 3, name: post.title, item: postUrl },
      ],
    },
  ];

  if (faqItems.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${postUrl}#faq`,
      mainEntity: faqItems.map((q) => ({
        '@type': 'Question',
        name: q.question.trim(),
        acceptedAnswer: { '@type': 'Answer', text: q.answer.trim() },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
};
