/**
 * Stale-seed repairs applied when stored content is adopted (src/utils/contentMigrations.ts) and the
 * profile-photo rules (src/utils/profilePhoto.ts).
 *
 * Run: npx tsx scripts/content-migrations.test.ts
 */
import assert from 'node:assert/strict';
import { PERSONAL_INFO } from '../src/data/content';
import { migratePersonalInfo, reconcileGlobalSeo } from '../src/utils/contentMigrations';
import { defaultGlobalSeo } from '../lib/seoDefaults';
import { BUILT_IN_PROFILE_PHOTO, customProfilePhoto, isStockPortrait, resolveAuthorPhoto } from '../src/utils/profilePhoto';

// ---- the default footer domain is the real one ----
assert.equal(PERSONAL_INFO.website, 'omidadli.site');
assert.equal(PERSONAL_INFO.avatar, BUILT_IN_PROFILE_PHOTO);

// ---- stored PERSONAL_INFO ----
const defaults = { avatar: BUILT_IN_PROFILE_PHOTO };
assert.equal(migratePersonalInfo({ website: 'omidadli01.site', avatar: 'data:image/jpeg;base64,AAAA' }, defaults).website, 'omidadli.site');
assert.equal(
  migratePersonalInfo({ website: 'omidadli.site', avatar: 'data:image/jpeg;base64,AAAA' }, defaults).avatar,
  'data:image/jpeg;base64,AAAA',
  "the owner's own upload is never replaced",
);
assert.equal(migratePersonalInfo({ avatar: '' }, defaults).avatar, BUILT_IN_PROFILE_PHOTO, 'empty → built-in');
assert.equal(
  migratePersonalInfo({ avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80' }, defaults).avatar,
  BUILT_IN_PROFILE_PHOTO,
  'stock portrait → built-in',
);
assert.equal(
  migratePersonalInfo({ avatar: 'https://images.unsplash.com/photo-1111111111111-aaaaaaaaaaaa?w=600' }, defaults).avatar,
  'https://images.unsplash.com/photo-1111111111111-aaaaaaaaaaaa?w=600',
  'a different Unsplash picture the owner picked on purpose stays',
);

// ---- GLOBAL_SEO from the database ----
const stale = {
  faviconUrl: '/favicon.ico',
  ogImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80',
  canonicalBaseUrl: 'https://omidadli.com',
  robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://omidadli.com/sitemap.xml',
};
const seo = reconcileGlobalSeo(defaultGlobalSeo, stale);
assert.equal(seo.canonicalBaseUrl, 'https://omidadli.site');
assert.ok(seo.robotsTxt.endsWith('Sitemap: https://omidadli.site/sitemap.xml'));
assert.equal(seo.faviconUrl, defaultGlobalSeo.faviconUrl);
assert.equal(seo.ogImage, defaultGlobalSeo.ogImage);
assert.equal(seo.siteTitle, defaultGlobalSeo.siteTitle, 'missing fields come from the defaults');
assert.equal(reconcileGlobalSeo(defaultGlobalSeo, undefined).canonicalBaseUrl, 'https://omidadli.site');

// ---- which photo the pages show ----
assert.equal(customProfilePhoto(''), null);
assert.equal(customProfilePhoto(undefined), null);
assert.equal(customProfilePhoto('/profile-photo-hero.webp'), null);
assert.equal(customProfilePhoto('/profile-photo-web.jpg'), null, 'the older built-in default also means "built-in"');
assert.equal(customProfilePhoto('  data:image/png;base64,Zm9v  '), 'data:image/png;base64,Zm9v', 'uploads are used as-is (trimmed)');
assert.equal(customProfilePhoto('/media/me.webp'), '/media/me.webp');
assert.ok(isStockPortrait('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'));
assert.ok(!isStockPortrait('/profile-photo-web.jpg'));

// author box: article photo → else the site's profile photo, never a stranger
assert.equal(resolveAuthorPhoto('/profile-photo-web.jpg', 'data:image/png;base64,Zm9v'), '/profile-photo-web.jpg');
assert.equal(resolveAuthorPhoto('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', 'data:image/png;base64,Zm9v'), 'data:image/png;base64,Zm9v');
assert.equal(resolveAuthorPhoto('', ''), '/profile-photo-160.webp');
assert.equal(resolveAuthorPhoto(undefined, '/profile-photo-hero.webp'), '/profile-photo-160.webp');

console.log('content-migrations.test.ts: all assertions passed');

// ---- section labels ----
{
  const { refreshSectionLabels } = await import('../src/utils/contentMigrations');
  const defaults = [
    { id: 'a', name: 'INSIGHTS', label: 'نوشت‌های تازه', isHidden: false },
    { id: 'b', name: 'FAQ', label: 'پرسش‌ها', isHidden: false },
  ];
  const stored = [
    { id: 'b', name: 'FAQ', label: 'پرسش‌ها', isHidden: true },
    { id: 'a', name: 'INSIGHTS', label: 'آنالیز رایگان + نوشت‌های تازه', isHidden: false },
    { id: 'z', name: 'CUSTOM', label: 'x', isHidden: false },
  ];
  type Section = { id: string; name: string; label: string; isHidden: boolean };
  const out = refreshSectionLabels<Section>(stored, defaults);
  assert.equal(out[1].label, 'نوشت‌های تازه', 'stale label replaced');
  assert.equal(out[0].isHidden, true, 'visibility the admin chose is kept');
  assert.deepEqual(out.map((s) => s.id), ['b', 'a', 'z'], 'order and unknown sections are kept');
  assert.deepEqual(refreshSectionLabels<Section>(undefined, defaults), defaults);
  console.log('section labels ok');
}
