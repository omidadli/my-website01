/**
 * contentCore.ts — synchronous content defaults WITHOUT the generated article
 * batches (batch01Posts/batch02Posts ≈ 748 kB of markdown source). The web app
 * imports this module eagerly and pulls './blogPosts' in via a background
 * dynamic import so the first-paint JS bundle stays small.
 *
 * Node scripts/tests should import './content' (which re-exports this module
 * plus the full BLOG_POSTS list).
 */
import { ServiceItem, CaseStudy, Testimonial, BlogPost, SkillTool, TimelineMilestone, ProductItem, OngoingProjectItem, BlogComment } from '../types';

export const PERSONAL_INFO = {
  name: 'امید عدلی',
  title: 'متخصص دیجیتال مارکتینگ و بهینه‌سازی نرخ تبدیل',
  avatar: '/profile-photo-hero.png',
  tagline: 'ساخت سیستم‌های بازاریابی داده‌محور، بهینه‌سازی Funnel و رشد قابل اندازه‌گیری شاخص‌های کلیدی (CRO, CTR, CPA)',
  bio: 'متخصص Performance Marketing & Growth با بیش از ۵ سال تجربه در طراحی، اجرا و بهینه‌سازی کمپین‌های تبلیغاتی، تحلیل داده، CRO و SEO. تمرکز اصلی من ساخت سیستم‌های بازاریابی داده‌محور است که از طریق بهینه‌سازی Funnel، پیاده‌سازی Tracking، تحلیل رفتار کاربران و بهبود مستمر عملکرد کمپین‌ها به رشد قابل اندازه‌گیری کسب‌وکار منجر می‌شوند.',
  shortBio: 'بیش از ۵ ساله که کنار فروشگاه‌ها و کسب‌وکارهای آنلاین هستم؛ از طراحی سایت و راه‌اندازی پیج گرفته تا تبلیغات، تحلیل رفتار مشتری و افزایش فروش. کاری که می‌کنم اینه که دقیق می‌بینم مشکل کجاست، و به‌جای حدس، با داده‌ی واقعی تصمیم می‌گیرم.',
  experienceYears: '۵+ سال',
  campaignsCount: '۵۰+ کمپین',
  avgRoasBoost: '۳.۵٪ CTR',
  totalAdSpendManaged: '۵+ برند',
  availability: 'در دسترس برای همکاری ریموت و پروژه‌ای',
  email: 'omidadli78@gmail.com',
  phone: '09933773515',
  phoneFormatted: '۰۹۹۳۳۷۷۳۵۱۵',
  telegram: '@omidadli01',
  telegramUrl: 'https://t.me/omidadli01',
  whatsappUrl: 'https://wa.me/989933773515',
  linkedin: 'https://linkedin.com/in/omidadli01',
  instagram: 'https://instagram.com/omidadli01',
  xTwitter: 'https://x.com/omidad01',
  website: 'omidadli01.site',
  location: 'مشهد / تهران / ریموت'
};

export const SERVICES: ServiceItem[] = [
  {
    id: 'web-app-design',
    title: 'طراحی سایت و اپلیکیشن',
    titleEn: 'Website & Application Design & Development',
    iconName: 'code',
    shortDesc: 'هنوز سایت ندارید یا سایت فعلی‌تون قدیمی و کند شده؟ یه سایت یا اپلیکیشن مدرن، سریع و متناسب با برندتون طراحی و می‌سازم.',
    fullDesc: 'هنوز سایت ندارید یا سایت فعلی‌تون قدیمی و کند شده؟ یه سایت یا اپلیکیشن مدرن، سریع و متناسب با برندتون طراحی و می‌سازم — از یه صفحه‌ی فرود ساده تا یه فروشگاه کامل.',
    features: [
      'طراحی UI اختصاصی متناسب با هویت بصری برند',
      'توسعه ریسپانسیو و بهینه برای موبایل، تبلت و دسکتاپ',
      'ساختار آماده برای SEO و بهینه‌سازی نرخ تبدیل از ابتدای طراحی',
      'اجرای انیمیشن‌ها و تعاملات مدرن جهت افزایش تجربه کاربری'
    ],
    deliverables: ['وب‌سایت یا اپلیکیشن آماده انتشار', 'کد منبع تمیز و مستندسازی‌شده', 'پشتیبانی و راهنمایی پس از تحویل'],
    tags: ['Web Design', 'App Design', 'Frontend Development', 'UX'],
    packages: [
      { title: 'صفحه فرود اختصاصی', price: '۱۵ تا ۲۵ میلیون تومان', description: 'طراحی و اجرای یک صفحه فرود حرفه‌ای و سریع' },
      { title: 'سایت چندصفحه‌ای', price: '۳۵ تا ۷۰ میلیون تومان', badge: 'پیشنهادی', isPopular: true, description: 'طراحی و توسعه کامل سایت شرکتی یا فروشگاهی' },
      { title: 'اپلیکیشن وب اختصاصی', price: 'براساس بریف پروژه', description: 'قیمت نهایی بر اساس پیچیدگی و قابلیت‌های موردنیاز' }
    ]
  },
  {
    id: 'ui-ux-design',
    title: 'طراحی تجربه‌ی کاربری',
    titleEn: 'UI/UX Design & User Experience',
    iconName: 'sparkles',
    shortDesc: 'سایتتون رو دارید ولی کاربرها سردرگم می‌شن یا زود خارج می‌شن؟ مسیر کاربری رو ساده و روان می‌کنم.',
    fullDesc: 'سایتتون رو دارید ولی کاربرها سردرگم می‌شن یا زود از سایت خارج می‌شن؟ مسیر کاربری سایتتون رو طراحی یا بازطراحی می‌کنم تا استفاده ازش ساده، روان و لذت‌بخش باشه.',
    features: [
      'طراحی Wireframe و معماری اطلاعات کاربری',
      'طراحی UI کامل در Figma همراه با Design System',
      'طراحی ریسپانسیو برای موبایل، تبلت و دسکتاپ',
      'تحویل فایل آماده جهت اجرای دقیق تیم توسعه'
    ],
    deliverables: ['فایل جامع Figma', 'دیزاین سیستم', 'جلسه ریویو و مشاوره اولیه رایگان'],
    tags: ['UI/UX', 'Figma', 'Design System', 'User Flow'],
    packages: [
      { title: 'قیمت هر صفحه', price: '۲۰ تا ۴۰ میلیون تومان', badge: 'مشاوره رایگان', isPopular: true, description: 'تعیین قیمت نهایی بر اساس پیچیدگی و تعداد صفحات' }
    ]
  },
  {
    id: 'social-media-strategy',
    title: 'مدیریت محتوا و شبکه‌های اجتماعی',
    titleEn: 'Social Media Strategy & Content Calendar',
    iconName: 'megaphone',
    shortDesc: 'پیج دارید ولی نمی‌دونید چه محتوایی منتشر کنید؟ یه تقویم محتوایی مشخص و متناسب با برندتون می‌سازم.',
    fullDesc: 'پیج دارید ولی نمی‌دونید چه محتوایی منتشر کنید؟ یه تقویم محتوایی مشخص و متناسب با برندتون می‌سازم تا انتشار محتوا دیگه سردرگمی نداشته باشه و مخاطب‌هاتون بیشتر باهاتون درگیر بشن.',
    features: [
      'تحلیل وضعیت پیج و رقبای اصلی بازار',
      'تدوین Tone of Voice و هویت محتوایی برند',
      'طراحی کانتنت کلندر اختصاصی یک‌ماهه',
      'جلسه مشاوره اختصاصی برای تیم تولید محتوا'
    ],
    deliverables: ['تقویم محتوایی ۱ ماهه', 'بریف ایده‌پردازی ستون‌های محتوا', 'بهینه‌سازی بایو و هایلایت‌ها'],
    tags: ['Social Media', 'Content Calendar', 'Strategy', 'Branding'],
    packages: [
      { title: 'مشاوره + کانتنت کلندر', price: '۸ میلیون تومان', description: 'شامل جلسه استراتژی، تحلیل رقبا و تحویل تقویم ۱ ماهه' }
    ]
  },
  {
    id: 'performance-marketing',
    title: 'تبلیغات نتیجه‌محور',
    titleEn: 'Performance Marketing & Campaign Management',
    iconName: 'rocket',
    shortDesc: 'کمپین‌های تبلیغاتی‌تون رو مدیریت می‌کنم و بودجه‌تون رو دقیقاً جایی خرج می‌کنم که مشتری و فروش بیاره.',
    fullDesc: 'تبلیغ می‌کنید ولی نمی‌دونید دقیقاً پولتون کجا خرج می‌شه؟ کمپین‌های تبلیغاتی‌تون رو (گوگل، اینستاگرام و پلتفرم‌های دیگه) طراحی و مدیریت می‌کنم و مرتب بررسی می‌کنم کدوم تبلیغ واقعاً مشتری و فروش آورده، تا بودجه‌تون جای درستش خرج بشه.',
    features: [
      'توسعه سیستم Publisher Dynamic Scoring جهت سنجش کیفیت ترافیک',
      'کاهش CPA و افزایش CTR کمپین‌ها (مانند ارتقا به ۳.۵٪ در ای‌ادز)',
      'بهینه‌سازی کمپین‌های Display Ads، Google Search و Retargeting',
      'استانداردسازی UTMها و سگمنت‌بندی دقیق مخاطبان'
    ],
    deliverables: ['گزارش‌دهی دقیق داده‌محور', 'بهینه‌سازی بیدینگ و بودجه', 'ارزیابی کیفیت ترافیک'],
    tags: ['Google Ads', 'Performance Marketing', 'Meta Ads', 'CPA Reduction'],
    packages: [
      { title: '۱ ماهه', price: '۴۰ میلیون تومان', description: 'راه‌اندازی و اجرای اولیه' },
      { title: '۲ ماهه', price: '۷۰ میلیون تومان', badge: 'پیشنهادی', isPopular: true, description: 'بهینه‌سازی کامل با نتایج قابل اندازه‌گیری' },
      { title: '۳ ماهه', price: '۱۱۰ میلیون تومان', description: 'رشد پایدار و کاهش مداوم CPA' }
    ]
  },
  {
    id: 'cro-optimization',
    title: 'افزایش نرخ خرید سایت',
    titleEn: 'Conversion Rate Optimization & Funnel Analysis',
    iconName: 'target',
    shortDesc: 'بررسی می‌کنم کجای مسیر خرید مشتری منصرف می‌شه و با اصلاح اون درصد بیشتری از بازدیدکننده‌ها رو خریدار می‌کنیم.',
    fullDesc: 'بازدیدکننده وارد سایتتون می‌شه ولی خرید نمی‌کنه؟ بررسی می‌کنم دقیقاً کجای مسیر خرید مشتری منصرف می‌شه، و قدم‌به‌قدم اصلاحش می‌کنیم تا درصد بیشتری از بازدیدکننده‌ها واقعاً خرید کنن.',
    features: [
      'طراحی و اجرای تست‌های A/B بر روی صفحات کلیدی مسیر خرید',
      'تحلیل رفتار کاربران با GA4، Hotjar و Microsoft Clarity',
      'شناسایی نقاط ریزش در Funnel و تدوین Roadmap بهینه‌سازی UX',
      'افزایش نرخ تبدیل لندینگ‌پِیج‌ها (رشد ۲۵٪ نرخ تبدیل در پروژه‌های قبلی)'
    ],
    deliverables: ['Roadmap بهبود تجربه کاربری', 'طراحی و تحلیل تست‌های A/B', 'گزارش‌های هیت‌مپ و رفتار کاربر'],
    tags: ['CRO', 'A/B Testing', 'GA4', 'Hotjar', 'Microsoft Clarity'],
    packages: [
      { title: 'پکیج استاندارد (۳ ماهه)', price: '۱۲۰ میلیون تومان', badge: 'دوره کامل', isPopular: true, description: 'تحلیل، تست A/B و اصلاح مستمر فانل فروش جهت نتایج پایدار' }
    ]
  },
  {
    id: 'tracking-analytics',
    title: 'تحلیل و رصد رفتار مشتری',
    titleEn: 'Tracking Architecture & Marketing Measurement',
    iconName: 'chart',
    shortDesc: 'ابزارهای تحلیلی سایت رو درست راه‌اندازی می‌کنم تا هر تصمیمی بر اساس داده واقعی باشه، نه حدس.',
    fullDesc: 'می‌خواید بفهمید مشتری‌هاتون از کجا میان و کجا از خرید منصرف می‌شن؟ ابزارهای تحلیلی سایتتون رو درست راه‌اندازی می‌کنم تا هر تصمیمی که می‌گیرید، بر اساس داده‌ی واقعی باشه، نه حدس.',
    features: [
      'طراحی معماری Tracking برای Affiliate Marketing و جذب کاربر',
      'پیاده‌سازی و اعتبارسنجی ساختار Event Tracking در GTM',
      'افزایش دقت Attribution و شفاف‌سازی تحلیل کانال‌ها',
      'کاهش ۲۲٪ کلیک‌های نامعتبر از طریق مدل‌های ارزیابی کیفیت'
    ],
    deliverables: ['مستندسازی کامل Event Tracking', 'اتصال دقیق GTM و GA4', 'داشبوردهای تحلیلی کیفیت داده'],
    tags: ['Google Tag Manager', 'GA4', 'Event Tracking', 'Attribution'],
    packages: [
      { title: 'پکیج استاندارد (۳ ماهه)', price: '۱۰۰ میلیون تومان', badge: 'زیرساخت کامل', isPopular: true, description: 'راه‌اندازی کامل ابزارها، ساخت داشبورد Looker Studio و گزارش‌دهی ماهانه' }
    ]
  },
  {
    id: 'seo-growth',
    title: 'رشد ارگانیک در گوگل',
    titleEn: 'SEO Strategy & Organic Growth',
    iconName: 'laptop',
    shortDesc: 'کاری می‌کنم کلمه‌هایی که مشتری‌هاتون دنبالش می‌گردن، سایتتون رو توی صفحه‌ی اول گوگل نشون بده.',
    fullDesc: 'می‌خواید بدون هزینه‌ی تبلیغات، مشتری‌های بیشتری از گوگل پیدا کنید؟ کاری می‌کنم کلمه‌هایی که مشتری‌هاتون دنبالش می‌گردن، سایتتون رو توی صفحه‌ی اول گوگل نشون بده.',
    features: [
      'بهینه‌سازی Technical SEO و معماری محتوایی صفحات',
      'تحلیل Search Intent و ارتقای Snippetها جهت افزایش CTR',
      'تدوین استراتژی لینک‌سازی داخلی و خارجی برای کلمات پررقابت',
      'رشد ۵۰٪ ترافیک ارگانیک در حوزه‌های رمزارز و صنعتی'
    ],
    deliverables: ['کیوورد ریسرچ و نقشه محتوا', 'آنالیز فنی SEO', 'گزارش رتبه‌بندی و CTR'],
    tags: ['SEO Strategy', 'Technical SEO', 'Keyword Research', 'Google Rank 1'],
    packages: [
      { title: '۱ ماهه', price: '۴۰ میلیون تومان', description: 'مناسب برای شروع و آنالیز اولیه' },
      { title: '۲ ماهه', price: '۷۵ میلیون تومان', badge: 'پیشنهادی', isPopular: true, description: 'بهترین نسبت هزینه به نتیجه و رشد محسوس' },
      { title: '۳ ماهه', price: '۱۱۵ میلیون تومان', description: 'نتایج پایدار و رشد بلندمدت در نتایج گوگل' }
    ]
  },
  {
    id: 'growth-strategy',
    title: 'استراتژی رشد',
    titleEn: 'Growth Strategy & Roadmap',
    iconName: 'rocket',
    shortDesc: 'نقشه‌ی راه مشخص برای رشد پایدار فروش، نه فقط راه‌حل‌های موقت',
    fullDesc: 'تدوین استراتژی جامع رشد و نقشه‌ی راه بازاریابی برای مقیاس‌پذیر کردن فروش و کسب سهم بیشتر از بازار.',
    features: [
      'تدوین نقشه راه رشد جامع',
      'شناسایی و اولویت‌بندی کانال‌های مقیاس‌پذیر',
      'تعیین شاخص‌های کلیدی و اهداف کمی'
    ],
    deliverables: ['مستند استراتژی رشد', 'نقشه راه فصلی', 'جلسات تحلیل مستمر'],
    tags: ['Growth Strategy', 'Scaling', 'Roadmap'],
    packages: [
      { title: 'تدوین نقشه راه رشد', price: 'بر اساس بریف', description: 'تحلیل بازار، رقبا و تعیین استراتژی ۳ تا ۶ ماهه' }
    ]
  },
  {
    id: 'marketing-automation',
    title: 'اتوماسیون فرآیندها',
    titleEn: 'Marketing Automation & Workflows',
    iconName: 'sparkles',
    shortDesc: 'خودکارسازی کارهای تکراری بازاریابی و فروش',
    fullDesc: 'خودکارسازی فرآیندهای ارتباط با مشتری، ایمیل مارکتینگ، پیامک‌های هوشمند و یکپارچه‌سازی ابزارها برای کاهش خطای انسانی و افزایش بازدهی.',
    features: [
      'طراحی سناریوهای خودکار ایمیل و پیامک',
      'اتصال فرم‌ها به CRM و سیستم‌های فروش',
      'اتوماسیون لید نرسینگ (Lead Nurturing)'
    ],
    deliverables: ['سناریوهای اتوماسیون فعال', 'یکپارچه‌سازی ابزارها', 'راهنمای کاربری سیستم'],
    tags: ['Automation', 'CRM', 'Lead Nurturing'],
    packages: [
      { title: 'راه‌اندازی اتوماسیون', price: 'بر اساس بریف', description: 'طراحی سناریوها و اتصال ابزارها' }
    ]
  },
  {
    id: 'retention-strategy',
    title: 'افزایش بازگشت مشتری',
    titleEn: 'Customer Retention & Loyalty',
    iconName: 'target',
    shortDesc: 'کاری کنیم مشتری‌های قبلی دوباره برگردن و خرید کنن',
    fullDesc: 'طراحی سیستم‌های وفادارسازی، تحلیل دوره‌های خرید مجدد (LTV) و برنامه‌های بازگشت مشتری برای بالا بردن ارزش طول عمر هر مشتری.',
    features: [
      'تحلیل LTV و Cohort مشتریان',
      'طراحی کمپین‌های بازگشت و Re-engagement',
      'بهینه‌سازی تجربه خرید مجدد'
    ],
    deliverables: ['گزارش تحلیل رفتار خرید مجدد', 'برنامه وفادارسازی مشتریان', 'سناریوهای Re-engagement'],
    tags: ['Retention', 'LTV', 'Loyalty'],
    packages: [
      { title: 'برنامه وفادارسازی و بازگشت', price: 'بر اساس بریف', description: 'تحلیل رفتار مشتریان و تدوین سناریوهای بازگشت' }
    ]
  }
];

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'dayan-performance',
    title: 'توسعه سیستم Publisher Scoring و بهینه‌سازی Funnel جذب کاربر',
    client: 'دایان (مشهد)',
    industry: 'Fintech',
    pathCategory: 'sell',
    industryFa: 'پرفورمنس مارکتینگ',
    summary: 'توسعه سیستم Publisher Dynamic Scoring برای ارزیابی کیفیت پابلیشرها و افزایش دقت تصمیم‌گیری در کمپین‌ها.',
    thumbnailIcon: 'chart',
    heroColor: '#8b5cf6',
    featured: true,
    metrics: {
      roas: 'CPA Optimized',
      conversionRate: 'High Quality Leads',
      cacReduction: '-CPA'
    },
    metricsComparison: [
      { label: 'دقت ارزیابی کیفیت پابلیشرها', before: 'سنتی', after: 'Dynamic Scoring', growth: '+۱۰۰٪' },
      { label: 'کیفیت لیدهای دریافتی', before: 'متوسط', after: 'بسیار بالا', growth: '+۴۵٪' },
      { label: 'بهره‌وری بودجه تبلیغاتی', before: 'معمولی', after: 'حداکثری', growth: '+۳۵٪' }
    ],
    challenge: 'عدم وجود سنجه‌های دقیق برای سنجش کیفیت لیدهای ارسالی از سمت پابلیشرها و اتلاف بخشی از بودجه تبلیغاتی.',
    solution: 'طراحی سیستم امتیازدهی پویا (Publisher Scoring)، هدایت کمپین‌های جذب با تمرکز بر کاهش CPA و تحلیل مستمر KPIهای Funnel.',
    results: 'کاهش محسوس هزینه جذب لید مؤثر، ارتقای شفافیت تصمیم‌گیری‌ها و افزایش بهره‌وری کل بودجه.',
    tags: ['Publisher Scoring', 'CPA Reduction', 'Funnel Optimization', 'Lead Quality'],
    date: 'اکنون'
  },
  {
    id: 'iranbroker-tracking',
    title: 'طراحی معماری Tracking و افزایش دقت Attribution در Affiliate Marketing',
    client: 'ایران بروکر (مشهد)',
    industry: 'Fintech',
    pathCategory: 'sell',
    industryFa: 'فین‌تک و رمزارز',
    summary: 'معماری جامع Tracking، پیاده‌سازی ساختار Event Tracking در GTM و بهینه‌سازی کمپین‌های Display Ads.',
    thumbnailIcon: 'rocket',
    heroColor: '#4c8dff',
    featured: true,
    metrics: {
      roas: 'High Attribution',
      conversionRate: 'Data Quality Up',
      cacReduction: 'Display Ads Opt'
    },
    metricsComparison: [
      { label: 'دقت مدل Attribution', before: 'محدود', after: 'شفاف و کامل', growth: '+۸۵٪' },
      { label: 'کیفیت داده‌های بازاریابی', before: 'همپوشانی', after: 'اعتبارسنجی‌شده', growth: '+۹۵٪' },
      { label: 'هزینه جذب کاربر (Display Ads)', before: 'بالا', after: 'بهینه‌شده', growth: '-۳۰٪' }
    ],
    challenge: 'عدم امکان تحلیل دقیق عملکرد کانال‌های مختلف جذب Affiliate و خطاهای همپوشانی در ترکینگ رویدادها.',
    solution: 'طراحی ساختار کامل GTM Event Tracking، اعتبارسنجی داده‌ها و بهینه‌سازی ساختاری کمپین‌های Display گوگل.',
    results: 'ایجاد شفافیت ۱۰۰٪ در تحلیل کانال‌های ورودی و کاهش هزینه جذب کاربر با بهبود کیفیت ترافیک.',
    tags: ['Tracking Architecture', 'Attribution Accuracy', 'GTM', 'Display Ads'],
    date: 'شهریور – دی ۱۴۰۴'
  },
  {
    id: 'eqamat24-cro',
    title: 'بهینه‌سازی نرخ تبدیل (CRO) مسیر رزرو و اجرای تست‌های A/B',
    client: 'اقامت ۲۴ (مشهد)',
    industry: 'Travel',
    pathCategory: 'sell',
    industryFa: 'گردشگری و سفر',
    summary: 'تحلیل رفتار کاربران با GA4، Hotjar و Clarity و تدوین Roadmap بهینه‌سازی UX مسیر رزرو.',
    thumbnailIcon: 'target',
    heroColor: '#5ce1e6',
    featured: true,
    metrics: {
      roas: 'CRO Boosted',
      conversionRate: '+A/B Tested',
      cacReduction: '-Funnel Drops'
    },
    metricsComparison: [
      { label: 'نرخ تبدیل مسیر رزرو', before: 'پایه', after: 'ارتقا یافته', growth: '+۲۸٪' },
      { label: 'شناسایی نقاط افت Funnel', before: 'تخمینی', after: 'تحلیل داده‌محور', growth: '+۱۰۰٪' },
      { label: 'تست‌های موفق A/B', before: '۰', after: 'چندین فاز موفق', growth: '+A/B' }
    ],
    challenge: 'وجود نقاط افت (Drop-off) در مراحل نهایی مسیر رزرو هتل و هدررفت ترافیک ورودی سایت.',
    solution: 'بررسی دقیق رکوردهای رفتاری در Hotjar و Microsoft Clarity، طراحی تست‌های A/B برای صفحات کلیدی و همکاری با تیم محصول.',
    results: 'اصلاح تجربه کاربری، کاهش ریزش کاربران در مسیر خرید و افزایش نرخ تبدیل کل سیستم رزرو.',
    tags: ['CRO', 'GA4', 'Microsoft Clarity', 'Hotjar', 'A/B Testing'],
    date: 'خرداد – شهریور ۱۴۰۴'
  },
  {
    id: 'eads-campaigns',
    title: 'افزایش CTR از ۱.۲٪ به ۳.۵٪ و رشد ۲۵٪ نرخ تبدیل برای ۵ برند معتبر',
    client: 'ای ادز (تهران)',
    industry: 'SaaS',
    pathCategory: 'sell',
    industryFa: 'آژانس تبلیغاتی',
    summary: 'مدیریت کمپین‌های پرفورمنس مارکتینگ در Google Ads، Meta Ads و TikTok Ads و استانداردسازی UTMها.',
    thumbnailIcon: 'laptop',
    heroColor: '#9d4edd',
    featured: true,
    metrics: {
      roas: '3.5% CTR',
      conversionRate: '+25% Conv Rate',
      cacReduction: '5 Brands Managed'
    },
    metricsComparison: [
      { label: 'میانگین کلیک به نمایش (CTR)', before: '۱.۲٪', after: '۳.۵٪', growth: '+۱۹۱٪' },
      { label: 'افزایش نرخ تبدیل لندینگ‌پیج‌ها', before: 'پایه', after: 'بهینه‌شده', growth: '+۲۵٪' }
    ],
    challenge: 'CTR پایین و ساختار غیراستاندارد UTMها که تحلیل دقیق کمپین‌ها را ناممکن ساخته بود.',
    solution: 'بازطراحی ساختار کمپین‌ها، هدف‌گیری دقیق‌تر مخاطبان و همکاری مستقیم با تیم طراحی برای بهبود لندینگ‌ها.',
    results: 'رشد چشمگیر تعامل مخاطبان، افزایش ۲۵ درصدی تبدیل‌ها و مدیریت موفق بودجه ۵ برند همزمان.',
    tags: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'CTR Boost'],
    date: 'مرداد ۱۴۰۲ – بهمن ۱۴۰۳'
  },
  {
    id: 'fastclick-campaigns',
    title: 'طراحی و اجرای +۵۰ کمپین ویدئویی و کاهش ۲۲٪ کلیک‌های نامعتبر',
    client: 'فست کلیک (تهران)',
    industry: 'SaaS',
    pathCategory: 'sell',
    industryFa: 'پلتفرم تبلیغاتی',
    summary: 'اجرای بیش از ۵۰ کمپین ویدئویی در آپارات، اینستاگرام و تلگرام، توسعه مدل ارزیابی کیفیت ترافیک و کاهش ۳۰٪ CPA ریتارگتینگ.',
    thumbnailIcon: 'rocket',
    heroColor: '#f43f5e',
    featured: false,
    metrics: {
      roas: '-30% CPA',
      conversionRate: '-22% Invalid Clicks',
      cacReduction: '+50 Campaigns'
    },
    metricsComparison: [
      { label: 'کاهش کلیک‌های نامعتبر', before: 'بالا', after: 'کنترل‌شده', growth: '-۲۲٪' },
      { label: 'هزینه جذب (CPA) ریتارگتینگ', before: 'پایه', after: 'بهینه‌شده', growth: '-۳۰٪' }
    ],
    challenge: 'کیفیت پایین ترافیک و کلیک‌های نامعتبر در کمپین‌های ویدیویی.',
    solution: 'اجرای بیش از ۵۰ کمپین ویدیویی در آپارات، اینستاگرام و تلگرام و توسعه مدل ارزیابی کیفیت ترافیک.',
    results: 'کاهش ۲۲٪ کلیک‌های نامعتبر و کاهش ۳۰٪ هزینه جذب مشتری (CPA) در کمپین‌های ریتارگتینگ.',
    tags: ['Video Campaigns', 'Retargeting', 'CPA Reduction', 'Traffic Quality'],
    date: 'دی ۱۴۰۲ – تیر ۱۴۰۳'
  },
  {
    id: 'ahanonline-seo',
    title: 'رساندن کلیدواژه «قیمت میلگرد» به رتبه ۱ گوگل و رشد ۳۰٪ ترافیک استراتژیک',
    client: 'آهن آنلاین (تهران)',
    industry: 'E-commerce',
    pathCategory: 'grow',
    industryFa: 'صنعتی و فولاد',
    summary: 'تدوین استراتژی لینک‌سازی هدفمند، بهینه‌سازی ساختار صفحات و بهبود Snippetها و Intent Search.',
    thumbnailIcon: 'chart',
    heroColor: '#eab308',
    featured: false,
    metrics: {
      roas: 'Rank 1 Google',
      conversionRate: '+30% Traffic',
      cacReduction: 'Technical SEO'
    },
    metricsComparison: [
      { label: 'رتبه کلیدواژه «قیمت میلگرد»', before: 'صفحات عقب', after: 'رتبه ۱ گوگل', growth: 'رتبه ۱' },
      { label: 'ترافیک کلیدواژه‌های استراتژیک', before: 'پایه', after: 'رشد یافته', growth: '+۳۰٪' }
    ],
    challenge: 'نیاز به رشد ترافیک ارگانیک در بازار رقابتی محصولات فلزی.',
    solution: 'تدوین استراتژی لینک‌سازی هدفمند و بهینه‌سازی ساختار صفحات، بهبود Snippetها و تحلیل Search Intent.',
    results: 'رساندن کلیدواژه «قیمت میلگرد» به رتبه اول گوگل و رشد ۳۰٪ ترافیک کلیدواژه‌های استراتژیک.',
    tags: ['SEO', 'Google Rank 1', 'Technical SEO', 'Keyword Research'],
    date: 'خرداد ۱۴۰۱ – خرداد ۱۴۰۲'
  },
  {
    id: 'bitestan-seo',
    title: 'رساندن ۱۵ کلیدواژه حوزه رمزارز به صفحه اول گوگل طی ۴ ماه',
    client: 'بیتستان (تهران)',
    industry: 'Crypto',
    pathCategory: 'grow',
    industryFa: 'رمزارز و فین‌تک',
    summary: 'طراحی معماری محتوایی، لینک‌سازی داخلی و ارتقای ۵۰٪ ترافیک ارگانیک سایت.',
    thumbnailIcon: 'laptop',
    heroColor: '#10b981',
    featured: false,
    metrics: {
      roas: '15 Words Page 1',
      conversionRate: '+50% Organic Growth',
      cacReduction: '4 Months Result'
    },
    metricsComparison: [
      { label: 'کلمات صفحه اول گوگل', before: 'محدود', after: '۱۵ کلیدواژه اصلی', growth: '۱۵ کلمه' },
      { label: 'ترافیک ارگانیک', before: 'پایه', after: 'افزایش یافته', growth: '+۵۰٪' }
    ],
    challenge: 'حضور ضعیف در نتایج جستجوی حوزه رمزارز.',
    solution: 'طراحی معماری محتوایی، لینک‌سازی داخلی و استراتژی هدفمند SEO مبتنی بر تحلیل روندهای بازار.',
    results: 'رساندن ۱۵ کلیدواژه رقابتی به صفحه اول گوگل طی چهار ماه و رشد ۵۰٪ ترافیک ارگانیک.',
    tags: ['Crypto SEO', 'Content Architecture', 'Internal Linking', 'Page 1 Google'],
    date: 'فروردین ۱۴۰۰ – فروردین ۱۴۰۱'
  },
  {
    id: 'amir-optic',
    title: 'مدیریت وب‌سایت، پیاده‌سازی Data Tracking و بهینه‌سازی SEO/UX',
    client: 'امیر اپتیک',
    industry: 'E-commerce',
    pathCategory: 'sell',
    industryFa: 'تجارت الکترونیک',
    summary: 'پیاده‌سازی Data Tracking و بهینه‌سازی SEO/UX برای رشد نرخ تبدیل.',
    thumbnailIcon: 'laptop',
    heroColor: '#06b6d4',
    featured: false,
    metrics: {
      roas: 'Data Tracking',
      conversionRate: 'SEO/UX Opt',
      cacReduction: 'E-commerce'
    },
    metricsComparison: [
      { label: 'وضعیت پیاده‌سازی ترکینگ', before: 'ناقص', after: 'Data Tracking کامل', growth: 'کامل' }
    ],
    challenge: 'عدم وجود زیرساخت ترکینگ دقیق رفتار کاربران و عدم بهینه‌سازی صفحات برای نرخ تبدیل و سئو.',
    solution: 'پیاده‌سازی Data Tracking و بهینه‌سازی SEO/UX.',
    results: 'پیاده‌سازی ترکینگ جامع، بهبود تجربه کاربری و افزایش قابل توجه نرخ تبدیل و فروش ارگانیک.',
    tags: ['Data Tracking', 'SEO/UX', 'E-commerce'],
    date: 'شهریور ۱۴۰۴'
  },
  {
    id: 'hihotel-google-ads',
    title: 'کارشناس گوگل ادز — بازطراحی ساختار کمپین‌های Hihotel',
    client: 'Hihotel',
    industry: 'Travel',
    pathCategory: 'sell',
    industryFa: 'گردشگری و سفر',
    summary: 'بازطراحی ساختار کمپین‌ها برای بهبود کیفیت ترافیک و بازده تبلیغات.',
    thumbnailIcon: 'rocket',
    heroColor: '#3b82f6',
    featured: false,
    metrics: {
      roas: 'Campaign Redesign',
      conversionRate: 'Traffic Quality Up',
      cacReduction: 'Google Ads'
    },
    metricsComparison: [
      { label: 'کیفیت ترافیک ورودی', before: 'متوسط', after: 'ارتقایافته', growth: 'بهینه‌شده' }
    ],
    challenge: 'نیاز به بهبود کیفیت ترافیک ورودی و ارتقای بازدهی کمپین‌های تبلیغاتی گوگل.',
    solution: 'بازطراحی کامل ساختار کمپین‌ها و هدف‌گیری دقیق‌تر کلمات کلیدی.',
    results: 'بهبود کیفیت ترافیک ورودی و افزایش بازدهی تبلیغات.',
    tags: ['Google Ads', 'Campaign Structure', 'Travel Ads'],
    date: 'فروردین ۱۴۰۴'
  },
  {
    id: 'dezhino-influencer',
    title: 'اینفلوئنسر مارکتینگ دژینو — افزایش ROI به تقریباً دوبرابر',
    client: 'دژینو',
    industry: 'SaaS',
    pathCategory: 'grow',
    industryFa: 'تکنولوژی و بازاریابی',
    summary: 'بهینه‌سازی فرآیند همکاری با اینفلوئنسرها؛ ROI تقریباً دوبرابر شد.',
    thumbnailIcon: 'target',
    heroColor: '#a855f7',
    featured: false,
    metrics: {
      roas: '~2x ROI',
      conversionRate: 'Influencer Process',
      cacReduction: 'Campaign Mgmt'
    },
    metricsComparison: [
      { label: 'بازگشت سرمایه (ROI)', before: 'پایه', after: 'تقریباً ۲ برابر', growth: '۲x' }
    ],
    challenge: 'فرآیند ناکارآمد همکاری با اینفلوئنسرها و بازدهی غیرشفاف کمپین‌ها.',
    solution: 'اعتبارسنجی فالوورها، سناریونویسی و بهینه‌سازی ساختار همکاری با اینفلوئنسرها.',
    results: 'دوبرابر شدن تقریبی نرخ بازگشت سرمایه (ROI) کمپین‌های اینفلوئنسری.',
    tags: ['Influencer Marketing', 'ROI Boost', 'Briefing'],
    date: 'اردیبهشت ۱۴۰۳'
  },
  {
    id: 'omidarvisa-seo',
    title: 'بهینه‌سازی +۱۵۰ صفحه و بهبود CTR نتایج جستجو برای امیدارویزا',
    client: 'امیدارویزا',
    industry: 'Travel',
    pathCategory: 'grow',
    industryFa: 'خدمات مهاجرت و ویزا',
    summary: 'بهینه‌سازی بیش از ۱۵۰ صفحه، ارتقای CTR نتایج جستجو و رشد ترافیک ارگانیک.',
    thumbnailIcon: 'chart',
    heroColor: '#ec4899',
    featured: false,
    metrics: {
      roas: '+150 Pages',
      conversionRate: 'CTR Improvement',
      cacReduction: 'Organic Growth'
    },
    metricsComparison: [
      { label: 'صفحات بهینه‌سازی‌شده', before: 'پایه', after: '+۱۵۰ صفحه', growth: '+۱۵۰' }
    ],
    challenge: 'نرخ کلیک (CTR) پایین در نتایج گوگل و عدم یکپارچگی ساختار محتوایی در صفحات خدمات.',
    solution: 'بهینه‌سازی فنی و محتوایی بیش از ۱۵۰ صفحه و اصلاح متاتگ‌ها جهت بهبود CTR.',
    results: 'بهبود CTR نتایج جستجو و رشد ورودی‌های ارگانیک سایت.',
    tags: ['SEO', 'Content Optimization', 'CTR Boost'],
    date: 'آبان ۱۴۰۲'
  },
  {
    id: 'partoka-seo',
    title: 'سرپرست سئو پارتوکا — تدوین استراتژی SEO شش سایت و +۸۰ محتوا',
    client: 'پارتوکا',
    industry: 'SaaS',
    pathCategory: 'grow',
    industryFa: 'هلدینگ دیجیتال',
    summary: 'تدوین استراتژی SEO برای ۶ سایت و تولید +۸۰ محتوا؛ ایجاد زیرساخت رشد ارگانیک مقیاس‌پذیر.',
    thumbnailIcon: 'laptop',
    heroColor: '#6366f1',
    featured: false,
    metrics: {
      roas: '6 Websites',
      conversionRate: '+80 Content Pieces',
      cacReduction: 'Scalable Growth'
    },
    metricsComparison: [
      { label: 'تعداد سایت‌های تحت پوشش', before: 'پراکنده', after: '۶ سایت با استراتژی مدون', growth: '۶ سایت' }
    ],
    challenge: 'نیاز به زیرساخت رشد ارگانیک مقیاس‌پذیر برای شش سایت مختلف.',
    solution: 'تدوین استراتژی جامع SEO برای شش سایت و هدایت تولید بیش از ۸۰ محتوای تخصصی.',
    results: 'ساخت زیرساخت رشد ارگانیک مقیاس‌پذیر و پایدار برای هلدینگ.',
    tags: ['SEO Leadership', 'Scalable SEO', 'Content Strategy'],
    date: 'مرداد ۱۴۰۰'
  },
  {
    id: 'fazanavard-design',
    title: 'طراحی و راه اندازی سایت فضانورد (fazanavard.app)',
    client: 'فزانورد',
    industry: 'SaaS',
    pathCategory: 'start',
    industryFa: 'محصولات دیجیتال',
    summary: 'راه‌اندازی fazanavard.app؛ زیرساخت اولیه محصول برای توسعه آتی.',
    thumbnailIcon: 'rocket',
    heroColor: '#14b8a6',
    featured: false,
    metrics: {
      roas: 'fazanavard.app',
      conversionRate: 'Initial Release',
      cacReduction: 'Product MVP'
    },
    metricsComparison: [
      { label: 'وضعیت محصول', before: 'ایده', after: 'راه‌اندازی کامل fazanavard.app', growth: 'مستقر' }
    ],
    challenge: 'نیاز به طراحی و پیاده‌سازی زیرساخت اولیه محصول جهت توسعه‌های بعدی.',
    solution: 'طراحی UI/UX و پیاده‌سازی وب‌سایت fazanavard.app.',
    results: 'تحویل کامل زیرساخت اولیه محصول جهت ورود به بازار.',
    tags: ['Web Design', 'Product Setup', 'UI/UX'],
    date: 'آبان ۱۴۰۳'
  },
  {
    id: 'molaghat-restaurant',
    title: 'طراحی وب‌سایت سینمایی رستوران مولاقات',
    client: 'رستوران مولاقات',
    industry: 'Web Design',
    pathCategory: 'start',
    industryFa: 'طراحی وب‌سایت',
    summary: 'طراحی و اجرای وب‌سایت اسکرول-محور و سینمایی برای رستوران مولاقات با تجربه بصری غنی و انیمیشن‌های روان.',
    thumbnailIcon: 'code',
    heroColor: '#f59e0b',
    featured: true,
    liveUrl: 'https://molaghaat.netlify.app/',
    metrics: {
      roas: 'Cinematic UI',
      conversionRate: 'Scroll-driven UX',
      cacReduction: 'Fully Responsive'
    },
    metricsComparison: [
      { label: 'طراحی بصری', before: 'بدون وب‌سایت اختصاصی', after: 'وب‌سایت سینمایی اسکرول-محور', growth: 'برندسازی دیجیتال' },
      { label: 'تجربه کاربری', before: 'معرفی صرفاً حضوری', after: 'تجربه بصری کامل آنلاین', growth: 'افزایش اعتماد مشتری' },
      { label: 'سازگاری دستگاه‌ها', before: '—', after: 'ریسپانسیو کامل موبایل و دسکتاپ', growth: '۱۰۰٪ ریسپانسیو' }
    ],
    challenge: 'رستوران مولاقات فاقد وب‌سایتی بود که فضا، منو و تجربه حضور در رستوران را به‌صورت بصری و جذاب به مشتریان آنلاین منتقل کند.',
    solution: 'طراحی وب‌سایتی با روایت اسکرول-محور (Scroll-driven) و جلوه‌های بصری سینمایی، همراه با معرفی منو و فضای رستوران، جهت ایجاد حس حضور واقعی برای بازدیدکننده.',
    results: 'ایجاد هویت دیجیتال متمایز برای برند و تجربه‌ای بصری که رستوران را از رقبا متمایز می‌کند.',
    tags: ['Web Design', 'Scroll Animation', 'Restaurant Branding', 'UI/UX'],
    date: '۱۴۰۴'
  },
  {
    id: 'golchin-home',
    title: 'طراحی وب‌سایت فروشگاهی گلچین هوم',
    client: 'گلچین هوم',
    industry: 'Web Design',
    pathCategory: 'start',
    industryFa: 'طراحی وب‌سایت',
    summary: 'طراحی وب‌سایت فروشگاهی گلچین هوم با چیدمان مدرن محصولات، ناوبری روان و آماده برای رشد فروش آنلاین.',
    thumbnailIcon: 'code',
    heroColor: '#22c55e',
    featured: true,
    liveUrl: 'https://golchin-home.netlify.app/',
    metrics: {
      roas: 'E-commerce Ready',
      conversionRate: 'Product Showcase',
      cacReduction: 'Fully Responsive'
    },
    metricsComparison: [
      { label: 'ویترین محصولات', before: 'بدون فروشگاه آنلاین', after: 'ویترین دیجیتال کامل محصولات', growth: 'دسترسی آنلاین ۲۴ ساعته' },
      { label: 'ناوبری سایت', before: '—', after: 'دسته‌بندی روان و جستجوی سریع محصولات', growth: 'کاهش سردرگمی کاربر' },
      { label: 'سازگاری دستگاه‌ها', before: '—', after: 'ریسپانسیو کامل موبایل و دسکتاپ', growth: '۱۰۰٪ ریسپانسیو' }
    ],
    challenge: 'گلچین هوم نیاز به یک ویترین آنلاین حرفه‌ای داشت تا محصولات خانگی و دکوراتیو خود را به‌شکلی مدرن و قابل‌اعتماد به مشتریان نمایش دهد.',
    solution: 'طراحی وب‌سایت فروشگاهی با چیدمان بصری تمیز، دسته‌بندی واضح محصولات و مسیر کاربری ساده برای مرور و انتخاب محصولات.',
    results: 'ایجاد ویترین دیجیتال حرفه‌ای که پایه‌ای مناسب برای توسعه فروش آنلاین برند فراهم کرد.',
    tags: ['Web Design', 'E-commerce UI', 'Product Showcase', 'UI/UX'],
    date: '۱۴۰۴'
  },
  {
    id: 'arad-beauty',
    title: 'طراحی وب‌سایت برند آراد بیوتی',
    client: 'آراد بیوتی',
    industry: 'Web Design',
    pathCategory: 'start',
    industryFa: 'طراحی وب‌سایت',
    summary: 'طراحی وب‌سایت برند آرایشی و بهداشتی آراد بیوتی با هویت بصری لوکس و تجربه خرید ساده و جذاب.',
    thumbnailIcon: 'code',
    heroColor: '#ec4899',
    featured: true,
    liveUrl: 'https://aradbeauty.netlify.app/',
    metrics: {
      roas: 'Premium Brand UI',
      conversionRate: 'Beauty E-commerce',
      cacReduction: 'Fully Responsive'
    },
    metricsComparison: [
      { label: 'هویت بصری برند', before: 'بدون حضور آنلاین اختصاصی', after: 'وب‌سایت با هویت بصری لوکس', growth: 'تقویت جایگاه برند' },
      { label: 'مسیر خرید', before: '—', after: 'مسیر ساده مرور و انتخاب محصولات', growth: 'تجربه خرید روان' },
      { label: 'سازگاری دستگاه‌ها', before: '—', after: 'ریسپانسیو کامل موبایل و دسکتاپ', growth: '۱۰۰٪ ریسپانسیو' }
    ],
    challenge: 'آراد بیوتی به وب‌سایتی نیاز داشت که ظرافت و لوکس‌بودن برندهای آرایشی را در قالب یک تجربه دیجیتال متناسب منتقل کند.',
    solution: 'طراحی رابط کاربری با پالت رنگی ملایم و لوکس، معرفی محصولات با چیدمانی شیک و مسیر کاربری ساده برای مرور محصولات.',
    results: 'راه‌اندازی وب‌سایتی که هویت بصری برند را به‌درستی منعکس کرده و تجربه کاربری خوشایندی برای مشتریان فراهم می‌کند.',
    tags: ['Web Design', 'Beauty Brand', 'Premium UI', 'E-commerce UI'],
    date: '۱۴۰۴'
  }
];

export const STATS = [
  { value: '۲.۹ برابر', label: 'افزایش نرخ کلیک روی تبلیغات', subtext: 'از ۱.۲٪ به ۳.۵٪ در کمپین‌ها', icon: 'trending-up' },
  { value: 'تا ۲۵٪', label: 'افزایش تبدیل بازدیدکننده به مشتری', subtext: 'در لندینگ‌پیج‌ها و مسیر خرید', icon: 'target' },
  { value: 'تا ۳۰٪', label: 'کاهش هزینه‌ی جذب هر مشتری', subtext: 'با سیستم‌های Scoring و فیلتر ترافیک', icon: 'award' },
  { value: 'تا ۲ برابر', label: 'بازگشت سرمایه از تبلیغات', subtext: 'در کمپین‌های بهینه‌شده', icon: 'rocket' }
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    clientName: 'تیم پرفورمنس مارکتینگ',
    clientRole: 'مدیر ارشد محصول و رشد',
    company: 'دایان',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    quote: 'پیاده‌سازی سیستم Publisher Dynamic Scoring توسط امید، دقت ما در ارزیابی ترافیک ورودی را به شدت بالا برد و باعث شد لیدهای بسیار باکیفیت‌تری جذب کنیم.',
    metricHighlight: 'بهینه‌سازی کامل CPA'
  },
  {
    id: '2',
    clientName: 'تیم فنی و مارکتینگ',
    clientRole: 'مدیر ارشد بازاریابی',
    company: 'ایران بروکر',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    quote: 'معماری ترکینگ دقیق و اعتبارسنجی GTM که امید طراحی کرد، شفافیت کاملی در ارزیابی کانال‌های Affiliate به ما داد.',
    metricHighlight: 'دقت بالای Attribution'
  },
  {
    id: '3',
    clientName: 'تیم محصول و CRO',
    clientRole: 'سرپرست تیم بهینه‌سازی',
    company: 'اقامت ۲۴',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    quote: 'اجرای دقیق تست‌های A/B و تحلیل رفتار کاربران در GA4 و Clarity توسط امید، نقش مهمی در کاهش نقاط افت مسیر رزرو داشت.',
    metricHighlight: 'رشد ۲۸٪ نرخ تبدیل رزرو'
  }
];

export const BLOG_PAGE_DATA = {
  badge: 'مقالات و راهنماها',
  headline: 'نکته‌ها و راهنماهایی برای رشد فروشگاهتون',
  subheadline: 'از تجربه‌ی واقعی پروژه‌ها نوشته شده — ساده، عملی و بدون پیچیدگی‌های اضافه.',
  searchPlaceholder: 'جستجو در مقالات...',
  newsletterHeadline: 'عضویت در خبرنامه',
  newsletterSubheadline: 'نکته‌های عملی برای رشد فروشگاهتون، مستقیم توی ایمیلتون — بدون هیچ اصطلاح پیچیده‌ای.',
  newsletterPlaceholder: 'آدرس ایمیل شما...',
  newsletterCta: 'عضویت رایگان',
  newsletterSuccess: 'ایمیل شما با موفقیت ثبت شد. به‌زودی اولین ایمیل رو براتون می‌فرستم!'
};

export const INITIAL_BLOG_COMMENTS: BlogComment[] = [
  {
    id: 'comm-1',
    postId: 'ecommerce-beginner-mistakes',
    authorName: 'سارا رضایی',
    authorEmail: 'sara@example.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
    content: 'نکته‌ای که در مورد ساده‌سازی مراحل تسویه حساب گفتید دقیقاً مشکلی بود که ما با درگاه پرداخت داشتیم. بعد از حذف فیلدهای اضافی فرم، نرخ خریدمون ۱۵٪ رشد کرد!',
    date: '۲ روز پیش',
    isApproved: true,
    likes: 4,
    reply: 'خیلی خوشحالم که این تغییر براتون اثربخش بوده سارا جان. بهینه‌سازی فرم تسویه‌حساب همیشه از پربازده‌ترین کارهای CRO است.'
  },
  {
    id: 'comm-2',
    postId: 'ecommerce-beginner-mistakes',
    authorName: 'محمدرضا کاظمی',
    authorEmail: 'm.kazemi@company.ir',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    content: 'برای فروشگاه‌های پوشاک با تنوع بالای رنگ و سایز، چه ابزاری رو برای رصد رفتار مشتری در صفحات محصول پیشنهاد می‌دید؟',
    date: '۵ روز پیش',
    isApproved: true,
    likes: 2,
    reply: 'سلام محمدرضا عزیز، ابزار Microsoft Clarity به دلیل رایگان بودن و ایجاد Session Replay و Heatmap دقیق، بهترین نقطه شروع برای شناسایی سردرگمی مشتری در انتخاب سایز و رنگ است.'
  },
  {
    id: 'comm-3',
    postId: 'cpa-campaign-success',
    authorName: 'امیرحسین تهرانی',
    authorEmail: 'amir@startup.io',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    content: 'تحلیل فوق‌العاده‌ای بود. ما هم مدت‌ها فکر می‌کردیم CPA کم یعنی سودآوری، تا اینکه فهمیدیم Retention کاربرهای لید ارزان زیر ۳٪ بود!',
    date: '۱ هفته پیش',
    isApproved: true,
    likes: 6
  }
];

export const CORE_BLOG_POSTS: BlogPost[] = [
  {
    id: 'ecommerce-beginner-mistakes',
    title: '۵ اشتباه رایج فروشگاه‌های تازه‌کار موقع طراحی اولین سایتشون',
    excerpt: 'اشتباهاتی که توی همون هفته‌های اول باعث ریزش مشتری و هدررفت بودجه می‌شه و چطور با چند تغییر ساده جلوشون رو بگیرید.',
    content: `وقتی یک فروشگاه یا کسب‌وکار برای اولین بار اقدام به راه‌اندازی سایت می‌کند، اشتیاق اولیه برای افزودن صدها قابلیت و گرافیک‌های پیچیده، معمولاً به تجربه کاربری سنگین و افت فروش منجر می‌شود. در این مقاله ۵ خطای اساسی و راه‌حل‌های عملی هرکدام را بررسی می‌کنیم.`,
    category: 'Web Design',
    categoryFa: 'طراحی و راه‌اندازی',
    pathCategory: 'start',
    date: '۱۵ مهر ۱۴۰۴',
    updatedAt: '۲۰ مهر ۱۴۰۴',
    readTime: '۵ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'استراتژیست رشد و CRO',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'code',
    coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    featured: true,
    isPopular: true,
    viewsCount: 1420,
    commentsCount: 2,
    tableOfContents: [
      { id: 'sec-1', title: '۱. پیچیده‌کردن بیش از حد مراحل ثبت سفارش و چک‌اوت' },
      { id: 'sec-2', title: '۲. نادیده‌گرفتن تجربه کاربری در صفحه موبایل (Mobile-First)' },
      { id: 'sec-3', title: '۳. سرعت لود پایین و استفاده از تصاویر فوق‌سنگین' },
      { id: 'sec-4', title: '۴. راه‌اندازی سایت بدون ابزارهای ردیابی و ترکینگ پایه' },
      { id: 'sec-5', title: '۵. کمبود المان‌های اعتمادسازی و شفافیت در هزینه ارسال' },
      { id: 'sec-summary', title: 'چک‌لیست جمع‌بندی و اقدامات بعدی' }
    ],
    sections: [
      {
        id: 'sec-1',
        heading: '۱. پیچیده‌کردن بیش از حد مراحل ثبت سفارش و چک‌اوت',
        content: `بزرگ‌ترین قاتل نرخ تبدیل در فروشگاه‌های نوپا، اجبار کاربر به ثبت‌نام طولانی، پر کردن فرم‌های ۱۰ فیلدی و تایید ایمیل قبل از خرید است. کاربر شما قصد خرید سریع یک محصول را دارد؛ هر کلیک اضافه بین سبد خرید تا درگاه پرداخت، بین ۱۰ تا ۲۰ درصد احتمال انصراف را افزایش می‌دهد.`,
        callout: 'نکته طلایی: خرید به عنوان مهمان (Guest Checkout) را فعال کنید و فیلدهای آدرس را به حداقل اطلاعات لازم برسانید.',
        keyPoints: [
          'حذف فیلدهای غیرضروری مانند کد پستی فرعی یا فکس',
          'امکان ورود آسان با پیامک یکبار مصرف (OTP)',
          'نمایش خلاصه سبد خرید و مبالغ نهایی در همان صفحه تسویه‌حساب'
        ]
      },
      {
        id: 'sec-2',
        heading: '۲. نادیده‌گرفتن تجربه کاربری در صفحه موبایل (Mobile-First)',
        content: `بیش از ۷۵ درصد کاربران فروشگاه‌های اینترنتی در ایران از گوشی همراه استفاده می‌کنند. اگر دکمه‌های خرید در موبایل کوچک باشند، منوی سایت کند باز شود یا نوشته‌ها نیاز به زوم داشته باشند، عملاً بخش اعظم مشتریان بالقوه را از دست می‌دهید.`,
        callout: 'تست ساده: سایت خود را با گوشی‌های مختلف و سرعت اینترنت همراه بررسی کنید و مطمئن شوید دکمه خرید همیشه در دسترس انگشت شست قرار دارد.',
        keyPoints: [
          'اندازه دکمه‌های لمسی حداقل ۴۴ در ۴۴ پیکسل باشد',
          'استفاده از Sticky Add to Cart (دکمه خرید چسبان پایین صفحه)',
          'ساده‌سازی گالری تصاویر محصول با قابلیت Swipe آسان'
        ]
      },
      {
        id: 'sec-3',
        heading: '۳. سرعت لود پایین و استفاده از تصاویر فوق‌سنگین',
        content: `هر ثانیه تاخیر در لود صفحه محصول، ۷٪ از نرخ تبدیل را کاهش می‌دهد. بارگذاری عکس‌های ۳ تا ۵ مگابایتی که مستقیماً از دوربین بدون فشرده‌سازی در سایت قرار گرفته‌اند، فاجعه‌ای برای سئو و فروش است.`,
        keyPoints: [
          'تبدیل تمامی تصاویر به فرمت WebP با حجم زیر ۱۰۰ کیلوبایت',
          'فعال‌سازی کش سرور و لود تنبل (Lazy Loading)',
          'حذف اسکریپت‌ها و پلاگین‌های بلااستفاده'
        ]
      },
      {
        id: 'sec-4',
        heading: '۴. راه‌اندازی سایت بدون ابزارهای ردیابی و ترکینگ پایه',
        content: `اگر ندانید مشتری از کجا آمده، در کدام مرحله از سایت خارج شده و به چه دلایلی خرید نکرده، چگونه می‌توانید فروش را بهبود ببخشید؟ راه‌اندازی سایت بدون گوگل آنالیتیکس ۴ و سرچ کنسول دقیقاً مانند باز کردن مغازه در تاریکی مطلق است.`,
        callout: 'از همان روز اول، ایونت‌های View Item، Add to Cart و Purchase را دقیق پیاده‌سازی کنید.'
      },
      {
        id: 'sec-5',
        heading: '۵. کمبود المان‌های اعتمادسازی و شفافیت در هزینه ارسال',
        content: `بسیاری از خریداران به دلیل عدم شفافیت در زمان و هزینه ارسال یا نبود نشانه‌های اعتماد در سایت انصراف می‌دهند. هزینه‌های پنهان ارسال که ناگهان در آخرین مرحله نمایان می‌شوند، علت اول رها شدن سبدهای خرید در ایران هستند.`,
        keyPoints: [
          'نمایش نماد اعتماد، آدرس، شماره تماس ثابت و گارانتی بازگشت وجه',
          'محاسبه و اعلام شفاف هزینه و زمان تقریبی پست قبل از مرحله نهایی'
        ]
      }
    ],
    tags: ['طراحی سایت', 'CRO', 'فروشگاه اینترنتی', 'نرخ تبدیل']
  },
  {
    id: 'cpa-campaign-success',
    title: 'چرا CPA پایین همیشه به معنی کمپین موفق نیست',
    excerpt: 'گاهی کاهش هزینه جذب، کیفیت لید رو قربانی می‌کنه — چطور این تعادل رو پیدا کنیم و روی ارزش طول عمر مشتری (LTV) تمرکز کنیم.',
    content: `در دنیای پرفورمنس مارکتینگ، تمرکز صرف روی کاهش هزینه به ازای جذب (CPA) می‌تواند بسیار گول‌زننده باشد. اگر لیدهای ارزان‌قیمت کیفیت لازم برای تبدیل به خریدار وفادار را نداشته باشند، سودآوری خالص کسب‌وکار افت خواهد کرد.`,
    category: 'Performance',
    categoryFa: 'پرفورمنس مارکتینگ',
    pathCategory: 'sell',
    date: '۲۸ شهریور ۱۴۰۴',
    updatedAt: '۲ مهر ۱۴۰۴',
    readTime: '۶ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'متخصص پرفورمنس مارکتینگ',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'rocket',
    coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    featured: true,
    isPopular: false,
    viewsCount: 980,
    commentsCount: 1,
    tableOfContents: [
      { id: 'cpa-trap', title: '۱. تله لید ارزان در تبلیغات کلیکی و شبکه‌های اجتماعی' },
      { id: 'cpa-ltv', title: '۲. رابطه مستقیم کیفیت لید با ارزش طول عمر مشتری (LTV)' },
      { id: 'cpa-framework', title: '۳. فریم‌ورک ارزیابی سلامت کمپین فراتر از CPA' }
    ],
    sections: [
      {
        id: 'cpa-trap',
        heading: '۱. تله لید ارزان در تبلیغات کلیکی و شبکه‌های اجتماعی',
        content: `وقتی تارگتینگ کمپین را بیش از حد باز می‌گذارید یا از قلاب‌های جایزه‌ای و تخفیف‌های افراطی استفاده می‌کنید، افراد زیادی فرم شما را پر می‌کنند و CPA ظاهراً افت چشمگیری می‌کند. اما تیم فروش با کوهی از تماس‌های بی‌فایده و کاربران بی‌علاقه روبرو می‌شود.`,
        callout: 'شاخص واقعی موفقیت: Cost Per Qualified Lead (هزینه لید واجد شرایط) و Cost Per Sale است، نه صرفاً CPA اولیه.'
      },
      {
        id: 'cpa-ltv',
        heading: '۲. رابطه مستقیم کیفیت لید با ارزش طول عمر مشتری (LTV)',
        content: `مشتریانی که با درک دقیق ارزش محصول و نیاز واقعی جذب می‌شوند، سبد خرید بزرگ‌تر و نرخ تکرار خرید (Repeat Purchase) بالاتری دارند. هزینه بالاتر در جذب اولیه، در ماه‌های بعدی با خریدهای مکرر جبران می‌شود.`
      },
      {
        id: 'cpa-framework',
        heading: '۳. فریم‌ورک ارزیابی سلامت کمپین فراتر از CPA',
        content: `به جای مقایسه هفتگی CPA، معیارهای Blended CAC، زمان بازگشت سرمایه تبلیغات (Payback Period) و نسبت LTV/CAC را در داشبوردهای تحلیلی خود قرار دهید.`,
        keyPoints: [
          'دسته‌بندی کمپین‌ها بر اساس نرخ بسته شدن قرارداد توسط تیم فروش',
          'محاسبه دقیق سود ناخالص به ازای هر کانال تبلیغاتی',
          'اتصال CRM به پلتفرم‌های تبلیغاتی با Conversion API'
        ]
      }
    ],
    tags: ['پرفورمنس مارکتینگ', 'CPA', 'تبلیغات دیجیتال', 'LTV']
  },
  {
    id: 'conversion-rate-measurement',
    title: 'نرخ تبدیل سایت‌تون رو چطور واقعاً اندازه بگیرید',
    excerpt: 'راهنمای ساده برای شروع اندازه‌گیری درست در GA4، بدون نیاز به کدنویسی عمیق یا اصطلاحات پیچیده.',
    content: `بسیاری از کسب‌وکارها نرخ تبدیل را صرفاً به عنوان یک عدد کلی (مثلاً ۱.۵٪) نگاه می‌کنند، در حالی که نرخ تبدیل میکرو و ماکرو در هر مرحله از فانل خرید، داستان متفاوتی را روایت می‌کند.`,
    category: 'CRO',
    categoryFa: 'بهینه‌سازی نرخ تبدیل',
    pathCategory: 'sell',
    date: '۲۰ مرداد ۱۴۰۴',
    updatedAt: '۲۵ مرداد ۱۴۰۴',
    readTime: '۸ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'مشاور بهینه‌سازی نرخ تبدیل',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'target',
    coverImage: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=1200&q=80',
    featured: true,
    isPopular: false,
    viewsCount: 1150,
    commentsCount: 0,
    tableOfContents: [
      { id: 'cro-1', title: '۱. تفاوت نرخ تبدیل کلی با نرخ تبدیل گام‌های فانل' },
      { id: 'cro-2', title: '۲. تنظیم Funnel Exploration در گوگل آنالیتیکس ۴' },
      { id: 'cro-3', title: '۳. شناسایی سریع گلوگاه‌های خروج مشتری' }
    ],
    sections: [
      {
        id: 'cro-1',
        heading: '۱. تفاوت نرخ تبدیل کلی با نرخ تبدیل گام‌های فانل',
        content: `اگر ۱۰۰۰ نفر وارد سایت شوند و ۱۵ نفر خرید کنند، نرخ تبدیل کلی ۱.۵٪ است. اما اگر بدانید از آن ۱۰۰۰ نفر، ۵۰۰ نفر دکمه افزودن به سبد را زدند ولی ۴۸۵ نفر در مرحله پرداخت انصراف دادند، بلافاصله متوجه می‌شوید مشکل در ترغیب به خرید نیست، بلکه در صفحه پرداخت است.`
      },
      {
        id: 'cro-2',
        heading: '۲. تنظیم Funnel Exploration در گوگل آنالیتیکس ۴',
        content: `با ابزار رایگان Funnel Exploration در GA4 می‌توانید دقیقاً گام‌های ورود -> مشاهده محصول -> افزودن به سبد خرید -> آغاز تسویه‌حساب -> خرید موفق را رسم کنید و درصد ریزش هر گام را با دقت بالا ببینید.`
      }
    ],
    tags: ['CRO', 'GA4', 'آنالیتیکس', 'قیف فروش']
  },
  {
    id: 'ab-testing-failures',
    title: 'چرا اکثر تست‌های A/B شکست می‌خورن و چطور درست اجراشون کنیم',
    excerpt: 'اشتباهات رایجی که نتیجه تست‌ها رو بی‌اعتبار می‌کنه و راه‌های طراحی تست علمی با معناداری آماری.',
    content: `تست A/B ابزاری شگفت‌انگیز برای رشد بدون حدس و گمان است؛ اما اجرای تست بدون ترافیک کافی، تغییر همزمان چند فرضیه یا پایان دادن زودهنگام به تست، نتایج کاملاً غلط به همراه دارد.`,
    category: 'CRO',
    categoryFa: 'بهینه‌سازی نرخ تبدیل',
    pathCategory: 'sell',
    date: '۱۰ تیر ۱۴۰۴',
    readTime: '۷ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'مشاور بهینه‌سازی نرخ تبدیل',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'target',
    coverImage: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    isPopular: false,
    viewsCount: 840,
    commentsCount: 0,
    tags: ['A/B تست', 'CRO', 'آزمایش داده‌محور']
  },
  {
    id: 'tracking-attribution-guide',
    title: 'Tracking یعنی چی و چرا بدونش کمپین‌تون کوره',
    excerpt: 'مقدمه‌ای ساده بر مفهوم Attribution و ترکینگ سمت سرور برای صاحبان کسب‌وکارهای غیرفنی.',
    content: `بدون ترکینگ دقیق رویدادها، UTMهای ساختاریافته و اتریبیوشن درست، تخصیص بودجه تبلیغاتی شبیه به پرتاب تیر در تاریکی است. در این مقاله به زبان ساده یاد می‌گیرید چطور ردپای مشتری را کشف کنید.`,
    category: 'Analytics',
    categoryFa: 'آنالیتیکس و ترکینگ',
    pathCategory: 'sell',
    date: '۰۵ خرداد ۱۴۰۴',
    readTime: '۱۰ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'متخصص ترکینگ و داده',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'chart',
    coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    isPopular: false,
    viewsCount: 1320,
    commentsCount: 0,
    tags: ['ترکینگ', 'Attribution', 'آنالیتیکس', 'سرور ساید']
  },
  {
    id: 'seo-short-vs-longterm',
    title: 'فرق سئو کوتاه‌مدت و بلندمدت در چیه',
    excerpt: 'چطور بین رشد سریع و ناپایدار با سئوی کلاه‌سیاه و رشد واقعی و پایدار ارگانیک فرق بذارید.',
    content: `تکنیک‌های سیاه یا بک‌لینک‌های فله‌ای ممکن است رشدی زودگذر ایجاد کنند، اما الگوریتم‌های گوگل به سرعت سایت را جریمه می‌کنند. استراتژی محتوای عمیق و پاسخگویی به نیاز واقعی مخاطب، تنها دارایی ماندگار سئو است.`,
    category: 'SEO',
    categoryFa: 'سئو و رشد ارگانیک',
    pathCategory: 'grow',
    date: '۲۲ اردیبهشت ۱۴۰۴',
    readTime: '۵ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'استراتژیست رشد و سئو',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'laptop',
    coverImage: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    isPopular: false,
    viewsCount: 760,
    commentsCount: 0,
    tags: ['سئو', 'تولید محتوا', 'رشد ارگانیک']
  },
  {
    id: 'pre-ad-budget-checklist',
    title: 'قبل از افزایش بودجه تبلیغات، این ۶ مورد رو چک کنید',
    excerpt: 'چک‌لیستی ساده قبل از هر تصمیم برای افزایش هزینه تبلیغاتی تا پولتان هدر نرود.',
    content: `افزایش بودجه در فانیلی که نرخ تبدیل پایینی دارد یا صفحه محصول آن ناقص است، اتلاف سرمایه است. قبل از اسکیل کمپین‌ها، این ۶ نقطه حیاتی در سایت و سیستم ترکینگ را ارزیابی کنید.`,
    category: 'Performance',
    categoryFa: 'پرفورمنس مارکتینگ',
    pathCategory: 'grow',
    date: '۱۵ فروردین ۱۴۰۴',
    readTime: '۶ دقیقه مطالعه',
    author: 'امید عدلی',
    authorRole: 'متخصص پرفورمنس مارکتینگ',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    imageIcon: 'rocket',
    coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    featured: false,
    isPopular: false,
    viewsCount: 1090,
    commentsCount: 0,
    tags: ['تبلیغات کلیکی', 'بودجه‌بندی', 'مقیاس‌پذیری', 'پرفورمنس']
  }
];

export const CHAT_CONFIG = {
  enabled: true,
  title: 'منتور هوشمند پرفورمنس مارکتینگ (امید عدلی)',
  greeting: 'سلام! من مسکات و منتور هوشمند پرفورمنس مارکتینگ و CRO امید عدلی‌ام. هر سوالی درباره استراتژی‌های رشد، افزایش نرخ تبدیل، بهینه‌سازی تبلیغات یا همکاری دارید بپرسید تا با تحلیل داده‌محور و راهکارهای عملی با هم بررسیش کنیم.',
  persona: 'تو منتور ارشد و دستیار هوشمند پرفورمنس مارکتینگ (Performance Marketing Mentor) و بهینه‌سازی نرخ تبدیل (CRO) امید عدلی هستی. شخصیت و لحن تو: متخصص، باتجربه، داده‌محور و عمل‌گرا، اما بسیار خوش‌برخورد، گرم، همدلانه و قابل‌فهم (Professional yet Approachable). به فارسی سلیس و محترمانه سخن بگو. برای هر پرسش کاربر، زاویه دید تحلیلی و راهکارهای سنجش‌پذیر ارائه کن و بر اساس داده‌های واقعی سایت پاسخ بده. از اصطلاحات خشک بی‌روح پرهیز کن و با راهنمایی‌های ملموس، کاربر را به سمت رشد کسب‌وکار و در صورت نیاز رزرو جلسه مشاوره اختصاصی با امید عدلی هدایت کن.',
  quickQuestions: ['چطور نرخ تبدیل (CRO) سایتم رو بالا ببرم؟', 'چه خدماتی در پرفورمنس مارکتینگ ارائه می‌دید؟', 'چطور هزینه جذب مشتری (CAC) رو کم کنیم؟', 'چطور می‌تونم جلسه مشاوره رزرو کنم؟'],
  ctaText: 'برای بررسی تخصصی فانل فروش و داده‌های کسب‌وکارتون، از بخش رزرو مشاوره یا صفحه تماس پیام بدید — در کمتر از ۴ ساعت کاری پاسخ داده می‌شود.',
  fallbackMessage: 'در حال حاضر به موتور هوش مصنوعی دسترسی ندارم، ولی می‌تونم بر اساس متدولوژی‌ها و داده‌های سایت به سوالات رایج پرفورمنس مارکتینگ جواب بدم.',
};

// Config for the paid AI TOOLS (محصولات هوشمند) — fully editable from the admin panel.
// The AI personas/prompts and security live server-side in lib/tools.ts; pricing
// plans live in lib/toolPlans.ts. This controls display, the purchase funnel, the
// free-trial gamification, and lets the admin override plan prices per tool.
export const AI_TOOLS_CONFIG = {
  // Master switch for the whole AI-tools section on the products page.
  enabled: true,
  // Gamification: number of free "taster" messages per device per tool (0 = fully locked).
  freeTrialCount: 3,
  // Persuasion copy shown on the plans/paywall.
  socialProof: 'به بیش از ۱۲۰ مارکتر و صاحب کسب‌وکار در تصمیم‌های واقعی کمک کرده‌ایم.',
  urgency: 'ظرفیت پشتیبانی این ماه محدود است — دسترسی‌ها به‌ترتیب فعال می‌شوند.',
  // Shown to the buyer inside the unlock gate, above the contact buttons.
  purchaseNote: 'برای دریافت دسترسی، پلن دلخواهت را انتخاب کن و در تلگرام / واتساپ / بله فیش واریزی به‌همراه شماره موبایلت را بفرست. دسترسی روی شماره‌ی تو باز می‌شود و یک کد اختصاصی برایت ارسال می‌گردد.',
  // Purchase channels. Leave empty to fall back to PERSONAL_INFO defaults.
  channels: {
    telegramUrl: 'https://t.me/omidadli01',
    whatsappUrl: 'https://wa.me/989933773515',
    baleUrl: 'https://ble.ir/omidadli01',
    phone: '۰۹۹۳۳۷۷۳۵۱۵',
  },
  // Per-tool: availability, behavior overrides, and optional plan-price overrides.
  // planPrices keys = plan ids (basic|pro|vip). Empty = use defaults from lib/toolPlans.ts.
  tools: {
    'business-therapist': { enabled: true, planPrices: {} as Record<string, string> },
    'growth-path': { enabled: true, planPrices: {} as Record<string, string> },
    'problem-solver': { enabled: true, planPrices: {} as Record<string, string> },
    'mock-customer': { enabled: true, planPrices: {} as Record<string, string> },
  } as Record<string, { enabled: boolean; planPrices?: Record<string, string>; behavior?: any }>,
};



export const PRODUCTS_PAGE_DATA = {
  badge: 'محصولات و ابزارهای هوش مصنوعی',
  headline: 'دستیارهای هوشمند اختصاصی، برای جهش فروش و رشد کسب‌وکار',
  subheadline: 'چهار ابزار هوش مصنوعی تخصصی که همین‌جا در سایت با آن‌ها گفتگو می‌کنی: از مشاوره مارکتینگ و عیب‌یابی کمپین تا برنامه‌ریزی هدف، حل مسئله استراتژیک و تمرین فروش.'
};

export const PRODUCTS: ProductItem[] = [
  {
    id: 'business-therapist',
    title: 'تراپیست بیزینسی و منتور مارکتینگ',
    tagline: 'یک مشاور ارشد پرفورمنس مارکتینگ همیشه در جیب شما — بدون جلسات میلیونی، گیرِ کمپینت رو همین امشب باز کن',
    description: 'ترکیبی از یک منتور ارشد مارکتینگ و همراه همدل که همه‌چیز درباره عیب‌یابی کمپین، بهینه‌سازی نرخ تبدیل (CRO)، محاسبه CAC/ROAS و بازگشت سرمایه می‌داند. دغدغه یا چالش فروش و تبلیغاتت را مطرح می‌کنی و مثل یک جلسه تراپی تخصصی، هم شنیده می‌شوی و هم چک‌لیست داده‌محور با اقدامات عملی همین هفته را تحویل می‌گیری.',
    targetAudience: 'مارکترها، صاحبان فروشگاه‌های اینترنتی، فریلنسرها و مدیران کسب‌وکاری که یک هم‌فکر ارشد، بی‌تعارف و داده‌محور برای تصمیم‌های حساس بازاریابی می‌خواهند.',
    problemSolved: 'سوختن بودجه در تبلیغات بدون بازدهی، سردرگمی در تحلیل داده‌های آنالیتیکس، افت نرخ تبدیل سایت و تنهایی کارآفرین در تصمیم‌گیری‌های پرریسک.',
    whyBuy: 'یک جلسه مشاوره خصوصی مارکتینگ بین ۲.۵ تا ۱۰ میلیون تومان هزینه دارد؛ با هزینه یک اشتراک ماهانه (شروع از ۵۹۰ هزار تومان)، ۲۴ ساعته و بدون نیاز به هماهنگی وقت، به متدولوژی و تحلیل‌های اختصاصی امید عدلی دسترسی داری. اگر فقط یک کمپین شما از ضرر نجات یابد، ده برابر این هزینه جبران شده است.',
    iconName: 'megaphone',
    glow: 'magenta',
    badge: 'منتور مارکتینگ اختصاصی',
    price: 'شروع از ۵۹۰٬۰۰۰ تومان',
    actionText: 'شروع گفتگو و تست رایگان',
    status: 'published',
    features: [
      'تحلیل نقاط نشت فانل فروش (Drop-off) و افت نرخ تبدیل',
      'فرمول‌های اختصاصی ارزیابی سلامت متریک‌ها (ROAS، CAC، LTV)',
      'عیب‌یابی افت فروش کمپین‌ها و ارائه فرضیه تست A/B',
      'چک‌لیست ۳ مرحله‌ای قابل تیک‌زدن برای اجرای فوری همین هفته',
      'اتصال به دایجست دانش روز و تجربیات بازاریابی دیجیتال ایران'
    ],
    howItWorks: [
      'چالش یا متریک کمپینت را بنویس (مثلاً: تبلیغم کلیک می‌خوره ولی سبد خرید خالی می‌مونه)',
      'دستیار ریشه‌ی مسئله را با دید تحلیلی و همدلانه کالبدشکافی می‌کند',
      'چک‌لیست ۳ اقدام مشخص و قابل‌اجرا در همین هفته را تحویل بگیر'
    ],
    sample: [
      { role: 'user', text: 'هرچی تبلیغ می‌کنم فروش بالا نمی‌ره، خسته شدم.' },
      { role: 'assistant', text: 'کاملاً درکت می‌کنم؛ این حسِ گیر افتادن طبیعیه. بگو ببینم نرخ تبدیل صفحه‌ی فرودت رو اندازه گرفتی؟ معمولاً مشکل نه در تبلیغ، که در ادامه‌ی مسیرِ فروشه…' }
    ],
    placeholder: 'دغدغه یا چالش کاری‌ات رو راحت بنویس…',
    plans: [
      { id: 'basic', name: 'پایه (آغازگر)', price: '۵۹۰٬۰۰۰ تومان', durationDays: 30, messageQuota: 200, maxDevices: 1, tagline: 'برای بررسی و حل چند چالش فوری', perks: ['۳۰ روز دسترسی کامل', '۲۰۰ پیام گفتگو', 'مشاوره داده‌محور کمپین', 'فعال روی ۱ دستگاه'] },
      { id: 'pro', name: 'حرفه‌ای (محبوب‌ترین)', price: '۱٬۲۹۰٬۰۰۰ تومان', durationDays: 90, messageQuota: 700, maxDevices: 2, tagline: 'انتخاب اول مارکترها و فروشگاه‌ها', perks: ['۹۰ روز دسترسی نامحدود زمانی', '۷۰۰ پیام گفتگو', 'حافظه طولانی‌تر مکالمه', 'اولویت پردازش هوش مصنوعی', 'فعال روی ۲ دستگاه'], popular: true, badge: 'محبوب‌ترین' },
      { id: 'vip', name: 'نامحدود VIP', price: '۲٬۴۹۰٬۰۰۰ تومان', durationDays: 180, messageQuota: 0, maxDevices: 3, tagline: 'برای تیم‌ها و مدیران پرمصرف', perks: ['۱۸۰ روز دسترسی کامل', 'پیام نامحدود بدون سهمیه', 'بیشترین صرفه اقتصادی', 'پشتیبانی ویژه اولویت‌دار', 'فعال روی ۳ دستگاه'], badge: 'بیشترین صرفه' }
    ],
    behavior: {
      persona: 'تو «تراپیست بیزینسی» هستی: ترکیبی از یک منتور ارشد پرفورمنس مارکتینگ و یک همراهِ همدل. اصول رفتار: اول همدلی، بعد راهکار. داده‌محور و صادق. راهکار عملی و کوچک ۱ تا ۳ قدمی در همین هفته. لحن محترمانه، خودمانی و بدون کلیشه.',
      welcome: 'سلام، خوش اومدی به جلسه‌ی تراپی بیزینسی. اینجا قراره راحت حرف بزنی. بگو این روزها چی توی کار یا مارکتینگت بیشتر از همه ذهنت رو مشغول کرده؟ می‌تونه یه چالش فنی باشه یا حتی حسِ گیر افتادن.',
      suggestions: ['حس می‌کنم هرچی تبلیغ می‌کنم فروش بالا نمی‌ره', 'نمی‌دونم بودجه محدودم رو کجا خرج کنم', 'رقیبم داره جلو می‌زنه و استرس گرفتم', 'برند شخصیم رو چطوری بسازم؟'],
      temperature: 0.7,
      useDigest: true,
      model: 'gemini-2.5-flash'
    }
  },
  {
    id: 'growth-path',
    title: 'مسیرساز هوشمند توسعه فردی و شغلی',
    tagline: 'از سردرگمی تا شفافیت محض در ۳ دقیقه: هدفت را بگو، نقشه‌ی راه فازبندی‌شده و چک‌لیستش را بگیر',
    description: 'هر هدف شغلی، کسب‌وکاری یا مهارتی در ذهن داری را برایش توصیف می‌کنی و او آن را به یک برنامه مدون، فازهای ۲ تا ۴ هفته‌ای، نقاط عطف شفاف و یک چک‌لیست قابلِ تیک‌زدن تبدیل می‌کند؛ دقیقاً متناسب با زمان و شرایط واقعی زندگی‌ات.',
    targetAudience: 'هرکسی که یک هدف جذاب در سر دارد (شغل دلخواه، راه‌اندازی کسب‌وکار، مهارت‌آموزی، درآمد دلاری) ولی در نقطه شروع احساس سردرگمی می‌کند و نمی‌داند اولویت اول چیست.',
    problemSolved: 'شکست ۹۰٪ اهداف به دلیل ابهام در گام‌های آغازین، کمال‌گرایی منفی، تعویق انداختن کارها و نداشتن چک‌لیست اجرایی روزمره.',
    whyBuy: 'دوره‌های منتورینگ و برنامه‌ریزی ماهانه میلیون‌ها تومان هزینه دارند و معمولاً بعد از دو هفته انگیزه فروکش می‌کند. این ابزار با هزینه یک پیراهن (شروع از ۴۹۰ هزار تومان)، نقشه‌ای دقیق، گام‌به‌گام و واقع‌بینانه می‌سازد که مقاومت ذهنی را می‌شکند و مسیر رسیدن به هدفت را ماه‌ها کوتاه‌تر می‌کند.',
    iconName: 'rocket',
    glow: 'blue',
    badge: 'نقشه‌ی راه هوشمند',
    price: 'شروع از ۴۹۰٬۰۰۰ تومان',
    actionText: 'ساخت نقشه‌ی راه و تست رایگان',
    status: 'published',
    features: [
      'تبدیل اهداف مبهم به ساختار استاندارد SMART و زمان‌دار',
      'فازبندی منطقی اهداف با نقاط عطف قابل‌سنجش (Milestones)',
      'تولید چک‌لیست هفتگی تیک‌زدنی متناسب با ساعت آزاد شما',
      'تعیین «اولین اقدام ۱۰ دقیقه‌ای» برای غلبه بر اهمال‌کاری',
      'امکان به‌روزرسانی و کالیبره‌کردن برنامه در طول زمان'
    ],
    howItWorks: [
      'هدفت را همراه شرایط، زمان آزاد در هفته و نقطه فعلی‌ات بنویس',
      'دستیار برنامه را به فازهای اجرایی با زمان‌بندی دقیق تقسیم می‌کند',
      'چک‌لیست این هفته را تیک بزن و اولین اقدام ۱۰ دقیقه‌ای را انجام بده'
    ],
    sample: [
      { role: 'user', text: 'می‌خوام تا ۶ ماه دیگه یه بیزینس آنلاین راه بندازم.' },
      { role: 'assistant', text: 'عالیه! مرحله ۱: انتخاب بازار و پیشنهاد ارزش (هفته ۱–۳). چک‌لیست این هفته:\n- [ ] ۳ ایده‌ی بازار بنویس\n- [ ] با ۵ مشتری بالقوه حرف بزن' }
    ],
    placeholder: 'هدفت رو با جزئیات بنویس (زمان، شرایط، نقطه‌ی فعلی)…',
    plans: [
      { id: 'basic', name: 'پایه (یک هدف)', price: '۴۹۰٬۰۰۰ تومان', durationDays: 30, messageQuota: 150, maxDevices: 1, tagline: 'برای ساخت و شروع یک هدف مشخص', perks: ['۳۰ روز دسترسی', '۱۵۰ پیام راهبری', 'نقشه راه و چک‌لیست کامل', 'روی ۱ دستگاه'] },
      { id: 'pro', name: 'حرفه‌ای (پیگیری مداوم)', price: '۹۹۰٬۰۰۰ تومان', durationDays: 90, messageQuota: 500, maxDevices: 2, tagline: 'همراهی گام‌به‌گام تا رسیدن به نتیجه', perks: ['۹۰ روز دسترسی', '۵۰۰ پیام گفتگو', 'به‌روزرسانی و عیب‌یابی مسیر', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'], popular: true, badge: 'محبوب‌ترین' },
      { id: 'vip', name: 'نامحدود VIP', price: '۱٬۹۹۰٬۰۰۰ تومان', durationDays: 180, messageQuota: 0, maxDevices: 3, tagline: 'برای چند هدف موازی و برنامه‌ریزی جامع', perks: ['۱۸۰ روز دسترسی', 'پیام نامحدود بدون سقف', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'], badge: 'بیشترین صرفه' }
    ],
    behavior: {
      persona: 'تو یک «مسیرسازِ توسعه‌ی فردی» هستی: کوچِ هدف‌گذاری که هر هدف را به نقشه‌ی راهِ اجراییِ روشن، فازبندی‌شده و چک‌لیست هفتگی تبدیل می‌کنی.',
      welcome: 'سلام! من کمکت می‌کنم هر هدفی داری رو به یه مسیرِ روشن با قدم‌های مشخص و چک‌لیست تبدیل کنی. هدفت رو بگو — هرچی دقیق‌تر (به‌همراه زمان و شرایطت) بهتر.',
      suggestions: ['می‌خوام تا ۶ ماه دیگه یه بیزینس آنلاین راه بندازم', 'می‌خوام مهارت دیجیتال مارکتینگ رو یاد بگیرم', 'می‌خوام عادت مطالعه روزانه بسازم', 'می‌خوام درآمد دلاری داشته باشم'],
      temperature: 0.7,
      useDigest: false,
      model: 'gemini-2.5-flash'
    }
  },
  {
    id: 'problem-solver',
    title: 'راه‌حل‌یاب استراتژیک و رفع بن‌بست',
    tagline: 'پایان فلج تصمیم‌گیری: مشکلت را بگو، ۳ سوال تحلیلی می‌پرسم و ۳ راه‌حل با مزایا و معایب می‌دهم',
    description: 'وقتی در دوراهی‌های دشوار کاری، مارکتینگی یا مدیریتی گیر افتاده‌ای، مشکلت را می‌گویی؛ ابتدا با پرسیدن چند سوال تیزبینانه صورت‌مسئله را شفاف و ریشه‌یابی می‌کند، سپس چند راه‌حل ساختارمند با تحلیل سود، ریسک و هزینه پیش پایت می‌گذارد و یک پیشنهاد نهایی قاطع ارائه می‌دهد.',
    targetAudience: 'بنیان‌گذاران، مدیران محصول، مارکترها و افرادی که در تصمیم‌گیری‌های پرهزینه بین چند گزینه معلق مانده‌اند و نیاز به یک ذهن تحلیلی بی‌طرف دارند.',
    problemSolved: 'فلج تحلیل (Analysis Paralysis)، تصمیم‌گیری‌های احساسی و عجولانه، اتلاف هفته‌ها زمان و هزینه گزاف ناشی از آزمون و خطای کور.',
    whyBuy: 'یک تصمیم غلط در بیزینس (مثل ورود به کانال اشتباه، قیمت‌گذاری نادرست یا استخدام اشتباه) می‌تواند ده‌ها میلیون تومان هزینه داشته باشد. راه‌حل‌یاب با متدولوژی‌های استراتژیک روز، گزینه‌ها را غربال و ریسک تصمیم‌گیری شما را به حداقل می‌رساند.',
    iconName: 'target',
    glow: 'purple',
    badge: 'حل مسئله‌ی ساختارمند',
    price: 'شروع از ۴۹۰٬۰۰۰ تومان',
    actionText: 'حل مسئله و تست رایگان',
    status: 'published',
    features: [
      'کشف علت ریشه‌ای مسئله با چارچوب تفکر از اصول اولیه (First Principles)',
      'جدول ارزیابی گزینه‌ها با تحلیل مزایا، معایب، هزینه و سطح ریسک',
      'ارائه یک «پیشنهاد نهایی قطعی» همراه با استدلال شفاف',
      'طراحی اولین تست سریع و ارزان برای ارزیابی راهکار منتخب'
    ],
    howItWorks: [
      'مشکل یا دوراهی تصمیم‌گیری‌ات را توضیح بده',
      'به ۲ تا ۴ سوال کوتاه و هدایت‌کننده پاسخ بده',
      'راه‌حل‌های مدون، ماتریس مزایا/معایب و پیشنهاد قطعی را دریافت کن'
    ],
    sample: [
      { role: 'user', text: 'نمی‌دونم روی کدوم شبکه‌ی اجتماعی تمرکز کنم.' },
      { role: 'assistant', text: 'چند سوال:\n۱. مخاطبت بیشتر کجاست؟\n۲. محتوای تصویری راحت‌تری یا نوشتاری؟\n۳. هدفت فروش مستقیمه یا برندسازی؟' }
    ],
    placeholder: 'مشکلت رو توضیح بده…',
    plans: [
      { id: 'basic', name: 'پایه (حل مسائل موردی)', price: '۴۹۰٬۰۰۰ تومان', durationDays: 30, messageQuota: 150, maxDevices: 1, tagline: 'برای گره‌گشایی از چند مسئله معین', perks: ['۳۰ روز دسترسی', '۱۵۰ پیام گفتگو', 'راه‌حل‌های ساختارمند تحلیلی', 'روی ۱ دستگاه'] },
      { id: 'pro', name: 'حرفه‌ای (مشاور تصمیم‌گیری)', price: '۹۹۰٬۰۰۰ تومان', durationDays: 90, messageQuota: 500, maxDevices: 2, tagline: 'همراه دائمی مدیران در تصمیم‌های کاری', perks: ['۹۰ روز دسترسی', '۵۰۰ پیام گفتگو', 'تحلیل عمیق ریسک و سناریوها', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'], popular: true, badge: 'محبوب‌ترین' },
      { id: 'vip', name: 'نامحدود VIP', price: '۱٬۹۹۰٬۰۰۰ تومان', durationDays: 180, messageQuota: 0, maxDevices: 3, tagline: 'برای استفاده تیمی و استراتژیک', perks: ['۱۸۰ روز دسترسی', 'پیام نامحدود', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'], badge: 'بیشترین صرفه' }
    ],
    behavior: {
      persona: 'تو یک «راه‌حل‌یابِ» ساختارمند هستی؛ مثل یک مشاورِ حلِ‌مسئله که ابتدا خوب گوش می‌دهد، سوال‌های ریشه‌ای می‌پرسد و بعد گزینه‌ها را با مزایا، معایب و پیشنهاد نهایی تحلیل می‌کند.',
      welcome: 'سلام! هر مشکلی داری — کاری، مارکتینگی، تصمیمِ سخت — همینجا بگو. من اول چند تا سوالِ کوتاه می‌پرسم تا دقیق بفهمم، بعد چند راه‌حلِ واقعی جلوت می‌ذارم. مشکلت چیه؟',
      suggestions: ['روی کدوم شبکه‌ی اجتماعی تمرکز کنم؟', 'تیمم بهره‌وری پایینی داره', 'قیمت‌گذاری محصولم رو چطوری انجام بدم؟', 'بین دو پیشنهاد شغلی موندم'],
      temperature: 0.6,
      useDigest: false,
      model: 'gemini-2.5-flash'
    }
  },
  {
    id: 'mock-customer',
    title: 'شبیه‌ساز مشتری فرضی و کوچ فروش',
    tagline: 'قبل از سوختن لیدهای واقعی اینجا تمرین کن: مشتریِ سرسخت را قانع کن و ایرادات ارائه‌ات را بگیر',
    description: 'یک مشتری فرضی و بسیار واقع‌گرایانه با روانشناسی خریدار ایرانی که محصول یا خدمتت را برایش توصیف می‌کنی و او مثل یک مشتری واقعی شک می‌کند، به قیمت ایراد می‌گیرد، با رقبا مقایسه می‌کند و چالش می‌سازد. با نوشتن کلمه «بازخورد»، از نقش مشتری بیرون می‌آید و به یک مربی ارشد فروش تبدیل می‌شود که نقاط قوت و ضعف ارائه‌ات را کالبدشکافی می‌کند.',
    targetAudience: 'فروشندگان تلفنی، ادمین‌های دایرکت مارکتینگ، کارآفرینان و ارائه‌دهندگان خدمات که می‌خواهند قبل از ارتباط با مشتری واقعی، فن بیان و سناریوی فروش خود را پخته کنند.',
    problemSolved: 'سوختن لیدهای گران‌قیمت تبلیغاتی، ناتوانی در غلبه بر اعتراضات مشتری («گرونه»، «از کجا معلوم جواب بده»)، و افت نرخ بستن قرارداد (Closing Rate).',
    whyBuy: 'در بازار امروز ایران، جذب هر لید بین ۱۰۰ تا ۵۰۰ هزار تومان هزینه برمی‌دارد. از دست دادن حتی یک مشتری به خاطر لکنت یا ضعف در پاسخ به اعتراضات، ضرر مستقیم است. با شبیه‌ساز مشتری، ده‌ها سناریوی پرچالش را با هزینه‌ای ناچیز تمرین می‌کنی و نرخ فروش قطعی خود را تا ۲ برابر بالا می‌بری.',
    iconName: 'chart',
    glow: 'emerald',
    badge: 'شبیه‌ساز فروش و تبدیل',
    price: 'شروع از ۴۹۰٬۰۰۰ تومان',
    actionText: 'تمرین فروش و تست رایگان',
    status: 'published',
    features: [
      'شبیه‌سازی تیپ‌های شخصیتی مختلف خریدار (محتاط، چانه‌زن، شکاک)',
      'حالت دوگانه: بازی نقش مشتری واقعی + حالت مربیگری فروش (کوچ)',
      'کالبدشکافی نقاط ضعف پیشنهاد ارزش (Value Proposition)',
      'ارائه جملات جایگزین متقاعدکننده برای بستن قطعی فروش'
    ],
    howItWorks: [
      'محصول، خدمت یا پیشنهادت را پرزنت کن (مثل شروع تماس یا دایرکت)',
      'مشتری با تردید، اعتراض و سوال پاسخ می‌دهد؛ تلاش کن او را قانع کنی',
      'هر زمان بنویس «بازخورد» تا نقد تخصصی مربی فروش را تحویل بگیری'
    ],
    sample: [
      { role: 'user', text: 'دوره‌ی آموزش دیجیتال مارکتینگ آنلاین می‌فروشم.' },
      { role: 'assistant', text: 'جالبه، ولی من قبلاً چند تا دوره‌ی رایگان دیدم. دوره‌ی تو چه فرقی داره که ارزشِ پول دادن داشته باشه؟' }
    ],
    placeholder: 'محصول یا خدمتت رو توصیف کن…',
    plans: [
      { id: 'basic', name: 'پایه (تمرین اولیه)', price: '۴۹۰٬۰۰۰ تومان', durationDays: 30, messageQuota: 200, maxDevices: 1, tagline: 'برای تمرین اولین ارائه‌ها و پیچ فروش', perks: ['۳۰ روز دسترسی', '۲۰۰ پیام تمرینی', 'شبیه‌سازی مشتری واقعی', 'روی ۱ دستگاه'] },
      { id: 'pro', name: 'حرفه‌ای (تسلط بر فروش)', price: '۱٬۰۹۰٬۰۰۰ تومان', durationDays: 90, messageQuota: 700, maxDevices: 2, tagline: 'پخته‌کردن سناریوهای فروش و اعتراضات', perks: ['۹۰ روز دسترسی', '۷۰۰ پیام تمرینی', 'کوچینگ فروش بعد از هر دور تمرین', 'اولویت پاسخ‌دهی', 'روی ۲ دستگاه'], popular: true, badge: 'محبوب‌ترین' },
      { id: 'vip', name: 'نامحدود VIP', price: '۱٬۹۹۰٬۰۰۰ تومان', durationDays: 180, messageQuota: 0, maxDevices: 3, tagline: 'برای تیم‌های فروش و استفاده روزانه', perks: ['۱۸۰ روز دسترسی', 'تمرین نامحدود', 'بالاترین صرفه اقتصادی', 'پشتیبانی ویژه', 'روی ۳ دستگاه'], badge: 'بیشترین صرفه' }
    ],
    behavior: {
      persona: 'تو نقشِ یک «مشتریِ بالقوه‌ی واقع‌گرایانه» را بازی می‌کنی. قواعد ایفای نقش: کنجکاو، نسبتاً محتاط، چالش‌گر در قیمت و ارزش افزوده. وقتی کاربر نوشت «بازخورد»، از نقش بیرون بیا و به عنوان مربی فروش تحلیل کن.',
      welcome: 'سلام 👋 من قراره نقشِ یه مشتریِ بالقوه‌ی محصولت رو بازی کنم. اول محصول یا خدمتت رو برام توصیف کن — چی می‌فروشی، به کی، و پیشنهادت چیه؟ بعد من مثل یه مشتریِ واقعی باهات حرف می‌زنم.',
      suggestions: ['دوره‌ی آموزش دیجیتال مارکتینگ آنلاین می‌فروشم', 'خدمات طراحی سایت برای کسب‌وکارهای کوچک ارائه می‌دم', 'یه اپلیکیشن مدیریت مالی شخصی دارم', 'محصول پوستی ارگانیک می‌فروشم'],
      temperature: 0.7,
      useDigest: false,
      model: 'gemini-2.5-flash'
    }
  }
];

export const PROJECTS_PAGE_DATA = {
  badge: 'وضعیت همکاری',
  headline: 'شفافیت درباره‌ی وضعیت همکاری‌ها و پروژه‌ها',
  subheadline: 'این صفحه نشون می‌ده الان چه پروژه‌هایی در جریانه و آیا ظرفیت برای پذیرش پروژه‌ی جدید هست یا نه.',
  capacityStatus: 'active' as 'active' | 'limited' | 'full',
  capacityText: 'در حال حاضر ظرفیت پذیرش پروژه‌ی جدید فعاله.',
  sectionTitle: 'وضعیت پروژه‌های جاری و سابق',
  portfolioHeadline: 'برای دیدن نمونه‌کارهای قبلی و نتایج واقعی',
  portfolioBody: 'پروژه‌های تکمیل‌شده‌ همراه با چالش، راهکار و نتیجه‌ی عددیشون توی بخش نمونه‌کارها موجوده.',
  portfolioCta: 'مشاهده کامل نمونه‌کارها'
};

export const ONGOING_PROJECTS: OngoingProjectItem[] = [
  {
    id: 'current-1',
    title: 'تبلیغات و افزایش نرخ خرید سایت',
    status: 'در حال اجرا',
    description: 'بهینه‌سازی کمپین‌های تبلیغاتی و تست‌های مقایسه‌ای برای افزایش نرخ خرید مشتری.',
    isPlaceholder: false
  },
  {
    id: 'past-1',
    title: 'راه‌اندازی سیستم تحلیل و ردیابی مشتری',
    status: 'تکمیل‌شده',
    description: 'پیاده‌سازی کامل ابزارهای تحلیلی و افزایش دقت در شناخت اینکه مشتری‌ها از کدوم کانال میان.',
    isPlaceholder: false
  }
];

export const BUSINESS_ANALYSIS_DATA = {
  headline: 'قبل از اینکه پیشنهاد بدم، اول وضعیتت رو می‌فهمم',
  subheadline: 'هیچ استراتژی بازاریابی خوبی روی حدس بنا نمی‌شه. قبل از هر پیشنهاد همکاری، یه تحلیل واقعی از وضعیت فعلی کسب‌وکارتون انجام می‌دم.',
  steps: [
    { step: '۰۱', title: 'بررسی حساب‌های تبلیغاتی فعلی', desc: 'ساختار کمپین، بودجه و عملکرد فعلی رو بررسی می‌کنم.' },
    { step: '۰۲', title: 'تحلیل رقبا', desc: 'می‌بینم رقبای‌تون در بازار چطور عمل می‌کنن و کجای مسیر جا مونده‌اید یا جلوترید.' },
    { step: '۰۳', title: 'شناسایی نقاط ضعف فانل', desc: 'از اولین برخورد کاربر تا خرید نهایی رو نقشه‌برداری می‌کنم تا نقاط افت رو پیدا کنم.' },
    { step: '۰۴', title: 'ارائه گزارش اولیه', desc: 'بسته به اندازه پروژه، این تحلیل می‌تونه رایگان یا کم‌هزینه باشه، و خروجی‌ش هم یه گزارش مکتوب و هم یه جلسه توضیح کلامیه.' }
  ],
  checklist: [
    'آیا نرخ تبدیل لندینگ‌پیج‌تون رو اندازه‌گیری می‌کنید؟',
    'آخرین بار کی استراتژی تبلیغاتی‌تون رو بازبینی کردید؟',
    'آیا مسیر کامل مشتری از کلیک تا خرید رو Track می‌کنید؟',
    'هزینه جذب مشتری (CPA) فعلی‌تون رو دقیق می‌دونید؟',
    'آیا بین کانال‌های تبلیغاتی‌تون (گوگل، اینستاگرام، تیک‌تاک) هماهنگی وجود داره؟',
    'چند وقت یک‌بار گزارش عملکرد کمپین‌ها رو بررسی می‌کنید؟',
    'آیا تست A/B روی صفحات کلیدی‌تون انجام دادید؟',
    'بودجه تبلیغاتی‌تون بر چه اساسی تقسیم می‌شه؟'
  ],
  ctaText: 'می‌خواید بدونید دقیقاً کجای مسیر رشد هستید؟ درخواست تحلیل بدید →'
};

export const SKILLS_TOOLS: SkillTool[] = [
  { name: 'Google Ads', category: 'Ads', icon: 'google', proficiency: 98 },
  { name: 'Meta Ads', category: 'Ads', icon: 'meta', proficiency: 92 },
  { name: 'TikTok Ads', category: 'Ads', icon: 'tiktok', proficiency: 88 },
  { name: 'Google Analytics 4 (GA4)', category: 'Analytics', icon: 'ga4', proficiency: 96 },
  { name: 'Google Tag Manager (GTM)', category: 'Analytics', icon: 'gtm', proficiency: 95 },
  { name: 'Hotjar & Clarity', category: 'CRO', icon: 'hotjar', proficiency: 94 },
  { name: 'A/B Testing & VWO', category: 'CRO', icon: 'cro', proficiency: 92 },
  { name: 'WordPress & Elementor', category: 'Tech', icon: 'wordpress', proficiency: 90 },
  { name: 'HTML & CSS', category: 'Tech', icon: 'code', proficiency: 85 },
  { name: 'AI & Prompt Engineering', category: 'Tech', icon: 'ai', proficiency: 90 }
];

export const ALL_SKILLS_LIST = {
  hard: [
    { title: 'Growth & Performance Marketing', tags: ['Performance Strategy', 'Customer Acquisition', 'Growth Marketing', 'Campaign Optimization', 'Lead Generation', 'Audience Segmentation', 'Budget Optimization', 'Funnel Optimization'] },
    { title: 'Marketing Analytics & CRO', tags: ['KPI Design', 'Marketing Analytics', 'Dashboard Design', 'A/B Testing', 'Conversion Rate Optimization (CRO)', 'Landing Page Optimization', 'Funnel Analysis', 'UX Optimization'] },
    { title: 'Tracking & Measurement', tags: ['Google Tag Manager (GTM)', 'Event Tracking', 'Google Analytics 4 (GA4)', 'UTM Strategy', 'Conversion Tracking', 'Attribution Modeling'] },
    { title: 'Paid Media', tags: ['TikTok Ads', 'Meta Ads', 'Google Ads', 'Retargeting Strategy', 'Display Advertising'] },
    { title: 'SEO', tags: ['On-page SEO', 'Technical SEO', 'Keyword Research & Strategy', 'Search Intent Analysis', 'Content Optimization', 'Internal Linking Strategy'] },
    { title: 'Web Development & Landing Pages', tags: ['WordPress Website Development', 'Elementor', 'Landing Page Development', 'Basic HTML & CSS'] },
    { title: 'AI & Productivity', tags: ['AI-assisted Research', 'Prompt Engineering', 'Workflow Optimization'] }
  ],
  soft: [
    { title: 'تفکر راهبردی و تحلیلی', tags: ['تفکر راهبردی', 'تفکر تحلیلی', 'تفکر نقادانه', 'تصمیم‌گیری مبتنی بر داده', 'حل مسئله'] },
    { title: 'همکاری و ارتباطات', tags: ['ارتباط مؤثر', 'همکاری بین‌تیمی', 'مدیریت ذینفعان', 'انتقال و به‌اشتراک‌گذاری دانش'] },
    { title: 'اجرا و بهره‌وری', tags: ['هماهنگی و پیگیری پروژه‌ها', 'مدیریت زمان', 'اولویت‌بندی وظایف', 'دقت و توجه به جزئیات', 'نتیجه‌گرایی'] },
    { title: 'سازگاری و رشد حرفه‌ای', tags: ['سازگاری با تغییر', 'یادگیری مستمر', 'ذهنیت رشد', 'مسئولیت‌پذیری و مالکیت کارها (Ownership)'] }
  ]
};

export const TIMELINE: TimelineMilestone[] = [
  {
    year: 'اکنون',
    title: 'کارشناس پرفورمنس مارکتینگ',
    company: 'دایان | مشهد',
    description: 'تیم نیاز داشت بفهمه کدوم منبع تبلیغاتی واقعاً مشتری باکیفیت میاره، نه فقط کلیک. یه سیستم امتیازدهی طراحی کردم که کیفیت هر منبع رو می‌سنجه. نتیجه: هزینه‌ی جذب هر مشتری کاهش پیدا کرد و تصمیم‌گیری‌ها شفاف‌تر شد.',
    achievement: 'کاهش CPA، افزایش کیفیت لید، پیاده‌سازی سیستم Publisher Scoring'
  },
  {
    year: 'شهریور – دی ۱۴۰۴',
    title: 'کارشناس پرفورمنس مارکتینگ',
    company: 'ایران بروکر | مشهد',
    description: 'داده‌های ورودی از کانال‌های مختلف مشخص نبود کدوم واقعاً اثر داره. یه ساختار ردیابی دقیق طراحی و پیاده‌سازی کردم. نتیجه: شفافیت کامل در ارزیابی کانال‌های ورودی به‌دست اومد.',
    achievement: 'معماری جامع Tracking، افزایش دقت Attribution، بهبود کیفیت داده‌ها'
  },
  {
    year: 'خرداد – شهریور ۱۴۰۴',
    title: 'کارشناس بهینه‌سازی نرخ تبدیل (CRO)',
    company: 'اقامت ۲۴ | مشهد',
    description: 'کاربرها وسط مسیر رزرو ریزش می‌کردن و علتش مشخص نبود. رفتار کاربران رو تحلیل کردم و تست‌های مقایسه‌ای اجرا کردم. نتیجه: نرخ تبدیل مسیر رزرو افزایش پیدا کرد.',
    achievement: 'افزایش نرخ تبدیل مسیر رزرو، اجرای تست‌های A/B، تحلیل نقاط افت Funnel'
  },
  {
    year: 'مرداد ۱۴۰۲ – بهمن ۱۴۰۳',
    title: 'مدیر کمپین (Campaign Manager)',
    company: 'ای ادز | تهران',
    description: '۵ برند مختلف کمپین تبلیغاتی داشتن ولی نرخ کلیک پایین بود. کمپین‌های هر ۵ برند رو مدیریت و بهینه کردم. نتیجه: نرخ کلیک تقریباً ۳ برابر شد (از ۱.۲٪ به ۳.۵٪).',
    achievement: 'افزایش CTR به ۳.۵٪، رشد ۲۵٪ نرخ تبدیل لندینگ‌پیج‌ها، مدیریت ۵ برند'
  },
  {
    year: 'دی ۱۴۰۲ – تیر ۱۴۰۳',
    title: 'مدیر کمپین (Campaign Manager)',
    company: 'فست کلیک | تهران',
    description: 'حجم زیادی از کلیک‌های تبلیغاتی واقعی نبودن و بودجه هدر می‌رفت. یه مدل برای شناسایی و حذف ترافیک بی‌کیفیت ساختم. نتیجه: هزینه‌ی جذب مشتری و کلیک‌های بی‌ارزش به‌طور محسوس کم شد.',
    achievement: 'کاهش ۳۰٪ CPA، کاهش ۲۲٪ کلیک‌های نامعتبر، اجرای +۵۰ کمپین ویدئویی'
  },
  {
    year: 'خرداد ۱۴۰۱ – خرداد ۱۴۰۲',
    title: 'کارشناس سئو',
    company: 'آهن آنلاین | تهران',
    description: 'یه کلمه‌ی کلیدی مهم و پررقابت (قیمت میلگرد) رتبه‌ی خوبی توی گوگل نداشت. استراتژی لینک‌سازی و بهینه‌سازی محتوایی اجرا کردم. نتیجه: اون کلمه به رتبه‌ی اول گوگل رسید.',
    achievement: 'رتبه ۱ گوگل در «قیمت میلگرد»، رشد ۳۰٪ ترافیک، بهینه‌سازی Technical SEO'
  },
  {
    year: 'فروردین ۱۴۰۰ – فروردین ۱۴۰۱',
    title: 'کارشناس سئو',
    company: 'بیتستان | تهران',
    description: 'چندین کلمه‌ی کلیدی مهم در حوزه‌ی رمزارز جایگاه خوبی نداشتن. استراتژی محتوایی و ساختاری برای این کلمات طراحی کردم. نتیجه: ۱۵ کلمه به صفحه‌ی اول گوگل رسیدن و ترافیک ارگانیک نصف افزایش پیدا کرد.',
    achievement: '۱۵ کلمه در صفحه اول گوگل، رشد ۵۰٪ ترافیک ارگانیک، استراتژی محتوایی'
  }
];

export const OTHER_COLLABORATIONS = [
  { company: 'ورسلند', role: 'کارشناس ارشد دیجیتال مارکتینگ' },
  { company: 'سازیتو', role: 'کارشناس سئو' },
  { company: 'گیشه ۷', role: 'کارشناس سئو' },
  { company: 'آرتیالس', role: 'کارشناس شبکه‌های اجتماعی' },
  { company: 'رسپینا ۲۴', role: 'کارشناس تولید محتوا' }
];

export const SELECT_PROJECTS = [
  { title: 'مدیر وب‌سایت امیر اپتیک', desc: 'پیاده‌سازی Data Tracking و بهینه‌سازی SEO/UX برای رشد نرخ تبدیل', date: 'شهریور ۱۴۰۴' },
  { title: 'کارشناس گوگل ادز — Hihotel', desc: 'بازطراحی ساختار کمپین‌ها برای بهبود کیفیت ترافیک و بازده تبلیغات', date: 'فروردین ۱۴۰۴' },
  { title: 'اینفلوئنسر مارکتینگ — دژینو', desc: 'بهینه‌سازی فرآیند همکاری با اینفلوئنسرها؛ ROI تقریباً دوبرابر', date: 'اردیبهشت ۱۴۰۳' },
  { title: 'کارشناس سئو — امیدارویزا', desc: 'بهینه‌سازی +۱۵۰ صفحه و بهبود CTR نتایج جستجو برای رشد ارگانیک', date: 'آبان ۱۴۰۲' },
  { title: 'سرپرست سئو — پارتوکا', desc: 'استراتژی SEO شش سایت و +۸۰ محتوا؛ زیرساخت رشد ارگانیک مقیاس‌پذیر', date: 'مرداد ۱۴۰۰' },
  { title: 'طراحی سایت فضانورد', desc: 'راه‌اندازی fazanavard.app؛ زیرساخت اولیه محصول برای توسعه آتی', date: 'آبان ۱۴۰۳' }
];

export const EDUCATION_AND_COURSES = {
  education: [
    { title: 'دیپلم IT — امنیت اطلاعات', institute: 'خوارزمی غیرانتفاعی', year: '۱۳۹۷', grade: 'معدل ۱۸' }
  ],
  courses: [
    { title: 'سئو حرفه‌ای', provider: 'آکادمی وبسیما', date: 'شهریور ۱۳۹۹' },
    { title: 'پرفورمنس مارکتینگ', provider: 'آنالیتیپس', date: 'شهریور ۱۴۰۳' },
    { title: 'دوره میداس (CRO)', provider: 'آنالیتیپس', date: 'اردیبهشت ۱۴۰۴' }
  ]
};

export const WHY_OMID_POINTS = [
  {
    title: 'همه‌ی مسیر رو با هم می‌بینم',
    description: 'به‌جای اینکه هر بخش کسب‌وکارتون (سایت، محتوا، تبلیغات، تحلیل) جدا جدا پیش بره، کمک می‌کنم همه در یک مسیر مشخص برای فروش و رشد کار کنن.',
    icon: 'layers'
  },
  {
    title: 'تصمیم‌هام رو با داده می‌گیرم، نه حدس',
    description: 'هر پیشنهادی که می‌دم، بر اساس تحلیل واقعی رفتار مشتری‌های شماست، نه یه فرمول یکسان برای همه.',
    icon: 'chart'
  },
  {
    title: 'نتیجه رو با عدد نشونتون می‌دم',
    description: 'همون‌طور که تا اینجا دیدید، ادعا نمی‌کنم — نتیجه رو با عدد ثابت می‌کنم.',
    icon: 'target'
  }
];

export const HOMEPAGE_HOW_I_WORK_STEPS = [
  {
    step: '۱',
    title: 'گفتگوی اولیه (رایگان)',
    desc: 'با هم صحبت می‌کنیم، وضعیت فعلی کسب‌وکارتون رو می‌فهمم و می‌گم دقیقاً کجای مسیر شروع/فروش/رشد هستید.',
    icon: 'message-circle'
  },
  {
    step: '۲',
    title: 'تشخیص و پیشنهاد مسیر',
    desc: 'بر اساس شرایط واقعی کسب‌وکارتون، یه پیشنهاد مشخص و قابل‌اجرا بهتون می‌دم — نه یه پکیج آماده‌ی یکسان برای همه.',
    icon: 'clipboard-check'
  },
  {
    step: '۳',
    title: 'اجرا',
    desc: 'شروع می‌کنیم به کار، با گزارش‌دهی منظم تا همیشه بدونید دقیقاً چه اتفاقی داره می‌افته.',
    icon: 'rocket'
  },
  {
    step: '۴',
    title: 'نتیجه و بهینه‌سازی مستمر',
    desc: 'نتیجه رو با عدد و داده نشونتون می‌دم، و بر اساسش مسیر رو برای رشد بعدی تنظیم می‌کنیم.',
    icon: 'trending-up'
  }
];

export const HOW_I_WORK_STEPS = [
  {
    step: '۰۱',
    title: 'بررسی وضعیت فعلی',
    desc: 'سایت، تبلیغات و مسیر خریدتون رو بررسی می‌کنم تا ببینم دقیقاً کجای کار داره بودجه یا مشتری از دست می‌ره.',
    icon: 'chart'
  },
  {
    step: '۰۲',
    title: 'برنامه‌ریزی و تعیین اهداف',
    desc: 'بر اساس بررسی‌ها، مشخص می‌کنیم دقیقاً روی چی باید کار کنیم و هدف‌های قابل‌اندازه‌گیری تعیین می‌کنیم.',
    icon: 'clipboard-check'
  },
  {
    step: '۰۳',
    title: 'اجرا و تست',
    desc: 'تغییرات رو پیاده می‌کنیم و با تست واقعی می‌سنجیم کدوم روش بهتر جواب می‌ده.',
    icon: 'rocket'
  },
  {
    step: '۰۴',
    title: 'بهینه‌سازی مستمر و رشد',
    desc: 'چیزی که جواب داده رو گسترش می‌دیم، و با گزارش‌های شفاف همیشه در جریان نتیجه‌ها هستید.',
    icon: 'trending-up'
  }
];
