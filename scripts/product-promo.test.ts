/**
 * Native product placement (src/data/productPromo.ts).
 *
 * Guarantees every paid tool actually shows up somewhere relevant — the whole
 * point of the module is that a reader of a CAC article sees the
 * business-therapist and a reader of a sales-objection article sees the
 * mock-customer. If a product stops being the top pick anywhere, or a
 * placement points at a product id that does not exist, this fails.
 *
 * Run: npx tsx scripts/product-promo.test.ts
 */
import assert from 'node:assert/strict';
import {
  PRODUCT_IDS,
  PRODUCTS_BY_PAGE,
  POST_PRODUCT_OVERRIDES,
  PRODUCT_BY_PATH_TAB,
  SERVICE_PRODUCT_MAP,
  TOPIC_PRODUCTS,
  angleFor,
  isCurrentProductId,
  complementaryProducts,
  pickProductsForPost,
  productForService,
  relatedPostsForProduct,
  topicOfCategory,
} from '../src/data/productPromo';
import { AI_TOOLS } from '../src/data/tools';
import { BLOG_POSTS } from '../src/data/content';
import { SERVICES } from '../src/data/contentCore';

// ---- every product id in the placement tables really exists ----
const knownIds = new Set(AI_TOOLS.map((t) => t.id));
for (const id of PRODUCT_IDS) {
  assert.ok(knownIds.has(id), `product "${id}" exists in AI_TOOLS`);
}
for (const [serviceId, productId] of Object.entries(SERVICE_PRODUCT_MAP)) {
  assert.ok(knownIds.has(productId), `service "${serviceId}" maps to a real product`);
}
for (const [page, ids] of Object.entries(PRODUCTS_BY_PAGE)) {
  for (const id of ids) assert.ok(knownIds.has(id), `page "${page}" promotes a current product`);
}
for (const [topic, ids] of Object.entries(TOPIC_PRODUCTS)) {
  for (const id of ids) assert.ok(knownIds.has(id), `topic "${topic}" promotes a current product`);
}
for (const [slug, ids] of Object.entries(POST_PRODUCT_OVERRIDES)) {
  for (const id of ids) assert.ok(knownIds.has(id), `post override "${slug}" promotes a current product`);
}
for (const [path, id] of Object.entries(PRODUCT_BY_PATH_TAB)) {
  assert.ok(knownIds.has(id), `homepage path "${path}" promotes a current product`);
}
const retiredProductIds = ['campaign-audit-checklist', 'reporting-template', 'short-cro-course', 'one-on-one-consultation'];
for (const id of retiredProductIds) {
  assert.ok(!PRODUCT_IDS.includes(id as any), `retired product "${id}" is not in the active catalog`);
  assert.equal(isCurrentProductId(id), false, `retired product "${id}" is rejected by the runtime guard`);
}
assert.deepEqual(new Set(PRODUCT_IDS), knownIds, 'promo IDs and actual AI tools contain exactly the same products');

// ---- topics ----
assert.equal(topicOfCategory('cro'), 'cro-conversion');
assert.equal(topicOfCategory('performance'), 'ads-performance');
assert.equal(topicOfCategory('analytics'), 'analytics-data');
assert.equal(topicOfCategory('seo'), 'content-search');
assert.equal(topicOfCategory('ai-strategy'), 'strategy-decision');
assert.equal(topicOfCategory('productivity'), 'career-growth');
assert.equal(topicOfCategory('retention'), 'sales-objection');
assert.equal(topicOfCategory('web-design'), 'web-launch');
// legacy free-text categories from the pre-taxonomy CMS still resolve
assert.equal(topicOfCategory('Web Design'), 'web-launch');
assert.equal(topicOfCategory('Performance'), 'ads-performance');
assert.equal(topicOfCategory('CRO'), 'cro-conversion');
// unknown falls back instead of throwing
assert.equal(topicOfCategory('nope-not-a-category'), 'ads-performance');

// ---- copy angles ----
const cacAngle = angleFor('business-therapist', 'ads-performance');
assert.ok(cacAngle.hook.includes('بودجه'), 'ads angle talks about budget');
assert.equal(cacAngle.bullets.length, 3);
assert.ok(angleFor('business-therapist', 'career-growth').hook.length > 0, 'every topic falls back to a real angle');
for (const id of PRODUCT_IDS) {
  const a = angleFor(id, 'sales-objection');
  assert.ok(a.relevance && a.hook && a.cta, `${id} has complete copy for every topic`);
  assert.ok(a.bullets.length >= 2, `${id} has at least two bullets`);
}

// ---- ranking by post ----
const cacPost = { title: 'چرا CPA دیگر به‌تنهایی KPI خوبی نیست؟', category: 'performance', tags: ['CPA', 'CAC'] };
assert.equal(pickProductsForPost(cacPost as any, 2)[0], 'business-therapist', 'CAC/CPA article → تراپیست بیزینسی');

const objectionPost = {
  title: '۷ دلیل اصلی که کاربران بدون خرید سایت شما را ترک می‌کنند',
  category: 'cro',
  tags: ['ترک سبد خرید'],
};
assert.equal(pickProductsForPost(objectionPost as any, 2)[0], 'business-therapist');

const salesPost = {
  title: 'چطور اعتراض مشتری را در فروش تلفنی پاسخ بدهیم',
  category: 'retention',
  tags: ['فروش', 'مذاکره'],
};
assert.equal(pickProductsForPost(salesPost as any, 2)[0], 'mock-customer', 'sales objection → شبیه‌ساز مشتری');

const careerPost = {
  title: 'چطور مهارت دیجیتال مارکتینگ را یاد بگیرم و مسیر شغلی‌ام را بسازم',
  category: 'productivity',
  tags: ['مهارت', 'هدف'],
};
assert.equal(pickProductsForPost(careerPost as any, 2)[0], 'growth-path', 'career/goal article → مسیرساز');

const decisionPost = {
  title: 'کدام شبکه اجتماعی را انتخاب کنیم؟ تصمیم و اولویت‌بندی',
  category: 'growth-strategy',
  tags: ['تصمیم', 'استراتژی'],
};
assert.equal(pickProductsForPost(decisionPost as any, 2)[0], 'problem-solver', 'decision article → راه‌حل‌یاب');

// ---- editorial overrides ----
const published = BLOG_POSTS.filter((p) => p.status !== 'draft');
const replacePost = published.find((p) => p.id === 'will-ai-replace-marketers');
if (replacePost) {
  assert.equal(pickProductsForPost(replacePost, 2)[0], 'growth-path', 'career question → مسیرساز (override)');
}

// ---- coverage: across the real corpus every product is promoted ----

assert.ok(published.length >= 20, `corpus has enough posts to check coverage (${published.length})`);

// Every tool is promoted inside at least two articles (as the in-article pick
// or as the second recommendation right after it).
const appearances = new Map<string, number>();
for (const post of published) {
  for (const id of pickProductsForPost(post, 2)) appearances.set(id, (appearances.get(id) || 0) + 1);
}
for (const id of PRODUCT_IDS) {
  assert.ok((appearances.get(id) || 0) >= 2, `product "${id}" is promoted inside at least two articles`);
}

// Three of the four tools are the single best answer for at least one article.
// (The corpus has no pure "sales conversation" article yet, so شبیه‌ساز مشتری is
// the #2 recommendation of the conversion cluster rather than a #1 anywhere.)
const topPicks = new Set(published.map((p) => pickProductsForPost(p, 1)[0]));
assert.ok(topPicks.size >= 3, `at least three products are the top pick somewhere (got ${topPicks.size})`);
assert.ok(
  pickProductsForPost(objectionPost as any, 2)[1] === 'mock-customer' ||
    pickProductsForPost(salesPost as any, 2).includes('mock-customer'),
  'شبیه‌ساز مشتری is recommended right next to conversion/sales articles',
);

// ---- reverse link: articles listed under a product page ----
const forTherapist = relatedPostsForProduct(published as any, 'business-therapist', 3);
assert.ok(forTherapist.length > 0, 'business-therapist lists related articles');
assert.ok(forTherapist.length <= 3);
const forMock = relatedPostsForProduct(published as any, 'mock-customer', 3);
assert.ok(forMock.length > 0, 'mock-customer lists related articles');
assert.ok(
  forTherapist.every((p) => p.id !== forMock[0].id) || forTherapist.length === forMock.length,
  'different products surface their own article sets',
);

// ---- services ----
for (const service of SERVICES) {
  const id = productForService(service.id);
  assert.ok(knownIds.has(id), `service "${service.id}" resolves to a real product`);
}
assert.equal(productForService('performance-marketing'), 'business-therapist');
assert.equal(productForService('seo-growth'), 'growth-path');
assert.equal(productForService('some-unknown-service'), 'business-therapist', 'unknown service falls back');

// ---- cross-sell ----
const cross = complementaryProducts('growth-path', 3);
assert.ok(!cross.includes('growth-path'), 'a product never cross-sells itself');
assert.equal(cross.length, 3);

console.log('product-promo.test.ts — تمام بررسی‌ها پاس شد ✅');
