/**
 * Service tabs: every service must be listed somewhere, and the ten built-in services must stay exactly where the
 * pages used to hard-code them.
 *
 * Production bug: /services and the home page filtered by a fixed list of the built-in ids, so a service added in
 * the admin panel — even a published one — appeared in no tab at all.
 *
 * Run: npx tsx scripts/service-path.test.ts
 */
import assert from 'node:assert/strict';
import { SERVICES } from '../src/data/content';
import { BUILT_IN_SERVICE_TAB, SERVICE_TABS, isServiceTab, serviceTab, servicesInTab, withServicePaths } from '../src/utils/servicePath';

// what HomePage.tsx / ServicesPage.tsx hard-coded before — the regression oracle
const LEGACY = {
  start: ['web-app-design', 'ui-ux-design', 'social-media-strategy'],
  sell: ['performance-marketing', 'cro-optimization', 'tracking-analytics'],
  grow: ['seo-growth', 'growth-strategy', 'marketing-automation', 'retention-strategy'],
} as const;

// ---- the built-in services did not move ----
for (const tab of SERVICE_TABS) {
  assert.deepEqual(
    servicesInTab(SERVICES, tab).map((s) => s.id),
    SERVICES.map((s) => s.id).filter((id) => (LEGACY[tab] as readonly string[]).includes(id)),
    `built-in services of "${tab}" are unchanged (and in the same order)`,
  );
}
for (const [tab, ids] of Object.entries(LEGACY)) for (const id of ids) assert.equal(BUILT_IN_SERVICE_TAB[id], tab, `${id} → ${tab}`);
assert.equal(Object.keys(BUILT_IN_SERVICE_TAB).length, 10);
assert.ok(SERVICES.every((s) => s.id in BUILT_IN_SERVICE_TAB), 'every shipped service has a tab');

// ---- a service added in the admin is visible ----
interface ServiceRow { id: string; title: string; pathCategory?: string }
const added: ServiceRow = { id: 'service-1790000000000', title: 'خدمت تازه' };
assert.equal(serviceTab(added), 'start', 'no path chosen → the first tab, never invisible');
assert.deepEqual(servicesInTab([...SERVICES, added], 'start').map((s) => s.id).slice(-1), [added.id]);
for (const tab of SERVICE_TABS) assert.equal(serviceTab({ ...added, pathCategory: tab }), tab, `explicit "${tab}" is honoured`);

// ---- the admin can move a built-in service ----
assert.equal(serviceTab({ id: 'seo-growth', pathCategory: 'start' }), 'start', 'an explicit choice beats the built-in default');
assert.equal(serviceTab({ id: 'seo-growth', pathCategory: 'nonsense' }), 'grow', 'garbage falls back to the built-in tab');
assert.equal(serviceTab({ id: 'seo-growth', pathCategory: '' }), 'grow');
assert.equal(serviceTab({ id: 'seo-growth' }), 'grow');
assert.equal(serviceTab(null), 'start');
assert.equal(serviceTab(undefined), 'start');
assert.equal(serviceTab({}), 'start');

// ---- the three tabs partition the list: nothing lost, nothing twice ----
const mixed: ServiceRow[] = [...SERVICES, added, { ...added, id: 'b', pathCategory: 'grow' }, { ...added, id: 'c', pathCategory: 'sell' }, { ...added, id: 'd', pathCategory: 'oops' }];
const seen = SERVICE_TABS.flatMap((t) => servicesInTab(mixed, t).map((s) => s.id));
assert.equal(seen.length, mixed.length, 'every service is in exactly one tab');
assert.deepEqual([...seen].sort(), mixed.map((s) => s.id).sort());

// ---- explicit paths for the admin form ----
const input: ServiceRow[] = [...SERVICES.slice(0, 3), added];
const frozen = JSON.stringify(input);
const explicit = withServicePaths(input);
assert.equal(JSON.stringify(input), frozen, 'does not mutate its input');
assert.ok(explicit.every((s) => isServiceTab(s.pathCategory)), 'every service carries its path afterwards');
assert.deepEqual(explicit.map((s) => s.pathCategory), ['start', 'start', 'start', 'start']);
assert.deepEqual(withServicePaths(explicit), explicit, 'idempotent');
assert.deepEqual(withServicePaths([{ id: 'seo-growth', pathCategory: 'sell' }]).map((s) => s.pathCategory), ['sell'], 'an admin choice survives');
assert.deepEqual(withServicePaths([]), []);

console.log('service-path.test.ts: all assertions passed');
