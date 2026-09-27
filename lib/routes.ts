/**
 * Route model shared by the SPA (src/utils/router.ts) and the edge
 * (functions/_middleware.ts, sitemap): one definition of which paths exist and
 * how pages/posts map to URLs, so client, server and sitemap never disagree.
 *
 *   /                → home            /blog            → article list
 *   /services …      → built-in pages  /blog/<slug|id>  → one article
 *   /<custom-slug>   → CMS custom page /admin           → CMS dashboard
 */

export const STATIC_PAGES = ['home', 'services', 'portfolio', 'about', 'blog', 'contact', 'projects', 'products', 'admin'] as const;

export interface Route {
  page: string;
  /** id or slug of the open blog post (page === 'blog' only) */
  postId: string | null;
  /** id of the open product (page === 'products' only) */
  productId?: string | null;
}

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export const pathForPage = (page: string): string => (page === 'home' ? '/' : `/${encodeURIComponent(page)}`);

export const pathForPost = (idOrSlug: string): string => (idOrSlug ? `/blog/${encodeURIComponent(idOrSlug)}` : '/blog');

export const pathForProduct = (productId: string): string => (productId ? `/products/${encodeURIComponent(productId)}` : '/products');

/** Preferred public URL of a post: slug when it has one, id otherwise. */
export const postPath = (post: { id: string; slug?: string } | null | undefined): string =>
  post ? pathForPost(post.slug || post.id) : '/blog';

export const routeToPath = (route: Route): string => {
  if (route.page === 'blog' && route.postId) return pathForPost(route.postId);
  if (route.page === 'products' && route.productId) return pathForProduct(route.productId);
  return pathForPage(route.page);
};

/**
 * Parse a pathname into a route; `null` for unknown paths (the SPA shows the
 * home page, the server answers 404).
 */
export const parsePath = (pathname: string, customSlugs: readonly string[] = []): Route | null => {
  const parts = (pathname || '/').split('/').filter(Boolean).map(decode);
  if (parts.length === 0) return { page: 'home', postId: null };
  const [first, second] = parts;
  const head = first.toLowerCase();
  if (head === 'admin') return { page: 'admin', postId: null };
  if (head === 'blog') {
    if (parts.length === 1) return { page: 'blog', postId: null };
    if (parts.length === 2 && second) return { page: 'blog', postId: second };
    return null;
  }
  if (head === 'products' || head === 'product') {
    if (parts.length === 1) return { page: 'products', postId: null };
    if (parts.length === 2 && second) return { page: 'products', postId: null, productId: second };
    return null;
  }
  if (parts.length !== 1) return null;
  if (head === 'home' || head === 'index.html') return { page: 'home', postId: null };
  if ((STATIC_PAGES as readonly string[]).includes(head)) return { page: head, postId: null };
  if (customSlugs.includes(first)) return { page: first, postId: null };
  return null;
};

/**
 * Legacy hash → path. Accepts `#/blog/x`, `#blog/x`, `#/services`, `#services`,
 * `#admin`. Anything that is not a known route (e.g. an in-page anchor like
 * `#faq`) yields `null` and is left alone.
 */
export const legacyHashToPath = (hash: string, customSlugs: readonly string[] = []): string | null => {
  const raw = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!raw) return null;
  const route = parsePath(`/${raw}`, customSlugs);
  return route ? routeToPath(route) : null;
};
