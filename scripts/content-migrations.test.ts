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

// ---- reconcileSections: a section shipped after the list was saved must not stay invisible ----
{
  const { reconcileSections } = await import('../src/utils/contentMigrations');
  const { defaultPageSections } = await import('../src/context/ContentContext');
  type Section = { id: string; name: string; label: string; isHidden: boolean };

  // The home list production actually holds (no AI_TOOLS): visibility/order chosen by the admin must survive.
  const live: Section[] = defaultPageSections.home
    .filter((s) => s.name !== 'AI_TOOLS')
    .map((s) => ({ ...s, label: s.name === 'INSIGHTS' ? 'آنالیز رایگان + نوشت‌های تازه' : s.label }));
  live.find((s) => s.name === 'FAQ')!.isHidden = true;
  const healed = reconcileSections<Section>(live, defaultPageSections.home);
  const names = healed.map((s) => s.name);
  assert.equal(healed.length, defaultPageSections.home.length, 'the missing section is added, nothing else');
  assert.ok(names.includes('AI_TOOLS'), 'AI_TOOLS is back');
  assert.equal(names.indexOf('AI_TOOLS'), names.indexOf('INSIGHTS') + 1, 'right after INSIGHTS, where the design puts it');
  assert.ok(names.indexOf('AI_TOOLS') < names.indexOf('FAQ'));
  assert.equal(healed.find((s) => s.name === 'AI_TOOLS')!.isHidden, false, 'a restored section starts visible');
  assert.equal(healed.find((s) => s.name === 'FAQ')!.isHidden, true, 'what the admin hid stays hidden');
  assert.equal(healed.find((s) => s.name === 'INSIGHTS')!.label, defaultPageSections.home.find((s) => s.name === 'INSIGHTS')!.label, 'labels follow the code');

  // the admin's own ordering is kept: move FAQ to the top and the healed list still starts with it
  const reordered = [live.find((s) => s.name === 'FAQ')!, ...live.filter((s) => s.name !== 'FAQ')];
  assert.equal(reconcileSections<Section>(reordered, defaultPageSections.home)[0].name, 'FAQ');

  // an already complete list is returned as it is (same order and flags)
  const complete = defaultPageSections.home.map((s) => ({ ...s }));
  assert.deepEqual(reconcileSections<Section>(complete, defaultPageSections.home), complete);

  // several missing sections keep their relative order; a missing FIRST section goes to the top
  const mini = [
    { id: '1', name: 'A', label: 'a', isHidden: false },
    { id: '2', name: 'B', label: 'b', isHidden: false },
    { id: '3', name: 'C', label: 'c', isHidden: false },
    { id: '4', name: 'D', label: 'd', isHidden: false },
  ];
  assert.deepEqual(reconcileSections<Section>([mini[2]], mini).map((s) => s.name), ['A', 'B', 'C', 'D'], 'A,B before C; D after C');
  assert.deepEqual(reconcileSections<Section>([mini[1]], mini).map((s) => s.name), ['A', 'B', 'C', 'D']);

  // sections the code does not know (e.g. a removed page) are kept, junk is dropped, nothing stored → defaults
  const withUnknown = reconcileSections<Section>([...live, { id: 'x', name: 'LEGACY', label: 'old', isHidden: false }, null, 7], defaultPageSections.home);
  assert.ok(withUnknown.some((s) => s.name === 'LEGACY'));
  assert.ok(withUnknown.every((s) => s && typeof s === 'object'));
  assert.deepEqual(reconcileSections<Section>(undefined, mini), mini);
  assert.deepEqual(reconcileSections<Section>([], mini), mini);
  assert.deepEqual(reconcileSections<Section>('nope', mini), mini);

  // every page of the site is healed the same way
  for (const [page, defaults] of Object.entries(defaultPageSections)) {
    assert.deepEqual(reconcileSections<Section>(defaults.slice(1), defaults).map((s) => s.name).sort(), defaults.map((s) => s.name).sort(), `${page}: dropping a section and healing restores the full set`);
  }
  console.log('reconcileSections ok');
}
