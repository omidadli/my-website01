import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeOverrides, normalizeHex, SHIPPED_THEME } from '../src/utils/themeConfig.ts';

// the value stored by default in the live DB must NOT repaint the site
assert.deepEqual(themeOverrides({ ...SHIPPED_THEME }), { vars: {}, rootFontSize: null });
assert.deepEqual(themeOverrides({ accentColor: '#8B5CF6', fontScale: 1 }), { vars: {}, rootFontSize: null }, 'case-insensitive default');
assert.deepEqual(themeOverrides(undefined), { vars: {}, rootFontSize: null });

// a changed accent colour is applied (+ derived strong / soft tokens)
const o = themeOverrides({ accentColor: '#E11D48' });
assert.equal(o.vars['--nd-accent'], '#e11d48');
assert.match(o.vars['--nd-accent-strong'], /^#[0-9a-f]{6}$/);
assert.notEqual(o.vars['--nd-accent-strong'], '#e11d48');
assert.equal(o.vars['--nd-accent-soft'], 'rgba(225, 29, 72, 0.14)');
assert.equal(normalizeHex('#abc'), '#aabbcc');

// invalid input is ignored, never applied
for (const bad of ['red', '#12', '#gggggg', '', 42, null]) assert.deepEqual(themeOverrides({ accentColor: bad }).vars, {});

// font scale: applied only when changed and within the admin's own 0.8–1.3 range
assert.equal(themeOverrides({ fontScale: 1.1 }).rootFontSize, '110.0%');
assert.equal(themeOverrides({ fontScale: 0.9 }).rootFontSize, '90.0%');
for (const bad of [1, 0.5, 2, NaN, 'abc']) assert.equal(themeOverrides({ fontScale: bad as any }).rootFontSize, null);

// regression guards: these admin fields must stay wired to the public site
const projects = readFileSync('src/pages/ProjectsPage.tsx', 'utf8');
assert.ok(projects.includes('proj.isPlaceholder'), 'ONGOING_PROJECTS.isPlaceholder must affect the Projects page');
assert.ok(projects.includes('capacityStatus'), 'PROJECTS_PAGE_DATA.capacityStatus must affect the Projects page');
assert.ok(readFileSync('src/App.tsx', 'utf8').includes('themeOverrides(data.THEME_CONFIG)'), 'THEME_CONFIG must be applied in App');
console.log('theme-config.test.ts: all checks passed');
