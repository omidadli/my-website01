import React, { useState, useEffect } from 'react';
import { Page, Theme } from '../types';
import { useContent } from '../context/ContentContext';
import { Menu, X, ArrowUpLeft, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { linkProps, pathForPage } from '../utils/router';
import { safeRecordArray } from '../utils/contentDefaults';
import { Logo } from './Logo';

// Header-only exclusion: these items stay in NAVIGATION_MENU (and in the
// Footer, and their pages remain fully live) — they're just not shown as
// links in the top header nav, per an explicit request to trim the header.
const HEADER_HIDDEN_SLUGS = ['projects', 'portfolio'];

interface NavbarProps {
  theme: Theme;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onReplaySplash?: () => void;
  onToggleTheme?: () => void;
  onOpenAdminModal?: () => void;
}

/* Luxe day/night switch — glossy track, glowing knob (per brand reference) */
const ThemeSwitch: React.FC<{ theme: Theme; onToggle?: () => void }> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';
  return (
    <button
      role="switch"
      aria-checked={isDark}
      aria-label="تغییر تم روز/شب"
      title={isDark ? 'حالت روز' : 'حالت شب'}
      onClick={onToggle}
      className="relative w-[58px] h-[30px] rounded-full nd-glass shrink-0 cursor-pointer overflow-hidden"
    >
      {/* edge glow per state */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none transition-shadow duration-500"
        style={{ boxShadow: isDark ? 'inset 0 0 12px rgba(99,102,241,0.45)' : 'inset 0 0 12px rgba(245,158,11,0.35)' }}
      />
      <Sun className="absolute w-3.5 h-3.5 left-[9px] top-1/2 -translate-y-1/2 text-amber-500 transition-opacity duration-300" style={{ opacity: isDark ? 0.45 : 0 }} />
      <Moon className="absolute w-3.5 h-3.5 right-[9px] top-1/2 -translate-y-1/2 text-indigo-300 transition-opacity duration-300" style={{ opacity: isDark ? 0 : 0.5 }} />
      <motion.span
        animate={{ left: isDark ? 29 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className="absolute top-[3px] w-6 h-6 rounded-full grid place-items-center"
        style={{
          background: isDark ? 'linear-gradient(135deg,#312e81,#0ea5e9)' : 'linear-gradient(135deg,#fbbf24,#f59e0b)',
          boxShadow: isDark ? '0 0 14px rgba(99,102,241,0.8)' : '0 0 14px rgba(245,158,11,0.7)',
        }}
      >
        {isDark ? <Moon className="w-3 h-3 text-sky-100" /> : <Sun className="w-3 h-3 text-amber-50" />}
      </motion.span>
    </button>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  currentPage,
  onNavigate,
  onToggleTheme,
}) => {
  const { data } = useContent();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const navItems = safeRecordArray<NonNullable<typeof data.NAVIGATION_MENU[number]>>(data.NAVIGATION_MENU)
    .filter((item) => typeof item.pageSlug === 'string' && typeof item.label === 'string')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .filter((item) => !item.isHidden)
    .filter((item) => !HEADER_HIDDEN_SLUGS.includes(item.pageSlug));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [currentPage]);

  const go = (pageSlug: string) => {
    onNavigate(pageSlug as Page);
    setMobileOpen(false);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 pt-3 sm:pt-5">
      <div
        className={`max-w-6xl mx-auto nd-glass rounded-full transition-all duration-500 ${
          scrolled ? 'shadow-[var(--nd-shadow-md)]' : ''
        }`}
      >
        <div className="flex items-center gap-2 ps-2 pe-2 sm:ps-3 sm:pe-2.5 py-2">
          {/* Brand */}
          <a {...linkProps(pathForPage('home'), () => go('home'))} aria-label="صفحه اصلی" className="flex items-center gap-2.5 shrink-0 cursor-pointer me-1 sm:me-3">
            <Logo className="w-9 h-9" />
            <span className="hidden md:block text-right leading-tight">
              <span className="block text-[13px] font-black text-[color:var(--nd-ink)]">امید عدلی</span>
              <span className="block text-[9.5px] font-bold text-[color:var(--nd-faint)]">Performance Marketing & CRO</span>
            </span>
          </a>

          {/* Desktop links */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-auto">
            {navItems.map((item) => {
              const active = currentPage === item.pageSlug;
              return (
                <a
                  key={item.id}
                  {...linkProps(pathForPage(item.pageSlug), () => go(item.pageSlug))}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3.5 xl:px-4 py-2 rounded-full text-[12px] font-extrabold transition-all cursor-pointer ${
                    active
                      ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm'
                      : 'text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)] hover:bg-[color:var(--nd-line)]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <span className="flex-1 lg:hidden" />

          {/* Theme switch */}
          {onToggleTheme && <ThemeSwitch theme={theme} onToggle={onToggleTheme} />}

          {/* CTA */}
          <a
            {...linkProps(pathForPage('contact'), () => go('contact'))}
            className="nd-btn nd-btn-accent hidden sm:inline-flex px-5 py-2.5 text-[12px] shrink-0"
          >
            <span>گفتگوی رایگان</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </a>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="منو"
            className="lg:hidden nd-btn nd-btn-ghost w-10 h-10 shrink-0"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden max-w-6xl mx-auto mt-2 nd-glass rounded-[var(--nd-radius-card)] p-4 space-y-1"
          >
            {navItems.map((item) => {
              const active = currentPage === item.pageSlug;
              return (
                <a
                  key={item.id}
                  {...linkProps(pathForPage(item.pageSlug), () => go(item.pageSlug))}
                  aria-current={active ? 'page' : undefined}
                  className={`block w-full text-right px-4 py-3 rounded-2xl text-sm font-extrabold transition-colors cursor-pointer ${
                    active ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)]' : 'text-[color:var(--nd-ink-2)] hover:bg-[color:var(--nd-line)]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
            <a {...linkProps(pathForPage('contact'), () => go('contact'))} className="nd-btn nd-btn-accent w-full py-3.5 text-sm mt-2">
              <span>گفتگوی رایگان</span>
              <ArrowUpLeft className="w-4 h-4" />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
