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
 * SEO box and this file — which is how the docs drifted to `omidadli.site` while
 * every canonical/og/sitemap URL said `omidadli01.site`. Change it here and every
 * consumer follows.
 */
export const CANONICAL_SITE_URL = 'https://omidadli01.site';

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
