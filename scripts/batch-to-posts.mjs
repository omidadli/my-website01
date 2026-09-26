#!/usr/bin/env node
/**
 * batch-to-posts.mjs — turn the batch markdown files in content/articles/
 * into published blog posts.
 *
 *   node scripts/batch-to-posts.mjs [batchDir=content/articles/batch-01] [outTs=src/data/batch01Posts.ts]
 *
 * For every `NN-*.md` file (master-prompt output format: SEO Brief → Article →
 * FAQ → SEO Assets) this script:
 *
 *   1. builds a `BlogPost` object (slug/SEO/sections/faq/tags/…),
 *   2. activates `⟨منتظر انتشار⟩` placeholders — links to the other articles
 *      of the same batch become real `/blog/<slug>` links (all articles of a
 *      batch go live together),
 *   3. rewrites the markdown source in place with the activated links,
 *   4. writes `<outTs>` (`export const BATCHNN_POSTS: BlogPost[]`),
 *   5. appends the posts to `content/site-content.json` (the Git copy of the
 *      live CMS content),
 *   6. prints a QA report (master-prompt compliance checks).
 *
 * The generated TS module is imported by src/data/content.ts. Regenerating is
 * idempotent: edit the markdown sources and run again.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const batchDirRel = process.argv[2] || 'content/articles/batch-01';
const outTsRel = process.argv[3] || 'src/data/batch01Posts.ts';
const batchDir = resolve(ROOT, batchDirRel);
const batchName = basename(batchDir); // batch-01
const exportName = `BATCH${batchName.replace(/[^0-9]/g, '')}_POSTS`; // BATCH01_POSTS

/** Article number → public slug (mirrors content/articles/README.md). */
const SLUG_BY_NUM = {
  1: 'ai-marketing',
  2: 'ai-marketing-tasks',
  3: 'ai-agent-vs-chatbot',
  4: 'will-ai-replace-marketers',
  5: 'ai-agent-guide-business',
  6: 'ai-agent-business-processes',
  7: 'ai-agent-vs-automation',
  8: 'ai-workflow-design',
  9: 'aeo-guide',
  10: 'geo-vs-seo',
  11: 'brand-visibility-ai-search',
  12: 'ai-search-rank-one',
  13: 'why-ai-content-fails',
  14: 'ai-human-content-formula',
  15: 'ai-content-strategy',
  16: 'google-ai-content-penalty',
  17: 'performance-marketing-ai-era',
  18: 'why-cpa-is-not-enough',
  19: 'cac-ltv-payback',
  20: 'data-driven-budget-allocation',
  21: 'ai-campaign-analysis',
  22: 'ai-ad-creation-testing',
  23: 'ai-media-buying',
  24: 'ai-campaign-optimization',
  25: 'marketing-analytics-mistakes',
  26: 'ga4-setup-guide',
  27: 'attribution-2026-challenges',
  28: 'first-party-data-guide',
  29: 'cro-complete-guide',
  30: 'users-leave-without-buying',
};

/** Brief `Category:` → taxonomy pair (src/data/blogTaxonomy.ts). */
const CATEGORY_BY_NUM = {
  1: ['ai-marketing', 'هوش مصنوعی در مارکتینگ'],
  2: ['ai-marketing', 'هوش مصنوعی در مارکتینگ'],
  3: ['ai-agents', 'ایجنت‌های هوش مصنوعی'],
  4: ['ai-marketing', 'هوش مصنوعی در مارکتینگ'],
  5: ['ai-agents', 'ایجنت‌های هوش مصنوعی'],
  6: ['ai-automation', 'اتوماسیون با هوش مصنوعی'],
  7: ['ai-automation', 'اتوماسیون با هوش مصنوعی'],
  8: ['ai-automation', 'اتوماسیون با هوش مصنوعی'],
  9: ['aeo', 'بهینه‌سازی برای موتورهای پاسخ (AEO)'],
  10: ['geo', 'بهینه‌سازی برای موتورهای مولد (GEO)'],
  11: ['ai-search', 'جست‌وجوی هوش مصنوعی'],
  12: ['ai-search', 'جست‌وجوی هوش مصنوعی'],
  13: ['ai-content', 'محتوای هوش مصنوعی'],
  14: ['ai-content', 'محتوای هوش مصنوعی'],
  15: ['content-strategy', 'استراتژی محتوا'],
  16: ['ai-content', 'محتوای هوش مصنوعی'],
  17: ['performance', 'پرفورمنس مارکتینگ'],
  18: ['performance', 'پرفورمنس مارکتینگ'],
  19: ['performance', 'پرفورمنس مارکتینگ'],
  20: ['performance', 'پرفورمنس مارکتینگ'],
  21: ['performance', 'پرفورمنس مارکتینگ'],
  22: ['advertising', 'تبلیغات'],
  23: ['advertising', 'تبلیغات'],
  24: ['performance', 'پرفورمنس مارکتینگ'],
  25: ['analytics', 'آنالیتیکس و ترکینگ'],
  26: ['analytics', 'آنالیتیکس و ترکینگ'],
  27: ['analytics', 'آنالیتیکس و ترکینگ'],
  28: ['analytics', 'آنالیتیکس و ترکینگ'],
  29: ['cro', 'بهینه‌سازی نرخ تبدیل'],
  30: ['cro', 'بهینه‌سازی نرخ تبدیل'],
};

const IMAGE_ICON_BY_NUM = {
  1: 'chart', 2: 'target', 3: 'code', 4: 'rocket', 5: 'book',
  6: 'laptop', 7: 'target', 8: 'code', 9: 'search', 10: 'search',
  11: 'rocket', 12: 'chart', 13: 'sparkles', 14: 'sparkles', 15: 'target',
  16: 'book', 17: 'target', 18: 'chart', 19: 'chart', 20: 'chart',
  21: 'search', 22: 'sparkles', 23: 'rocket', 24: 'rocket', 25: 'chart',
  26: 'code', 27: 'search', 28: 'book', 29: 'target', 30: 'target',
};

/** Pillars get the `featured` flag (one per cluster hub). */
const FEATURED_NUMS = new Set([1, 5, 9, 15, 17, 19, 25, 29]);

const FA_DATE = '۴ مهر ۱۴۰۵'; // 2026-09-26 — publication day of batch 01

// ---------- helpers ----------
const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const toAsciiDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const stripBold = (s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').trim();
const unique = (arr) => [...new Set(arr)];

/**
 * Activate pending-publication placeholders. All articles of a batch publish
 * together, so every `⟨منتظر انتشار — مقاله N⟩` becomes a real link.
 */
function activatePendingLinks(text, titles) {
  let out = text;
  // 1) [text](⟨منتظر انتشار — مقاله N…⟩) → [text](/blog/<slugN>)
  out = out.replace(/\[([^\]]+)\]\(⟨([^⟩]*)⟩\)/g, (m, label, marker) => {
    const num = parseInt(toAsciiDigits((marker.match(/مقاله\s*([۰-۹0-9]+)/) || [])[1] || ''), 10);
    return num && SLUG_BY_NUM[num] ? `[${label}](/blog/${SLUG_BY_NUM[num]})` : label;
  });
  // 2) «عنوان» ⟨منتظر انتشار — مقاله N…⟩ → [«عنوان»](/blog/<slugN>)
  out = out.replace(/«([^»]+)»\s*⟨منتظر انتشار[^⟩]*مقاله\s*([۰-۹0-9]+)[^⟩]*⟩/g, (m, quoted, numStr) => {
    const num = parseInt(toAsciiDigits(numStr), 10);
    return num && SLUG_BY_NUM[num] ? `[«${quoted}»](/blog/${SLUG_BY_NUM[num]})` : `«${quoted}»`;
  });
  // 3) remaining ⟨منتظر انتشار …⟩ → [title N](/blog/<slugN>)
  out = out.replace(/⟨منتظر انتشار[^⟩]*⟩/g, (m) => {
    const num = parseInt(toAsciiDigits((m.match(/مقاله\s*([۰-۹0-9]+)/) || [])[1] || ''), 10);
    if (num && SLUG_BY_NUM[num]) {
      const label = titles[num] ? titles[num].replace(/\s*\(.*\)$/, '') : `مقاله ${faDigits(num)}`;
      return `[${label}](/blog/${SLUG_BY_NUM[num]})`;
    }
    return '';
  });
  return out;
}

/** Absolute self-links → SPA-relative (same site, no need to round-trip the domain). */
const relativizeSelfLinks = (text) =>
  text.replace(/\]\(https?:\/\/(?:www\.)?omidadli01\.site(\/[^)\s]*)\)/g, ']($1)');

const pendingRe = /⟨منتظر انتشار[^⟩]*⟩/g;

// ---------- parsing ----------
function splitOnce(text, re) {
  const m = text.match(re);
  if (!m) return [text, ''];
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
}

function parseBrief(briefText) {
  const brief = {};
  for (const line of briefText.split('\n')) {
    const m = line.match(/^-\s*\*\*([^*]+):\*\*\s*(.*)$/);
    if (m) brief[m[1].trim()] = m[2].trim();
  }
  return brief;
}

/** Split an article body into `### heading` sections. */
function parseH3Sections(body) {
  const parts = body.split(/^###\s+/m).filter((s) => s.trim());
  return parts.map((part) => {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const content = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    return { heading, content };
  });
}

function parseFaq(faqText, titles) {
  return parseH3Sections(faqText)
    .filter((s) => s.heading && s.content)
    .map((s) => ({ question: s.heading, answer: s.content }));
}

function parseInternalLinks(assetsText) {
  const links = [];
  const re = /Anchor:\s*«([^»]+)»\s*→\s*Target:\s*`([^`]+)`/g;
  let m;
  while ((m = re.exec(assetsText))) links.push({ anchor: m[1], target: m[2] });
  return links;
}

function parseExternalSources(assetsText) {
  const sources = [];
  const re = /Source:\s*\[([^\]]+)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(assetsText))) sources.push({ title: m[1], url: m[2] });
  return sources;
}

function parseFeaturedImage(assetsText) {
  const concept = (assetsText.match(/Concept:\*\*\s*(.+)/) || assetsText.match(/Concept:\s*(.+)/) || [])[1] || '';
  const alt = (assetsText.match(/Alt Text:\*\*\s*(.+)/) || assetsText.match(/Alt Text:\s*(.+)/) || [])[1] || '';
  return { concept: concept.trim(), alt: alt.trim() };
}

function parseCta(assetsText) {
  const cta = (assetsText.match(/CTA:\*\*\s*(.+)/) || [])[1] || '';
  const target = (assetsText.match(/Target:\*\*\s*`([^`]+)`/) || [])[1] || '/contact';
  return { cta: cta.trim(), target: target.trim() };
}

const slugId = (heading, fallback) => {
  const ascii = heading
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');
  return ascii || fallback;
};

/** CTA link label = the CTA title before its em-dash description. */
const ctaLabel = (cta) => (cta.split(/\s+[—–-]\s+/)[0] || 'درخواست مشاوره').trim();

// ---------- QA (master-prompt compliance) ----------
const AI_CLICHES = [
  'در دنیای امروز', 'با پیشرفت روزافزون', 'در عصر دیجیتال', 'بیایید با هم بررسی',
  'در این مقاله قصد داریم', 'در نهایت باید گفت', 'نکته بسیار مهم این است',
  'همان‌طور که می‌دانیم',
];
const HALFSPACE_ISSUES = [
  [/\bمی [آا]\w+/g, '«می + فعل» بدون نیم‌فاصله'],
  [/\bنمی [آا]\w+/g, '«نمی + فعل» بدون نیم‌فاصله'],
  [/بهینه سازی/g, 'بهینه سازی → بهینه‌سازی'],
  [/داده محور/g, 'داده محور → داده‌محور'],
  [/\bهای \w/g, '«های» بدون نیم‌فاصله (نمونه)'],
];

function qaReport(name, articleText, faqText) {
  const issues = [];
  const body = articleText + '\n' + faqText;
  for (const c of AI_CLICHES) {
    const n = (body.match(new RegExp(c, 'g')) || []).length;
    if (n > 0) issues.push(`کلیشهٔ AI «${c}» ${n} بار`);
  }
  for (const [re, label] of HALFSPACE_ISSUES) {
    const n = (body.match(re) || []).length;
    if (n > 2) issues.push(`${label}: ${n} مورد`);
  }
  // claims of the shape «طبق گزارش …» with no markdown link in the same paragraph
  for (const para of body.split(/\n{2,}/)) {
    if (/(طبق|بر اساس)\s+(گزارش|داده|تحلیل|بررسی)/.test(para) && !/\[[^\]]+\]\(https?:\/\//.test(para) && /\d/.test(para)) {
      issues.push('ادعای آماری با «طبق/بر اساس گزارش» بدون لینک منبع در همان پاراگراف');
      break;
    }
  }
  if (/⟨منتظر انتشار/.test(body)) issues.push('جای‌نگه‌دار ⟨منتظر انتشار⟩ باقی مانده');
  return issues.map((i) => `  ⚠ ${name}: ${i}`);
}

// ---------- main ----------
const files = readdirSync(batchDir)
  .filter((f) => /^\d{2}-.*\.md$/.test(f))
  .sort();

if (files.length === 0) {
  console.error(`[batch-to-posts] no NN-*.md files in ${batchDir}`);
  process.exit(1);
}

// Pass 1: titles (needed to activate placeholders that reference other articles).
const titles = {};
const raw = {};
for (const f of files) {
  const num = parseInt(f.slice(0, 2), 10);
  const text = readFileSync(join(batchDir, f), 'utf8');
  raw[f] = text;
  const h1 = (text.match(/^#\s+(.+)$/m) || [])[1];
  titles[num] = h1 ? h1.trim() : f;
}

const posts = [];
const qaLines = [];
const assetReports = [];

for (const f of files) {
  const num = parseInt(f.slice(0, 2), 10);
  let text = raw[f];

  const [beforeBrief, afterBrief] = splitOnce(text, /^##\s+SEO Brief\s*$/m);
  const [briefText, afterAssetsStart] = splitOnce(afterBrief, /^##\s+Article\s*$/m);
  const [articleText, afterArticle] = splitOnce(afterAssetsStart, /^##\s+FAQ\s*$/m);
  const [faqText, afterFaq] = splitOnce(afterArticle, /^##\s+SEO Assets\s*$/m);
  const [assetsText, extra] = [afterFaq, ''];

  const brief = parseBrief(briefText);
  const h1 = (beforeBrief.match(/^#\s+(.+)$/m) || [])[1].trim();

  // --- activate links in the published parts (article + FAQ) ---
  const cleanArticle = relativizeSelfLinks(activatePendingLinks(articleText.trim(), titles));
  const cleanFaq = relativizeSelfLinks(activatePendingLinks(faqText.trim(), titles));

  // --- rewrite the markdown source in place (idempotent) ---
  const cleanAssets = assetsText.replace(pendingRe, '').replace(/[ \t]+\n/g, '\n');
  const newMd = [
    `# ${h1}`, '', '## SEO Brief', '', briefText.trim(), '',
    '## Article', '', cleanArticle, '',
    '## FAQ', '', cleanFaq, '',
    '## SEO Assets', '', cleanAssets.trim(), '',
  ].join('\n');
  writeFileSync(join(batchDir, f), newMd, 'utf8');

  // --- structure ---
  const rawSections = parseH3Sections(cleanArticle);
  let excerpt = '';
  const bodySections = [];
  for (const s of rawSections) {
    if (/پاسخ کوتاه/.test(s.heading) && !excerpt) {
      excerpt = s.content.replace(/\n{2,}/g, ' ').replace(/\s+/g, ' ').trim();
      // keep the direct answer as the intro paragraph (excerpt); drop the duplicate section
      continue;
    }
    bodySections.push(s);
  }
  if (!excerpt) excerpt = (brief['Meta Description'] || h1).trim();

  const faq = parseFaq(cleanFaq, titles);

  const sections = bodySections.map((s, i) => ({
    id: slugId(s.heading, `sec-${i + 1}`),
    heading: s.heading,
    content: s.content,
  }));

  // CTA (master prompt §17) — the closing "next step" section, intent-matched.
  const ctaParsed = parseCta(assetsText.replace(pendingRe, ''));
  if (ctaParsed.cta) {
    sections.push({
      id: 'next-step',
      heading: 'قدم بعدی',
      content: `${ctaParsed.cta}\n\n[${ctaLabel(ctaParsed.cta)}](${ctaParsed.target || '/contact'})`,
    });
  }

  const toc = sections.map((s) => ({ id: s.id, title: s.heading }));
  if (faq.length) toc.push({ id: 'faq', title: 'پرسش‌های پرتکرار' });

  const tags = unique(
    (brief['Tags'] || '')
      .split(/[،,]/)
      .map((t) => stripBold(t))
      .filter(Boolean),
  );
  const secondary = (brief['Secondary Keywords'] || '')
    .split(/[،,]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const keywords = unique([brief['Primary Keyword']?.trim(), ...secondary].filter(Boolean)).join(', ');

  const slug = (brief['Suggested Slug'] || '').replace(/`/g, '').trim() || SLUG_BY_NUM[num];
  const [category, categoryFa] = CATEGORY_BY_NUM[num];

  const wordCount = `${cleanArticle} ${cleanFaq}`.split(/\s+/).filter(Boolean).length;
  const readTime = `${faDigits(Math.max(4, Math.round(wordCount / 200)))} دقیقه مطالعه`;

  const post = {
    id: slug,
    slug,
    title: h1,
    excerpt,
    content: `${cleanArticle}\n\n${faq.map((q) => `### ${q.question}\n\n${q.answer}`).join('\n\n')}`,
    category,
    categoryFa,
    date: FA_DATE,
    updatedAt: FA_DATE,
    dateIso: '2026-09-26',
    updatedIso: '2026-09-26',
    readTime,
    author: 'امید عدلی',
    authorRole: 'متخصص پرفورمنس مارکتینگ، ترکینگ و CRO',
    authorAvatar: '/profile-photo-web.jpg',
    imageIcon: IMAGE_ICON_BY_NUM[num] || 'book',
    coverImage: `/blog/${slug}.jpg`,
    featured: FEATURED_NUMS.has(num),
    viewsCount: 0,
    tableOfContents: toc,
    sections,
    faq,
    tags,
    status: 'published',
    seo: {
      title: stripBold(brief['Meta Title'] || h1),
      metaDescription: stripBold(brief['Meta Description'] || excerpt),
      keywords,
    },
  };
  posts.push(post);

  const internal = parseInternalLinks(assetsText.replace(pendingRe, ''));
  const external = parseExternalSources(assetsText);
  const img = parseFeaturedImage(assetsText);
  const cta = parseCta(assetsText.replace(pendingRe, ''));
  assetReports.push({ num, slug, internal, external, img, cta });

  qaLines.push(...qaReport(`${num}-${slug}`, cleanArticle, cleanFaq));
}

// ---------- write TS module ----------
const nums = files.map((f) => parseInt(f.slice(0, 2), 10));
const rangeFa = nums.length > 1 ? `${faDigits(nums[0])} تا ${faDigits(nums[nums.length - 1])}` : faDigits(nums[0]);
const tsHeader = `import type { BlogPost } from '../types';\n\n/**\n * ${batchName} — مقالات ${rangeFa} تقویم ۱۲ هفته‌ای (generated).\n *\n * Generated by scripts/batch-to-posts.mjs from ${batchDirRel}/.\n * Edit the markdown sources and re-run the script — do not edit by hand.\n */\nexport const ${exportName}: BlogPost[] = `;
writeFileSync(resolve(ROOT, outTsRel), tsHeader + JSON.stringify(posts, null, 2) + ';\n', 'utf8');

// ---------- update content/site-content.json ----------
const contentFile = resolve(ROOT, 'content/site-content.json');
if (existsSync(contentFile)) {
  const site = JSON.parse(readFileSync(contentFile, 'utf8'));
  const existing = Array.isArray(site.BLOG_POSTS) ? site.BLOG_POSTS : [];
  const ids = new Set(posts.map((p) => p.id));
  const kept = existing.filter((p) => !ids.has(p.id));
  site.BLOG_POSTS = [...posts, ...kept];
  writeFileSync(contentFile, JSON.stringify(site, null, 2) + '\n', 'utf8');
  console.log(`[batch-to-posts] content/site-content.json → BLOG_POSTS: ${posts.length} new, ${kept.length} kept`);
}

// ---------- report ----------
console.log(`[batch-to-posts] wrote ${outTsRel} (${posts.length} posts → ${exportName})`);
console.log('\n=== QA (master prompt) ===');
console.log(qaLines.length ? qaLines.join('\n') : '  ✓ هیچ موردی از کلیشه‌ها/نیم‌فاصله‌های پرریسک دیده نشد');
console.log('\n=== Internal links (published body) ===');
for (const p of posts) {
  const links = [];
  for (const s of [...p.sections.map((x) => x.content), p.excerpt, ...p.faq.map((q) => q.answer)]) {
    for (const m of s.matchAll(/\[([^\]]+)\]\((\/blog\/[^)\s]+|https?:\/\/[^)\s]+)\)/g)) links.push(`${m[1]} → ${m[2]}`);
  }
  console.log(`  ${p.slug}:`);
  for (const l of unique(links)) console.log(`    - ${l}`);
}
console.log('\n=== Featured images (for generation) ===');
for (const a of assetReports) console.log(`  ${a.slug}.jpg — ${a.img.alt || '(no alt)'}`);
console.log('\n=== CTA ===');
for (const a of assetReports) console.log(`  ${a.slug}: ${a.cta.target}`);
