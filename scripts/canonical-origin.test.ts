import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCanonicalOrigin, CANONICAL_SITE_URL } from '../lib/seoDefaults.ts';

const R = resolveCanonicalOrigin;
assert.equal(CANONICAL_SITE_URL, 'https://omidadli01.site', 'the real domain of the site (it is the one the admin is served from)');

// THE live bug: the database still holds the old seed https://omidadli.com
assert.equal(R('https://omidadli.com', 'omidadli01.site'), 'https://omidadli01.site');
assert.equal(R('https://omidadli.com/', 'www.omidadli01.site'), 'https://omidadli01.site');
assert.equal(R('https://omidadli.site', 'omidadli01.site'), 'https://omidadli01.site', 'a different domain is never advertised as canonical');
// previews / crawlers hitting the pages.dev alias must still get the real domain
assert.equal(R('https://omidadli.com', 'my-website.pages.dev'), 'https://omidadli01.site');
assert.equal(R('', 'my-website.pages.dev'), 'https://omidadli01.site');
assert.equal(R(undefined, 'localhost:8788'), 'https://omidadli01.site');
// correct / empty / garbage values
assert.equal(R('https://omidadli01.site', 'omidadli01.site'), 'https://omidadli01.site');
assert.equal(R('https://omidadli01.site/', 'my-website.pages.dev'), 'https://omidadli01.site');
assert.equal(R('not a url', 'omidadli01.site'), 'https://omidadli01.site');
assert.equal(R(42, ''), 'https://omidadli01.site');
// moving to a new custom domain keeps working: the CMS value is honoured when the request comes from that host
assert.equal(R('https://example.org', 'example.org'), 'https://example.org');
assert.equal(R('', 'example.org'), 'https://example.org');

// regression guard: nobody may read the raw CMS value for canonical URLs again
for (const f of ['functions/_seo.ts', 'src/components/SEOHead.tsx', 'src/context/ContentContext.tsx']) {
  assert.ok(readFileSync(f, 'utf8').includes('resolveCanonicalOrigin('), `${f} must use resolveCanonicalOrigin`);
}
console.log('canonical-origin.test.ts: all checks passed');
