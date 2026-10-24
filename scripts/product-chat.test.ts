import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS, buildToolSystemPrompt, resolveBehavior } from '../lib/tools';
import { createDefaultSectionKeys, type ChatTurn, type AiKeyState } from '../lib/aiKeys';
import { runSectionAiWithStore, type AiKeyStore } from '../lib/aiSection';
import { planAssistantReply } from '../lib/assistantStrategy';

const originalFetch = globalThis.fetch;
try {
  for (const tool of TOOLS) {
    let states: Record<string, AiKeyState> = {};
    let memory: ChatTurn[] = [];
    let sticky = '';
    const requests: { url: string; headers: Headers; body: any }[] = [];
    const keys = createDefaultSectionKeys(tool.id).map((k, i) => ({ ...k,
      enabled: i < 2,
      apiKey: i < 2 ? `test-only-${tool.id}-${i}` : '',
      provider: (i === 0 ? 'openai' : 'gemini') as 'openai' | 'gemini',
      model: i === 0 ? 'custom-openai-model' : 'gemini-product-custom',
      baseUrl: i === 0 ? 'https://provider.example/v1' : '',
    }));
    const store: AiKeyStore = {
      loadKeys: async section => { assert.equal(section, tool.id); return keys; },
      loadStates: async section => { assert.equal(section, tool.id); return states; },
      saveStates: async (_section, next) => { states = Object.fromEntries(next.map(s => [s.keyId, s])); },
      saveKeys: async () => {}, recall: async () => [...memory],
      stickyKey: async () => sticky,
      remember: async args => { assert.equal(args.sectionId, tool.id); memory.push(...args.turns); sticky = args.stickyKeyId || sticky; },
      logEvents: async () => {}, envFallbackKey: 'test-only-unrelated-environment-key',
    };
    globalThis.fetch = async (url, init) => {
      const req = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      requests.push(req);
      if (req.headers.has('Authorization')) {
        assert.equal(req.headers.get('Authorization'), `Bearer test-only-${tool.id}-0`);
        assert.equal(req.body.model, 'custom-openai-model', 'Slot model overrides CMS default');
        assert.ok(req.body.messages.some((m: any) => m.content === 'سلام'));
        return new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
      }
      assert.equal(req.headers.get('x-goog-api-key'), `test-only-${tool.id}-1`);
      assert.ok(req.url.includes('gemini-product-custom'));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `پاسخ تخصصی ${tool.id}` }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const strategy = planAssistantReply('سلام', []);
    const result = await runSectionAiWithStore(store, {
      sectionId: tool.id, systemPrompt: buildToolSystemPrompt(tool), history: [], question: 'سلام',
      sessionId: `${tool.id}:test-session`, allowEnvFallback: false,
      preferredModel: 'cms-default', maxOutputTokens: strategy.maxOutputTokens,
    });
    assert.equal(result.text, `پاسخ تخصصی ${tool.id}`);
    assert.equal(result.usedSlot, 2);
    assert.equal(result.switched, true);
    assert.equal(result.usedFallback, false);
    assert.equal(requests.length, 2);
    assert.equal(memory.length, 2);
    const next = await runSectionAiWithStore(store, {
      sectionId: tool.id, systemPrompt: buildToolSystemPrompt(tool), history: [], question: 'بیشتر توضیح بده',
      sessionId: `${tool.id}:test-session`, allowEnvFallback: false,
    });
    assert.equal(next.usedSlot, 2, 'Healthy sticky key is reused');
    assert.equal(requests.length, 3);
    assert.ok(requests[2].body.contents.some((m: any) => m.parts[0].text === `پاسخ تخصصی ${tool.id}`), 'Model receives earlier reply');
    assert.equal(next.recalledCount, 2);
    const before = requests.length;
    const unavailable = await runSectionAiWithStore({ ...store, loadKeys: async () => [], stickyKey: async () => '' }, {
      sectionId: tool.id, systemPrompt: buildToolSystemPrompt(tool), history: [], question: 'سؤال', allowEnvFallback: false,
    });
    assert.equal(unavailable.text, null);
    assert.equal(requests.length, before, 'No borrowing another product/environment key');
    assert.equal(resolveBehavior(tool, { AI_TOOLS_CONFIG: { tools: { [tool.id]: { behavior: { model: 42 } } } } }).model, '');
    console.log(`✓ ${tool.id}: isolated keys, OpenAI request, 429 → Gemini failover, slot model, memory, sticky key and no-key failure`);
  }
  for (const path of ['functions/api/tools.ts', 'vite-dev-api.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.ok(!source.includes('localToolAnswer('));
    assert.ok(source.includes('allowEnvFallback: false'));
    const unavailableAt = source.indexOf("if (!answer) return", source.indexOf('const answer = aiResult.text'));
    const chargeAt = path.startsWith('functions') ? source.indexOf('// Persist: trial counter') : source.indexOf('trials[idx].count += 1');
    assert.ok(unavailableAt > 0 && unavailableAt < chargeAt, 'Provider failure returns before charging quota/coins');
  }
} finally { globalThis.fetch = originalFetch; }
