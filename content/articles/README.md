# محتوای تولیدی ۱۲ هفته — omidadli.site

این پوشه خروجیِ اجرای `omidadli-arena-ai-master-prompt.md` روی تقویمِ
`omidadli-12-week-content-strategy.md` است.

## وضعیت

| Batch | مقالات | وضعیت |
|---|---|---|
| Batch 1 | ۱ تا ۱۵ | ✅ تولید و **منتشر شد** روی سایت (۱۴۰۵/۰۷/۰۴) |
| Batch 2 | ۱۶ تا ۳۰ | ✅ تولید و **منتشر شد** روی سایت (۱۴۰۵/۰۷/۰۴) |
| Batch 3 | ۳۱ تا ۴۵ | ⏸ متوقف (منتظر تأیید) |
| Batch 4 | ۴۶ تا ۴۸ + ۲۴ محتوای کوتاه + بررسی نهایی | ⏸ متوقف |

طبق قانونِ تولید مرحله‌ای، هیچ Batch بعدی بدون تأییدِ صریح شروع نمی‌شود.

## انتشار Batch 1

مقالات Batch 1 با اسکریپت [`scripts/batch-to-posts.mjs`](../../scripts/batch-to-posts.mjs) به
پست‌های `BLOG_POSTS` تبدیل و منتشر شدند:

- **داده:** `src/data/batch01Posts.ts` (منبعِ کامپایل‌شده) + `content/site-content.json` (کپیِ Git از محتوای زنده)
- **لینک‌های `⟨منتظر انتشار⟩`** همه فعال شدند (کل Batch با هم منتشر شد)؛ فقط
  `⟨منتظر ساخت صفحه⟩`‌ها باقی مانده‌اند چون صفحاتِ مقصدِ CTA هنوز ساخته نشده‌اند (مقصد فعلی: `/contact`).
- **Schema:** هر مقاله `BlogPosting` + `BreadcrumbList` + `FAQPage` (JSON-LD) دارد — هم در HTML سرور
  (`functions/_middleware.ts`) و هم در هد SPA (`SEOHead`).
- **FAQ** هر مقاله در فیلد `faq` ذخیره و به‌صورت آکاردئونی در انتهای مقاله نمایش داده می‌شود.
- **CTA** هر مقاله (مطابق intent) به‌عنوان بخش «قدم بعدی» در انتهای بدنه اضافه شده است.
- برای تغییر محتوا: فایل‌های markdown را ویرایش کنید و دوباره `node scripts/batch-to-posts.mjs` را اجرا کنید.

## ساختار هر فایل

هر فایل یک مقالهٔ کامل با این بخش‌هاست:

`SEO Brief` → `Article` → `FAQ` → `SEO Assets`
(لینک داخلی، منابع خارجی، تصویر شاخص، Schema، CTA)

## قبل از انتشار (Batchهای بعد)

1. **بازبینی انسانی.** آمارها تاریخ دارند؛ قبل از انتشارِ هر مقاله عددها را دوباره چک کنید
   (به‌ویژه هرچه به ۲۰۲۶/۲۰۲۷ وابسته است).
2. **لینک‌های داخلی.** لینک‌هایی که مقصدشان مقاله‌ای از Batchهای بعد است، تا وقتی آن مقاله
   منتشر نشده غیرفعال بمانند (در فایل با علامت `⟨منتظر انتشار⟩` مشخص شده‌اند) — اسکریپت
   `batch-to-posts.mjs` هنگام انتشارِ کل Batch آن‌ها را خودکار فعال می‌کند.
3. **ورود به CMS.** فیلدهای `slug`، `excerpt`، `tags` و `seo` مستقیماً قابل انتقال به
   `content/site-content.json` (کلید `BLOG_POSTS`) هستند.
4. **Schema.** پیشنهاد هر مقاله در بخش `Schema Recommendation` آمده؛ فقط وقتی پیاده شود که
   با محتوای واقعیِ صفحه مطابقت داشته باشد.

## نقشهٔ انتشار Batch 1 (دسته‌بندی‌ها از taxonomy مشترکند)

دسته‌بندی‌ها آزاد نیستند: مقدارِ `category` باید دقیقاً یکی از کلیدهای
`src/data/blogTaxonomy.ts` باشد (مقدارِ فارسی خودکار پر می‌شود). لینک‌های داخلیِ
`⟨منتظر انتشار⟩` هم‌زمان با انتشارِ همان مقاله فعال می‌شوند.

| # | فایل | Slug | category | categoryFa | CTA |
|---|---|---|---|---|---|
| ۱ | `01-ai-marketing.md` | `ai-marketing` | `ai-marketing` | هوش مصنوعی در مارکتینگ | AI Readiness Audit |
| ۲ | `02-ai-marketing-tasks.md` | `ai-marketing-tasks` | `ai-marketing` | هوش مصنوعی در مارکتینگ | AI Readiness Audit |
| ۳ | `03-ai-agent-vs-chatbot.md` | `ai-agent-vs-chatbot` | `ai-agents` | ایجنت‌های هوش مصنوعی | Automation Assessment |
| ۴ | `04-will-ai-replace-marketers.md` | `will-ai-replace-marketers` | `ai-marketing` | هوش مصنوعی در مارکتینگ | Growth Strategy Session |
| ۵ | `05-ai-agent-guide.md` | `ai-agent-guide-business` | `ai-agents` | ایجنت‌های هوش مصنوعی | Automation Assessment |
| ۶ | `06-ai-agent-business-processes.md` | `ai-agent-business-processes` | `ai-automation` | اتوماسیون با هوش مصنوعی | Automation Assessment |
| ۷ | `07-ai-agent-vs-automation.md` | `ai-agent-vs-automation` | `ai-automation` | اتوماسیون با هوش مصنوعی | Automation Assessment |
| ۸ | `08-ai-workflow-design.md` | `ai-workflow-design` | `ai-automation` | اتوماسیون با هوش مصنوعی | Automation Assessment |
| ۹ | `09-aeo-guide.md` | `aeo-guide` | `aeo` | بهینه‌سازی برای موتورهای پاسخ (AEO) | AI Search Audit |
| ۱۰ | `10-geo-vs-seo.md` | `geo-vs-seo` | `geo` | بهینه‌سازی برای موتورهای مولد (GEO) | AI Search Audit |
| ۱۱ | `11-brand-visibility-ai-search.md` | `brand-visibility-ai-search` | `ai-search` | جست‌وجوی هوش مصنوعی | AI Search Audit |
| ۱۲ | `12-ai-search-rank-one.md` | `ai-search-rank-one` | `ai-search` | جست‌وجوی هوش مصنوعی | AI Search Audit |
| ۱۳ | `13-why-ai-content-fails.md` | `why-ai-content-fails` | `ai-content` | محتوای هوش مصنوعی | Growth Strategy Session |
| ۱۴ | `14-ai-human-content-formula.md` | `ai-human-content-formula` | `ai-content` | محتوای هوش مصنوعی | Growth Strategy Session |
| ۱۵ | `15-ai-content-strategy.md` | `ai-content-strategy` | `content-strategy` | استراتژی محتوا | Growth Strategy Session |

## انتشار Batch 2

مقالات Batch 2 (۱۶ تا ۳۰) با همان اسکریپت [`scripts/batch-to-posts.mjs`](../../scripts/batch-to-posts.mjs)
به پست‌های `BLOG_POSTS` تبدیل و منتشر شدند:

- **داده:** `src/data/batch02Posts.ts` (منبعِ کامپایل‌شده) + `content/site-content.json` (کپیِ Git از محتوای زنده)
- لینک‌های بینِ مقالاتِ همین Batch مستقیم و زنده نوشته شده‌اند؛ هیچ `⟨منتظر انتشار⟩` باقی نمانده است.
  فقط `⟨منتظر ساخت صفحه⟩`‌های CTA (مقصد: `/campaign-audit`، `/tracking-audit`، `/conversion-audit`)
  باقی مانده‌اند؛ مقصد فعلی همه CTAها `/contact` است.
- **تصاویر شاخص:** ۵ از ۱۵ ساخته شد (۱۶ تا ۲۰)؛ ۱۰ تصویرِ باقی‌مانده (۲۱ تا ۳۰) در نوبتِ بعدی
  به `public/blog/<slug>.jpg` اضافه می‌شوند — بدون نیاز به تغییرِ کد.
- برای تغییر محتوا: فایل‌های markdown را ویرایش کنید و دوباره
  `node scripts/batch-to-posts.mjs content/articles/batch-02 src/data/batch02Posts.ts` را اجرا کنید.

## نقشهٔ انتشار Batch 2 (دسته‌بندی‌ها از taxonomy مشترکند)

| # | فایل | Slug | category | categoryFa | CTA |
|---|---|---|---|---|---|
| ۱۶ | `16-google-ai-content-penalty.md` | `google-ai-content-penalty` | `ai-content` | محتوای هوش مصنوعی | SEO Audit |
| ۱۷ | `17-performance-marketing-ai-era.md` | `performance-marketing-ai-era` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۱۸ | `18-why-cpa-is-not-enough.md` | `why-cpa-is-not-enough` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۱۹ | `19-cac-ltv-payback.md` | `cac-ltv-payback` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۲۰ | `20-data-driven-budget-allocation.md` | `data-driven-budget-allocation` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۲۱ | `21-ai-campaign-analysis.md` | `ai-campaign-analysis` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۲۲ | `22-ai-ad-creation-testing.md` | `ai-ad-creation-testing` | `advertising` | تبلیغات | Campaign Audit |
| ۲۳ | `23-ai-media-buying.md` | `ai-media-buying` | `advertising` | تبلیغات | Campaign Audit |
| ۲۴ | `24-ai-campaign-optimization.md` | `ai-campaign-optimization` | `performance` | پرفورمنس مارکتینگ | Campaign Audit |
| ۲۵ | `25-marketing-analytics-mistakes.md` | `marketing-analytics-mistakes` | `analytics` | آنالیتیکس و ترکینگ | Tracking / Analytics Audit |
| ۲۶ | `26-ga4-setup-guide.md` | `ga4-setup-guide` | `analytics` | آنالیتیکس و ترکینگ | Tracking / Analytics Audit |
| ۲۷ | `27-attribution-2026-challenges.md` | `attribution-2026-challenges` | `analytics` | آنالیتیکس و ترکینگ | Tracking / Analytics Audit |
| ۲۸ | `28-first-party-data-guide.md` | `first-party-data-guide` | `analytics` | آنالیتیکس و ترکینگ | Tracking / Analytics Audit |
| ۲۹ | `29-cro-complete-guide.md` | `cro-complete-guide` | `cro` | بهینه‌سازی نرخ تبدیل | Conversion Audit |
| ۳۰ | `30-users-leave-without-buying.md` | `users-leave-without-buying` | `cro` | بهینه‌سازی نرخ تبدیل | Conversion Audit |

## نقشهٔ کلی

مستندِ مرجع: [`docs/CONTENT-SYSTEM-MAP.md`](../../docs/CONTENT-SYSTEM-MAP.md)
(موجودی URLها، خوشه‌های موضوعی، نقشهٔ لینک داخلی، یافته‌های فنی SEO)
