import React, { useEffect } from 'react';
import { useContent } from '../context/ContentContext';
import { Page } from '../types';
import { pathForPage, postPath } from '../utils/router';
import { resolveSeo, buildDocumentTitle, buildPostJsonLd, NOT_FOUND_TITLE } from '../../lib/seoDefaults';

interface SEOHeadProps {
  currentPage: Page;
  /** When a blog post is open, its own SEO overrides the page-level config. */
  blogPostId?: string | null;
  /** URL matched no route — title "صفحه پیدا نشد" + noindex (mirrors the edge 404). */
  notFound?: boolean;
}

/** Applies CMS SEO settings (global → page → post) to the document head. */
export const SEOHead: React.FC<SEOHeadProps> = ({ currentPage, blogPostId, notFound = false }) => {
  const { data, isAdmin } = useContent();
  const globalSeo = data.GLOBAL_SEO;
  const pageSeo = data.PAGE_SEO[currentPage] || {};
  const post =
    currentPage === 'blog' && blogPostId
      ? (data.BLOG_POSTS || []).find((p) => p.id === blogPostId || (!!p.slug && p.slug === blogPostId))
      : null;

  useEffect(() => {
    const seo = resolveSeo({ page: currentPage, post, globalSeo, pageSeo, isAdmin });
    // A post URL that matches nothing is a 404 too (the edge answers 404 for it as well).
    const missingPost = currentPage === 'blog' && !!blogPostId && !post;
    if (notFound || missingPost) {
      seo.title = buildDocumentTitle(NOT_FOUND_TITLE, globalSeo);
      seo.ogTitle = seo.title;
      seo.noIndex = true;
    }
    document.title = seo.title;
    setMetaTag('description', seo.description);
    setMetaTag('keywords', seo.keywords);

    // Open Graph
    setMetaProperty('og:title', seo.ogTitle);
    setMetaProperty('og:description', seo.ogDescription);
    setMetaProperty('og:image', seo.ogImage);
    setMetaProperty('og:type', seo.ogType);
    setMetaProperty('og:locale', 'fa_IR');

    // Canonical — real paths (/services, /blog/<slug>), base URL from the CMS.
    const base = (globalSeo.canonicalBaseUrl || '').replace(/\/$/, '');
    const canonical = notFound
      ? `${base}/`
      : missingPost
        ? `${base}/blog`
        : post
        ? post.seo?.canonicalUrl || `${base}${postPath(post)}`
        : pageSeo.canonicalUrl || `${base}${pathForPage(currentPage)}`;
    setLinkRel('canonical', canonical);
    setMetaProperty('og:url', canonical);

    // Robots / noindex — drafts are always hidden from crawlers (admin still previews them).
    setMetaTag('robots', seo.noIndex ? 'noindex, nofollow' : 'index, follow');

    // Favicon
    if (globalSeo.faviconUrl) {
      setLinkRel('icon', globalSeo.faviconUrl);
    }

    // JSON-LD — BlogPosting + BreadcrumbList (+ FAQPage) for open posts only.
    if (post && !seo.noIndex && !missingPost) {
      setJsonLd(
        buildPostJsonLd(post, base || '', {
          categoryName: typeof (post as any).categoryFa === 'string' && (post as any).categoryFa ? (post as any).categoryFa : undefined,
          authorRole: typeof (post as any).authorRole === 'string' ? (post as any).authorRole : undefined,
        }),
      );
    } else {
      setJsonLd(null);
    }
  }, [currentPage, blogPostId, post, pageSeo, globalSeo, isAdmin, notFound]);

  return null;
};

function setMetaTag(name: string, content: string) {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setMetaProperty(property: string, content: string) {
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setLinkRel(rel: string, href: string) {
  let element = document.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
  if (rel === 'icon') {
    // Keep the MIME type in sync with the file, otherwise an SVG/PNG favicon set from the CMS may be ignored.
    const ext = (href.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
    const type = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'ico' ? 'image/x-icon' : '';
    if (type) element.setAttribute('type', type);
    else element.removeAttribute('type');
  }
}

function setJsonLd(json: string | null) {
  let element = document.getElementById('nd-post-jsonld') as HTMLScriptElement | null;
  if (!json) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    element.id = 'nd-post-jsonld';
    document.head.appendChild(element);
  }
  element.textContent = json;
}
