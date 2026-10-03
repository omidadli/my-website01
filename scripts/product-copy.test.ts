/**
 * Product copy rule: an admin edit always reaches the site, an untouched product keeps its designed copy.
 *
 * Run: npx tsx scripts/product-copy.test.ts
 */
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/content';
import { TOOL_PLANS } from '../lib/toolPlans';
import { hasAboutBlock, isEditedList, isEditedText, planCopy, productCopy, withPlanCopy } from '../src/utils/productCopy';

const fresh = () => JSON.parse(JSON.stringify(PRODUCTS[0]));
const product = fresh();

// ---- untouched product → nothing overrides the designed page ----
assert.deepEqual(productCopy(product), {}, 'unedited product has no overrides');
assert.equal(hasAboutBlock(productCopy(product)), false);
assert.deepEqual(productCopy(undefined), {});
assert.deepEqual(productCopy(null), {});
for (const p of PRODUCTS) assert.deepEqual(productCopy(JSON.parse(JSON.stringify(p))), {}, `${p.id} untouched`);
for (const p of PRODUCTS) for (const plan of p.plans || []) assert.deepEqual(planCopy(JSON.parse(JSON.stringify(p)), plan.id), {}, `${p.id}/${plan.id} untouched`);

// ---- every edit shows up ----
const edited = fresh();
edited.title = '  عنوان تازه  ';
edited.tagline = 'هوک تازه';
edited.description = 'توضیح تازه';
edited.badge = 'نشان تازه';
edited.actionText = 'دکمه تازه';
edited.price = 'شروع از ۱ تومان';
edited.targetAudience = 'مخاطب تازه';
edited.problemSolved = 'مشکل تازه';
edited.whyBuy = 'دلیل تازه';
edited.features = ['الف', ' ', 'ب'];
edited.howItWorks = ['یک', 'دو'];
const c = productCopy(edited);
assert.equal(c.title, 'عنوان تازه', 'trimmed');
assert.equal(c.hook, 'هوک تازه');
assert.equal(c.subhook, 'توضیح تازه');
assert.equal(c.badge, 'نشان تازه');
assert.equal(c.actionText, 'دکمه تازه');
assert.equal(c.price, 'شروع از ۱ تومان');
assert.equal(c.audience, 'مخاطب تازه');
assert.equal(c.problem, 'مشکل تازه');
assert.equal(c.whyBuy, 'دلیل تازه');
assert.deepEqual(c.features, ['الف', 'ب'], 'blank list items are dropped');
assert.deepEqual(c.howItWorks, ['یک', 'دو']);
assert.equal(hasAboutBlock(c), true);

// clearing a field is "not edited" — the designed copy stays rather than leaving a hole
const cleared = fresh();
cleared.description = '   ';
cleared.features = [];
assert.deepEqual(productCopy(cleared), {});

// editing back to exactly the default is also "not edited"
assert.equal(isEditedText(PRODUCTS[0].description, PRODUCTS[0].description), false);
assert.equal(isEditedList(PRODUCTS[0].features, PRODUCTS[0].features), false);

// ---- plans ----
const withPlans = fresh();
withPlans.plans[1].name = 'پلن طلایی';
withPlans.plans[1].tagline = 'شعار تازه';
withPlans.plans[1].badge = 'ویژه';
withPlans.plans[1].perks = ['مزیت ۱', 'مزیت ۲'];
withPlans.plans[0].price = '۱۲۳ تومان'; // price has its own override channel (planPrices) — not copy
assert.deepEqual(planCopy(withPlans, 'pro'), { name: 'پلن طلایی', tagline: 'شعار تازه', badge: 'ویژه', perks: ['مزیت ۱', 'مزیت ۲'] });
assert.deepEqual(planCopy(withPlans, 'basic'), {}, 'untouched plan, and a price edit is not plan copy');
assert.deepEqual(planCopy(withPlans, 'nope'), {});

const designed = TOOL_PLANS[withPlans.id];
const shown = withPlanCopy(designed, withPlans);
assert.equal(shown.length, designed.length);
assert.equal(shown[1].name, 'پلن طلایی');
assert.deepEqual(shown[1].perks, ['مزیت ۱', 'مزیت ۲']);
assert.equal(shown[1].popular, designed[1].popular, 'non-copy fields of the designed plan are untouched');
assert.equal(shown[1].dailyCost, designed[1].dailyCost);
assert.deepEqual(shown[0], designed[0], 'untouched plan is identical to the designed one');
assert.deepEqual(withPlanCopy(designed, undefined), designed);

console.log('product-copy.test.ts: all assertions passed');
