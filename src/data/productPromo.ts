/**
 * productPromo.ts — the "native placement" brain for the paid AI tools.
 *
 * The four products (see src/data/tools.ts + src/data/productDetails.ts) were
 * only linked from /products, so a reader who finished an article about CAC or
 * checkout drop-off never learned that a tool exists that solves exactly that
 * problem. This module answers two questions, in pure data, for any surface:
 *
 *   1. "Which product belongs HERE?"  → pickProductsForPost / ForCategory /
 *      ForService / ForPage, all returning product ids ranked by relevance.
 *   2. "What should it SAY here?"     → angleFor(productId, topic), which
 *      returns copy written for that topic instead of a generic ad slogan.
 *
 * Everything is pure (no React, no fetch) so it can be unit-tested from
 * scripts/product-promo.test.ts and reused by the server later.
 *
 * Copy lives here, not in the CMS, because it is written per topic; the
 * surrounding product names/prices/icons still come from the CMS at render time
 * (src/components/ProductPromo.tsx) so admins keep control of those.
 */

import type { BlogPost } from '../types';

/* ------------------------------------------------------------------ */
/*  Products                                                           */
/* ------------------------------------------------------------------ */

export type ProductId = 'business-therapist' | 'growth-path' | 'problem-solver' | 'mock-customer';

/** Display order used as a stable tie-breaker (matches AI_TOOLS / PRODUCTS). */
export const PRODUCT_IDS: ProductId[] = ['business-therapist', 'growth-path', 'problem-solver', 'mock-customer'];

const CURRENT_PRODUCT_ID_SET = new Set<string>(PRODUCT_IDS);
/** Runtime guard for CMS snapshots or old caller code that still names retired products. */
export const isCurrentProductId = (id: string): id is ProductId => CURRENT_PRODUCT_ID_SET.has(id);

/* ------------------------------------------------------------------ */
/*  Topics                                                             */
/* ------------------------------------------------------------------ */

/**
 * A "topic" is the intent behind a page, not its URL. Nine of them cover every
 * cluster of the 12-week content plan, every service tab and every page of the
 * site. Two different categories can map to the same topic (seo and geo are
 * both `content-search`) so the copy table stays small enough to maintain.
 */
export type PromoTopic =
  | 'ads-performance'
  | 'cro-conversion'
  | 'analytics-data'
  | 'ai-automation'
  | 'content-search'
  | 'strategy-decision'
  | 'career-growth'
  | 'sales-objection'
  | 'web-launch';

/** Which product is most useful for each topic, best first. */
export const TOPIC_PRODUCTS: Record<PromoTopic, ProductId[]> = {
  'ads-performance': ['business-therapist', 'mock-customer', 'problem-solver', 'growth-path'],
  'cro-conversion': ['business-therapist', 'mock-customer', 'problem-solver', 'growth-path'],
  'analytics-data': ['business-therapist', 'problem-solver', 'growth-path', 'mock-customer'],
  'ai-automation': ['problem-solver', 'business-therapist', 'growth-path', 'mock-customer'],
  'content-search': ['problem-solver', 'business-therapist', 'growth-path', 'mock-customer'],
  'strategy-decision': ['problem-solver', 'growth-path', 'business-therapist', 'mock-customer'],
  'career-growth': ['growth-path', 'problem-solver', 'business-therapist', 'mock-customer'],
  'sales-objection': ['mock-customer', 'business-therapist', 'problem-solver', 'growth-path'],
  'web-launch': ['business-therapist', 'problem-solver', 'mock-customer', 'growth-path'],
};

/**
 * category → topic. Keys are matched case-insensitively against BOTH
 * `BlogPost.category` (English slug) and `BlogPost.categoryFa`, so legacy
 * free-text values from the old CMS ("Performance", "CRO", "Web Design") and
 * the modern taxonomy ("performance", "cro") land on the same topic.
 */
const TOPIC_BY_CATEGORY: Record<string, PromoTopic> = {
  // تبلیغات و پرفورمنس
  performance: 'ads-performance',
  advertising: 'ads-performance',
  digital: 'ads-performance',
  'پرفورمنس مارکتینگ': 'ads-performance',
  تبلیغات: 'ads-performance',
  'دیجیتال مارکتینگ': 'ads-performance',

  // تبدیل و قیف فروش
  cro: 'cro-conversion',
  conversion: 'cro-conversion',
  funnel: 'cro-conversion',
  'بهینه‌سازی نرخ تبدیل': 'cro-conversion',
  تبدیل: 'cro-conversion',
  'قیف فروش': 'cro-conversion',

  // داده و تحلیل
  analytics: 'analytics-data',
  'data-analytics': 'analytics-data',
  'آنالیتیکس و ترکینگ': 'analytics-data',
  'داده و تحلیل': 'analytics-data',

  // هوش مصنوعی و اتوماسیون
  'ai-marketing': 'ai-automation',
  'ai-agents': 'ai-automation',
  'ai-automation': 'ai-automation',
  'ai-tools': 'ai-automation',
  'هوش مصنوعی در مارکتینگ': 'ai-automation',
  'ایجنت‌های هوش مصنوعی': 'ai-automation',
  'اتوماسیون با هوش مصنوعی': 'ai-automation',
  'ابزارهای هوش مصنوعی': 'ai-automation',

  // استراتژی و تصمیم
  'ai-strategy': 'strategy-decision',
  'ai-business': 'strategy-decision',
  'growth-strategy': 'strategy-decision',
  'business-strategy': 'strategy-decision',
  startup: 'strategy-decision',
  'digital-transformation': 'strategy-decision',
  'استراتژی هوش مصنوعی': 'strategy-decision',
  'کسب‌وکار و هوش مصنوعی': 'strategy-decision',
  'استراتژی رشد': 'strategy-decision',
  'استراتژی کسب‌وکار': 'strategy-decision',
  استارتاپ: 'strategy-decision',
  'تحول دیجیتال': 'strategy-decision',

  // محتوا و جست‌وجو
  seo: 'content-search',
  aeo: 'content-search',
  geo: 'content-search',
  'ai-search': 'content-search',
  'ai-content': 'content-search',
  'content-strategy': 'content-search',
  'content-marketing': 'content-search',
  'سئو و رشد ارگانیک': 'content-search',
  'بهینه‌سازی برای موتورهای پاسخ (AEO)': 'content-search',
  'بهینه‌سازی برای موتورهای مولد (GEO)': 'content-search',
  'جست‌وجوی هوش مصنوعی': 'content-search',
  'محتوای هوش مصنوعی': 'content-search',
  'استراتژی محتوا': 'content-search',
  'بازاریابی محتوایی': 'content-search',

  // فروش و مذاکره
  'social-media': 'sales-objection',
  retention: 'sales-objection',
  'شبکه‌های اجتماعی': 'sales-objection',
  'حفظ و بازگشت مشتری': 'sales-objection',

  // رشد فردی و مسیر شغلی
  productivity: 'career-growth',
  بهرهوری: 'career-growth',
  'بهره‌وری': 'career-growth',

  // طراحی و راه‌اندازی
  'web-design': 'web-launch',
  'طراحی و راه‌اندازی': 'web-launch',
};

const DEFAULT_TOPIC: PromoTopic = 'ads-performance';

/** "Web Design" and "web-design" are the same category; try both spellings. */
const categoryKeys = (value?: string): string[] => {
  const base = String(value || '').trim().toLowerCase();
  if (!base) return [];
  return base.includes('-') ? [base] : [base, base.replace(/\s+/g, '-')];
};

export const topicOfCategory = (category?: string, categoryFa?: string): PromoTopic => {
  for (const key of [...categoryKeys(category), ...categoryKeys(categoryFa)]) {
    const hit = TOPIC_BY_CATEGORY[key];
    if (hit) return hit;
  }
  return DEFAULT_TOPIC;
};

/* ------------------------------------------------------------------ */
/*  Copy — one angle per (product × topic)                             */
/* ------------------------------------------------------------------ */

export interface ProductAngle {
  /** Why this tool is showing up right here (the "native" justification). */
  relevance: string;
  /** One-line value hook written for this topic. */
  hook: string;
  /** 2–3 concrete outcomes. */
  bullets: string[];
  /** Call-to-action label. */
  cta: string;
}

type AngleTable = { default: ProductAngle } & Partial<Record<PromoTopic, ProductAngle>>;

export const PRODUCT_ANGLES: Record<ProductId, AngleTable> = {
  /* ---------------------------------------------------------------- */
  'business-therapist': {
    default: {
      relevance: 'همین چالش را می‌توانی همین‌جا، بدون نوبت و هزینه جلسه، با یک منتور مارکتینگ کالبدشکافی کنی.',
      hook: 'عددها را بگو؛ نشتی فانل و بودجه‌سوزی را همین امشب پیدا کن',
      bullets: [
        'عیب‌یابی کمپین و افت نرخ تبدیل با داده‌های خودت',
        'محاسبه سلامت CAC، LTV و ROAS قبل از خرج بودجه',
        'چک‌لیست ۳ مرحله‌ای قابل اجرا در همین هفته',
      ],
      cta: 'شروع تست رایگان با ۵۰۰ سکه',
    },
    'ads-performance': {
      relevance: 'قبل از اینکه این مقاله را به بودجه تبلیغاتی وصل کنی، یک دور عددهایت را با منتور چک کن.',
      hook: 'قبل از سوختن بودجه کمپین، بفهم مشکل از تبلیغ است یا از صفحه فرود',
      bullets: [
        'تشخیص اینکه کلیک می‌خری ولی فروش نمی‌گیری یعنی کجای مسیر می‌ریزد',
        'تخصیص بودجه بین گوگل، اینستاگرام و اینفلوئنسر با عدد واقعی',
        'اصلاح کمپین قبل از اینکه هزینه بعدی را خرج کنی',
      ],
      cta: 'عیب‌یابی کمپین با ۵۰۰ سکه هدیه',
    },
    'cro-conversion': {
      relevance: 'این مقاله می‌گوید نرخ تبدیل کجا می‌ریزد؛ این ابزار می‌گوید سایتِ تو دقیقاً در کدام قدم می‌ریزد.',
      hook: 'گلوگاه خروج مشتری را پیدا کن، نه حدس بزن',
      bullets: [
        'پیدا کردن نقطه دقیق Drop-off در سبد خرید و فرم‌ها',
        'اولویت‌بندی تست A/B بر اساس اثر روی درآمد، نه سلیقه',
        '۳ اصلاح فوری که همین هفته نرخ تبدیل را تکان می‌دهد',
      ],
      cta: 'تحلیل مسیر خرید سایتم',
    },
    'analytics-data': {
      relevance: 'داده جمع می‌کنی تا تصمیم بگیری؛ این ابزار همان داده را به تصمیم و اقدام ترجمه می‌کند.',
      hook: 'کدام عددِ report تو واقعاً باید تصمیم بعدی را عوض کند؟',
      bullets: [
        'تبدیل گزارش آنالیتیکس به ۳ اقدام مشخص',
        'تشخیص ناهنجاری واقعی از نویز آماری',
        'انتخاب معیاری که راهنمای تصمیم باشد، نه معیارِ بیکار',
      ],
      cta: 'برداشت تحلیلی از داده‌هایم',
    },
    'content-search': {
      relevance: 'ترافیک ارگانیک بالا می‌رود ولی فروش نه؟ این ابزار دقیقاً همان فاصله را اندازه می‌گیرد.',
      hook: 'ترافیک داری و نمی‌فروشی؟ مسیر تبدیل را کالبدشکافی کن',
      bullets: [
        'فهمیدن اینکه مشکل از جذب است یا از تبدیل',
        'تعیین اینکه کدام صفحه ارزش بهینه‌سازی دارد',
        'توصیه عملی برای صفحاتی که بازدید دارند و خروجی نه',
      ],
      cta: 'بررسی تبدیل ترافیک ارگانیک',
    },
    'sales-objection': {
      relevance: 'لید می‌آید ولی نمی‌خرد؟ اغلب مشکل از فن بیان نیست، از قیف و پیشنهاده.',
      hook: 'وقتی لید می‌آید و نمی‌خرد، قبل از فروشنده، قیف را بررسی کن',
      bullets: [
        'تشخیص اینکه لید بی‌کیفیت است یا پیام اشتباه است',
        'اصلاح پیشنهاد ارزش و نقاط اصطکاک قبل از تماس',
        'چک‌لیست افزایش نرخ بستن روی لیدهای فعلی',
      ],
      cta: 'چرا لیدهام نمی‌خرند؟',
    },
    'web-launch': {
      relevance: 'سایت یا پیج تازه راه افتاده و اولین فروش‌ها هنوز نیامده؟ همین الان اولین گلوگاه را پیدا کن.',
      hook: 'از اولین بازدید تا اولین فروش، مسیر را کوتاه کن',
      bullets: [
        'پیدا کردن اولین مانع خرید در سایت تازه‌راه‌افتاده',
        'حداقل‌های ترکینگ و اندازه‌گیری قبل از خرج تبلیغ',
        '۳ تغییر کم‌هزینه با بیشترین اثر روی فروش',
      ],
      cta: 'اولین عیب‌یابی فروشگاهم',
    },
    'career-growth': {
      relevance: 'اگر هدفت درآمد یا راه‌اندازی بیزینس است، اولویت‌بندی‌اش را به یک منتور بسپار.',
      hook: 'بین ده تا کار عقب‌افتاده، کدام را اول انجام بدهی پول می‌سازد؟',
      bullets: [
        'اولویت‌بندی اقدامات بر اساس بازگشت سرمایه',
        'بررسی اقتصاد بیزینس (CAC/LTV) قبل از بزرگ‌کردن تیم',
        'برنامه فشرده ۳۰ روزه برای اولین نتیجه',
      ],
      cta: 'اولویت‌بندی اقداماتم',
    },
    'ai-automation': {
      relevance: 'هوش مصنوعی وقتی پول می‌سازد که به یک عددِ کسب‌وکار وصل باشد؛ این ابزار همان اتصال را می‌سنجد.',
      hook: 'کدام کار را اول به هوش مصنوعی بسپاری که روی فروش اثر بگذارد؟',
      bullets: [
        'انتخاب اولین گردش‌کار AI با بیشترین بازگشت',
        'تعیین عدد پایه قبل از شروع تا نتیجه قابل سنجش باشد',
        'جلوگیری از اتلاف وقت روی اتوماسیون بی‌اثر',
      ],
      cta: 'انتخاب اولین اتوماسیونم',
    },
  },

  /* ---------------------------------------------------------------- */
  'problem-solver': {
    default: {
      relevance: 'اگر بین چند راه مانده‌ای، این ابزار با ۳ سؤال تیزبین صورت‌مسئله را شفاف و گزینه‌ها را با ریسک می‌سنجد.',
      hook: 'بن‌بست را توضیح بده؛ ۳ راه‌حل با مزایا، معایب و یک پیشنهاد قطعی بگیر',
      bullets: [
        'ریشه‌یابی مسئله با چارچوب اصول اولیه',
        'جدول مقایسه گزینه‌ها بر اساس هزینه، ریسک و زمان',
        'یک پیشنهاد نهایی قاطع + اولین تست ارزان',
      ],
      cta: 'حل مسئله با ۵۰۰ سکه هدیه',
    },
    'strategy-decision': {
      relevance: 'هر استراتژی در نهایت یک تصمیم است؛ این ابزار همان تصمیم را از حالت احساسی به حالت سنجیده می‌برد.',
      hook: 'قبل از تصمیمِ گران، سناریوها را روی کاغذ بیاور',
      bullets: [
        'شکستن تصمیم به گزینه‌های واقعیِ قابل مقایسه',
        'تحلیل ریسک، هزینه فرصت و سناریوی بدبینانه',
        'پیشنهاد نهایی با دلیل شفاف + اولین قدم',
      ],
      cta: 'تحلیل تصمیمم',
    },
    'ai-automation': {
      relevance: 'سؤالِ واقعی در هوش مصنوعی «چه ابزاری» نیست؛ «کدام کار را اول بسپاریم» است.',
      hook: 'کدام کار را به AI بسپاری و کدام را نه؟ ماتریس تصمیم را بساز',
      bullets: [
        'انتخاب اولین فرآیند مناسب اتوماسیون',
        'مرز درست بین تصمیم انسان و اجرای مدل',
        'تعیین معیار موفقیت قبل از پیاده‌سازی',
      ],
      cta: 'انتخاب مسیر اتوماسیونم',
    },
    'content-search': {
      relevance: 'در محتوا و سئو، انتخابِ موضوع و معیار مهم‌تر از حجم تولید است؛ این ابزار همان انتخاب را می‌سنجد.',
      hook: 'کدام موضوع، کدام کانال، کدام معیار؟ از حدس به ماتریس برو',
      bullets: [
        'انتخاب بین موضوعات و خوشه‌های محتوایی با معیار روشن',
        'سنجش اینکه مشکل از محتواست یا از توزیع و تبدیل',
        'تعیین معیار توقف: چه وقت این مسیر را عوض کنیم',
      ],
      cta: 'تحلیل استراتژی محتوایم',
    },
    'ads-performance': {
      relevance: 'وقتی بودجه محدود است، انتخابِ کانالِ اشتباه گران‌ترین اشتباه است.',
      hook: 'بودجه محدود را کجا خرج کنی؟ گزینه‌ها را با عدد مقایسه کن',
      bullets: [
        'مقایسه کانال‌ها بر اساس هزینه جذب و سرعت بازگشت',
        'سناریوی بدبینانه قبل از افزایش بودجه',
        'تصمیم نهایی با اولویت سودآوری',
      ],
      cta: 'مقایسه گزینه‌های تبلیغاتی‌ام',
    },
    'career-growth': {
      relevance: 'دوراهی‌های شغلی با حدس حل نمی‌شوند؛ با ماتریس حل می‌شوند.',
      hook: 'بین دو مسیر شغلی مانده‌ای؟ مزایا و معایب را کنار هم ببین',
      bullets: [
        'مقایسه مسیرها بر اساس درآمد، ریسک و زمان',
        'تشخیص هزینه فرصتِ هر انتخاب',
        'پیشنهاد نهایی + اولین قدم ۱۰ دقیقه‌ای',
      ],
      cta: 'تحلیل دوراهی شغلی‌ام',
    },
  },

  /* ---------------------------------------------------------------- */
  'growth-path': {
    default: {
      relevance: 'اگر این مقاله برایت یک «هدف» ساخت، این ابزار همان هدف را به فاز، چک‌لیست و اولین اقدام ۱۰ دقیقه‌ای تبدیل می‌کند.',
      hook: 'هدفت را بگو؛ نقشه راه فازبندی‌شده و چک‌لیست هفتگی‌اش را بگیر',
      bullets: [
        'تبدیل هدف مبهم به برنامه SMART و زمان‌دار',
        'فازبندی ۲ تا ۴ هفته‌ای متناسب با وقت آزاد تو',
        'تعیین «اولین اقدام ۱۰ دقیقه‌ای» برای شکستن اهمال‌کاری',
      ],
      cta: 'ساخت نقشه راه با ۵۰۰ سکه هدیه',
    },
    'career-growth': {
      relevance: 'خواندن جای عمل را نمی‌گیرد؛ این ابزار همان چیزی را که اینجا یاد گرفتی به برنامه اجرایی تبدیل می‌کند.',
      hook: 'از «می‌خواهم» تا «امروز چیکار کنم» فقط ۳ دقیقه فاصله است',
      bullets: [
        'برنامه متناسب با ساعت آزاد واقعیِ تو، نه برنامه آرمانی',
        'نقاط عطف قابل اندازه‌گیری برای هر فاز',
        'چک‌لیست هفتگی که تیک خوردنش انگیزه می‌سازد',
      ],
      cta: 'ساخت برنامه رشد من',
    },
    'ai-automation': {
      relevance: 'یادگیری AI بدون برنامه، به ده تبِ باز و هیچ خروجی ختم می‌شود.',
      hook: 'مسیر یادگیری‌ات را از پراکندگی به یک نقشه خطی تبدیل کن',
      bullets: [
        'انتخاب اولین مهارتِ پول‌ساز به‌جای جمع‌کردن دوره',
        'برنامه یادگیری فشرده متناسب با وقت آزاد',
        'چک‌لیست هفتگی و اولین اقدام ۱۰ دقیقه‌ای',
      ],
      cta: 'برنامه یادگیری‌ام را بساز',
    },
    'content-search': {
      relevance: 'استراتژی محتوا یک پروژه چند ماهه است؛ این ابزار آن را به فاز و چک‌لیست تقسیم می‌کند.',
      hook: 'تقویم محتوایی‌ات را از ایده به برنامه اجرایی تبدیل کن',
      bullets: [
        'فازبندی تولید و انتشار با نقاط عطف مشخص',
        'تطبیق برنامه با ظرفیت واقعی تیم یا خودت',
        'پایش هفتگی و اصلاح مسیر',
      ],
      cta: 'برنامه اجرای محتوایم',
    },
    'strategy-decision': {
      relevance: 'بعد از انتخاب مسیر، نوبت برنامه است؛ این ابزار تصمیم را به تقویم اجرا تبدیل می‌کند.',
      hook: 'مسیر را انتخاب کردی؟ حالا فازبندی و چک‌لیستش را بگیر',
      bullets: [
        'شکستن هدف استراتژیک به فازهای ۲ تا ۴ هفته‌ای',
        'تعیین اولویت بین کارهای هم‌زمان',
        'چک‌لیست این هفته + اولین اقدام ۱۰ دقیقه‌ای',
      ],
      cta: 'برنامه اجرای تصمیمم',
    },
    'web-launch': {
      relevance: 'راه‌اندازی یک سایت پروژه است نه یک روز کار؛ این ابزار مراحلش را زمان‌بندی می‌کند.',
      hook: 'از ایده تا لانچ: مسیر را فازبندی کن تا وسط راه رها نشود',
      bullets: [
        'فازبندی لانچ با نقاط تحویل مشخص',
        'برنامه واقع‌بینانه در کنار شغل یا کار اصلی',
        'چک‌لیست هفتگی برای جلوگیری از رها شدن پروژه',
      ],
      cta: 'برنامه راه‌اندازی‌ام',
    },
  },

  /* ---------------------------------------------------------------- */
  'mock-customer': {
    default: {
      relevance: 'آموزش فروش را با لید واقعی تمرین نکن؛ اینجا با یک مشتری سخت‌گیر تمرین کن و بعد برو سراغ لید واقعی.',
      hook: 'قبل از سوختن لیدهای واقعی، اینجا مشتری سرسخت را قانع کن',
      bullets: [
        'شبیه‌سازی تیپ‌های مختلف خریدار ایرانی (شکاک، چانه‌زن، مردد)',
        'بنویس «بازخورد» تا مربی فروش ارائه‌ات را نقد کند',
        'جملات جایگزین برای بستن قطعی فروش',
      ],
      cta: 'شروع تمرین فروش با ۵۰۰ سکه',
    },
    'sales-objection': {
      relevance: 'هر چقدر هم درباره فروش بخوانی، اعتراض واقعی فقط با تمرین حل می‌شود.',
      hook: '«گرونه»، «از کجا معلوم»، «بعداً تماس می‌گیرم» — اینجا تا می‌خواهی تمرین کن',
      bullets: [
        'مواجهه با اعتراض‌های واقعی بازار ایران در محیط امن',
        'کالبدشکافی پیشنهاد ارزش بعد از هر دور تمرین',
        'نسخه قوی‌تر جملات فروش برای بستن قرارداد',
      ],
      cta: 'تمرین پاسخ به اعتراض مشتری',
    },
    'cro-conversion': {
      relevance: 'بخشی از افت تبدیل در مکالمه اتفاق می‌افتد، نه در سایت؛ آن بخش را اینجا تمرین کن.',
      hook: 'وقتی کاربر به دایرکت یا تماس رسید، چطور او را به خرید می‌رسانی؟',
      bullets: [
        'تمرین سناریوی فروش برای لیدهایی که از سایت آمده‌اند',
        'کشف ایرادهای پیشنهاد ارزش از زبان مشتری',
        'افزایش نرخ بستن بدون افزایش هزینه تبلیغات',
      ],
      cta: 'تمرین سناریوی فروشم',
    },
    'ads-performance': {
      relevance: 'هر لید تبلیغاتی بین ۱۰۰ تا ۵۰۰ هزار تومان خرج دارد؛ قبل از تماس، پیچ فروشت را اینجا پخته کن.',
      hook: 'لید گران می‌خری؟ اول اینجا تمرین کن که هدرش ندهی',
      bullets: [
        'تمرین مکالمه با مشتری آمده از کمپین',
        'رفع اشکالات پیام تبلیغاتی قبل از تماس واقعی',
        'افزایش نرخ تبدیل لید به مشتری',
      ],
      cta: 'قبل از تماس، اینجا تمرین کن',
    },
    'web-launch': {
      relevance: 'سایت جدید بالا آمده و اولین مشتری‌ها دارند زنگ می‌زنند؛ اولین مکالمه‌ها را نسوزان.',
      hook: 'اولین مشتری‌های سایت تازه‌ات را با آمادگی کامل جواب بده',
      bullets: [
        'تمرین معرفی خدمت برای مشتری بی‌اطلاع',
        'پاسخ به «چرا شما؟» و «قیمتتون بالاست»',
        'گرفتن نقد مربی فروش روی هر مکالمه',
      ],
      cta: 'تمرین مکالمه با مشتری جدید',
    },
  },
};

/** Copy for a product in a given context — falls back to the generic angle. */
export const angleFor = (productId: string, topic?: PromoTopic): ProductAngle =>
  (PRODUCT_ANGLES as Record<string, AngleTable>)[productId]
    ? ((PRODUCT_ANGLES as Record<string, AngleTable>)[productId][topic || ''] ||
        (PRODUCT_ANGLES as Record<string, AngleTable>)[productId].default)
    : PRODUCT_ANGLES['business-therapist'].default;

/* ------------------------------------------------------------------ */
/*  Keyword signals (fine-tuning on top of the category → topic map)    */
/* ------------------------------------------------------------------ */

const KEYWORD_RULES: { re: RegExp; id: ProductId; weight: number }[] = [
  // تراپیست بیزینسی — اعداد، بودجه، کمپین، تبدیل
  { re: /نرخ تبديل|نرخ تبدیل|cro|سبد خرید|drop[- ]?off|قیف/i, id: 'business-therapist', weight: 14 },
  { re: /cac|cpa|roas|ltv|kpi|بودجه|هزینه جذب|payback/i, id: 'business-therapist', weight: 12 },
  { re: /کمپین|تبلیغ|ادز|ads|media buy|مدیا|اینستاگرام|گوگل ادز/i, id: 'business-therapist', weight: 8 },
  { re: /آنالیتیکس|ga4|اتریبیوشن|ترکینگ|داده|گزارش|شاخص/i, id: 'business-therapist', weight: 7 },

  // شبیه‌ساز مشتری — مکالمه فروش و اعتراض
  { re: /فروش|مشتری|اعتراض|مذاکره|متقاعد|بستن|لید|دایرکت|پاسخ|تماس/i, id: 'mock-customer', weight: 9 },
  { re: /تیم فروش|فروشنده|coach|کوچ|ارائه/i, id: 'mock-customer', weight: 5 },

  // راه‌حل‌یاب — تصمیم و انتخاب
  { re: /تصمیم|انتخاب|دوراهی|کدام|اولویت|استراتژی|سناریو|ریسک/i, id: 'problem-solver', weight: 11 },
  { re: /بن‌بست|فلج|اشتباه|خطا|چالش|معیار|framing/i, id: 'problem-solver', weight: 5 },

  // مسیرساز — هدف، مهارت، مسیر شغلی
  { re: /هدف|مسیر|یادگیری|مهارت|شغل|فریلنس|عادت|توسعه فردی|رزومه|مهاجرت|برنامه/i, id: 'growth-path', weight: 10 },
  { re: /جایگزین|آینده|منتور|راه‌اندازی|side project|درآمد دلاری/i, id: 'growth-path', weight: 4 },
];

/**
 * Editorial overrides.
 *
 * Scoring is a good default, but a few articles deserve a hand-made
 * recommendation: an article about whether AI will replace marketers is really
 * a career question, and the honest answer is the career tool — even though its
 * category (`ai-marketing`) belongs to the automation cluster. Keys are post
 * ids or slugs; the first entry becomes the in-article promo.
 */
export const POST_PRODUCT_OVERRIDES: Record<string, ProductId[]> = {
  'will-ai-replace-marketers': ['growth-path', 'problem-solver'],
  'ai-content-strategy': ['problem-solver', 'growth-path'],
};

/* ------------------------------------------------------------------ */
/*  Ranking                                                            */
/* ------------------------------------------------------------------ */

export interface RankedProduct {
  id: ProductId;
  score: number;
}

const rank = (weights: Map<ProductId, number>): RankedProduct[] =>
  PRODUCT_IDS.filter((id) => (weights.get(id) || 0) > 0)
    .map((id) => ({ id, score: weights.get(id) || 0 }))
    .sort((a, b) => b.score - a.score || PRODUCT_IDS.indexOf(a.id) - PRODUCT_IDS.indexOf(b.id));

const addWeights = (weights: Map<ProductId, number>, id: ProductId, value: number) =>
  weights.set(id, (weights.get(id) || 0) + value);

/**
 * Rank every product for a blog post: the category decides the baseline,
 * then title/excerpt/tag keywords fine-tune it (so an article about
 * «دوراهی انتخاب کانال» inside the ads cluster still surfaces راه‌حل‌یاب).
 */
export const rankProductsForPost = (post: {
  id?: string;
  slug?: string;
  title?: string;
  excerpt?: string;
  category?: string;
  categoryFa?: string;
  tags?: string[];
}): RankedProduct[] => {
  // An explicit editorial pick always wins over the scored order.
  const override = POST_PRODUCT_OVERRIDES[post.slug || ''] || POST_PRODUCT_OVERRIDES[post.id || ''];
  if (override && override.length) return override.map((id) => ({ id, score: 1000 - override.indexOf(id) }));

  const weights = new Map<ProductId, number>();
  const topic = topicOfCategory(post.category, post.categoryFa);
  const ordered = TOPIC_PRODUCTS[topic] || TOPIC_PRODUCTS[DEFAULT_TOPIC];
  ordered.forEach((id, i) => addWeights(weights, id, (ordered.length - i) * 10));

  const haystack = [post.title, post.excerpt, ...(post.tags || [])].filter(Boolean).join(' ');
  KEYWORD_RULES.forEach((rule) => {
    if (rule.re.test(haystack)) addWeights(weights, rule.id, rule.weight);
  });

  return rank(weights);
};

/** Product ids to promote next to a post (most relevant first). */
export const pickProductsForPost = (post: BlogPost, limit = 2): ProductId[] =>
  rankProductsForPost(post).slice(0, Math.max(1, limit)).map((p) => p.id);

/** Product ids for a topic / category filter (blog list, strip sections…). */
export const pickProductsForTopic = (topic: PromoTopic, limit = 2): ProductId[] =>
  (TOPIC_PRODUCTS[topic] || TOPIC_PRODUCTS[DEFAULT_TOPIC]).slice(0, Math.max(1, limit));

export const pickProductsForCategory = (category?: string, categoryFa?: string, limit = 2): ProductId[] =>
  pickProductsForTopic(topicOfCategory(category, categoryFa), limit);

/* ------------------------------------------------------------------ */
/*  Static placements (non-blog pages)                                 */
/* ------------------------------------------------------------------ */

/** Each service gets the tool that naturally continues that service. */
export const SERVICE_PRODUCT_MAP: Record<string, ProductId> = {
  'web-app-design': 'problem-solver',
  'ui-ux-design': 'business-therapist',
  'social-media-strategy': 'mock-customer',
  'performance-marketing': 'business-therapist',
  'cro-optimization': 'business-therapist',
  'tracking-analytics': 'business-therapist',
  'seo-growth': 'growth-path',
  'growth-strategy': 'problem-solver',
  'marketing-automation': 'problem-solver',
  'retention-strategy': 'mock-customer',
};

export const productForService = (serviceId: string): ProductId =>
  SERVICE_PRODUCT_MAP[serviceId] || 'business-therapist';

/** The topic whose copy fits each service (so the hook matches the service). */
export const SERVICE_TOPIC_MAP: Record<string, PromoTopic> = {
  'web-app-design': 'web-launch',
  'ui-ux-design': 'cro-conversion',
  'social-media-strategy': 'sales-objection',
  'performance-marketing': 'ads-performance',
  'cro-optimization': 'cro-conversion',
  'tracking-analytics': 'analytics-data',
  'seo-growth': 'content-search',
  'growth-strategy': 'strategy-decision',
  'marketing-automation': 'ai-automation',
  'retention-strategy': 'sales-objection',
};

export const topicForService = (serviceId: string): PromoTopic =>
  SERVICE_TOPIC_MAP[serviceId] || DEFAULT_TOPIC;

/** The tool (and its angle) that matches each of the three homepage/service paths. */
export const PRODUCT_BY_PATH_TAB: Record<'start' | 'sell' | 'grow', ProductId> = {
  start: 'problem-solver',
  sell: 'business-therapist',
  grow: 'growth-path',
};

export const TOPIC_BY_PATH_TAB: Record<'start' | 'sell' | 'grow', PromoTopic> = {
  start: 'web-launch',
  sell: 'ads-performance',
  grow: 'strategy-decision',
};

/**
 * The contact form asks which stage the business is at — use that answer to
 * pick both the products and their copy angle.
 */
export const topicForStage = (stage?: string): PromoTopic => {
  const s = String(stage || '');
  if (s.includes('تبلیغات') || s.includes('سئو')) return 'ads-performance';
  if (s.includes('بیشتر بفروشم')) return 'cro-conversion';
  if (s.includes('شروع')) return 'web-launch';
  return 'strategy-decision';
};

/** Products promoted on a given site page, in display order. */
export const PRODUCTS_BY_PAGE: Record<string, ProductId[]> = {
  home: ['business-therapist', 'growth-path', 'problem-solver', 'mock-customer'],
  contact: ['business-therapist', 'problem-solver'],
  about: ['growth-path', 'business-therapist'],
  portfolio: ['business-therapist', 'mock-customer'],
  projects: ['problem-solver', 'growth-path'],
  services: ['business-therapist', 'mock-customer', 'problem-solver', 'growth-path'],
};

export const productsForPage = (page: string): ProductId[] =>
  PRODUCTS_BY_PAGE[page] || PRODUCTS_BY_PAGE.home;

/** The reverse link: which articles should be listed under a product page. */
export const relatedPostsForProduct = <T extends BlogPost>(posts: T[], productId: string, limit = 3): T[] =>
  posts
    .map((post) => ({ post, score: rankProductsForPost(post).find((p) => p.id === productId)?.score || 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.post);

/** Cross-sell: the other tools worth showing on a product's own page. */
export const complementaryProducts = (productId: string, limit = 3): ProductId[] =>
  PRODUCT_IDS.filter((id) => id !== productId).slice(0, Math.max(1, limit));
