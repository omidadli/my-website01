#!/usr/bin/env node
/**
 * Unit tests for the Git ⇄ live-site content merge (scripts/sync-content.mjs).
 *   node scripts/sync-content.test.mjs
 */
import assert from 'node:assert/strict';
import { mergeContent } from './sync-content.mjs';

const base = { A: 1, B: { x: 1 }, C: [1] };
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✓', name); };

test('live-only sections are preserved; without a base Git wins', () => {
  const r = mergeContent({ git: { A: 2 }, live: { A: 1, THEME_CONFIG: 'dark' }, base: null });
  assert.deepEqual(r.merged, { A: 2, THEME_CONFIG: 'dark' });
  assert.deepEqual(r.taken, ['A']);
});

test('3-way: live-only change is kept, Git-only change is taken', () => {
  const r = mergeContent({ git: { A: 2, B: { x: 1 }, C: [1] }, live: { A: 1, B: { x: 9 }, C: [1], T: 't' }, base });
  assert.deepEqual(r.merged, { A: 2, B: { x: 9 }, C: [1], T: 't' });
  assert.deepEqual(r.kept, ['B']);
  assert.deepEqual(r.taken, ['A']);
  assert.deepEqual(r.conflicts, []);
});

test('3-way: both sides changed the same section → conflict reported (Git value staged)', () => {
  const r = mergeContent({ git: { A: 1, B: { x: 1 }, C: [2] }, live: { A: 1, B: { x: 1 }, C: [3] }, base });
  assert.deepEqual(r.conflicts, ['C']);
  assert.deepEqual(r.merged.C, [2]);
});

test('identical content → nothing to write', () => {
  const r = mergeContent({ git: { A: 1 }, live: { A: 1, Z: 0 }, base });
  assert.deepEqual(r.taken, []);
  assert.deepEqual(r.merged, { A: 1, Z: 0 });
});

test('object key order does not count as a change', () => {
  const r = mergeContent({ git: { B: { x: 1, y: 2 } }, live: { B: { y: 2, x: 1 } }, base: null });
  assert.deepEqual(r.taken, []);
});

test('empty live site is seeded from Git', () => {
  const r = mergeContent({ git: { NEW: 1 }, live: null, base: null });
  assert.deepEqual(r.merged, { NEW: 1 });
  assert.deepEqual(r.taken, ['NEW']);
});

test('section added in Git (absent from base and live) is taken', () => {
  const r = mergeContent({ git: { A: 1, B: { x: 1 }, C: [1], NEW: 'n' }, live: { A: 1, B: { x: 1 }, C: [1] }, base });
  assert.deepEqual(r.taken, ['NEW']);
  assert.equal(r.merged.NEW, 'n');
});

test('collections: new items in Git + item edited on live → both survive, no conflict', () => {
  const b = { POSTS: [{ id: 'a', t: 1 }, { id: 'b', t: 1 }] };
  const g = { POSTS: [{ id: 'n1', t: 1 }, { id: 'n2', t: 1 }, { id: 'a', t: 1 }, { id: 'b', t: 1 }] };
  const l = { POSTS: [{ id: 'a', t: 1, status: 'draft' }, { id: 'b', t: 2 }], THEME: 'x' };
  const r = mergeContent({ git: g, live: l, base: b });
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.taken, ['POSTS']);
  assert.deepEqual(r.merges, ['POSTS']);
  assert.deepEqual(r.merged.POSTS, [{ id: 'n1', t: 1 }, { id: 'n2', t: 1 }, { id: 'a', t: 1, status: 'draft' }, { id: 'b', t: 2 }]);
  assert.equal(r.merged.THEME, 'x');
});

test('collections: deletion on live is kept, live-only additions keep their position', () => {
  const b = { P: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const g = { P: [{ id: 'new' }, { id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const l = { P: [{ id: 'a' }, { id: 'live1' }, { id: 'c' }] };
  const r = mergeContent({ git: g, live: l, base: b });
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.merged.P.map((x) => x.id), ['new', 'a', 'live1', 'c']);
});

test('collections: same item changed differently on both sides → item-level conflict', () => {
  const b = { P: [{ id: 'a', t: 0 }] };
  const r = mergeContent({ git: { P: [{ id: 'a', t: 1 }] }, live: { P: [{ id: 'a', t: 2 }] }, base: b });
  assert.deepEqual(r.conflicts, ['P[a]']);
  assert.deepEqual(r.merged.P, [{ id: 'a', t: 1 }]);
});

test('arrays without unique ids still conflict as a whole section', () => {
  const r = mergeContent({ git: { C: [{ x: 1 }] }, live: { C: [{ x: 2 }] }, base: { C: [{ x: 0 }] } });
  assert.deepEqual(r.conflicts, ['C']);
});

console.log(`\nsync-content merge: ${n} tests passed`);

// ---- setByPath hardening (used by the MCP set_field tool) ----
{
  const { setByPath, getByPath } = await import('./site-client.mjs');
  const root = { PRODUCTS: [{ title: 'a' }], PERSONAL_INFO: { name: 'x' } };
  setByPath(root, 'PERSONAL_INFO.tagline', 'new');
  assert.equal(getByPath(root, 'PERSONAL_INFO.tagline'), 'new', 'setByPath sets a nested field');
  setByPath(root, 'PRODUCTS.1.title', 'b');
  assert.equal(root.PRODUCTS.length, 2, 'setByPath appends at index = length');
  setByPath(root, 'AI_TOOLS_CONFIG.tools.growth-path.enabled', false);
  assert.equal(root.AI_TOOLS_CONFIG.tools['growth-path'].enabled, false, 'setByPath creates intermediate objects');
  assert.throws(() => setByPath(root, 'PRODUCTS.title', 'x'), /numeric index/, 'non-numeric key on an array is rejected');
  assert.throws(() => setByPath(root, 'PRODUCTS.9.title', 'x'), /past the end/, 'index past the end is rejected');
  assert.throws(() => setByPath(root, '__proto__.polluted', 1), /Invalid path segment/, 'prototype pollution is rejected');
  assert.throws(() => setByPath(root, '', 1), /empty/, 'empty path is rejected');
  assert.equal({}.polluted, undefined, 'Object.prototype untouched');
  console.log('✓ setByPath hardening');
}
