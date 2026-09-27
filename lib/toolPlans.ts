/**
 * lib/toolPlans.ts — pricing plans + gamification defaults for the paid AI tools.
 *
 * Pure data (no fetch/crypto), imported by BOTH the server (functions +
 * vite-dev-api, via lib/tools.ts) and the client (src/data/tools.ts +
 * components) so pricing/quota never drift.
 *
 * Pricing model: usage-based tiers. Because one buyer chats a lot and another
 * a little, each tool has 3 plans differing in message quota + duration, all
 * priced from 400,000 Toman upward. The middle "حرفه‌ای" plan is the anchored
 * "most popular" tier (classic decoy/anchor psychology).
 *
 * Prices are the DEFAULT display labels; the admin can override any plan price
 * from the panel (AI_TOOLS_CONFIG.tools[id].planPrices[planId]).
 */

export interface ToolPlan {
  id: 'basic' | 'pro' | 'vip';
  name: string;
  /** default price label (Persian) — overridable per-tool from the CMS */
  price: string;
  /** access duration in days */
  durationDays: number;
  /** message quota over the plan window; 0 = unlimited */
  messageQuota: number;
  /** device count allowed */
  maxDevices: number;
  /** short value line */
  tagline: string;
  /** bullet perks shown on the card */
  perks: string[];
  /** highlighted (anchored) tier */
  popular?: boolean;
  /** ribbon text */
  badge?: string;
  /** Neuromarketing daily cost breakdown (e.g. "روزی فقط ۱۱ هزار تومان") */
  dailyCost?: string;
  /** Tangible daily comparison (e.g. "کمتر از قیمت یک پاکت آدامس!") */
  dailyComparison?: string;
  /** Total coins granted in this plan */
  coinsTotal?: number;
}

/** Neuromarketing Coin Economy defaults */
export const INITIAL_FREE_COINS = 500;
export const COINS_PER_MESSAGE = 150;

/** Calculate remaining coins given number of messages sent */
export const calculateRemainingCoins = (messagesUsed: number): number => {
  return Math.max(0, INITIAL_FREE_COINS - messagesUsed * COINS_PER_MESSAGE);
};

/** True if user has enough coins for at least one message */
export const canSendMessageWithCoins = (messagesUsed: number): boolean => {
  return calculateRemainingCoins(messagesUsed) >= COINS_PER_MESSAGE;
};

/** Number of free "taster" messages per device per tool (gamification hook). */
export const DEFAULT_FREE_TRIAL = 3;

const P = (
  id: ToolPlan['id'],
  name: string,
  price: string,
  durationDays: number,
  messageQuota: number,
  maxDevices: number,
  tagline: string,
  perks: string[],
  extra: Partial<ToolPlan> = {}
): ToolPlan => ({ id, name, price, durationDays, messageQuota, maxDevices, tagline, perks, ...extra });

export const TOOL_PLANS: Record<string, ToolPlan[]> = {
  'business-therapist': [
    P('basic', 'پایه (آغازگر)', '۵۹۰٬۰۰۰ تومان', 30, 200, 1, 'برای شروع و بررسی چند چالش فوری',
      ['۳۰ روز دسترسی کامل', '۲۰۰ پیام گفتگو (۳۰,۰۰۰ سکه)', 'مشاوره‌ی داده‌محورِ کامل', 'روی ۱ دستگاه'],
      { dailyCost: 'روزی ۱۹٬۶۰۰ تومان', dailyComparison: 'کمتر از قیمت یک استکان چای در کافه!' }),
    P('pro', 'حرفه‌ای (محبوب‌ترین)', '۱٬۲۹۰٬۰۰۰ تومان', 90, 700, 2, 'انتخابِ اول مارکترها و فروشگاه‌ها',
      ['۹۰ روز دسترسی', '۷۰۰ پیام گفتگو (۱۰۵,۰۰۰ سکه)', 'حافظه‌ی بلندترِ گفتگو', 'اولویت پردازش هوش مصنوعی', 'روی ۲ دستگاه'],
      { popular: true, badge: 'بالاترین ارزش خرید ⭐', dailyCost: 'روزی ۱۴٬۳۰۰ تومان', dailyComparison: 'صرفه‌جویی ۹۵٪ نسبت به ۱ جلسه مشاوره حضوری' }),
    P('vip', 'نامحدود VIP', '۲٬۴۹۰٬۰۰۰ تومان', 180, 0, 3, 'برای مدیران و تیم‌های پرمصرف',
      ['۱۸۰ روز دسترسی کامل', 'پیام و سکه نامحدود', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه VIP', 'روی ۳ دستگاه'],
      { badge: 'بیشترین صرفه', dailyCost: 'روزی ۱۳٬۸۰۰ تومان', dailyComparison: 'مشاور اختصاصی همیشه همراه' }),
  ],
  'growth-path': [
    P('basic', 'پایه (یک هدف)', '۴۹۰٬۰۰۰ تومان', 30, 150, 1, 'برای ساخت اولین نقشه‌ی راه مدون',
      ['۳۰ روز دسترسی', '۱۵۰ پیام گفتگو (۲۲,۵۰۰ سکه)', 'نقشه‌ی راه و چک‌لیست کامل', 'روی ۱ دستگاه'],
      { dailyCost: 'روزی ۱۶٬۳۰۰ تومان', dailyComparison: 'کمتر از قیمت یک بطری آب‌معدنی!' }),
    P('pro', 'حرفه‌ای (پیگیری مداوم)', '۹۹۰٬۰۰۰ تومان', 90, 500, 2, 'همراهی گام‌به‌گام تا تحقق قطعی هدف',
      ['۹۰ روز دسترسی', '۵۰۰ پیام گفتگو (۷۵,۰۰۰ سکه)', 'به‌روزرسانی و عیب‌یابی مسیر', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'],
      { popular: true, badge: 'محبوب‌ترین انتخاب ⭐', dailyCost: 'روزی ۱۱٬۰۰۰ تومان', dailyComparison: 'روزی ۱۱ هزار تومان برای آینده شغلی‌ات!' }),
    P('vip', 'نامحدود VIP', '۱٬۹۹۰٬۰۰۰ تومان', 180, 0, 3, 'برای چند هدفِ موازی و توسعه جامع',
      ['۱۸۰ روز دسترسی', 'پیام و سکه نامحدود', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'],
      { badge: 'بیشترین صرفه', dailyCost: 'روزی ۱۱٬۰۰۰ تومان', dailyComparison: 'کوچینگ شخصی با یک‌دهم قیمت بازار' }),
  ],
  'problem-solver': [
    P('basic', 'پایه (حل موردی)', '۴۹۰٬۰۰۰ تومان', 30, 150, 1, 'برای گره‌گشایی از چند مسئله معین',
      ['۳۰ روز دسترسی', '۱۵۰ پیام گفتگو (۲۲,۵۰۰ سکه)', 'راه‌حل‌های ساختارمند تحلیلی', 'روی ۱ دستگاه'],
      { dailyCost: 'روزی ۱۶٬۳۰۰ تومان', dailyComparison: 'بیمه جلوگیری از تصمیم‌های غلط میلیونی' }),
    P('pro', 'حرفه‌ای (مشاور تصمیم‌گیری)', '۹۹۰٬۰۰۰ تومان', 90, 500, 2, 'همراه دائمی مدیران در تصمیم‌های کاری',
      ['۹۰ روز دسترسی', '۵۰۰ پیام گفتگو (۷۵,۰۰۰ سکه)', 'تحلیل عمیق ریسک و ماتریس سود', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'],
      { popular: true, badge: 'پیشنهاد ۸۰٪ مدیران ⭐', dailyCost: 'روزی ۱۱٬۰۰۰ تومان', dailyComparison: 'اتاق فکر استراتژیک با روزی ۱۱ هزار تومان!' }),
    P('vip', 'نامحدود VIP', '۱٬۹۹۰٬۰۰۰ تومان', 180, 0, 3, 'برای استفاده تیمی و استراتژیک',
      ['۱۸۰ روز دسترسی', 'پیام و سکه نامحدود', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'],
      { badge: 'بیشترین صرفه', dailyCost: 'روزی ۱۱٬۰۰۰ تومان', dailyComparison: 'مشاور استراتژیک ارشد ۲۴ ساعته' }),
  ],
  'mock-customer': [
    P('basic', 'پایه (تمرین اولیه)', '۴۹۰٬۰۰۰ تومان', 30, 200, 1, 'برای تمرین اولین ارائه‌ها و پیچ فروش',
      ['۳۰ روز دسترسی', '۲۰۰ پیام تمرین (۳۰,۰۰۰ سکه)', 'شبیه‌سازی مشتریِ واقعی', 'روی ۱ دستگاه'],
      { dailyCost: 'روزی ۱۶٬۳۰۰ تومان', dailyComparison: 'کمتر از هزینه سوختن تنها ۱ لید فروش!' }),
    P('pro', 'حرفه‌ای (تسلط بر فروش)', '۱٬۰۹۰٬۰۰۰ تومان', 90, 700, 2, 'پخته‌کردن سناریوهای فروش و اعتراضات',
      ['۹۰ روز دسترسی', '۷۰۰ پیام تمرین (۱۰۵,۰۰۰ سکه)', 'کوچینگ فروش بعد از هر دور تمرین', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'],
      { popular: true, badge: 'انتخاب اول فروشنده‌ها ⭐', dailyCost: 'روزی ۱۲٬۱۰۰ تومان', dailyComparison: 'فقط با بستن ۱ مشتری بیشتر، کل هزینه برمی‌گردد' }),
    P('vip', 'نامحدود VIP', '۱٬۹۹۰٬۰۰۰ تومان', 180, 0, 3, 'برای تیم‌های فروش و استفاده روزانه',
      ['۱۸۰ روز دسترسی', 'تمرین نامحدود بدون سقف', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'],
      { badge: 'بیشترین صرفه', dailyCost: 'روزی ۱۱٬۰۰۰ تومان', dailyComparison: 'مربی فروش ۲۴ ساعته برای تمام تیم' }),
  ],
};

export const getPlans = (toolId: string): ToolPlan[] => TOOL_PLANS[toolId] || [];
export const getPlan = (toolId: string, planId: string): ToolPlan | undefined => getPlans(toolId).find((p) => p.id === planId);

/** Resolve the effective price label for a plan (CMS override wins). */
export const resolvePlanPrice = (toolId: string, plan: ToolPlan, data?: any): string => {
  const override = data?.AI_TOOLS_CONFIG?.tools?.[toolId]?.planPrices?.[plan.id];
  return (typeof override === 'string' && override.trim()) ? override : plan.price;
};

/** The cheapest plan's price label — used for the "از … تومان" hook on cards. */
export const startingPrice = (toolId: string, data?: any): string => {
  const plans = getPlans(toolId);
  if (!plans.length) return '';
  return resolvePlanPrice(toolId, plans[0], data);
};

export interface NeuromarketingTrigger {
  headline: string;
  subheadline: string;
  lossWarning: string;
  roiTitle: string;
  roiComparison: string;
  guaranteeBadge: string;
  socialBadge: string;
  dailyHook: string;
  anchorRealValue: string;
}

export const NEUROMARKETING_TRIGGERS: Record<string, NeuromarketingTrigger> = {
  'business-therapist': {
    headline: 'سرمایه‌گذاری روی این ابزار، ارزان‌تر از یک اشتباه تبلیغاتی ساده است',
    subheadline: 'هر جلسه مشاوره بیزینس حضوری حداقل ۳ تا ۶ میلیون تومان هزینه دارد؛ درحالی‌که هوش مصنوعی درمانگر کسب‌وکار با روزی فقط ۱۴ هزار تومان (کمتر از قیمت یک استکان چای) ۲۴ ساعته در جیب شماست.',
    lossWarning: 'شما هنوز ۵۰ سکه طلایی فعال در حساب خود دارید! نگذارید اعتبارتان بسوزد؛ با انتخاب یک پلن، این ۵۰ سکه حفظ شده و قفل تحلیل‌های استراتژیک باز می‌شود.',
    roiTitle: 'تضمین بازگشت سرمایه ۱۰ برابری (ROI)',
    roiComparison: 'تنها با جلوگیری از سوزاندن یک کمپین تبلیغاتی بی‌ثمر ۵ میلیونی، هزینه اشتراک کل سال جبران می‌شود.',
    guaranteeBadge: 'تضمین اثربخشی در تصمیم‌گیری و نجات نقدینگی',
    socialBadge: 'انتخاب بیش از ۳۲۰ مدیر عامل و صاحب کسب‌وکار آنلاین',
    dailyHook: 'روزی فقط ۱۴ هزار تومان — کمتر از قیمت یک استکان چای کافه!',
    anchorRealValue: 'ارزش واقعی مشاوره اختصاصی: ۳ تا ۶ میلیون تومان'
  },
  'growth-path': {
    headline: 'آینده شغلی و بیزینسی شما، ارزش روزی ۱۱ هزار تومان را ندارد؟',
    subheadline: 'کتاب‌ها و دوره‌های پراکنده میلیون‌ها تومان وقت و پول شما را هدر می‌دهند. یک مسیر شفاف اختصاصی در هر لحظه، کمتر از قیمت یک پاکت آدامس هزینه دارد.',
    lossWarning: 'شما هنوز ۵۰ سکه طلایی فعال در کیفتان دارید! اجازه ندهید نقشه‌راه نصفه‌کاره رها شود. فعال‌سازی پلن = تضمین ادامه مسیر و دستیابی قطعی به اهداف.',
    roiTitle: 'صرفه‌جویی ۱۰۰ ساعت آزمون و خطا',
    roiComparison: 'پیمودن کوتاه‌ترین مسیر بدون سردرگمی، ماه‌ها جلو افتادن از رقبا در مسیر شغلی و مالی.',
    guaranteeBadge: 'گام‌به‌گام، اختصاصی و کاملاً متناسب با ظرفیت شما',
    socialBadge: 'مورد اعتماد بیش از ۴۵۰ کارآفرین و متخصص توسعه فردی',
    dailyHook: 'روزی فقط ۱۱ هزار تومان — کمتر از قیمت یک پاکت آدامس!',
    anchorRealValue: 'ارزش واقعی دوره‌های منتورشیپ شغلی: ۴ تا ۱۰ میلیون تومان'
  },
  'problem-solver': {
    headline: 'هزینه نگرفتن یک تصمیم درست، صدها برابر بیشتر از اشتراک این ابزار است',
    subheadline: 'تصمیم‌گیری اشتباه در انتخاب محصول یا استراتژی، میلیون‌ها تومان خسارت می‌زند. این ابزار اتاق فکر استراتژیک ۲۴ ساعته شما با روزی فقط ۱۱ هزار تومان است.',
    lossWarning: 'تنها ۵۰ سکه تا حل کامل مسئله فاصله دارید! این ۵۰ سکه طلایی هدیه را رها نکنید؛ با فعال‌سازی پلن گره اصلی را باز کنید.',
    roiTitle: 'ریسک‌زدایی کامل از تصمیم‌های کلیدی بیزینس',
    roiComparison: 'جلوگیری از زیان‌های سنگین ناشی از ابهام، تردید یا سوگیری‌های شناختی در شراکت و سرمایه‌گذاری.',
    guaranteeBadge: 'مبتنی بر مدل‌های ذهنی پیشرفته چارلی مانگر و ماتریس تصمیم‌گیری',
    socialBadge: 'مورد تایید ۲۸۰+ مدیر محصول و استراتژیست ارشد',
    dailyHook: 'روزی فقط ۱۱ هزار تومان — معادل یک‌سوم کرایه یک مسیر تاکسی!',
    anchorRealValue: 'ارزش جلسات تحلیل استراتژیک: حداقل ۴ میلیون تومان'
  },
  'mock-customer': {
    headline: 'فقط با بستن یک مشتری بیشتر، هزینه اشتراک یک سال جبران می‌شود!',
    subheadline: 'از دست دادن حتی یک مشتری بالقوه حداقل ۱ تا ۵ میلیون تومان سود خالص از دست رفته است. روی شبیه‌ساز مشتری تمرین کنید تا هیچ اعتراضی در فروش واقعی شما را غافلگیر نکند.',
    lossWarning: 'شما هنوز ۵۰ سکه طلایی هدیه در کیف خود دارید! نگذارید سناریوی مذاکره نیمه‌کاره بماند؛ با فعال‌سازی پلن مهارت فروش خود را به پول نقد تبدیل کنید.',
    roiTitle: 'افزایش نرخ تبدیل مذاکرات حداقل ۳۰ تا ۵۰ درصد',
    roiComparison: 'هر مشتری جدیدی که با تسلط بر اعتراضات ببندید، چند برابر کل هزینه این ابزار برایتان سود خواهد ساخت.',
    guaranteeBadge: 'شبیه‌سازی بر اساس تیپ‌های شخصیتی سخت‌گیر بازار ایران',
    socialBadge: 'تمرین‌شده در بیش از ۱,۸۰۰ سناریوی فروش تلفنی و حضوری',
    dailyHook: 'روزی فقط ۱۲ هزار تومان — کمتر از هزینه سوختن یک لید تبلیغاتی!',
    anchorRealValue: 'ارزش کوچینگ اختصاصی فروش: ۵ تا ۸ میلیون تومان'
  }
};

export const getNeuromarketingTrigger = (toolId: string): NeuromarketingTrigger => {
  return NEUROMARKETING_TRIGGERS[toolId] || NEUROMARKETING_TRIGGERS['business-therapist'];
};

/** Free-trial count from CMS config, falling back to the default. */
export const resolveFreeTrial = (data?: any): number => {
  const v = data?.AI_TOOLS_CONFIG?.freeTrialCount;
  return typeof v === 'number' && v >= 0 ? v : DEFAULT_FREE_TRIAL;
};
