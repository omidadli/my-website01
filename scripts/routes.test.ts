/**
 * Route model + SEO resolution shared by the SPA and the edge middleware.
 * Run: npx tsx scripts/routes.test.ts
 */
import assert from 'node:assert/strict';
import { legacyHashToPath, parsePath, pathForPage, pathForPost, postPath, routeToPath } from '../lib/routes';
import { buildDocumentTitle, defaultGlobalSeo, findPublishedPost, resolveSeo } from '../lib/seoDefaults';

// ---- paths ----
assert.deepEqual(parsePath('/'), { page: 'home', postId: null });
assert.deepEqual(parsePath(''), { page: 'home', postId: null });
assert.deepEqual(parsePath('/services'), { page: 'services', postId: null });
assert.deepEqual(parsePath('/Services/'), { page: 'services', postId: null }, 'case-insensitive + trailing slash');
assert.deepEqual(parsePath('/blog'), { page: 'blog', postId: null });
assert.deepEqual(parsePath('/blog/ga4-setup-guide'), { page: 'blog', postId: 'ga4-setup-guide' });
assert.deepEqual(parsePath('/blog/%D9%85%D9%82%D8%A7%D9%84%D9%87'), { page: 'blog', postId: 'مقاله' }, 'percent-decoded slug');
assert.deepEqual(parsePath('/products'), { page: 'products', postId: null });
assert.deepEqual(parsePath('/products/business-therapist'), { page: 'products', postId: null, productId: 'business-therapist' });
assert.deepEqual(parsePath('/product/growth-path'), { page: 'products', postId: null, productId: 'growth-path' });
assert.deepEqual(parsePath('/admin/anything'), { page: 'admin', postId: null });
assert.deepEqual(parsePath('/landing-x', ['landing-x']), { page: 'landing-x', postId: null }, 'custom page');
assert.equal(parsePath('/landing-x'), null, 'unknown custom page without CMS data');
assert.equal(parsePath('/blog/a/b'), null);
assert.equal(parsePath('/nope'), null);
assert.equal(parsePath('/services/extra'), null);

assert.equal(pathForPage('home'), '/');
assert.equal(pathForPage('services'), '/services');
assert.equal(pathForPost('my-post'), '/blog/my-post');
assert.equal(pathForPost(''), '/blog');
assert.equal(postPath({ id: 'id-1', slug: 'nice-slug' }), '/blog/nice-slug', 'slug preferred');
assert.equal(postPath({ id: 'id-1' }), '/blog/id-1');
assert.equal(postPath(null), '/blog');
assert.equal(routeToPath({ page: 'blog', postId: 'x' }), '/blog/x');
assert.equal(routeToPath({ page: 'blog', postId: null }), '/blog');

// ---- legacy hash links keep working ----
assert.equal(legacyHashToPath('#/blog/ga4-setup-guide'), '/blog/ga4-setup-guide');
assert.equal(legacyHashToPath('#blog/ga4-setup-guide'), '/blog/ga4-setup-guide');
assert.equal(legacyHashToPath('#/services'), '/services');
assert.equal(legacyHashToPath('#services'), '/services');
assert.equal(legacyHashToPath('#admin'), '/admin');
assert.equal(legacyHashToPath('#landing-x', ['landing-x']), '/landing-x');
assert.equal(legacyHashToPath('#faq'), null, 'in-page anchors are left alone');
assert.equal(legacyHashToPath('#'), null);
assert.equal(legacyHashToPath(''), null);

// ---- SEO resolution (browser + edge must agree) ----
const home = resolveSeo({ page: 'home' });
assert.equal(home.title, defaultGlobalSeo.siteTitle, 'home uses the full site title');
assert.equal(home.ogType, 'website');
assert.equal(home.noIndex, false);
const homeExplicit = resolveSeo({ page: 'home', pageSeo: { title: 'خانه' } });
assert.equal(homeExplicit.title, 'خانه | امید عدلی', 'explicit CMS title goes through the template');
const services = resolveSeo({ page: 'services' });
assert.equal(services.title, 'خدمات تخصصی و مشاوره | امید عدلی');
assert.equal(resolveSeo({ page: 'admin' }).noIndex, true, 'admin is never indexed');
assert.equal(resolveSeo({ page: 'products', pageSeo: { noIndex: true } }).noIndex, true);
const post = resolveSeo({ page: 'blog', post: { id: 'p', title: 'عنوان', excerpt: 'خلاصه', coverImage: '/img.jpg', tags: ['a', 'b'] } });
assert.equal(post.title, 'عنوان | امید عدلی');
assert.equal(post.description, 'خلاصه');
assert.equal(post.ogImage, '/img.jpg');
assert.equal(post.keywords, 'a, b');
assert.equal(post.ogType, 'article');
assert.equal(resolveSeo({ page: 'blog', post: { id: 'p', title: 't', status: 'draft' } }).noIndex, true, 'drafts hidden from crawlers');
assert.equal(resolveSeo({ page: 'blog', post: { id: 'p', title: 't', status: 'draft' }, isAdmin: true }).noIndex, false, 'admin previews drafts');
const cmsPosts = [{ id: 'published', slug: 'published', title: 'Public', status: 'published' }, { id: 'draft', slug: 'draft', title: 'Secret draft', status: 'draft' }];
assert.equal(findPublishedPost(cmsPosts, 'published')?.title, 'Public');
assert.equal(findPublishedPost(cmsPosts, 'draft'), null, 'edge middleware must not render draft content in crawler metadata');
assert.equal(findPublishedPost(cmsPosts, 'published')?.id, 'published', 'published slugs resolve in edge metadata');
assert.equal(resolveSeo({ page: 'blog', post: { id: 'p', title: 't', seo: { title: 'SEO', ogImage: 'https://x/y.png' } } }).ogImage, 'https://x/y.png');
assert.equal(buildDocumentTitle('X', { titleTemplate: '' }), `X | ${defaultGlobalSeo.siteTitle}`, 'empty template → "base | site"');
assert.equal(buildDocumentTitle('X', { titleTemplate: '%s — برند' }), 'X — برند');

console.log('✓ routes + seo resolution: all assertions passed');
