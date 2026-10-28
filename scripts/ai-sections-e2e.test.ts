import assert from 'node:assert/strict';
import { AI_SECTIONS, mergeSectionKeys, normalizeStoredKeys, maskedKey } from '../lib/aiKeys.ts';
import { runSectionAiWithStore, type AiKeyStore } from '../lib/aiSection.ts';

// In-memory copy of the D1 tables the admin panel writes (ai_section_keys.keys_json).
const db = new Map<string, string>();
const store: AiKeyStore = {
  loadKeys: async (id) => normalizeStoredKeys(id, db.get(id) || ''),
  loadStates: async () => ({}),
  saveStates: async () => {},
  saveKeys: async (id, keys) => void db.set(id, JSON.stringify(keys)),
  recall: async () => [],
  stickyKey: async () => '',
  remember: async () => {},
  logEvents: async () => {},
  envFallbackKey: '',
};
const keyFor = (id: string, n = 1) => `KEY-${id}-${n}-` + 'A'.repeat(24);

type Seen = { url: string; apiKey: string };
let seen: Seen[] = [];
const invalid = new Set<string>(); // api keys the fake provider rejects with 401
(globalThis as any).fetch = async (url: string, init: any) => {
  const gemini = String(url).includes('generativelanguage');
  const apiKey = gemini ? init.headers['x-goog-api-key'] : String(init.headers.Authorization).replace('Bearer ', '');
  seen.push({ url: String(url), apiKey });
  if (invalid.has(apiKey)) return new Response(JSON.stringify({ error: { code: 401, message: 'API key not valid' } }), { status: 401 });
  return gemini
    ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `gemini:${apiKey}` }] } }] }), { status: 200 })
    : new Response(JSON.stringify({ choices: [{ message: { content: `openai:${apiKey}` } }] }), { status: 200 });
};
const adminSave = async (id: string, incoming: any[]) => store.saveKeys(id, mergeSectionKeys(id, incoming, await store.loadKeys(id)));
const run = (sectionId: string) =>
  runSectionAiWithStore(store, { sectionId, systemPrompt: 's', history: [], question: 'q', fallback: () => 'LOCAL', allowEnvFallback: false });

async function main() {
  assert.ok(AI_SECTIONS.length >= 6, 'site assistant, slug and the 4 products');

  // 1) a key saved from the admin is the key used — for every section — and never leaks to another one
  for (const s of AI_SECTIONS) await adminSave(s.id, [{ id: 'key-1', provider: 'gemini', apiKey: keyFor(s.id) }]);
  for (const s of AI_SECTIONS) {
    seen = [];
    const r = await run(s.id);
    assert.equal(r.text, `gemini:${keyFor(s.id)}`, `${s.id}: answered with its own key`);
    assert.equal(r.usedFallback, false, `${s.id}: real AI answer, not the local fallback`);
    assert.equal(seen.length, 1);
    assert.ok(seen[0].url.includes(`/models/${s.models.gemini}:`), `${s.id}: default model ${s.models.gemini} used (${seen[0].url})`);
  }

  // 2) no key in a section -> local fallback, and no request leaves the server
  db.delete('growth-path');
  seen = [];
  const none = await run('growth-path');
  assert.equal(none.text, 'LOCAL');
  assert.equal(none.usedFallback, true);
  assert.equal(seen.length, 0);

  // 3) an invalid first key rotates to the second slot (OpenAI) without the user noticing
  await adminSave('site-assistant', [
    { id: 'key-1', provider: 'gemini', apiKey: keyFor('site-assistant', 1) },
    { id: 'key-3', provider: 'openai', apiKey: keyFor('site-assistant', 3) },
  ]);
  invalid.add(keyFor('site-assistant', 1));
  seen = [];
  const rot = await run('site-assistant');
  assert.equal(rot.text, `openai:${keyFor('site-assistant', 3)}`);
  assert.equal(rot.switched, true);
  invalid.clear();

  // 4) re-saving the form with the MASKED key shown in the admin must not wipe the real key
  const real = keyFor('business-therapist');
  await adminSave('business-therapist', [{ id: 'key-1', apiKey: maskedKey(real), label: 'اصلی' }]);
  assert.equal((await store.loadKeys('business-therapist'))[0].apiKey, real);
  // ...and an explicit "clear" does remove it
  await adminSave('business-therapist', [{ id: 'key-1', clearKey: true }]);
  assert.equal((await store.loadKeys('business-therapist'))[0].apiKey, '');

  console.log(`ai-sections-e2e.test.ts: ${AI_SECTIONS.length} sections verified (own key, no leakage, fallback, rotation, masked re-save)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
