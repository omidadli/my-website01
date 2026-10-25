import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCanonicalOrigin, CANONICAL_SITE_URL } from '../lib/seoDefaults.ts';

const R = resolveCanonicalOrigin;
const REAL = 'https://omidadli.site';
assert.equal(CANONICAL_SITE_URL, REAL, 'the real domain of the site (confirmed by the owner)');

// THE live bug (verified on the live page): canonical / og:url were https://omidadli.com
assert.equal(R('https://omidadli.com', 'omidadli.site'), REAL);
assert.equal(R('https://omidadli.com/', 'www.omidadli.site'), REAL);
// the old alias omidadli01.site must never be advertised as canonical, whatever the CMS says
assert.equal(R('https://omidadli01.site', 'omidadli01.site'), REAL);
assert.equal(R('https://omidadli.com', 'omidadli01.site'), REAL);
assert.equal(R('', 'omidadli01.site'), REAL);
// previews, crawlers on the pages.dev alias, local dev
assert.equal(R('https://omidadli.com', 'my-website.pages.dev'), REAL);
assert.equal(R('', 'my-website.pages.dev'), REAL);
assert.equal(R(undefined, 'localhost:8788'), REAL);
// correct / noisy / garbage values
assert.equal(R('https://omidadli.site', 'omidadli.site'), REAL);
assert.equal(R('https://omidadli.site/', 'my-website.pages.dev'), REAL);
assert.equal(R('http://omidadli.site', 'omidadli.site'), REAL, 'always https');
assert.equal(R('not a url', 'omidadli.site'), REAL);
assert.equal(R(42, ''), REAL);
// moving to a brand-new domain later: honoured once that domain is the one serving the request
assert.equal(R('https://example.org', 'example.org'), 'https://example.org');
assert.equal(R('https://example.org', 'omidadli.site'), REAL, 'a domain that is not serving this request is not advertised');

// regression guards: nobody may read the raw CMS value or the legacy domain for canonical URLs again
for (const f of ['functions/_seo.ts', 'src/components/SEOHead.tsx', 'src/context/ContentContext.tsx']) {
  assert.ok(readFileSync(f, 'utf8').includes('resolveCanonicalOrigin('), `${f} must use resolveCanonicalOrigin`);
}
assert.ok(!/omidadli01\.site/.test(readFileSync('index.html', 'utf8')), 'index.html still names the legacy domain');
console.log('canonical-origin.test.ts: all checks passed');
