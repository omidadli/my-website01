import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/contentCore';
import { getProductDetail } from '../src/data/productDetails';
import { reconcileProductCatalog } from '../src/utils/contentDefaults';

const expected = [
  ['business-therapist', 'تراپیست بیزینسی و منتور مارکتینگ'],
  ['growth-path', 'مسیرساز هوشمند توسعه فردی و شغلی'],
  ['problem-solver', 'راه‌حل‌یاب استراتژیک و رفع بن‌بست'],
  ['mock-customer', 'شبیه‌ساز مشتری فرضی و کوچ فروش'],
];
assert.deepEqual(PRODUCTS.map(({ id, title }) => [id, title]), expected, 'built-in catalog is the intended four products');
assert.equal(getProductDetail('problem-solver')?.title, 'راه‌حل‌یاب استراتژیک و رفع بن‌بست', 'detail metadata uses the current product name');

const staleCatalog = [
  { id: 'campaign-audit-checklist', title: 'چک‌لیست ممیزی کمپین' },
  { id: 'reporting-template', title: 'قالب گزارش‌گیری' },
  { id: 'short-cro-course', title: 'دوره‌ی آموزشی کوتاه افزایش نرخ خرید سایت' },
  { id: 'one-on-one-consultation', title: 'مشاوره‌ی یک‌جلسه‌ای' },
];
assert.deepEqual(
  reconcileProductCatalog(PRODUCTS, staleCatalog).map(({ id, title }) => [id, title]),
  expected,
  'a saved snapshot containing only the retired catalog is replaced by current products',
);

const edited = reconcileProductCatalog(PRODUCTS, [
  { ...PRODUCTS[0], title: 'عنوان ویرایش‌شده در CMS' },
  staleCatalog[0],
]);
assert.deepEqual(edited.map((product) => product.id), expected.map(([id]) => id), 'unsupported ids are dropped and supported missing products restored');
assert.equal(edited[0].title, 'عنوان ویرایش‌شده در CMS', 'admin edits to a supported product are preserved');
assert.deepEqual(reconcileProductCatalog(PRODUCTS, []), [], 'an intentionally empty catalog remains empty');
console.log('product-catalog-migration.test.ts — تمام بررسی‌ها پاس شد ✅');
