import assert from 'node:assert/strict';
import { planAssistantReply, selectRelevantExcerpt } from '../lib/assistantStrategy';
import { tokens, retrieveSources, buildSoulPrompt } from '../lib/assistant';
const history = [{ role: 'user', content: 'برای کاهش هزینه جذب در گوگل ادز چه کنم؟' }];
assert.ok(planAssistantReply('بیشتر توضیح بده', history).retrievalQuery.includes('گوگل ادز'));
assert.equal(planAssistantReply('درباره سئو فروشگاه بگو', history).retrievalQuery, 'درباره سئو فروشگاه بگو');
assert.equal(planAssistantReply('بیشتر توضیح بده', []).retrievalQuery, 'بیشتر توضیح بده');
assert.ok(planAssistantReply('تحلیل کامل کمپین', []).maxOutputTokens > planAssistantReply('خلاصه بگو', []).maxOutputTokens);
assert.equal(planAssistantReply('تحلیل کامل ولی مختصر', []).maxOutputTokens, 700);
const body = 'مقدمه عمومی بازاریابی. '.repeat(250) + '\nروش اندازه گیری سودآوری مشتری و محاسبه ارزش طول عمر در انتهای مقاله آمده است.';
const excerpt = selectRelevantExcerpt(body, tokens('محاسبه ارزش طول عمر'), tokens);
assert.ok(excerpt.includes('محاسبه ارزش طول عمر'));
assert.ok(excerpt.length <= 2200);
const sources = retrieveSources({ BLOG_POSTS: [
  { id: 'published', title: 'ارزش طول عمر مشتری', content: body },
  { id: 'draft', status: 'draft', title: 'ارزش طول عمر مشتری', content: body },
]}, 'محاسبه ارزش طول عمر');
assert.equal(sources.length, 1);
assert.ok(sources[0].text.includes('محاسبه ارزش طول عمر'));
const prompt = buildSoulPrompt({ persona: '', name: '', page: 'home', daypart: '', bodyState: '', digest: '' });
for (const rule of ['مثال فرضی', 'حداکثر دو سؤال', 'به اینترنت زنده', 'فرایند فکر درونی', 'ادعاهای مربوط به امید عدلی']) assert.ok(prompt.includes(rule));
console.log('✓ Assistant strategy: follow-up context, topic changes, adaptive budget, relevant excerpts, draft exclusion and grounding rules');

const repeated = planAssistantReply('چطور هزینه جذب رو کم کنم؟', [{ role: 'user', content: 'چطور هزینه جذب رو کم کنم?' }, { role: 'model', content: 'پاسخ قبلی' }]);
assert.equal(repeated.repeated, true);
assert.ok(repeated.conversationInstruction.includes('بازپخش'));
assert.equal(planAssistantReply('سؤال جدید', history).repeated, false);
assert.equal(planAssistantReply('قیمت چیه؟', [{ role: 'model', content: 'قیمت چیه؟' }]).repeated, false);
console.log('✓ Repeated questions: Persian punctuation normalization, prior user turns and no forced fact changes');

// No provider is not a successful AI answer and must not pollute model memory.
const { runSectionAiWithStore } = await import('../lib/aiSection');
let remembered = false;
const unavailable = await runSectionAiWithStore({
  loadKeys: async () => [], loadStates: async () => ({}),
  saveStates: async () => {}, saveKeys: async () => {},
  recall: async () => [], stickyKey: async () => '',
  remember: async () => { remembered = true; }, logEvents: async () => {},
}, { sectionId: 'site-assistant', systemPrompt: 'پاسخ طبیعی', history: [], question: 'سلام', allowEnvFallback: false });
assert.equal(unavailable.text, null);
assert.equal(unavailable.usedFallback, false);
assert.equal(remembered, false);
const { readFileSync } = await import('node:fs');
for (const path of ['functions/api/chat.ts', 'vite-dev-api.ts']) {
  const source = readFileSync(path, 'utf8');
  assert.ok(!source.includes('localAnswer('), `${path}: chat never substitutes canned replies`);
  assert.ok(source.includes("code: 'AI_UNAVAILABLE'"));
}
console.log('✓ No-key regression: no fake answer, no memory pollution, explicit unavailability in both backends');
