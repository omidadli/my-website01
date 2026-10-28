/**
 * AI keys & products readiness test.
 *
 * Verifies the two things the client asked for:
 *  1. All 4 paid products are fully coded — persona/system-prompt, welcome,
 *     starter prompts, behaviour config, plans, UI metadata — and only need an
 *     API key to go live.
 *  2. Every AI section has exactly 5 key slots, the rotation switches to the
 *     next key on a rate limit, cools the failed key down, and continues the
 *     same conversation naturally (memory recall + hand-off prompt).
 *
 * Run: npx tsx scripts/ai-keys.test.ts
 */
import assert from 'node:assert/strict';
import {
  AI_SECTIONS,
  KEYS_PER_SECTION,
  PRODUCT_SECTION_IDS,
  SITE_SECTION_IDS,
  SITE_ASSISTANT_SECTION,
  SEO_SLUG_SECTION,
  applyAttemptToState,
  buildContinuitySystemPrompt,
  buildSectionStatus,
  classifyAiError,
  cooldownRemainingMs,
  createDefaultSectionKeys,
  emptyKeyState,
  isCoolingDown,
  mergeConversationHistory,
  mergeSectionKeys,
  normalizeStoredKeys,
  planKeyOrder,
  runKeyFailover,
  type AiKeyEntry,
} from '../lib/aiKeys';
import { TOOLS, buildToolSystemPrompt, resolveBehavior, localToolAnswer, createDefaultProductKeys } from '../lib/tools';
import { AI_TOOLS, getToolMeta } from '../src/data/tools';
import { PRODUCT_DETAILS } from '../src/data/productDetails';
import { getPlans } from '../lib/toolPlans';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

const withKeys = (n: number, provider: 'gemini' | 'openai' = 'gemini'): AiKeyEntry[] =>
  createDefaultSectionKeys('business-therapist').map((k, i) => ({
    ...k,
    provider: i % 2 === 0 ? provider : 'gemini',
    enabled: true,
    apiKey: i < n ? `key-${i + 1}-secret` : '',
  }));

const ok = (text: string) => ({ text });
const rateLimited = () => ({ text: null, code: 'rate_limit' as const, status: 429, message: '429 Too Many Requests' });

/* ------------------------------------------------------------------ */
/* 1. The 4 products are complete                                     */
/* ------------------------------------------------------------------ */
console.log('\n— محصولات هوشمند (کد + سیستم‌پرامپت) —');
check('exactly 4 products are defined', TOOLS.length === 4, `got ${TOOLS.length}`);
check('4 products are advertised in the UI', AI_TOOLS.length === 4, `got ${AI_TOOLS.length}`);

const PRODUCT_IDS = ['business-therapist', 'growth-path', 'problem-solver', 'mock-customer'];
for (const id of PRODUCT_IDS) {
  const tool = TOOLS.find((t) => t.id === id);
  check(`product "${id}" exists in lib/tools.ts`, !!tool);
  if (!tool) continue;

  check(`  • name / tagline / description are filled`, !!tool.name && !!tool.tagline && !!tool.description);
  check(`  • audience + price + badge + icon are filled`, !!tool.audience && !!tool.price && !!tool.badge && !!tool.iconName);
  check(`  • system prompt (persona) is substantial`, (tool.persona || '').length > 400, `${(tool.persona || '').length} chars`);
  check(`  • welcome message exists`, (tool.welcome || '').length > 30);
  check(`  • has 3-4 starter prompts`, Array.isArray(tool.suggestions) && tool.suggestions.length >= 3);
  check(`  • input placeholder exists`, !!tool.placeholder);
  check(`  • buildToolSystemPrompt returns the persona`, buildToolSystemPrompt(tool).includes(tool.persona));
  check(`  • resolveBehavior gives welcome + suggestions`, !!(resolveBehavior(tool) as any).welcome && ((resolveBehavior(tool) as any).suggestions || []).length > 0);
  check(`  • zero-key local fallback exists`, (localToolAnswer(tool, 'سلام') || '').length > 40);

  const ui = getToolMeta(id);
  check(`  • UI metadata (cards) exists`, !!ui && !!ui.tagline && (ui.how || []).length >= 3);
  check(`  • product detail page spec exists`, !!PRODUCT_DETAILS[id]);
  check(`  • at least one pricing plan exists`, getPlans(id).length >= 1, `${getPlans(id).length} plans`);

  const section = AI_SECTIONS.find((s) => s.id === id);
  check(`  • has its own AI key section`, !!section && section.kind === 'product');
  check(`  • that section starts with exactly 5 empty slots`, createDefaultSectionKeys(id).length === KEYS_PER_SECTION && createDefaultSectionKeys(id).every((k) => !k.apiKey));
}

/* ------------------------------------------------------------------ */
/* 2. Sections & slots                                                */
/* ------------------------------------------------------------------ */
console.log('\n— بخش‌های کلید (۶ بخش × ۵ اسلات) —');
check('6 sections need an API key', AI_SECTIONS.length === 6, AI_SECTIONS.map((s) => s.id).join(', '));
check('4 product sections + 2 site sections', PRODUCT_SECTION_IDS.length === 4 && SITE_SECTION_IDS.length === 2);
check('site assistant section is registered', AI_SECTIONS.some((s) => s.id === SITE_ASSISTANT_SECTION));
check('SEO slug section is registered', AI_SECTIONS.some((s) => s.id === SEO_SLUG_SECTION));
check('every section exposes 5 slots', AI_SECTIONS.every((s) => createDefaultSectionKeys(s.id).length === 5));
check('slots are numbered 1..5 with unique ids', createDefaultSectionKeys('growth-path').every((k, i) => k.slot === i + 1 && k.id === `key-${i + 1}`));
check('section 1-2 default to Gemini and 3-5 to an OpenAI-compatible service', createDefaultSectionKeys('growth-path').map((k) => k.provider).join(',') === 'gemini,gemini,openai,openai,openai');
check('section model defaults are filled', createDefaultSectionKeys('growth-path').every((k) => !!k.model));

// legacy migration: 3 stored keys become 5 slots without losing data
const migrated = createDefaultProductKeys({ provider: 'openai', baseUrl: 'https://proxy.example/v1', model: 'gpt-4o-mini', apiKey: 'legacy-secret' });
check('legacy single product key migrates into slot 1', migrated.length === 5 && migrated[0].apiKey === 'legacy-secret' && migrated[0].provider === 'openai');
const migratedJson = normalizeStoredKeys('growth-path', JSON.stringify([{ id: 'key-1', provider: 'gemini', apiKey: 'a' }, { id: 'key-2', apiKey: 'b' }, { id: 'key-3', apiKey: 'c' }]));
check('stored JSON with 3 keys is padded to 5 slots', migratedJson.length === 5 && migratedJson[1].apiKey === 'b' && migratedJson[4].apiKey === '');
const kept = mergeSectionKeys('growth-path', [{ id: 'key-2', label: 'کیف پول دوم', apiKey: '' }], [
  { id: 'key-2', slot: 2, label: 'x', provider: 'gemini', baseUrl: '', model: 'm', apiKey: 'saved-secret', enabled: true } as AiKeyEntry,
]);
check('blank apiKey in the admin form keeps the stored key', kept[1].apiKey === 'saved-secret' && kept[1].label === 'کیف پول دوم');
const cleared = mergeSectionKeys('growth-path', [{ id: 'key-2', clearKey: true }], kept);
check('clearKey removes just that slot', cleared[1].apiKey === '' && cleared[0].apiKey === kept[0].apiKey);
const switchedProvider = mergeSectionKeys('growth-path', [{ id: 'key-5', provider: 'gemini' }], createDefaultSectionKeys('growth-path'));
check('switching slot provider to Gemini picks a Gemini model', switchedProvider[4].provider === 'gemini' && switchedProvider[4].model.startsWith('gemini'), switchedProvider[4].model);
const maskedEcho = mergeSectionKeys('growth-path', [{ id: 'key-1', apiKey: 'sk-1••••abcd' }], [{ id: 'key-1', slot: 1, label: 'a', provider: 'gemini', baseUrl: '', model: 'm', apiKey: 'real', enabled: true } as AiKeyEntry]);
check('a masked value coming back from the UI never overwrites the key', maskedEcho[0].apiKey === 'real');

/* ------------------------------------------------------------------ */
/* 3. Error classification & cooldowns                                */
/* ------------------------------------------------------------------ */
console.log('\n— تشخیص خطا و کول‌داون —');
check('HTTP 429 → rate_limit', classifyAiError({ status: 429 }) === 'rate_limit');
check('RESOURCE_EXHAUSTED → rate_limit', classifyAiError({ message: 'RESOURCE_EXHAUSTED: quota exceeded' }) === 'rate_limit');
check('daily quota message → quota', classifyAiError({ message: 'You exceeded your current quota, check your billing' }) === 'quota');
check('401 → auth', classifyAiError({ status: 401 }) === 'auth');
check('invalid key message → auth', classifyAiError({ message: 'API key not valid. Please pass a valid API key.' }) === 'auth');
check('500 → server', classifyAiError({ status: 500 }) === 'server');
check('timeout → timeout', classifyAiError({ message: 'The operation was aborted due to timeout' }) === 'timeout');

const st1 = applyAttemptToState(undefined, 'key-1', { ok: false, code: 'rate_limit', status: 429, latencyMs: 120, error: '429' }, 1_000_000);
check('rate limit cools the key down for 15 minutes', isCoolingDown(st1, 1_000_000) && cooldownRemainingMs(st1, 1_000_000) === 15 * 60_000);
check('fail counters are tracked', st1.failCount === 1 && st1.rateLimitCount === 1);
const st2 = applyAttemptToState(st1, 'key-1', { ok: true, latencyMs: 90 }, 1_000_000 + 16 * 60_000);
check('a successful call clears the cooldown', st2.cooldownUntil === 0 && st2.status === 'healthy' && st2.successCount === 1);

/* ------------------------------------------------------------------ */
/* 4. Key ordering & automatic failover                               */
/* ------------------------------------------------------------------ */
console.log('\n— چرخش خودکار کلیدها —');
const five = withKeys(5);
const states = { 'key-2': { ...emptyKeyState('key-2'), status: 'rate_limited' as const, cooldownUntil: Date.now() + 600_000 } };
const order = planKeyOrder({ keys: five, states, stickyKeyId: 'key-4', now: Date.now() });
check('the sticky key of this conversation is tried first', order.ordered[0].id === 'key-4');
check('cooling-down keys go last', order.ordered[order.ordered.length - 1].id === 'key-2');
check('disabled/empty slots are skipped', planKeyOrder({ keys: withKeys(2), now: Date.now() }).ordered.length === 2);
check('all-cooling is reported', planKeyOrder({
  keys: withKeys(2),
  states: { 'key-1': { ...emptyKeyState('key-1'), cooldownUntil: Date.now() + 60_000 }, 'key-2': { ...emptyKeyState('key-2'), cooldownUntil: Date.now() + 120_000 } },
  now: Date.now(),
}).allCooling === true);

// rate-limited key 1 → the answer must come from key 2, and key 1 must cool down
const seen: string[] = [];
const failover = await runKeyFailover({
  sectionId: 'business-therapist',
  keys: five,
  now: Date.now(),
  call: async (ctx) => {
    seen.push(ctx.key.id);
    return ctx.key.id === 'key-1' ? rateLimited() : ok('پاسخ از کلید دوم');
  },
});
check('429 on key 1 switches to key 2 automatically', seen.join(',') === 'key-1,key-2' && failover.usedKeyId === 'key-2');
check('the switch is reported (switched + attempts)', failover.switched === true && failover.attempts.length === 2 && failover.attempts[0].ok === false && failover.attempts[1].ok === true);
check('the limited key is now cooling down', isCoolingDown(failover.states['key-1']));
check('the hand-off flag is raised for the continuity prompt', failover.attempts[1].handoff === true);
check('a healthy response is not flagged as switched', (await runKeyFailover({ sectionId: 'x', keys: five, call: async () => ok('ok') })).switched === false);

// all keys limited → no crash, all attempts recorded
const allLimited = await runKeyFailover({ sectionId: 'x', keys: withKeys(3), call: async () => rateLimited() });
check('all keys limited → text is null with every attempt logged', allLimited.text === null && allLimited.attempts.length === 3);
check('last error is surfaced', typeof allLimited.lastError === 'string' && allLimited.lastError.length > 0);

// prompt errors must NOT burn the remaining keys
let promptAttempts = 0;
await runKeyFailover({
  sectionId: 'x',
  keys: five,
  call: async () => {
    promptAttempts++;
    return { text: null, code: 'bad_request' as const, status: 400, message: 'invalid argument' };
  },
});
check('a malformed-request error stops the rotation (no wasted keys)', promptAttempts === 1);

/* ------------------------------------------------------------------ */
/* 5. Conversation continuity across keys                             */
/* ------------------------------------------------------------------ */
console.log('\n— ادامه‌ی طبیعی گفتگو پس از جابه‌جایی کلید —');
const clientTurns = [
  { role: 'user' as const, content: 'بودجه‌ی تبلیغاتم رو چطور تقسیم کنم؟' },
  { role: 'model' as const, content: 'اول CAC هر کانال را حساب کن…' },
];
const recalled = [
  { role: 'user' as const, content: 'سلام، فروشگاه لوازم ورزشی دارم' },
  { role: 'model' as const, content: 'خوش آمدی! چه هدفی داری؟' },
  ...clientTurns,
];
const merged = mergeConversationHistory(clientTurns, recalled, 24);
check('server memory is reviewed and merged with the client history', merged.usedMemory && merged.history.length === 4 && merged.history[0].content.includes('لوازم ورزشی'));
check('no duplicate turns after merging', merged.history.filter((t) => t.content === clientTurns[0].content).length === 1);
const noMemory = mergeConversationHistory(clientTurns, [], 24);
check('without memory the client history is used as-is', !noMemory.usedMemory && noMemory.history.length === 2);
const cap = mergeConversationHistory(
  Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: `پیام ${i}` })),
  [],
  24
);
check('history is capped at 24 turns', cap.history.length === 24);

const handoffPrompt = buildContinuitySystemPrompt({
  systemPrompt: 'تو تراپیست بیزینسی هستی.',
  recap: recalled,
  history: merged.history,
  handoff: true,
  failoverCount: 1,
});
check('the hand-off prompt tells the model to review the previous chat', /مرور کن/.test(handoffPrompt) && /حافظه‌ی گفتگو/.test(handoffPrompt));
check('it forbids mentioning the key/service switch', /هرگز به تغییرِ سرویس، مدل، کلید/.test(handoffPrompt));
check('the persona prompt is preserved first', handoffPrompt.startsWith('تو تراپیست بیزینسی هستی.'));
const sameKeyPrompt = buildContinuitySystemPrompt({ systemPrompt: 'p', history: merged.history, handoff: false });
check('a same-key continuation still keeps the thread', /ادامه‌ی همین گفت‌وگو/.test(sameKeyPrompt));

/* ------------------------------------------------------------------ */
/* 6. Admin status shape                                              */
/* ------------------------------------------------------------------ */
console.log('\n— وضعیت پنل ادمین —');
const status = buildSectionStatus({
  sectionId: 'mock-customer',
  keys: five,
  states: { 'key-1': { ...emptyKeyState('key-1'), status: 'rate_limited', cooldownUntil: Date.now() + 300_000, rateLimitCount: 2 } },
  envKeyPresent: true,
});
check('5 slots are reported with masked keys', status.keys.length === 5 && status.keys.every((k) => !('apiKey' in k)) && status.keys[0].keyMask.includes('••'));
check('health + cooldown countdown are exposed', status.keys[0].health === 'rate_limited' && status.keys[0].cooldownRemainingMs > 0 && !!status.keys[0].cooldownLabel);
check('the next active key is key-2 (key-1 is cooling down)', status.activeKeyId === 'key-2');
check('counts are correct', status.configuredCount === 5 && status.healthyCount === 4 && status.totalKeys === 5);
check('env fallback presence is reported', status.envKeyPresent === true);

console.log(failures === 0 ? '\n✅ همه‌ی بررسی‌های کلیدهای API و محصولات پاس شد.\n' : `\n❌ ${failures} بررسی ناموفق بود.\n`);
assert.equal(failures, 0, `${failures} check(s) failed`);
