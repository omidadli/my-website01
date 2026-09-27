import React from 'react';
import { motion } from 'motion/react';
import { Home, ChevronLeft } from 'lucide-react';
import { Page, Theme } from '../../types';

/* Shared input skin for both themes.
   `text-base` (16px) is mandatory: iOS Safari zooms the viewport on any
   focusable field whose computed font-size is smaller. */
export const inputCls = (isDark: boolean) =>
  `w-full rounded-2xl px-4 py-3.5 text-base font-bold border focus:outline-none transition-colors ${
    isDark
      ? 'bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-indigo-400/60'
      : 'bg-white border-[color:var(--nd-line-strong)] text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)] focus:border-[color:var(--nd-accent)]'
  }`;

/* Centered section heading */
export const Head: React.FC<{
  theme: Theme;
  eyebrow: string;
  icon?: React.ReactNode;
  title: string;
  desc?: string;
}> = ({ theme, eyebrow, icon, title, desc }) => {
  const isDark = theme === 'dark';
  return (
    <div className="text-center mx-auto max-w-2xl space-y-4">
      <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
        {icon}
        <span>{eyebrow}</span>
      </span>
      <h2 className={`nd-h2 text-2xl sm:text-3xl lg:text-[2.4rem] ${isDark ? 'text-white' : ''}`}>{title}</h2>
      {desc && <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base leading-relaxed`}>{desc}</p>}
    </div>
  );
};

/* Page hero band — dark stage vs light panel, breadcrumb included */
export const PageHero: React.FC<{
  theme: Theme;
  page: Page;
  title: string;
  subtitle: string;
  badge?: string;
  onNavigate: (p: Page) => void;
  children?: React.ReactNode;
}> = ({ theme, page, title, subtitle, badge, onNavigate, children }) => {
  const isDark = theme === 'dark';
  const names: Partial<Record<Page, string>> = {
    services: 'خدمات تخصصی',
    portfolio: 'نمونه‌کارها',
    about: 'درباره من',
    blog: 'نوشت‌ها',
    contact: 'تماس',
    projects: 'پروژه‌ها',
    products: 'محصولات',
  };
  return (
    <div className="space-y-5 pt-2">
      <nav className="flex items-center gap-2 text-[11px] font-bold text-[color:var(--nd-faint)] px-1" aria-label="مسیر صفحه">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-1 hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">
          <Home className="w-3.5 h-3.5" />
          <span>صفحه اصلی</span>
        </button>
        <ChevronLeft className="w-3 h-3 opacity-60" />
        <span className="text-[color:var(--nd-accent)] font-extrabold">{names[page] || title}</span>
      </nav>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[32px] sm:rounded-[40px] px-6 sm:px-12 py-12 sm:py-16 text-center space-y-5`}
      >
        {badge && (
          <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            <span>{badge}</span>
          </span>
        )}
        <h1 className={`nd-h1 text-2xl sm:text-4xl lg:text-[2.9rem] mx-auto max-w-3xl ${isDark ? 'text-white' : ''}`}>{title}</h1>
        <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base leading-relaxed max-w-2xl mx-auto`}>{subtitle}</p>
        {children}
      </motion.div>
    </div>
  );
};

/* Closing CTA band */
export const CtaPanel: React.FC<{
  theme: Theme;
  title: string;
  desc: string;
  primaryLabel: string;
  onPrimary: () => void;
}> = ({ theme, title, desc, primaryLabel, onPrimary }) => {
  const isDark = theme === 'dark';
  return (
    <div className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} relative rounded-[32px] sm:rounded-[40px] p-9 sm:p-14 text-center space-y-5`}>
      <h2 className={`nd-h2 text-xl sm:text-3xl max-w-2xl mx-auto ${isDark ? 'text-white' : ''}`}>{title}</h2>
      <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm max-w-xl mx-auto`}>{desc}</p>
      <button onClick={onPrimary} className={`nd-btn ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'} px-8 py-4 text-xs sm:text-sm`}>
        <span>{primaryLabel}</span>
        <ChevronLeft className="w-4 h-4 rotate-90" />
      </button>
    </div>
  );
};
