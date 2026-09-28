/**
 * Blog taxonomy — the single source of truth for article categories.
 *
 * Before this file existed the CMS stored `category` (English) and `categoryFa`
 * (Persian) as two free-text inputs, so every editor spelled them differently
 * ("Performance" vs "performance", "سئو" vs "سئو و رشد ارگانیک"). The blog page
 * derives its filter chips from those strings, so each spelling variant became a
 * separate filter and the topic clusters the content plan depends on never held
 * together.
 *
 * The list merges the categories already used by the seven published posts with
 * the clusters of the 12-week content plan (see docs/CONTENT-SYSTEM-MAP.md).
 */

export interface BlogCategory {
  /** Value stored in `BlogPost.category` — stable, English, lowercase, dash-separated. */
  value: string;
  /** Value stored in `BlogPost.categoryFa` — shown to readers and used by the blog filter. */
  fa: string;
  /** Cluster this category belongs to. */
  group: string;
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  // ---- هوش مصنوعی ----
  { value: 'ai-marketing', fa: 'هوش مصنوعی در مارکتینگ', group: 'هوش مصنوعی' },
  { value: 'ai-agents', fa: 'ایجنت‌های هوش مصنوعی', group: 'هوش مصنوعی' },
  { value: 'ai-automation', fa: 'اتوماسیون با هوش مصنوعی', group: 'هوش مصنوعی' },
  { value: 'ai-tools', fa: 'ابزارهای هوش مصنوعی', group: 'هوش مصنوعی' },
  { value: 'ai-business', fa: 'کسب‌وکار و هوش مصنوعی', group: 'هوش مصنوعی' },
  { value: 'ai-strategy', fa: 'استراتژی هوش مصنوعی', group: 'هوش مصنوعی' },

  // ---- جست‌وجو و محتوا ----
  { value: 'seo', fa: 'سئو و رشد ارگانیک', group: 'جست‌وجو و محتوا' },
  { value: 'aeo', fa: 'بهینه‌سازی برای موتورهای پاسخ (AEO)', group: 'جست‌وجو و محتوا' },
  { value: 'geo', fa: 'بهینه‌سازی برای موتورهای مولد (GEO)', group: 'جست‌وجو و محتوا' },
  { value: 'ai-search', fa: 'جست‌وجوی هوش مصنوعی', group: 'جست‌وجو و محتوا' },
  { value: 'ai-content', fa: 'محتوای هوش مصنوعی', group: 'جست‌وجو و محتوا' },
  { value: 'content-strategy', fa: 'استراتژی محتوا', group: 'جست‌وجو و محتوا' },
  { value: 'content-marketing', fa: 'بازاریابی محتوایی', group: 'جست‌وجو و محتوا' },

  // ---- مارکتینگ و تبلیغات ----
  { value: 'performance', fa: 'پرفورمنس مارکتینگ', group: 'مارکتینگ و تبلیغات' },
  { value: 'digital', fa: 'دیجیتال مارکتینگ', group: 'مارکتینگ و تبلیغات' },
  { value: 'advertising', fa: 'تبلیغات', group: 'مارکتینگ و تبلیغات' },
  { value: 'social-media', fa: 'شبکه‌های اجتماعی', group: 'مارکتینگ و تبلیغات' },

  // ---- رشد و تبدیل ----
  { value: 'growth-strategy', fa: 'استراتژی رشد', group: 'رشد و تبدیل' },
  { value: 'cro', fa: 'بهینه‌سازی نرخ تبدیل', group: 'رشد و تبدیل' },
  { value: 'funnel', fa: 'قیف فروش', group: 'رشد و تبدیل' },
  { value: 'conversion', fa: 'تبدیل', group: 'رشد و تبدیل' },
  { value: 'retention', fa: 'حفظ و بازگشت مشتری', group: 'رشد و تبدیل' },

  // ---- داده و تحلیل ----
  { value: 'analytics', fa: 'آنالیتیکس و ترکینگ', group: 'داده و تحلیل' },
  { value: 'data-analytics', fa: 'داده و تحلیل', group: 'داده و تحلیل' },

  // ---- کسب‌وکار ----
  { value: 'business-strategy', fa: 'استراتژی کسب‌وکار', group: 'کسب‌وکار' },
  { value: 'startup', fa: 'استارتاپ', group: 'کسب‌وکار' },
  { value: 'productivity', fa: 'بهره‌وری', group: 'کسب‌وکار' },
  { value: 'digital-transformation', fa: 'تحول دیجیتال', group: 'کسب‌وکار' },

  // ---- طراحی و راه‌اندازی ----
  { value: 'web-design', fa: 'طراحی و راه‌اندازی', group: 'طراحی و راه‌اندازی' },
];

/** Groups in display order — used by the CMS dropdown and the blog filter ordering. */
export const BLOG_CATEGORY_GROUPS: string[] = [
  'هوش مصنوعی',
  'جست‌وجو و محتوا',
  'مارکتینگ و تبلیغات',
  'رشد و تبدیل',
  'داده و تحلیل',
  'کسب‌وکار',
  'طراحی و راه‌اندازی',
];

export const findCategory = (value: unknown): BlogCategory | undefined =>
  BLOG_CATEGORIES.find((c) => c.value === value);

export const findCategoryByFa = (fa: unknown): BlogCategory | undefined =>
  BLOG_CATEGORIES.find((c) => c.fa === fa);

/**
 * Best-effort mapping for posts created before this taxonomy existed (or edited
 * in the CMS with a free-text value): match on the English key, then on the
 * Persian label, otherwise keep the stored pair untouched.
 */
export const normalizeCategory = (post: { category?: string; categoryFa?: string }): { category: string; categoryFa: string } => {
  const byValue = findCategory(post.category);
  if (byValue) return { category: byValue.value, categoryFa: byValue.fa };
  const byFa = findCategoryByFa(post.categoryFa);
  if (byFa) return { category: byFa.value, categoryFa: byFa.fa };
  return { category: String(post.category || '').trim(), categoryFa: String(post.categoryFa || '').trim() };
};

/**
 * Groups for posts stored before the taxonomy existed (or whose category was
 * typed by hand in the CMS). The stored English values are compared
 * case-insensitively because the legacy CMS did not normalise casing
 * ("Performance" vs "performance").
 */
const LEGACY_GROUP_BY_VALUE: Record<string, string> = {
  performance: 'مارکتینگ و تبلیغات',
  advertising: 'مارکتینگ و تبلیغات',
  digital: 'مارکتینگ و تبلیغات',
  cro: 'رشد و تبدیل',
  conversion: 'رشد و تبدیل',
  funnel: 'رشد و تبدیل',
  retention: 'رشد و تبدیل',
  analytics: 'داده و تحلیل',
  'data-analytics': 'داده و تحلیل',
  seo: 'جست‌وجو و محتوا',
  'web-design': 'طراحی و راه‌اندازی',
  'web design': 'طراحی و راه‌اندازی',
};

/**
 * Which cluster a post belongs to (`''` when its category is unknown).
 * Used by the homepage insights section, which shows the latest articles of
 * each topic cluster instead of one flat "newest posts" list.
 */
export const groupOfPost = (post: { category?: string; categoryFa?: string }): string => {
  const raw = String(post.category || '').trim();
  const byValue = findCategory(raw) || findCategory(raw.toLowerCase()) || findCategory(raw.replace(/\s+/g, '-'));
  if (byValue) return byValue.group;
  const byFa = findCategoryByFa(String(post.categoryFa || '').trim());
  if (byFa) return byFa.group;
  return LEGACY_GROUP_BY_VALUE[raw.toLowerCase()] || '';
};

/** Sort key so the blog filter chips follow the taxonomy order instead of insertion order. */
export const categoryOrder = (fa: string): number => {
  const i = BLOG_CATEGORIES.findIndex((c) => c.fa === fa);
  return i === -1 ? BLOG_CATEGORIES.length : i;
};
