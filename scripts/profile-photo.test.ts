import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCustomAvatar, profilePhotoProps } from '../src/utils/profilePhoto.ts';

// default / bundled / legacy placeholder => NOT custom (keep the fast responsive ladder)
for (const v of ['', '   ', undefined, null, '/profile-photo-hero.webp', '/profile-photo-web.jpg', '/profile-photo.png',
  '/profile-photo-160.webp', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600']) {
  assert.equal(isCustomAvatar(v), false, `should not be custom: ${String(v)}`);
}
// anything the admin uploads / pastes => custom
for (const v of ['/api/media/file?key=d1-1792811095742-8fd7aa99a7c3', 'uploads/me.jpg', 'https://cdn.example.com/me.jpg',
  'data:image/jpeg;base64,/9j/4AAQ', '/blog/photo.jpg']) {
  assert.equal(isCustomAvatar(v), true, `should be custom: ${v}`);
}

const custom = profilePhotoProps('/api/media/file?key=d1-1', 'hero');
assert.deepEqual(custom, { src: '/api/media/file?key=d1-1' }, 'custom photo: just src, no stale srcSet from the bundled photo');
assert.ok('srcSet' in profilePhotoProps(undefined, 'pill'), 'default keeps the bundled ladder');
assert.equal(profilePhotoProps('/profile-photo-hero.webp', 'card').src, '/profile-photo-160.webp');

// regression guard: the public pages must not hard-code the bundled photo again
for (const f of ['src/pages/AboutPage.tsx', 'src/pages/HomePage.tsx']) {
  const src = readFileSync(f, 'utf8');
  assert.ok(!/src="\/profile-photo-/.test(src), `${f} hard-codes the profile photo again`);
  assert.ok(src.includes('profilePhotoProps(personal.avatar'), `${f} must read PERSONAL_INFO.avatar`);
}
// the author box of EVERY post must use the one global photo, not a per-post value
const detail = readFileSync('src/pages/BlogPostDetailPage.tsx', 'utf8');
assert.ok(!detail.includes('post.authorAvatar'), 'post pages must not read a per-post author avatar');
assert.ok(detail.includes('profilePhotoProps(data.PERSONAL_INFO.avatar'), 'post pages must read PERSONAL_INFO.avatar');
assert.ok(!/key: 'authorAvatar'/.test(readFileSync('src/pages/AdminPage.tsx', 'utf8')), 'admin must not offer a per-post avatar (it would be a dead field)');
console.log('profile-photo.test.ts: all checks passed');
