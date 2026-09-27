/**
 * Minimal path-based router for the SPA.
 *
 * URLs are real paths (`/services`, `/blog/<slug>`, `/<custom-page-slug>`) served by
 * Cloudflare Pages' SPA fallback, so every page is a distinct, indexable,
 * shareable URL. The previous hash routes (`/#/blog/<slug>`, `/#services`) are
 * still understood and transparently upgraded to their path form so old links
 * shared on social media keep working. Pure route logic lives in lib/routes.ts
 * (shared with the edge middleware and the sitemap).
 */
import type React from 'react';
import type { Page } from '../types';
import { legacyHashToPath, parsePath, pathForPage as _pathForPage, routeToPath, type Route as BaseRoute } from '../../lib/routes';

export { STATIC_PAGES, pathForPost, postPath, pathForProduct, routeToPath, legacyHashToPath, parsePath } from '../../lib/routes';

export interface Route extends BaseRoute {
  page: Page;
}

/** Custom event fired after a programmatic navigation (pushState/replaceState). */
export const NAVIGATE_EVENT = 'nd:navigate';

export const pathForPage = (page: Page): string => _pathForPage(String(page));

/** Current route from the window (path first, legacy hash as a fallback). */
export const currentRoute = (customSlugs: readonly string[] = []): { route: Route | null; upgradedFromHash: boolean } => {
  if (typeof window === 'undefined') return { route: { page: 'home', postId: null }, upgradedFromHash: false };
  const { pathname, hash } = window.location;
  const legacy = legacyHashToPath(hash, customSlugs);
  if (legacy && (pathname === '/' || pathname === '/index.html')) {
    return { route: parsePath(legacy, customSlugs) as Route | null, upgradedFromHash: true };
  }
  return { route: parsePath(pathname, customSlugs) as Route | null, upgradedFromHash: false };
};

/** pushState/replaceState + notify the app (popstate does not fire for programmatic changes). */
export const navigate = (path: string, opts: { replace?: boolean } = {}): void => {
  if (typeof window === 'undefined') return;
  const target = path.startsWith('/') ? path : `/${path}`;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current !== target) {
    try {
      window.history[opts.replace ? 'replaceState' : 'pushState'](null, '', target);
    } catch {
      window.location.assign(target);
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path: target } }));
};

/** True for plain left-clicks that should be handled in-app (lets ⌘/ctrl-click open a new tab). */
export const isPlainLeftClick = (e: React.MouseEvent): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;

/** `<a>` props for an in-app link: real href for crawlers/new-tab, SPA navigation on plain clicks. */
export const linkProps = (path: string, onActivate: () => void) => ({
  href: path,
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onActivate();
  },
});

