import React, { useState, useRef } from 'react';
import { Theme, Page, CaseStudy } from '../types';
import { useContent } from '../context/ContentContext';
import { usePreservedState } from '../utils/statePreserver';
import { EditableText } from '../components/cms/EditableText';
import { RepeaterControls } from '../components/cms/RepeaterControls';
import { SectionEditHeader } from '../components/cms/SectionEditHeader';
import { SectionWrapper } from '../components/cms/SectionWrapper';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { TiltCard } from '../components/3D/TiltCard';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpLeft,
  Sparkles,
  Target,
  Rocket,
  TrendingUp,
  Layers,
  MessageCircle,
  ClipboardCheck,
  LineChart,
  Briefcase,
  CheckCircle2,
  Quote,
  Award,
  Code,
  Megaphone,
  Laptop,
  Star,
  Send,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { MaskLines, Magnetic } from '../components/motion/Cinematic';
import { linkProps, postPath } from '../utils/router';
import { normalizeCaseStudies } from '../utils/caseStudies';
import { safeRecordArray } from '../utils/contentDefaults';
import { groupOfPost, normalizeCategory } from '../data/blogTaxonomy';
import { ProductPromo, isProductPromotable } from '../components/ProductPromo';
import { productsForPage } from '../data/productPromo';
import { imageFallback } from '../utils/imageFallback';
import { ProfilePhoto } from '../components/ProfilePhoto';
import { servicesInTab } from '../utils/servicePath';
import { responsiveImageProps } from '../utils/responsiveImage';

interface HomePageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  onSelectCaseStudy: (caseStudy: CaseStudy) => void;
  onSelectPost?: (postId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Icon helpers                                                       */
/* ------------------------------------------------------------------ */
const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  code: Code,
  sparkles: Sparkles,
  megaphone: Megaphone,
  rocket: Rocket,
  target: Target,
  chart: LineChart,
  laptop: Laptop,
  'trending-up': TrendingUp,
  award: Award,
  layers: Layers,
  'message-circle': MessageCircle,
  'clipboard-check': ClipboardCheck,
  briefcase: Briefcase,
};

const iconFor = (name: string) => ICON_MAP[name] || Sparkles;

/**
 * موضوعاتِ اصلیِ بخش «نوشت‌های تازه» در صفحه اصلی.
 *
 * هر کادر، سه مقاله‌ی آخرِ همان خوشه‌ی موضوعی را نشان می‌دهد. خوشه‌ها همان
 * `group`های تعریف‌شده در src/data/blogTaxonomy.ts هستند، بنابراین دسته‌بندی
 * با فیلترهای صفحه‌ی وبلاگ یکی است و با اضافه‌شدن مقاله‌ی جدید، خودبه‌خود
 * به‌روزرسانی می‌شود.
 */
const INSIGHT_GROUPS: { id: string; title: string; groups: string[] }[] = [
  { id: 'performance', title: 'پرفورمنس مارکتینگ و تبلیغات', groups: ['مارکتینگ و تبلیغات'] },
  { id: 'cro', title: 'بهینه‌سازی نرخ تبدیل (CRO)', groups: ['رشد و تبدیل'] },
  { id: 'ai', title: 'هوش مصنوعی در مارکتینگ', groups: ['هوش مصنوعی'] },
  {
    id: 'digital',
    title: 'دیجیتال مارکتینگ و رشد',
    groups: ['جست‌وجو و محتوا', 'داده و تحلیل', 'کسب‌وکار', 'طراحی و راه‌اندازی'],
  },
];

/* Soft pastel tints cycled across cards — calm, professional palette */
const TINTS = [
  { bg: 'var(--nd-accent-soft)', fg: '#4f46e5' },
  { bg: 'var(--nd-sky-soft)', fg: '#1d6fd8' },
  { bg: 'var(--nd-mint-soft)', fg: '#0f9d6e' },
  { bg: 'var(--nd-peach-soft)', fg: '#d97706' },
];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
const SectionHead: React.FC<{
  eyebrow: string;
  icon?: React.ReactNode;
  title: string;
  desc?: string;
}> = ({ eyebrow, icon, title, desc }) => (
  <div className="text-center mx-auto max-w-2xl space-y-4">
    <span className="nd-eyebrow">
      {icon}
      <span>{eyebrow}</span>
    </span>
    <h2 className="nd-h2 text-2xl sm:text-3xl lg:text-[2.6rem]">{title}</h2>
    {desc && <p className="nd-muted text-sm sm:text-base leading-relaxed">{desc}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/*  HomePage                                                           */
/* ------------------------------------------------------------------ */
export const HomePage: React.FC<HomePageProps> = ({ theme, onNavigate, onSelectCaseStudy, onSelectPost }) => {
  const { data } = useContent();
  const isDark = theme === 'dark';

  const [activeServiceTab, setActiveServiceTab] = usePreservedState<'start' | 'sell' | 'grow'>('homepage_active_service_tab', 'sell');
  // Two independent lead-capture inputs (hero prompt + insights lead magnet)
  // must NOT share state — typing in one leaks into the other.
  const [heroPrompt, setHeroPrompt] = usePreservedState<string>('homepage_hero_prompt', '');
  const [auditPrompt, setAuditPrompt] = usePreservedState<string>('homepage_audit_prompt', '');
  const [openFaq, setOpenFaq] = usePreservedState<number>('homepage_open_faq', -1);
  // Shared with the blog page (same StatePreserver keys) so «مطالب این دسته」
  // lands on the article list already filtered to that topic.
  const [, setBlogCategoryFilter] = usePreservedState<string>('blog_category_filter', 'all');
  const [, setBlogSearchQuery] = usePreservedState<string>('blog_search_query', '');

  // Cinematic pointer parallax for the hero stage
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 90, damping: 20 });
  const sy = useSpring(py, { stiffness: 90, damping: 20 });
  const orbX = useTransform(sx, (v) => v * 18);
  const orbY = useTransform(sy, (v) => v * 14);
  const orb2X = useTransform(sx, (v) => v * -12);
  const spotX = useTransform(sx, (v) => `${50 + v * 38}%`);
  const spotY = useTransform(sy, (v) => `${42 + v * 34}%`);

  const handleStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };
  const servicesSectionRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const personal = data.PERSONAL_INFO;
  const stats = safeRecordArray<NonNullable<typeof data.STATS[number]>>(data.STATS);
  const services = safeRecordArray<NonNullable<typeof data.SERVICES[number]>>(data.SERVICES);
  const caseStudies = normalizeCaseStudies(data.CASE_STUDIES);
  const testimonials = safeRecordArray<NonNullable<typeof data.TESTIMONIALS[number]>>(data.TESTIMONIALS);
  const howIWork = safeRecordArray<any>(data.HOMEPAGE_HOW_I_WORK_STEPS || data.HOW_I_WORK_STEPS);
  const timeline = safeRecordArray<any>(data.TIMELINE);
  const otherCollaborations = safeRecordArray<any>(data.OTHER_COLLABORATIONS);
  const whyOmidPoints = safeRecordArray<any>(data.WHY_OMID_POINTS);
  const skills = safeRecordArray<any>(data.SKILLS_TOOLS);
  const homeSections = safeRecordArray<any>(data.PAGE_SECTIONS?.['home']);

  const featuredStudies = (caseStudies.filter((c) => c.featured).length ? caseStudies.filter((c) => c.featured) : caseStudies).slice(0, 6);
  const homepageStudies = featuredStudies.slice(0, 4);
  const homepageTimeline = timeline.slice(0, 4);

  const handlePathNavClick = (tab: 'start' | 'sell' | 'grow') => {
    setActiveServiceTab(tab);
    servicesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollCarousel = (dir: 1 | -1) => {
    const el = carouselRef.current;
    if (!el) return;
    // RTL: next items live to the left → negative scrollLeft
    el.scrollBy({ left: dir * -1 * (el.clientWidth * 0.75), behavior: 'smooth' });
  };

  const handlePromptSubmit = (e?: React.FormEvent, value: string = '') => {
    e?.preventDefault();
    // Hand the visitor's typed need to the contact form instead of losing it.
    if (value.trim()) {
      window.dispatchEvent(new CustomEvent('nd:prefill-contact', { detail: value.trim() }));
    }
    onNavigate('contact');
  };

  /* 3-path navigation cards (copy preserved) */
  const pathCards = [
    {
      id: 'start' as const,
      tag: 'مسیر ۱',
      title: 'تازه می‌خوام شروع کنم',
      desc: 'هنوز سایت یا پیج فعالی ندارم، یا تازه راه افتادم و نمی‌دونم از کجا شروع کنم.',
      cta: 'ببین از کجا شروع کنیم',
      iconName: 'sparkles',
    },
    {
      id: 'sell' as const,
      tag: 'مسیر ۲',
      title: 'فروش دارم ولی می‌خوام بیشتر بفروشم',
      desc: 'سایت یا پیج دارم، بازدید هم میاد، ولی فروش اونی نیست که باید باشه.',
      cta: 'ببین مشکل کجاست',
      iconName: 'target',
      isFeatured: true,
    },
    {
      id: 'grow' as const,
      tag: 'مسیر ۳',
      title: 'فروش دارم و می‌خوام رشدش بدم',
      desc: 'همه‌چیز کار می‌کنه، ولی می‌خوام سیستم رشدم رو قوی‌تر و مقیاس‌پذیرتر کنم.',
      cta: 'ببین چطور رشد کنیم',
      iconName: 'rocket',
    },
  ];

  const tabConfig = {
    start: {
      label: 'شروع کنیم',
      tagline: 'هنوز آنلاین شروع نکرده‌اید؟ از صفر کنارتان هستم.',
      ctaText: 'ببینیم دقیقاً چی نیاز داری',
      icon: Sparkles,
    },
    sell: {
      label: 'بهتر بفروشیم',
      tagline: 'آنلاین هستید، اما فروش آن چیزی نیست که باید باشد؟ با هم پیدا می‌کنیم مشکل کجاست.',
      ctaText: 'ببینیم دقیقاً چی نیاز داری',
      icon: Target,
    },
    grow: {
      label: 'رشد کنیم',
      tagline: 'فروش دارید؟ حالا وقت مقیاس‌پذیر کردن و رشد پایدار است.',
      ctaText: 'ببینیم دقیقاً چی نیاز داری',
      icon: Rocket,
    },
  } as const;

  const promptSuggestions = [
    'نرخ تبدیل سایتم رو بیشتر کن',
    'بودجه تبلیغاتم هدر می‌ره',
    'می‌خوام رتبه ۱ گوگل بشم',
    'سایت ندارم؛ از صفر شروع کنم',
  ];

  /* ---------------------------------------------------------------- */
  const renderSectionByName = (secName: string) => {
    switch (secName) {
      /* ============ 1. HERO ============ */
      case 'HERO':
        return (
          <section id="hero-section" className="relative w-full">
            {/* ---------- Cinematic dark stage (full-bleed 100% screen width) ---------- */}
            <div
              onMouseMove={isDark ? handleStageMove : undefined}
              className={
                isDark
                  ? 'nd-stage nd-hairline-top relative w-full rounded-b-[var(--nd-radius-hero)] pt-28 sm:pt-32 pb-16 sm:pb-20 overflow-hidden'
                  : 'relative w-full pt-28 sm:pt-32 pb-10'
              }
            >
              {/* dark-theme cinematic decorations */}
              {isDark && (
                <>
              <span className="nd-watermark" aria-hidden>رشد</span>

              {/* pointer spotlight */}
              <motion.div
                aria-hidden
                style={{ left: spotX, top: spotY }}
                className="absolute w-[42rem] h-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              >
                <div className="w-full h-full rounded-full" style={{ background: 'radial-gradient(circle, rgba(148,163,255,0.14), transparent 62%)' }} />
              </motion.div>

              {/* aurora orbs — parallax layers */}
              <motion.div style={{ x: orbX, y: orbY }} className="absolute -top-40 -left-32 pointer-events-none">
                <div className="w-[36rem] h-[36rem] rounded-full blur-3xl opacity-40 nd-float-slow" style={{ background: 'radial-gradient(circle, rgba(99,91,255,0.5), transparent 65%)' }} />
              </motion.div>
              <motion.div style={{ x: orb2X }} className="absolute top-1/2 -right-24 pointer-events-none">
                <div className="w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30 nd-float" style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.4), transparent 65%)' }} />
              </motion.div>

              {/* floating particles */}
              <span className="nd-particle" style={{ top: '22%', right: '14%', animationDelay: '0s' }} aria-hidden />
              <span className="nd-particle" style={{ top: '38%', right: '82%', animationDelay: '-2.4s' }} aria-hidden />
              <span className="nd-particle" style={{ top: '64%', right: '24%', animationDelay: '-4.8s' }} aria-hidden />
              <span className="nd-particle" style={{ top: '74%', right: '68%', animationDelay: '-6.2s' }} aria-hidden />
                </>
              )}

              <div className="relative max-w-5xl mx-auto px-4 sm:px-8 text-center space-y-8 pt-4 sm:pt-6">
                {/* Trust pill */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={`${isDark ? 'nd-glass-dark' : 'nd-glass'} inline-flex items-center gap-3 rounded-full ps-2 pe-4 py-1.5`}
                >
                  <ProfilePhoto
                    avatar={personal.avatar}
                    name={personal.name}
                    variant="chip"
                    className={`w-8 h-8 rounded-full object-cover ring-2 ${isDark ? 'ring-white/30' : 'ring-white'}`}
                  />
                  <span className={`text-xs font-extrabold ${isDark ? 'text-slate-200' : 'text-[color:var(--nd-ink-2)]'}`}>
                    همراه برندهای فروش‌محور
                  </span>
                  <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold ${isDark ? 'text-emerald-300' : 'text-[color:var(--nd-success)]'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {personal.availability}
                  </span>
                </motion.div>

                {/* Headline — cinematic mask reveal */}
                <h1 className={`nd-h1 ${isDark ? 'text-white' : ''} text-[2.2rem] leading-[1.28] sm:text-5xl sm:leading-[1.22] lg:text-[3.7rem] lg:leading-[1.18]`}>
                  <MaskLines
                    delay={0.1}
                    lines={[
                      <span key="1">فروشگاهتان را آنلاین شروع کنید،</span>,
                      <span key="2">
                        {isDark ? (
                          <span className="nd-text-glow nd-shine">بهتر بفروشید</span>
                        ) : (
                          <span className="relative inline-block text-[color:var(--nd-accent)]">
                            <span className="absolute inset-x-[-6px] bottom-[4px] h-3.5 sm:h-4 rounded-md bg-[rgba(99,102,241,0.16)] -rotate-1" aria-hidden />
                            <span className="relative">بهتر بفروشید</span>
                          </span>
                        )}{' '}
                        و رشد کنید.
                      </span>,
                    ]}
                  />
                </h1>

                {/* Sub */}
                <motion.p
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-lg leading-relaxed max-w-2xl mx-auto`}
                >
                  فرقی نمی‌کنه تازه می‌خواید وارد دنیای آنلاین بشید یا همین حالا فروشگاه و سایت دارید؛ از طراحی سایت و راه‌اندازی پیج و محتوا تا تبلیغات، تحلیل و افزایش فروش، کمکتون می‌کنم مسیر درست رشدتون رو پیدا کنید و اجراش کنید.
                </motion.p>

                {/* Prompt box — dark glass */}
                <motion.form
                  onSubmit={(e) => handlePromptSubmit(e, heroPrompt)}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={`${isDark ? 'nd-glass-dark' : 'nd-card'} rounded-[var(--nd-radius-card)] p-3 sm:p-4 max-w-2xl mx-auto text-right`}
                >
                  <div className="flex items-center gap-3 px-2 sm:px-3 pt-2 pb-3">
                    <Search className={`w-5 h-5 shrink-0 ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`} />
                    <input
                      value={heroPrompt}
                      onChange={(e) => setHeroPrompt(e.target.value)}
                      placeholder="نیازت رو بنویس؛ مثلاً: بازدید میاد ولی فروش نه…"
                      className={`w-full bg-transparent text-sm sm:text-base font-medium focus:outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)]'}`}
                    />
                  </div>
                  <div className={`flex flex-wrap items-center gap-2 border-t pt-3 px-1 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                    {promptSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setHeroPrompt(s)}
                        className={`nd-chip transition-colors cursor-pointer ${isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-indigo-400/50' : 'hover:text-[color:var(--nd-accent)] hover:border-[rgba(79,70,229,0.4)]'}`}
                      >
                        {s}
                      </button>
                    ))}
                    <button type="submit" className={`nd-btn ms-auto px-5 py-2.5 text-xs sm:text-sm ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}>
                      <span>تحلیل رایگان نیازت</span>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </motion.form>

                {/* CTAs */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.62 }}
                  className="flex flex-wrap items-center justify-center gap-3"
                >
                  <Magnetic>
                    <button onClick={() => onNavigate('contact')} className={`nd-btn px-7 py-4 text-xs sm:text-sm ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}>
                      <span>ببینیم کسب‌وکارتان به چی نیاز دارد</span>
                      <ArrowUpLeft className="w-4 h-4" />
                    </button>
                  </Magnetic>
                  <button onClick={() => onNavigate('portfolio')} className={`nd-btn px-6 py-4 text-xs sm:text-sm ${isDark ? 'nd-glass-dark bg-white/5 border-white/15 text-white hover:bg-white/10' : 'nd-btn-ghost'}`}>
                    <span>پروژه‌هایی که انجام دادم</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.72 }}
                  className={`flex flex-wrap items-center justify-center gap-2 text-[11px] sm:text-xs font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}
                >
                  <span>طراحی سایت</span><span>·</span>
                  <span>محتوا و شبکه‌های اجتماعی</span><span>·</span>
                  <span>تبلیغات</span><span>·</span>
                  <span>تحلیل و بهینه‌سازی فروش</span>
                </motion.div>

                {/* Scroll cue */}
                <div className="flex justify-center pt-4">
                  <ChevronLeft className={`w-5 h-5 nd-scroll-cue rotate-[-90deg] ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`} />
                </div>
              </div>
            </div>

            {/* ---------- Intro statement — overlapping the stage edge ---------- */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={`relative z-10 nd-card max-w-3xl mx-auto p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-5 ${isDark ? '-mt-10 sm:-mt-12' : 'mt-6'}`}
            >
              <ProfilePhoto avatar={personal.avatar} name={personal.name} variant="card" className="w-16 h-16 rounded-2xl object-cover shadow-sm shrink-0" />
              <p className="text-sm sm:text-base leading-relaxed text-[color:var(--nd-ink-2)]">
                <span className="font-black text-[color:var(--nd-accent)] me-1">من امید عدلی هستم؛</span>
                متخصص رشد دیجیتال برای فروشگاه‌ها. کمک می‌کنم بفهمید مشتری‌ها کجا شما را پیدا می‌کنند، چرا بعضی‌ها خرید می‌کنند و بعضی‌ها نه، و برای بهتر شدن فروش باید دقیقاً روی چه چیزی کار کنید.
              </p>
            </motion.div>
          </section>
        );

      /* ============ 1.5 TRUST BAR (brand marquee) ============ */
      case 'TRUST_BAR': {
        const brandLogos = [
          { name: 'دایان', mono: 'د', shape: 'rounded-[14px]', tint: 0 },
          { name: 'ایران بروکر', mono: 'IB', ltr: true, shape: 'rounded-full', tint: 1 },
          { name: 'اقامت ۲۴', mono: '۲۴', shape: 'rounded-[10px] rotate-6', tint: 2 },
          { name: 'ای ادز', mono: 'e', ltr: true, shape: 'rounded-[18px]', tint: 3 },
          { name: 'فست‌کلیک', mono: 'ف', shape: 'rounded-full', tint: 0 },
          { name: 'آهن آنلاین', mono: 'آ', shape: 'rounded-[10px]', tint: 1 },
          { name: 'بیتستان', mono: 'ب', shape: 'rounded-[16px] -rotate-6', tint: 2 },
          { name: 'ورسلند', mono: 'و', shape: 'rounded-full', tint: 3 },
        ];
        return (
          <section className="py-10 sm:py-14 space-y-6">
            <p className="text-center text-[11px] sm:text-xs font-black tracking-wide text-[color:var(--nd-faint)]">
              برندهایی که به داده اعتماد کردن، نه به شعار
            </p>
            <div className="nd-marquee overflow-hidden [mask-image:linear-gradient(to_left,transparent,black_12%,black_88%,transparent)]">
              <div className="nd-marquee-track items-center gap-12">
                {[...brandLogos, ...brandLogos].map((b, i) => (
                  <span key={i} className="group flex items-center gap-3 whitespace-nowrap opacity-70 saturate-50 transition-all duration-300 hover:opacity-100 hover:saturate-100">
                    <span
                      className={`w-10 h-10 grid place-items-center text-sm font-black shrink-0 ${b.shape}`}
                      style={{ background: TINTS[b.tint].bg, color: TINTS[b.tint].fg }}
                    >
                      <span className={b.ltr ? 'dir-ltr' : ''}>{b.mono}</span>
                    </span>
                    <span className="text-sm sm:text-base font-black tracking-tight text-[color:var(--nd-ink-2)] group-hover:text-[color:var(--nd-accent)] transition-colors">
                      {b.name}
                    </span>
                    <span className="w-1 h-1 rotate-45 rounded-[1px] bg-[color:var(--nd-line-strong)] ms-6" aria-hidden />
                  </span>
                ))}
              </div>
            </div>
          </section>
        );
      }

      /* ============ 1.7 PROOF — cinematic dark evidence scene ============ */
      case 'PROOF':
        return (
          <section className="py-6 sm:py-10">
            <div className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[var(--nd-radius-panel)] sm:rounded-[var(--nd-radius-hero)] p-7 sm:p-14 space-y-10`}>
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <span className={`${isDark ? 'nd-glass-dark text-indigo-200' : 'nd-eyebrow'} inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold`}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>اثبات با داده، نه شعار</span>
                </span>
                <h2 className={`nd-h2 ${isDark ? 'text-white' : ''} text-2xl sm:text-3xl lg:text-[2.6rem]`}>نتیجه‌هایی که تا الان گرفتم</h2>
                <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base leading-relaxed`}>این‌ها فقط عدد نیستن؛ نتیجه‌ی کار روی کسب‌وکارهای واقعیه.</p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-4">
                {stats.map((stat, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.55, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    className="relative text-center space-y-1.5"
                  >
                    <RepeaterControls arrayPath="STATS" index={idx} totalCount={stats.length} className="absolute top-0 left-0" />
                    {/* dir-rtl: «۲.۹ برابر» باید با جهتِ پاراگراف فارسی تراز شود،
                        وگرنه عدد و کلمه جابه‌جا دیده می‌شوند («برابر ۲.۹»). */}
                    <div className={`text-3xl sm:text-4xl font-black ${isDark ? 'nd-text-glow' : 'text-[color:var(--nd-accent)]'} dir-rtl text-center`}>
                      <EditableText path={`STATS.${idx}.value`}>{stat.value}</EditableText>
                    </div>
                    <div className={`font-extrabold text-xs sm:text-sm ${isDark ? 'text-slate-200' : 'text-[color:var(--nd-ink)]'}`}>
                      <EditableText path={`STATS.${idx}.label`}>{stat.label}</EditableText>
                    </div>
                    <div className={`text-[11px] font-medium ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>
                      <EditableText path={`STATS.${idx}.subtext`}>{stat.subtext}</EditableText>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Two featured case studies */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {homepageStudies.slice(0, 2).map((study, idx) => (
                  <motion.button
                    key={study.id || idx}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => onSelectCaseStudy(study)}
                    className={`${isDark ? 'nd-glass-dark hover:bg-white/10' : 'nd-card nd-card-hover'} p-6 sm:p-7 text-right flex flex-col gap-4 cursor-pointer transition-colors group`}>
                    <div className="flex items-center justify-between">
                      <span className={`nd-chip ${isDark ? 'bg-white/8 border-white/12 text-slate-300' : ''}`}>{study.industryFa}</span>
                      <span className={`text-[11px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{study.client}</span>
                    </div>
                    <h3 className={`nd-h2 ${isDark ? 'text-white' : ''} text-base sm:text-lg leading-snug`}>{study.title}</h3>
                    {/* آمار و ارقام حذف شد — به‌جای آن خلاصه‌ی پروژه می‌آید. */}
                    <p className={`text-xs leading-relaxed line-clamp-3 ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{study.summary}</p>
                    <span className={`mt-auto flex items-center justify-between pt-3 border-t text-xs font-extrabold ${isDark ? 'border-white/10 text-indigo-300' : 'border-[color:var(--nd-line)] text-[color:var(--nd-accent)]'}`}>
                      <span>دیدن کامل این پروژه</span>
                      <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    </span>
                  </motion.button>
                ))}
              </div>

              <div className="text-center">
                <button onClick={() => onNavigate('portfolio')} className={`nd-btn ${isDark ? 'nd-glass-dark bg-white/5 border-white/15 text-white hover:bg-white/10' : 'nd-btn-ghost'} px-7 py-3.5 text-xs sm:text-sm`}>
                  <span>همه‌ی نمونه‌کارها</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        );
      /* ============ 2. PATH NAV ============ */
      case 'PATH_NAV':
        return (
          <section id="path-navigation" className="py-14 sm:py-20 space-y-10">
            <SectionHead
              eyebrow="مسیریابی سه‌گانه"
              icon={<Layers className="w-3.5 h-3.5" />}
              title="الان کسب‌وکارت کجای این مسیره؟"
              desc="روی همونی که به شرایط الانت نزدیک‌تره بزن، تا دقیقاً همون چیزی رو ببینی که بهش نیاز داری."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {pathCards.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                >
                  <TiltCard maxTilt={4} glowColor="rgba(79, 70, 229, 0.12)">
                    <button
                      onClick={() => handlePathNavClick(p.id)}
                      className={`nd-card nd-card-hover w-full h-full p-7 text-right flex flex-col justify-between gap-6 cursor-pointer relative overflow-hidden ${
                        p.isFeatured ? 'ring-2 ring-[rgba(79,70,229,0.35)]' : ''
                      }`}
                    >
                      {p.isFeatured && (
                        <span className="absolute top-5 left-5 nd-eyebrow bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent">
                          پرترین انتخاب
                        </span>
                      )}
                      <span className="flex items-start justify-between gap-4">
                        <IconBadge3D iconName={p.iconName} theme={theme} size="sm" glowColor={(['purple', 'blue', 'emerald'] as const)[i % 3]} floating={false} />
                        <span className="nd-chip">{p.tag}</span>
                      </span>
                      <span className="block">
                        <span className="block nd-h2 text-lg sm:text-xl mb-2.5">{p.title}</span>
                        <span className="block nd-muted text-xs sm:text-sm leading-relaxed">{p.desc}</span>
                      </span>
                      <span className="flex items-center justify-between pt-4 border-t border-[color:var(--nd-line)] text-xs font-extrabold text-[color:var(--nd-accent)]">
                        <span>{p.cta}</span>
                        <ChevronLeft className="w-4 h-4" />
                      </span>
                    </button>
                  </TiltCard>
                </motion.div>
              ))}
            </div>
          </section>
        );

      /* ============ 3. STATS ============ */
      case 'STATS':
        return (
          <section id="stats-section" className="py-14 sm:py-20 space-y-10">
            <SectionEditHeader title="آمار و شاخص‌های کلیدی" arrayPath="STATS" />
            <SectionHead
              eyebrow="نتایج واقعی"
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              title="نتیجه‌هایی که تا الان گرفتم"
              desc="این‌ها فقط عدد نیستن؛ نتیجه‌ی کار روی کسب‌وکارهای واقعیه."
            />
            <div className="nd-card rounded-[var(--nd-radius-panel)] p-6 sm:p-10 grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6">
              {stats.map((stat, idx) => (
                <div key={idx} className="relative text-center lg:text-right space-y-1.5">
                  <RepeaterControls arrayPath="STATS" index={idx} totalCount={stats.length} className="absolute top-0 left-0" />
                  {/* dir-rtl: «۲.۹ برابر» باید با جهتِ پاراگراف فارسی تراز شود،
                      وگرنه عدد و کلمه جابه‌جا دیده می‌شوند («برابر ۲.۹»). */}
                  <div className="text-3xl sm:text-4xl font-black text-[color:var(--nd-accent)] dir-rtl text-center lg:text-right">
                    <EditableText path={`STATS.${idx}.value`}>{stat.value}</EditableText>
                  </div>
                  <div className="font-extrabold text-xs sm:text-sm text-[color:var(--nd-ink)]">
                    <EditableText path={`STATS.${idx}.label`}>{stat.label}</EditableText>
                  </div>
                  <div className="text-[11px] font-medium text-[color:var(--nd-faint)]">
                    <EditableText path={`STATS.${idx}.subtext`}>{stat.subtext}</EditableText>
                  </div>
                </div>
              ))}
            </div>

            {/* Tools marquee */}
            {skills.length > 0 && (
              <div className="nd-marquee overflow-hidden py-2 [mask-image:linear-gradient(to_left,transparent,black_12%,black_88%,transparent)]">
                <div className="nd-marquee-track gap-3">
                  {[...skills, ...skills].map((t, i) => (
                    <span key={i} className="nd-chip py-2 px-4 text-[11px] whitespace-nowrap dir-ltr">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        );

      /* ============ 4. SERVICES TABS ============ */
      case 'SERVICES_TABS':
      case 'SERVICES': {
        const currentTab = tabConfig[activeServiceTab];
        const currentServices = servicesInTab(services, activeServiceTab);
        const TabIcon = currentTab.icon;
        return (
          <section id="services-tabs" className="py-14 sm:py-20 space-y-10">
            <div ref={servicesSectionRef} className="space-y-10 scroll-mt-28">
              <SectionHead
                eyebrow="خدمات تخصصی"
                icon={<Layers className="w-3.5 h-3.5" />}
                title="خدماتی که در هر مرحله از مسیر بهت کمک می‌کنن"
                desc="از شروع آنلاین تا رشد فروش، هر بخش رو می‌تونی جدا یا در کنار هم داشته باشی."
              />

              {/* Segmented tabs */}
              <div className="flex justify-center">
                <div className="nd-glass inline-flex p-1.5 rounded-full gap-1">
                  {(['start', 'sell', 'grow'] as const).map((tabKey) => {
                    const cfg = tabConfig[tabKey];
                    const Icon = cfg.icon;
                    const isActive = activeServiceTab === tabKey;
                    return (
                      <button
                        key={tabKey}
                        onClick={() => setActiveServiceTab(tabKey)}
                        className={`px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                          isActive ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm' : 'text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeServiceTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-8"
                >
                  <p className="text-center text-xs sm:text-sm font-bold text-[color:var(--nd-ink-2)] bg-[color:var(--nd-accent-soft)] border border-[rgba(79,70,229,0.12)] rounded-full px-5 py-3 max-w-xl mx-auto flex items-center gap-2 justify-center">
                    <TabIcon className="w-4 h-4 text-[color:var(--nd-accent)]" />
                    {currentTab.tagline}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {currentServices.map((srv, idx) => (
                      <motion.div
                        key={srv.id || idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: idx * 0.07, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full"
                      >
                        <div className="nd-card nd-card-hover p-7 h-full flex flex-col justify-between gap-6 group">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <IconBadge3D iconName={srv.iconName} theme={theme} size="sm" glowColor={(['blue', 'cyan', 'purple', 'emerald', 'gold', 'magenta'] as const)[idx % 6]} floating={false} />
                              <span className="text-[11px] font-black text-[color:var(--nd-faint)] dir-ltr">0{idx + 1}</span>
                            </div>
                            <h3 className="nd-h2 text-base sm:text-lg">{srv.title}</h3>
                            <p className="nd-muted text-xs sm:text-sm leading-relaxed">{srv.shortDesc}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(Array.isArray(srv.tags) ? srv.tags : []).slice(0, 3).map((t) => (
                                <span key={t} className="nd-chip dir-ltr">{t}</span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => onNavigate('services')}
                            className="nd-btn nd-btn-ghost w-full py-3 text-xs"
                          >
                            <span>مشاهده جزئیات کامل</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="text-center">
                <button onClick={() => onNavigate('contact')} className="nd-btn nd-btn-accent px-8 py-4 text-xs sm:text-sm">
                  <span>{currentTab.ctaText}</span>
                  <ArrowUpLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        );
      }

      /* ============ 5. CASE STUDIES ============ */
      case 'CASE_STUDIES':
      case 'PORTFOLIO':
        return (
          <section id="case-studies" className="py-14 sm:py-20 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div className="space-y-4 max-w-xl">
                <span className="nd-eyebrow">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>پروژه‌های واقعی</span>
                </span>
                <h2 className="nd-h2 text-2xl sm:text-3xl lg:text-[2.6rem]">چند نمونه از پروژه‌هایی که روشون کار کردم</h2>
                <p className="nd-muted text-sm sm:text-base leading-relaxed">از فروشگاه‌های کوچیک تا برندهای بزرگ‌تر — هرکدوم یه چالش متفاوت داشتن.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex gap-2">
                  <button onClick={() => scrollCarousel(-1)} aria-label="قبلی" className="nd-btn nd-btn-ghost w-11 h-11">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button onClick={() => scrollCarousel(1)} aria-label="بعدی" className="nd-btn nd-btn-ghost w-11 h-11">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
                <button onClick={() => onNavigate('portfolio')} className="nd-btn nd-btn-ghost px-5 py-3 text-xs font-extrabold">
                  <span>همه‌ی نمونه‌کارها</span>
                </button>
              </div>
            </div>

            <div ref={carouselRef} className="flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              {homepageStudies.map((study, idx) => (
                <motion.button
                  key={study.id || idx}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.6, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => onSelectCaseStudy(study)}
                  className="nd-card nd-card-hover snap-start shrink-0 w-[min(86vw,420px)] text-right overflow-hidden group cursor-pointer flex flex-col"
                >
                  {/* Cover */}
                  <div
                    className="relative h-40 sm:h-44 flex items-center justify-center overflow-hidden"
                    style={{ background: `linear-gradient(140deg, ${study.heroColor}18, ${study.heroColor}30)` }}
                  >
                    <span className="w-16 h-16 rounded-3xl grid place-items-center shadow-sm" style={{ background: `${study.heroColor}22`, color: study.heroColor }}>
                      {React.createElement(iconFor(study.thumbnailIcon), { className: 'w-7 h-7' })}
                    </span>
                    <span className="absolute top-4 right-4 nd-chip bg-white/80 backdrop-blur">{study.industryFa}</span>
                    <span className="absolute bottom-4 left-4 text-[10px] font-bold text-[color:var(--nd-muted)]">{study.client}</span>
                  </div>
                  {/* Body */}
                  <div className="p-6 sm:p-7 flex flex-col gap-4 grow">
                    <h3 className="nd-h2 text-base sm:text-lg leading-snug">{study.title}</h3>
                    <p className="nd-muted text-xs leading-relaxed line-clamp-3">{study.summary}</p>
                    {/* آمار و ارقام حذف شد. */}
                    <span className="mt-auto flex items-center justify-between pt-3 border-t border-[color:var(--nd-line)] text-xs font-extrabold text-[color:var(--nd-accent)]">
                      <span>دیدن کامل این پروژه</span>
                      <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        );

      /* ============ 6. HOW I WORK ============ */
      case 'HOW_I_WORK':
        return (
          <section id="how-i-work" className="py-14 sm:py-20 space-y-12">
            <SectionHead
              eyebrow="فرآیند شفاف"
              icon={<ClipboardCheck className="w-3.5 h-3.5" />}
              title="همکاری با من چطور پیش می‌ره؟"
              desc="یه فرآیند ساده و شفاف، از اولین گفتگو تا نتیجه‌ی قابل‌اندازه‌گیری."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 relative">
              {howIWork.map((stepItem, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.55, delay: idx * 0.09, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <div className="nd-card p-7 h-full flex flex-col gap-5 nd-card-hover">
                    <div className="flex items-center justify-between">
                      <span className={`w-11 h-11 rounded-full grid place-items-center text-sm font-black transition-colors ${
                        theme === 'dark'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                          : 'bg-slate-900 text-white'
                      }`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <IconBadge3D iconName={stepItem.icon} theme={theme} size="sm" glowColor={(['blue', 'purple', 'emerald', 'cyan'] as const)[idx % 4]} floating={false} />
                    </div>
                    <div className="space-y-2.5">
                      <h3 className="nd-h2 text-base">{stepItem.title}</h3>
                      <p className="nd-muted text-xs leading-relaxed">{stepItem.desc}</p>
                    </div>
                  </div>
                  {idx < howIWork.length - 1 && (
                    <span className="hidden lg:block absolute top-1/2 -left-5 w-5 border-t-2 border-dashed border-[color:var(--nd-line-strong)]" aria-hidden />
                  )}
                </motion.div>
              ))}
            </div>
            <div className="text-center">
              <button onClick={() => onNavigate('contact')} className="nd-btn px-8 py-4 text-xs sm:text-sm">
                <span>بیایید گفتگوی اولیه رو شروع کنیم</span>
                <ArrowUpLeft className="w-4 h-4" />
              </button>
            </div>
          </section>
        );

      /* ============ 7. WHY OMID ============ */
      case 'WHY_OMID':
        return (
          <section id="why-omid" className="py-14 sm:py-20">
            <div className="nd-panel rounded-[var(--nd-radius-panel)] sm:rounded-[var(--nd-radius-hero)] p-7 sm:p-14 space-y-10">
              <SectionHead
                eyebrow="تمایز و رویکرد"
                icon={<Target className="w-3.5 h-3.5" />}
                title="چرا با من کار کنید؟"
                desc="چون به‌جای اجرای پراکنده، به کسب‌وکارتون به چشم یه سیستم کامل نگاه می‌کنم."
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {whyOmidPoints.map((item: any, idx: number) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.55, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="nd-panel-card rounded-[var(--nd-radius-card)] p-7 space-y-4 h-full"
                  >
                    <IconBadge3D iconName={item.icon} theme={theme} size="sm" glowColor={(['cyan', 'gold', 'magenta'] as const)[idx % 3]} floating={false} />
                    <h3 className="nd-h2 text-base sm:text-lg">{item.title}</h3>
                    <p className="nd-muted text-xs sm:text-sm leading-relaxed">{item.description || item.desc}</p>
                  </motion.div>
                ))}
              </div>

              {/* Testimonial block intentionally removed per request */}
            </div>
          </section>
        );

      /* ============ 8. EXPERIENCE ============ */
      case 'EXPERIENCE':
        return (
          <section id="experience" className="py-14 sm:py-20 space-y-10">
            <SectionHead
              eyebrow="سوابق کاری"
              icon={<Briefcase className="w-3.5 h-3.5" />}
              title="مسیری که تا اینجا طی کردم"
              desc="هر پروژه یه چالش واقعی داشت؛ این‌ها نتیجه‌شونه."
            />
            <div className="max-w-3xl mx-auto relative">
              <span className="absolute top-2 bottom-2 right-[19px] w-px bg-[color:var(--nd-line-strong)]" aria-hidden />
              <div className="space-y-6">
                {homepageTimeline.map((item: any, idx: number) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.55, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    className="relative pr-14"
                  >
                    <span className="absolute right-2.5 top-7 w-3.5 h-3.5 rounded-full bg-[color:var(--nd-surface)] border-[3px] border-[color:var(--nd-accent)]" aria-hidden />
                    <div className="nd-card p-6 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="nd-chip bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] border-transparent">{item.year}</span>
                        <span className="nd-chip">{item.company}</span>
                      </div>
                      <h3 className="nd-h2 text-base">{item.title}</h3>
                      <p className="nd-muted text-xs leading-relaxed">{item.description}</p>
                      <p className="text-[11px] font-extrabold text-[color:var(--nd-success)] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {item.achievement}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {otherCollaborations.length > 0 && (
              <div className="nd-card rounded-full px-6 py-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-xs font-bold max-w-3xl mx-auto">
                <span className="text-[color:var(--nd-faint)] font-medium">سایر همکاری‌ها:</span>
                {otherCollaborations.map((collab: any, idx: number) => (
                  <span key={idx} className="flex items-center gap-1.5">
                    <span className="font-black text-[color:var(--nd-ink)]">{collab.company}</span>
                    <span className="text-[color:var(--nd-faint)] text-[11px]">({collab.role})</span>
                  </span>
                ))}
              </div>
            )}

            <div className="text-center">
              <button onClick={() => onNavigate('about')} className="nd-btn nd-btn-ghost px-6 py-3 text-xs font-extrabold">
                <span>مسیر کامل حرفه‌ای من</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </section>
        );

      /* ============ 9. FINAL CTA ============ */
      /* ============ 8.5 INSIGHTS — lead magnet + latest articles per topic ============ */
      case 'INSIGHTS': {
        // Latest three articles of each topic cluster, newest first. Generated
        // posts carry `dateIso`; the older hand-written ones only have the
        // Persian date string, so they simply keep their stored order.
        const publishedPosts = safeRecordArray<any>(data.BLOG_POSTS).filter(
          (p: any) => p && typeof p.id === 'string' && p.status !== 'draft',
        );
        const insightsGroups = INSIGHT_GROUPS.map((g) => ({
          ...g,
          posts: publishedPosts
            .filter((p: any) => g.groups.includes(groupOfPost(p)))
            .sort((a: any, b: any) => String(b.dateIso || '').localeCompare(String(a.dateIso || '')))
            .slice(0, 3),
        })).filter((g) => g.posts.length > 0);

        return (
          <section className="py-14 sm:py-20 space-y-8">
            {/* Free-audit box removed per request — section now opens directly on articles */}

            {/* نوشت‌های تازه — دسته‌بندی‌شده بر اساس موضوعات اصلی */}
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                  <span className="nd-eyebrow">
                    <LineChart className="w-3.5 h-3.5" />
                    <span>نوشت‌های تازه</span>
                  </span>
                  <h3 className="nd-h2 text-xl sm:text-2xl">چیزهایی که اخیراً از داده‌ها یاد گرفتم</h3>
                </div>
                <a {...linkProps('/blog', () => onNavigate('blog'))} className="nd-btn nd-btn-ghost px-5 py-2.5 text-xs font-extrabold shrink-0">
                  <span>همه‌ی نوشت‌ها</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </a>
              </div>

              {insightsGroups.length === 0 ? (
                <div className="nd-card p-10 text-center">
                  <p className="nd-muted text-xs sm:text-sm">مقاله‌ای هنوز منتشر نشده است.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {insightsGroups.map((group, gi) => (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.5, delay: gi * 0.07, ease: [0.22, 1, 0.36, 1] }}
                      className="nd-card p-5 sm:p-6 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-3 pb-2">
                        <h4 className="text-sm font-black text-[color:var(--nd-ink)]">{group.title}</h4>
                        <a
                          {...linkProps('/blog', () => {
                            const first = group.posts[0];
                            setBlogSearchQuery('');
                            setBlogCategoryFilter(first ? normalizeCategory(first).categoryFa : 'all');
                            onNavigate('blog');
                          })}
                          className="nd-chip text-[10px] hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer"
                        >
                          <span>مطالب این دسته</span>
                          <ChevronLeft className="w-3 h-3" />
                        </a>
                      </div>
                      <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-[color:var(--nd-line)]'}`}>
                        {group.posts.map((post: any) => (
                          <a
                            key={post.id}
                            {...linkProps(postPath(post), () => (onSelectPost ? onSelectPost(post.id) : onNavigate('blog')))}
                            className="flex items-center gap-3 py-3.5 text-right cursor-pointer group"
                          >
                            {/* تصویر واقعی مقاله (نه آیکون) */}
                            <span className={`block w-20 h-14 sm:w-24 sm:h-16 rounded-xl overflow-hidden border shrink-0 ${isDark ? 'border-white/10 bg-white/5' : 'border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)]'}`}>
                              <img
                                alt={post.title}
                                {...responsiveImageProps(post.coverImage || '/image-fallback.svg', { sizes: '96px', displayWidth: 160, displayHeight: 112 })}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500"
                                referrerPolicy="no-referrer"
                                onError={imageFallback()}
                              />
                            </span>
                            <span className="flex-1 min-w-0 space-y-1">
                              <span className="block text-xs sm:text-sm font-extrabold text-[color:var(--nd-ink)] leading-snug line-clamp-2 group-hover:text-[color:var(--nd-accent)] transition-colors">
                                {post.title}
                              </span>
                              <span className="block text-[10px] font-bold text-[color:var(--nd-faint)]">{post.date}</span>
                            </span>
                            <span className="nd-btn nd-btn-ghost px-3.5 py-2 text-[10px] shrink-0 group-hover:text-[color:var(--nd-accent)]">
                              <span>مشاهده مقاله</span>
                              <ChevronLeft className="w-3 h-3" />
                            </span>
                          </a>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      }

      /* ============ 8.6 AI_TOOLS — native showcase of the paid assistants ============ */
      case 'AI_TOOLS': {
        const toolsCfg = data.AI_TOOLS_CONFIG;
        if (toolsCfg?.enabled === false) return null;
        const toolIds = productsForPage('home');
        if (!toolIds.some((id) => isProductPromotable(data, id))) return null;
        return (
          <section id="ai-tools" className="py-14 sm:py-20 space-y-10">
            <SectionHead
              eyebrow="دستیارهای هوشمند"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              title="چهار هم‌فکرِ همیشه‌بیدار برای تصمیم‌های مارکتینگ"
              desc="مشاوره، برنامه‌ریزی، حل مسئله و تمرین فروش — هرکدام روی یک گره مشخص. با ۵۰۰ سکه هدیه، همین‌جا امتحانشان کن."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {toolIds.map((id) => (
                <ProductPromo key={id} productId={id} theme={theme} onNavigate={onNavigate} variant="card" />
              ))}
            </div>
            <div className="text-center">
              <a
                {...linkProps('/products', () => onNavigate('products'))}
                className="nd-btn nd-btn-ghost px-6 py-3 text-xs font-extrabold"
              >
                <span>مشاهده همه ابزارها و تعرفه‌ها</span>
                <ChevronLeft className="w-4 h-4" />
              </a>
            </div>
          </section>
        );
      }

      /* ============ 8.7 FAQ — objection handling ============ */
      case 'FAQ': {
        const faqs = [
          { q: 'قیمت‌ها چطور محاسبه می‌شه؟', a: 'هر خدمت یه بازه قیمت مشخص داره که در صفحه خدمات شفاف نوشته شده. قیمت نهایی بعد از گفتگوی اولیه رایگان و بر اساس بریف واقعی پروژه تعیین می‌شه — بدون هزینه پنهان.' },
          { q: 'نتیجه رو تضمین می‌کنی؟', a: 'هیچ متخصص صادقی نمی‌تونه عدد دقیق تضمین کنه؛ چون بازار و محصول شما متغیره. تعهد من فرآیند داده‌محور، تست مستمر و گزارش‌دهی شفافه — و نمونه نتایج واقعی در نمونه‌کارها قابل بررسیه.' },
          { q: 'ریموت کار می‌کنی یا حضوری؟', a: 'هر دو. پایه کار ریموته (مشهد/تهران/هر جای ایران) با جلسات منظم ویدیویی و گزارش‌های هفتگی؛ جلسات حضوری موردی هم در مشهد و تهران امکان‌پذیره.' },
          { q: 'تفاوتت با آژانس‌های تبلیغاتی چیه؟', a: 'مستقیم با خودم کار می‌کنی، نه یه تیم junior که بعد از قرارداد می‌بینی. هزینه سربار کمتر یعنی قیمت منصفانه‌تر، و تمام توجه روی داده‌های کسب‌وکار شماست.' },
          { q: 'چقدر طول می‌کشه تا نتیجه ببینم؟', a: 'بسته به کانال: تبلیغات و CRO معمولاً اولین سیگنال‌ها رو در ۴ تا ۸ هفته نشون می‌دن؛ SEO بازه ۳ تا ۶ ماهه داره. از روز اول با نقشه راه می‌دونید هر مرحله چه انتظاری داشته باشید.' },
        ];
        return (
          <section className="py-14 sm:py-20 space-y-10">
            <SectionHead
              eyebrow="پرسش‌های پرتکرار"
              icon={<ClipboardCheck className="w-3.5 h-3.5" />}
              title="هر سوالی داری، رک جواب می‌دم"
              desc="چیزهایی که مشتری‌ها قبل از شروع همکاری معمولاً می‌پرسن."
            />
            <div className="max-w-3xl mx-auto space-y-3">
              {faqs.map((f, idx) => (
                <div key={idx} className="nd-card overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}
                    className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-right cursor-pointer"
                  >
                    <span className="text-sm font-extrabold text-[color:var(--nd-ink)]">{f.q}</span>
                    <span className={`w-8 h-8 rounded-full border border-[color:var(--nd-line-strong)] grid place-items-center shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-45 bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] border-transparent' : 'text-[color:var(--nd-muted)]'}`}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="px-5 sm:px-6 pb-6 nd-muted text-xs sm:text-sm leading-relaxed">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </section>
        );
      }

      /* ============ 9. FINAL CTA — dark cinematic close ============ */
      case 'FINAL_CTA':
      case 'CTA':
        return (
          <section id="final-cta" className="py-10 sm:py-16">
            <div className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} relative rounded-[var(--nd-radius-panel)] sm:rounded-[var(--nd-radius-hero)] p-9 sm:p-16 text-center space-y-6`}>
              <div className="absolute w-[30rem] h-[30rem] -top-32 -right-24 rounded-full blur-3xl opacity-40 nd-float-slow" style={{ background: 'radial-gradient(circle, rgba(99,91,255,0.5), transparent 65%)' }} aria-hidden />
              <div className="absolute w-[26rem] h-[26rem] -bottom-28 -left-20 rounded-full blur-3xl opacity-30 nd-float" style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.4), transparent 65%)' }} aria-hidden />
              <h2 className={`nd-h1 relative ${isDark ? 'text-white' : ''} text-2xl sm:text-4xl lg:text-[3rem] max-w-2xl mx-auto`}>
                <MaskLines lines={[<span key="1">آماده‌ای مسیر رشد کسب‌وکارتو پیدا کنی؟</span>]} />
              </h2>
              <p className={`relative ${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base max-w-xl mx-auto`}>یه گفتگوی کوتاه کافیه تا دقیقاً بفهمیم از کجا باید شروع کنیم.</p>
              <div className="relative flex flex-wrap items-center justify-center gap-3 pt-2">
                <Magnetic>
                  <button onClick={() => onNavigate('contact')} className="nd-btn bg-white text-[#17171c] hover:bg-slate-200 px-8 py-4 text-xs sm:text-sm">
                    <span>ببینیم کسب‌وکارتان به چی نیاز دارد</span>
                    <ArrowUpLeft className="w-4 h-4" />
                  </button>
                </Magnetic>
                <a href={personal.whatsappUrl} target="_blank" rel="noreferrer" className={`nd-btn ${isDark ? 'nd-glass-dark bg-white/5 border-white/15 text-white hover:bg-white/10' : 'nd-btn-ghost'} px-6 py-4 text-xs sm:text-sm`}>
                  <MessageCircle className={`w-4 h-4 ${isDark ? 'text-emerald-300' : 'text-[color:var(--nd-success)]'}`} />
                  <span>گفتگو در واتساپ</span>
                </a>
              </div>
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full space-y-6 md:space-y-10">
      {homeSections.map((sec) => (
        <SectionWrapper key={sec.id} pageKey="home" sectionName={sec.name}>
          {sec.name === 'HERO' ? (
            renderSectionByName(sec.name)
          ) : (
            <div className="max-w-6xl mx-auto px-4 sm:px-8">
              {renderSectionByName(sec.name)}
            </div>
          )}
        </SectionWrapper>
      ))}
    </div>
  );
};
