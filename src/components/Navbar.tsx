import React, { useState, useEffect } from 'react';
import { Page, Theme } from '../types';
import { useContent } from '../context/ContentContext';
import { useUser } from '../context/UserContext';
import { Menu, X, User } from 'lucide-react';
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

/* Scenic day/night switch — landscape illustration with sliding white knob (per reference design) */
const ThemeSwitch: React.FC<{ theme: Theme; onToggle?: () => void }> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';
  return (
    <button
      role="switch"
      aria-checked={isDark}
      aria-label="تغییر تم روز/شب"
      title={isDark ? 'حالت روز' : 'حالت شب'}
      onClick={onToggle}
      className="relative w-[88px] h-[42px] rounded-full shrink-0 cursor-pointer overflow-hidden border-2 border-white/30 shadow-lg"
      style={{
        background: isDark
          // Night: deep indigo/purple sky fading darker toward the bottom
          ? 'linear-gradient(180deg,#1a1040 0%,#2d1b5e 45%,#0b0524 100%)'
          // Day: bright blue sky gradient
          : 'linear-gradient(180deg,#5cc8ff 0%,#89dbff 50%,#b7e8ff 100%)',
        transition: 'background 0.6s ease',
      }}
    >
      {/* ==== DAY ELEMENTS (faded out at night) ==== */}
      {/* Clouds */}
      <span className="absolute top-1.5 left-3 w-5 h-2.5 rounded-full bg-white/90 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1, boxShadow: '0 0 0 2px rgba(255,255,255,0.7)' }} />
      <span className="absolute top-2.5 left-6 w-3 h-1.5 rounded-full bg-white/80 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 0.9 }} />
      <span className="absolute top-3 left-[52%] w-6 h-2.5 rounded-full bg-white/90 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1 }} />
      <span className="absolute top-5 right-4 w-4 h-1.5 rounded-full bg-white/80 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 0.8 }} />
      <span className="absolute top-1.5 right-7 w-2 h-1 rounded-full bg-white/70 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 0.7 }} />
      {/* Small mountain/hill behind trees */}
      <span
        className="absolute bottom-[14px] left-0 right-0 h-[14px] transition-opacity duration-500"
        style={{
          opacity: isDark ? 0 : 1,
          background: 'linear-gradient(180deg,#7aa7d9 0%,#6a94c4 100%)',
          clipPath: 'polygon(0% 100%, 0% 60%, 15% 30%, 30% 55%, 45% 20%, 60% 50%, 75% 25%, 90% 45%, 100% 30%, 100% 100%)',
        }}
      />
      {/* Ground / sand path */}
      <span
        className="absolute bottom-0 left-0 right-0 h-[12px] transition-opacity duration-500"
        style={{
          opacity: isDark ? 0 : 1,
          background: 'linear-gradient(180deg,#e8b87a 0%,#d4a062 100%)',
        }}
      />
      {/* Grass patches on ground */}
      <span className="absolute bottom-[11px] left-[20%] w-1 h-2 bg-green-500 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1, clipPath: 'polygon(50% 0,0 100%,100% 100%)' }} />
      <span className="absolute bottom-[11px] left-[45%] w-1 h-2 bg-green-600 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1, clipPath: 'polygon(50% 0,0 100%,100% 100%)' }} />
      <span className="absolute bottom-[11px] right-[30%] w-1 h-2 bg-green-500 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1, clipPath: 'polygon(50% 0,0 100%,100% 100%)' }} />
      <span className="absolute bottom-[11px] right-[15%] w-1 h-2 bg-green-600 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1, clipPath: 'polygon(50% 0,0 100%,100% 100%)' }} />
      {/* Rocks */}
      <span
        className="absolute bottom-[6px] left-[40%] w-5 h-3 rounded-t-lg transition-opacity duration-500"
        style={{ opacity: isDark ? 0 : 1, background: 'linear-gradient(180deg,#5a6a7d,#3f4d5e)', borderRadius: '50% 50% 20% 20%' }}
      />
      <span
        className="absolute bottom-[6px] left-[55%] w-3.5 h-2 rounded-t-lg transition-opacity duration-500"
        style={{ opacity: isDark ? 0 : 1, background: 'linear-gradient(180deg,#667689,#4a586a)', borderRadius: '50% 50% 20% 20%' }}
      />
      <span
        className="absolute bottom-[6px] right-[25%] w-4 h-2.5 rounded-t-lg transition-opacity duration-500"
        style={{ opacity: isDark ? 0 : 1, background: 'linear-gradient(180deg,#5e6e80,#455366)', borderRadius: '50% 50% 20% 20%' }}
      />
      {/* Pine trees (day - green) */}
      <PineTree left="62%" height={18} color="#2d8f3e" dark={isDark} />
      <PineTree left="70%" height={14} color="#34a048" dark={isDark} />
      <PineTree left="77%" height={20} color="#28883a" dark={isDark} />
      <PineTree left="84%" height={16} color="#2f9644" dark={isDark} />
      <PineTree left="90%" height={17} color="#2a8d3c" dark={isDark} />

      {/* ==== NIGHT ELEMENTS (faded in at night) ==== */}
      {/* Stars */}
      <span className="absolute top-2 left-[35%] w-0.5 h-0.5 rounded-full bg-yellow-200 transition-opacity duration-500" style={{ opacity: isDark ? 0.9 : 0, boxShadow: '0 0 3px #fde68a' }} />
      <span className="absolute top-3 left-[48%] w-0.5 h-0.5 rounded-full bg-yellow-100 transition-opacity duration-500" style={{ opacity: isDark ? 0.7 : 0, boxShadow: '0 0 2px #fef3c7' }} />
      <span className="absolute top-1.5 left-[60%] w-0.5 h-0.5 rounded-full bg-yellow-200 transition-opacity duration-500" style={{ opacity: isDark ? 0.8 : 0, boxShadow: '0 0 3px #fde68a' }} />
      <span className="absolute top-4 left-[70%] w-0.5 h-0.5 rounded-full bg-yellow-100 transition-opacity duration-500" style={{ opacity: isDark ? 0.6 : 0 }} />
      <span className="absolute top-2.5 right-[45%] w-0.5 h-0.5 rounded-full bg-amber-200 transition-opacity duration-500" style={{ opacity: isDark ? 0.9 : 0, boxShadow: '0 0 4px #fbbf24' }} />
      <span className="absolute top-5 left-[42%] w-0.5 h-0.5 rounded-full bg-yellow-100 transition-opacity duration-500" style={{ opacity: isDark ? 0.5 : 0 }} />
      {/* Orange moon (on the left in night mode) */}
      <span
        className="absolute top-1/2 -translate-y-1/2 w-[30px] h-[30px] rounded-full transition-opacity duration-500"
        style={{
          left: '6px',
          opacity: isDark ? 1 : 0,
          background: 'radial-gradient(circle at 35% 35%, #ffcc66 0%, #ff9933 40%, #e6731a 75%, #c55a0f 100%)',
          boxShadow: '0 0 18px rgba(255,150,50,0.7), 0 0 32px rgba(255,120,30,0.35)',
        }}
      >
        {/* Moon craters */}
        <span className="absolute top-2 left-3 w-2 h-2 rounded-full bg-orange-700/30" />
        <span className="absolute top-4 left-6 w-1.5 h-1.5 rounded-full bg-orange-800/25" />
        <span className="absolute top-6 left-4 w-2.5 h-2.5 rounded-full bg-orange-700/20" />
      </span>
      {/* Small night cloud near moon */}
      <span className="absolute top-4 left-9 w-8 h-2 rounded-full bg-white/25 transition-opacity duration-500" style={{ opacity: isDark ? 1 : 0 }} />
      <span className="absolute top-5.5 left-7 w-5 h-1.5 rounded-full bg-white/20 transition-opacity duration-500" style={{ opacity: isDark ? 0.8 : 0 }} />
      {/* Dark tree silhouettes (night) */}
      <span
        className="absolute bottom-0 left-0 right-0 h-[22px] transition-opacity duration-500"
        style={{
          opacity: isDark ? 1 : 0,
          background: '#050212',
          clipPath: 'polygon(0 100%, 0 40%, 4% 25%, 7% 50%, 10% 15%, 13% 45%, 16% 20%, 19% 40%, 23% 10%, 26% 35%, 30% 20%, 34% 42%, 38% 18%, 42% 38%, 46% 25%, 50% 45%, 54% 22%, 58% 40%, 62% 15%, 66% 38%, 70% 28%, 100% 30%, 100% 100%)',
        }}
      />

      {/* ==== SLIDING WHITE KNOB ==== */}
      <motion.span
        animate={{ left: isDark ? 'calc(100% - 36px)' : '4px' }}
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        className="absolute top-[4px] w-[34px] h-[34px] rounded-full z-10"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #f0f0f5 60%, #d8d8e2 100%)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.5) inset, -2px -2px 6px rgba(255,255,255,0.8) inset',
        }}
      />
    </button>
  );
};

/* Small pine tree element for the day scene */
const PineTree: React.FC<{ left: string; height: number; color: string; dark: boolean }> = ({ left, height, color, dark }) => (
  <span
    className="absolute bottom-[8px] transition-opacity duration-500"
    style={{
      left,
      opacity: dark ? 0 : 1,
      width: `${height * 0.6}px`,
      height: `${height}px`,
    }}
  >
    {/* Trunk */}
    <span
      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[3px] rounded-sm"
      style={{ height: `${height * 0.25}px`, background: '#5c3a1e' }}
    />
    {/* Tree layers (triangles) */}
    <span
      className="absolute left-1/2 -translate-x-1/2 rounded-sm"
      style={{
        bottom: `${height * 0.2}px`,
        width: 0,
        height: 0,
        borderLeft: `${height * 0.3}px solid transparent`,
        borderRight: `${height * 0.3}px solid transparent`,
        borderBottom: `${height * 0.35}px solid ${color}`,
      }}
    />
    <span
      className="absolute left-1/2 -translate-x-1/2 rounded-sm"
      style={{
        bottom: `${height * 0.4}px`,
        width: 0,
        height: 0,
        borderLeft: `${height * 0.25}px solid transparent`,
        borderRight: `${height * 0.25}px solid transparent`,
        borderBottom: `${height * 0.35}px solid ${color}`,
        filter: 'brightness(1.1)',
      }}
    />
    <span
      className="absolute left-1/2 -translate-x-1/2 rounded-sm"
      style={{
        bottom: `${height * 0.6}px`,
        width: 0,
        height: 0,
        borderLeft: `${height * 0.2}px solid transparent`,
        borderRight: `${height * 0.2}px solid transparent`,
        borderBottom: `${height * 0.3}px solid ${color}`,
        filter: 'brightness(1.15)',
      }}
    />
  </span>
);

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  currentPage,
  onNavigate,
  onToggleTheme,
}) => {
  const { data } = useContent();
  const { isLoggedIn, profile } = useUser();
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

          {/* Profile Button */}
          <a
            {...linkProps(pathForPage('profile'), () => go('profile'))}
            aria-label="پروفایل کاربری"
            title={profile ? `پروفایل ${profile.fullName}` : 'ورود / ثبت‌نام'}
            className={`w-10 h-10 rounded-full grid place-items-center shrink-0 transition-all cursor-pointer ${
              currentPage === 'profile'
                ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)]'
                : 'nd-glass text-[color:var(--nd-muted)] hover:text-[color:var(--nd-accent)]'
            } ${isLoggedIn ? 'ring-2 ring-[color:var(--nd-accent)]/30' : ''}`}
          >
            <User className="w-4.5 h-4.5" />
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
            <a {...linkProps(pathForPage('profile'), () => go('profile'))} className="nd-btn nd-btn-accent w-full py-3.5 text-sm mt-2">
              <span>{isLoggedIn ? 'پروفایل من' : 'ورود / ثبت‌نام'}</span>
              <User className="w-4 h-4" />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
