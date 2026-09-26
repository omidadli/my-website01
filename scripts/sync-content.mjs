#!/usr/bin/env node
/**
 * sync-content.mjs — round-trip the site content between Git and the live site.
 *
 *   node scripts/sync-content.mjs export                  # live site → content/site-content.json
 *   node scripts/sync-content.mjs import [options]        # content/site-content.json → live site
 *
 * import options:
 *   --base <file>   previous Git version of the content file (3-way merge base).
 *                   CI passes the pre-push version so edits made on the live site
 *                   (admin panel / Claude MCP) since the last export are NOT lost.
 *   --force         on a conflict (same section changed in Git AND on the live
 *                   site) let Git win instead of aborting.
 *   --dry-run       show what would change, write nothing.
 *
 * How import merges (per top-level section):
 *   - sections that exist only on the live site (THEME_CONFIG, NAVIGATION_MENU,
 *     MEDIA_LIBRARY, VERSION_HISTORY, …) are always preserved — import is NOT a
 *     blind full overwrite;
 *   - with --base: a section is taken from Git only if Git changed it; if only
 *     the live site changed it, the live value is kept; if both changed it:
 *       · id-keyed collections (BLOG_POSTS, PRODUCTS, …) are merged item by item
 *         (new posts from Git + posts edited on the live site both survive);
 *         only an item changed on BOTH sides is a conflict;
 *       · any other section is a conflict;
 *     conflicts abort with exit code 3 unless --force;
 *   - without --base: Git wins for every section present in the file.
 *
 * Env: SITE_URL, ADMIN_USERNAME, ADMIN_PASSWORD  (see scripts/site-client.mjs)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteClient, NO_CHANGE } from './site-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_FILE = resolve(__dirname, '../content/site-content.json');

/** Sections that are runtime state, not authored content — never frozen into Git. */
const RUNTIME_SECTIONS = ['BLOG_COMMENTS', 'VERSION_HISTORY', 'AUDIT_LOGS'];

const argv = process.argv.slice(2);
const mode = (argv[0] || '').toLowerCase();
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const client = new SiteClient();
const log = (...a) => console.log('[sync-content]', ...a);
const inCI = process.env.GITHUB_ACTIONS === 'true';
const annotate = (level, msg) => console.log(inCI ? `::${level}::${msg}` : `[sync-content] ${level.toUpperCase()}: ${msg}`);

const isEmpty = (c) => !c || typeof c !== 'object' || Object.keys(c).length === 0;
const stable = (v) => JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : val));
const same = (a, b) => stable(a) === stable(b);
const stripRuntime = (c) => {
  const out = { ...c };
  for (const k of RUNTIME_SECTIONS) delete out[k];
  return out;
};
const readJson = (file, label) => {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not a JSON object');
    return v;
  } catch (e) {
    throw new Error(`Cannot read/parse ${label} (${file}): ${e.message}`);
  }
};

// ---------------------------------------------------------------------------
async function doExport() {
  log(`fetching content from ${client.baseUrl} …`);
  const content = await client.getContent();
  if (isEmpty(content)) {
    annotate('notice', `The live site has no saved content yet (${client.baseUrl}/api/content → data: null) — nothing to export.`);
    return;
  }
  const out = stripRuntime(content);
  mkdirSync(dirname(CONTENT_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  log(`wrote ${CONTENT_FILE} (${Object.keys(out).length} sections)`);
}

/** Key of a collection item (`id`), or undefined when the value is not an id-keyed record. */
const itemKey = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && (typeof v.id === 'string' || typeof v.id === 'number') && v.id !== ''
    ? String(v.id)
    : undefined;

/** Map id → item when `arr` is an array of records with unique ids; otherwise null. */
const indexById = (arr) => {
  if (arr === undefined) return new Map();
  if (!Array.isArray(arr)) return null;
  const map = new Map();
  for (const item of arr) {
    const k = itemKey(item);
    if (k === undefined || map.has(k)) return null;
    map.set(k, item);
  }
  return map;
};

/**
 * 3-way merge of an id-keyed collection (BLOG_POSTS, PRODUCTS, CASE_STUDIES …),
 * item by item. Adding new posts in Git while an existing post was edited on
 * the live site is NOT a conflict — both changes survive. Only an item changed
 * differently on both sides conflicts.
 *
 * Order: Git's order, with items that exist only on the live site inserted
 * right after the item that precedes them on the live site.
 * Returns { value, conflicts: [ids] } or null when the section isn't a collection.
 */
export function mergeCollection({ git, live, base }) {
  const g = indexById(git);
  const l = indexById(live);
  const b = indexById(base);
  if (!g || !l || !b) return null;
  if (!Array.isArray(git) && !Array.isArray(live)) return null;

  const pick = new Map(); // id → merged item (absent = deleted)
  const conflicts = [];
  const ids = new Set([...g.keys(), ...l.keys(), ...b.keys()]);
  for (const id of ids) {
    const gi = g.get(id);
    const li = l.get(id);
    const bi = b.get(id);
    let v;
    if (same(gi, li)) v = gi;
    else if (same(gi, bi)) v = li; // only the live site changed (or deleted) it
    else if (same(li, bi)) v = gi; // only Git changed (or deleted / added) it
    else {
      conflicts.push(id);
      v = gi; // stage Git's version; the caller decides (abort unless --force)
    }
    if (v !== undefined) pick.set(id, v);
  }

  const order = [];
  const placed = new Set();
  for (const item of git || []) {
    const id = itemKey(item);
    if (pick.has(id)) { order.push(id); placed.add(id); }
  }
  let prev = null;
  for (const item of live || []) {
    const id = itemKey(item);
    if (pick.has(id) && !placed.has(id)) {
      const at = prev === null ? 0 : order.indexOf(prev) + 1;
      order.splice(at, 0, id);
      placed.add(id);
    }
    if (placed.has(id)) prev = id;
  }
  return { value: order.map((id) => pick.get(id)), conflicts };
}

/**
 * Merge the Git file into the live content, section by section.
 * Id-keyed collections changed on both sides are merged item by item.
 * Returns { merged, taken, kept, conflicts, merges } for reporting.
 */
export function mergeContent({ git, live, base }) {
  const merged = { ...(live || {}) };
  const taken = []; // sections written from Git
  const kept = []; // sections where the live value was kept although it differs from Git
  const conflicts = []; // both sides changed the same section / item (base known)
  const merges = []; // sections merged item by item
  for (const key of Object.keys(git)) {
    const gitVal = git[key];
    const liveVal = live ? live[key] : undefined;
    if (same(gitVal, liveVal)) continue; // already identical
    if (!base) {
      merged[key] = gitVal;
      taken.push(key);
      continue;
    }
    const gitChanged = !same(gitVal, base[key]);
    const liveChanged = !same(liveVal, base[key]);
    if (gitChanged && liveChanged) {
      const coll = mergeCollection({ git: gitVal, live: liveVal, base: base[key] });
      if (coll) {
        for (const id of coll.conflicts) conflicts.push(`${key}[${id}]`);
        merges.push(key);
        if (!same(coll.value, liveVal)) {
          merged[key] = coll.value;
          taken.push(key);
        }
        continue;
      }
      conflicts.push(key);
    }
    if (gitChanged) {
      merged[key] = gitVal;
      taken.push(key);
    } else {
      kept.push(key); // only the live site changed it → keep the live edit
    }
  }
  return { merged, taken, kept, conflicts, merges };
}

async function doImport() {
  const force = flag('--force') || process.env.SYNC_FORCE === '1';
  const dryRun = flag('--dry-run');
  const baseFile = opt('--base');

  log(`reading ${CONTENT_FILE} …`);
  const git = stripRuntime(readJson(CONTENT_FILE, 'content file'));
  if (isEmpty(git)) throw new Error('content file has no sections — refusing to import an empty document.');

  let base = null;
  if (baseFile) {
    try {
      const b = readJson(baseFile, 'base file');
      base = isEmpty(b) ? null : stripRuntime(b);
    } catch (e) {
      annotate('warning', `${e.message} — continuing without a merge base (Git wins).`);
    }
  }

  log(`fetching live content from ${client.baseUrl} …`);

  // Plan the merge against the live content; fail on a true conflict.
  const plan = (liveRaw) => {
    const live = isEmpty(liveRaw) ? null : liveRaw;
    if (!live) log('live content is empty → seeding it from Git.');
    const result = mergeContent({ git, live, base: live ? base : null });
    if (result.conflicts.length) {
      const list = result.conflicts.join(', ');
      if (!force) {
        annotate(
          'error',
          `Conflict: these sections changed BOTH in Git and on the live site since the last export: ${list}. ` +
            `Run the "Export live content to Git" workflow (or: npm run content:export), reconcile, and push again — ` +
            `or re-run this import with --force / force=true to let Git win.`
        );
        process.exit(3);
      }
      annotate('warning', `Conflict in ${list} — Git wins because --force was given (live edits in those sections are overwritten).`);
    }
    if (result.kept.length) log(`kept live edits (unchanged in Git): ${result.kept.join(', ')}`);
    for (const key of result.merges) {
      const n = (v) => (Array.isArray(v) ? v.length : 0);
      log(`merged ${key} item by item: live ${n(live?.[key])} → ${n(result.merged[key])} items (Git ${n(git[key])}, base ${n(base?.[key])})`);
    }
    return result;
  };

  if (dryRun) {
    const { taken } = plan(await client.getContent());
    log(taken.length ? `would write sections from Git: ${taken.join(', ')}` : 'live site already matches Git — nothing to do.');
    return;
  }

  // Conditional write: if the site changes between read and write (admin panel,
  // Claude MCP), the API answers 409 and the merge is re-planned on fresh data.
  const r = await client.updateContent((liveRaw) => {
    const { merged, taken } = plan(liveRaw);
    if (!taken.length) return NO_CHANGE;
    log(`writing sections from Git: ${taken.join(', ')}`);
    return merged;
  });
  if (r.skipped) log('live site already matches Git — nothing to do.');
  else log(`done. updatedAt=${r.updatedAt || '?'}`);
}

// ---------------------------------------------------------------------------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  (async () => {
    try {
      if (mode === 'export') await doExport();
      else if (mode === 'import') await doImport();
      else {
        console.error('Usage: node scripts/sync-content.mjs <export|import> [--base <file>] [--force] [--dry-run]');
        process.exit(2);
      }
    } catch (e) {
      annotate('error', e.message);
      process.exit(1);
    }
  })();
}
