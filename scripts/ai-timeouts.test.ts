import assert from 'node:assert/strict';
import { callProviderKey, runKeyFailover, type AiKeyEntry } from '../lib/aiKeys.ts';

type Behaviour = 'hang' | 'ok' | 'overloaded' | 'ratelimit';
const calls: { model: string; at: number }[] = [];
const T0 = Date.now();

/** fake Gemini: behaviour per model; "hang" never answers until the request is aborted */
function installFetch(by: Record<string, Behaviour>) {
  calls.length = 0;
  (globalThis as any).fetch = (url: string, init: any) => {
    const model = /models\/([^:]+):/.exec(String(url))![1];
    calls.push({ model, at: Date.now() - T0 });
    const b = by[model] ?? 'hang';
    const json = (status: number, body: any) => Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (b === 'ok') return json(200, { candidates: [{ content: { parts: [{ text: `answer from ${model}` }] } }] });
    if (b === 'overloaded') return json(503, { error: { message: 'The model is overloaded' } });
    if (b === 'ratelimit') return json(429, { error: { message: 'Resource has been exhausted (quota)' } });
    return new Promise((_res, rej) => {
      const sig: AbortSignal | undefined = init?.signal;
      sig?.addEventListener('abort', () => rej(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })));
    });
  };
}
const base = { provider: 'gemini' as const, apiKey: 'k'.repeat(30), systemPrompt: 's', history: [], question: 'q', model: 'gemini-2.5-flash' };

async function main() {
  // 1) the main model hangs -> the next (faster) model answers inside the budget instead of failing after 30s
  installFetch({ 'gemini-2.5-flash': 'hang', 'gemini-2.5-flash-lite': 'ok' });
  let t = Date.now();
  let r = await callProviderKey({ ...base, timeoutMs: 3200, deadlineAt: Date.now() + 9000 });
  assert.equal(r.text, 'answer from gemini-2.5-flash-lite', 'falls through to flash-lite after a timeout');
  assert.deepEqual(calls.map((c) => c.model), ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  assert.ok(Date.now() - t < 7000, 'answered well before the budget');

  // 2) everything hangs -> gives up at the TOTAL deadline (not per model x N), reporting a timeout
  installFetch({});
  t = Date.now();
  r = await callProviderKey({ ...base, timeoutMs: 3200, deadlineAt: Date.now() + 7000 });
  const took = Date.now() - t;
  assert.equal(r.text, null);
  assert.equal(r.code, 'timeout');
  assert.ok(took < 7000 + 3300, `stopped at the deadline (took ${took}ms)`);
  assert.ok(calls.length <= 3, `no endless model walk (${calls.length} attempts)`);

  // 3) rate limit is a real answer: do not burn time on other models
  installFetch({ 'gemini-2.5-flash': 'ratelimit' });
  r = await callProviderKey({ ...base, timeoutMs: 3200, deadlineAt: Date.now() + 9000 });
  assert.equal(r.code, 'rate_limit');
  assert.equal(calls.length, 1);

  // 4) overloaded (503) on the main model -> next model
  installFetch({ 'gemini-2.5-flash': 'overloaded', 'gemini-2.5-flash-lite': 'ok' });
  r = await callProviderKey({ ...base, timeoutMs: 3200, deadlineAt: Date.now() + 9000 });
  assert.equal(r.text, 'answer from gemini-2.5-flash-lite');

  // 5) failover: a second key is NOT started when the overall deadline is (almost) used up
  const keys: AiKeyEntry[] = [1, 2].map((slot) => ({ id: `key-${slot}`, slot, label: `k${slot}`, provider: 'gemini', baseUrl: '', model: 'gemini-2.5-flash', apiKey: 'x'.repeat(30), enabled: true }));
  let started = 0;
  const out = await runKeyFailover({
    sectionId: 'site-assistant', keys, deadlineAt: Date.now() + 1000,
    call: async () => { started++; await new Promise((r2) => setTimeout(r2, 50)); return { text: null, code: 'timeout', message: 'timeout' }; },
  });
  assert.equal(out.text, null);
  assert.equal(started, 1, 'second key skipped: not enough time left');

  // 6) with enough time the second key IS tried
  started = 0;
  const out2 = await runKeyFailover({
    sectionId: 'site-assistant', keys, deadlineAt: Date.now() + 20000,
    call: async (ctx) => { started++; return ctx.index === 0 ? { text: null, code: 'timeout', message: 'timeout' } : { text: 'ok' }; },
  });
  assert.equal(out2.text, 'ok');
  assert.equal(started, 2);

  console.log('ai-timeouts.test.ts: 6 scenarios passed');
}
// AbortSignal.timeout() timers are unref'd in Node, so without this the process would exit
// silently while a fake request is still "hanging" and the assertions would never run.
const keepAlive = setInterval(() => {}, 1000);
main().then(() => clearInterval(keepAlive)).catch((e) => { console.error(e); process.exit(1); });
