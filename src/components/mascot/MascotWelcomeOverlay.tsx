import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Theme } from '../../types';
import { soulJourney } from './soul';
import { useStaticMediaMode } from './useStaticMediaMode';

interface MascotWelcomeOverlayProps {
  theme?: Theme;
  onComplete?: (name: string) => void;
}

const NAME_KEY = 'nd-mascot-name';

// 64 meticulously-staggered celestial particles:
// Clusters with orbital dispersal, slow-motion trajectories, and neon halos
const STAGGERED_PARTICLES = Array.from({ length: 64 }, (_, i) => {
  const ring = Math.floor(i / 16); // 4 concentric dispersal rings
  const angle = ((i % 16) / 16) * Math.PI * 2 + ring * 0.25;
  const radialDist = 28 + ring * 32 + (i % 5) * 6;
  const initX = Math.cos(angle) * radialDist;
  const initY = Math.sin(angle) * radialDist;
  const midArcX = initX * 1.6 + (i % 2 === 0 ? 55 : -45);
  const midArcY = initY * 1.6 - 70; // majestic parabolic upward arc

  const size = 3 + (i % 5) * 1.8; // 3px to 10.2px
  // Refined staggered delays across 0.0s to 0.75s for a seamless slow-motion river
  const delay = ((i * 19) % 64) * 0.012; 
  const duration = 2.1 + (i % 6) * 0.18; // smooth duration variance

  const colors = [
    '#38bdf8', // radiant cyan
    '#818cf8', // celestial indigo
    '#60a5fa', // vibrant cobalt
    '#c084fc', // ethereal purple
    '#f472b6', // soft magenta
    '#2dd4bf', // glowing mint
    '#fbbf24', // golden stardust accent
  ];
  const color = colors[i % colors.length];

  return {
    id: i,
    initX,
    initY,
    midArcX,
    midArcY,
    size,
    delay,
    duration,
    color,
  };
});

export function MascotWelcomeOverlay({ theme = 'dark', onComplete }: MascotWelcomeOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDissolving, setIsDissolving] = useState(false);
  const [userName, setUserName] = useState('');
  const [existingName, setExistingName] = useState<string | null>(null);
  const [greetingText, setGreetingText] = useState('');
  const [subText, setSubText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  // Touch / reduced-motion / Save-Data / 2G → static WebP instead of the MP4.
  const staticMode = useStaticMediaMode();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate target position for bottom-right corner mascot
  const [targetCorner, setTargetCorner] = useState({ x: 320, y: 360 });

  useEffect(() => {
    const updateTarget = () => {
      if (typeof window !== 'undefined') {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Mascot avatar lives at bottom-right corner: right ~20px, bottom ~16px
        // Relative to center coordinates:
        const destX = vw / 2 - 56;
        const destY = vh / 2 - 56;
        setTargetCorner({ x: destX, y: destY });
      }
    };
    updateTarget();
    window.addEventListener('resize', updateTarget);
    return () => window.removeEventListener('resize', updateTarget);
  }, []);

  // Persian time of day and greeting
  const getDaypartGreeting = (name?: string) => {
    const h = new Date().getHours();
    let timeWord = 'شبت بخیر';
    let timeLabel = 'شب';

    if (h >= 5 && h < 12) {
      timeWord = 'صبحت بخیر';
      timeLabel = 'صبح';
    } else if (h >= 12 && h < 15) {
      timeWord = 'ظهرت بخیر';
      timeLabel = 'ظهر';
    } else if (h >= 15 && h < 19) {
      timeWord = 'عصرت بخیر';
      timeLabel = 'عصر';
    }

    if (name) {
      return {
        title: `سلام ${name}، ${timeWord}!`,
        subtitle: `حالت چطوره؟ امروز میتونم چه کمکی بهت بکنم؟`,
        timeLabel,
      };
    }

    return {
      title: `سلام، ${timeWord}!`,
      subtitle: `من دستیار و مسکات هوشمند سایت امید عدلی‌ام. خوشحال می‌شم اسمت رو بدونم تا با هم آشنا بشیم.`,
      timeLabel,
    };
  };

  /**
   * High-End Slow-Motion Particle Metamorphosis:
   * 1. Trigger isDissolving: Central stage dematerializes into an ethereal plasma shockwave.
   * 2. 64 staggered stardust particles arc into the bottom-right corner.
   * 3. Ambient atmospheric veil dissolves gently in 2.6s, unveiling the live site.
   * 4. As the stream converges into the corner, the mascot awakens with a graceful wave.
   */
  const startCinematicDissolve = (nameToPass: string) => {
    if (isDissolving) return;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    setIsDissolving(true);

    // Give full 2.6s for the ultra smooth slow-motion particle trajectory & site reveal
    finishTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsDissolving(false);
      soulJourney({ pose: 'wave', hold: 3.5, then: 'idle' });
      onComplete?.(nameToPass);
    }, 2600);
  };

  useEffect(() => {
    let savedName = '';
    try {
      savedName = (localStorage.getItem(NAME_KEY) || '').trim();
    } catch {
      /* private mode */
    }

    if (savedName) {
      // Returning visitor: exactly 4.0 seconds cinematic presentation, then slow-mo dissolve
      setExistingName(savedName);
      const greeting = getDaypartGreeting(savedName);
      setGreetingText(greeting.title);
      setSubText(greeting.subtitle);
      setIsOpen(true);

      autoCloseTimerRef.current = setTimeout(() => {
        startCinematicDissolve(savedName);
      }, 4000);
    } else {
      // First-time visitor: prompts user for name
      setExistingName(null);
      const greeting = getDaypartGreeting();
      setGreetingText(greeting.title);
      setSubText(greeting.subtitle);
      setIsOpen(true);
    }

    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    };
  }, []);

  // Listen for explicit manual reopen requests (e.g. from footer, navbar, or mascot interaction)
  useEffect(() => {
    const handleOpen = () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
      setIsDissolving(false);

      let savedName = '';
      try {
        savedName = (localStorage.getItem(NAME_KEY) || '').trim();
      } catch {
        /* private mode */
      }
      if (savedName) {
        setExistingName(savedName);
        const greeting = getDaypartGreeting(savedName);
        setGreetingText(greeting.title);
        setSubText(greeting.subtitle);
        setIsOpen(true);
        autoCloseTimerRef.current = setTimeout(() => {
          startCinematicDissolve(savedName);
        }, 4000);
      } else {
        setExistingName(null);
        const greeting = getDaypartGreeting();
        setGreetingText(greeting.title);
        setSubText(greeting.subtitle);
        setIsOpen(true);
      }
    };

    window.addEventListener('nd:open-welcome', handleOpen);
    return () => window.removeEventListener('nd:open-welcome', handleOpen);
  }, []);

  useEffect(() => {
    if (isOpen && !existingName) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isOpen, existingName]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = userName.trim().slice(0, 24);
    if (!clean) return;

    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);

    setIsSubmitting(true);

    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      /* private mode */
    }

    window.dispatchEvent(new CustomEvent('nd:mascot-name', { detail: clean }));
    soulJourney({ pose: 'excited', hold: 3.5, then: 'happy' });

    const greeting = getDaypartGreeting(clean);
    setExistingName(clean);
    setGreetingText(greeting.title);
    setSubText(greeting.subtitle);

    setTimeout(() => {
      startCinematicDissolve(clean);
    }, 1200);
  };

  const handleDismissNow = () => {
    startCinematicDissolve(existingName || '');
  };

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 overflow-hidden cursor-default"
          dir="rtl"
        >
          {/* Ethereal background veil — slow dissolves like mist to unveil real site */}
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{
              opacity: isDissolving ? 0 : 1,
              backdropFilter: isDissolving ? 'blur(0px)' : 'blur(28px)',
            }}
            transition={{
              duration: isDissolving ? 2.6 : 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={handleDismissNow}
            className={`fixed inset-0 cursor-pointer ${
              isDark
                ? 'bg-black/85'
                : 'bg-slate-900/75'
            }`}
          />

          {/* Ethereal Ambient Glow Orbs floating in slow motion */}
          <motion.div
            animate={{
              opacity: isDissolving ? 0 : 0.65,
              scale: isDissolving ? 0.2 : 1,
              x: isDissolving ? targetCorner.x : 0,
              y: isDissolving ? targetCorner.y : 0,
            }}
            transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-1/4 -right-16 w-80 h-80 bg-blue-500/25 rounded-full blur-[110px] pointer-events-none"
          />
          <motion.div
            animate={{
              opacity: isDissolving ? 0 : 0.65,
              scale: isDissolving ? 0.2 : 1,
              x: isDissolving ? targetCorner.x : 0,
              y: isDissolving ? targetCorner.y : 0,
            }}
            transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-1/4 -left-16 w-80 h-80 bg-cyan-500/25 rounded-full blur-[110px] pointer-events-none"
          />

          {/* HIGH-END STAGGERED PARTICLES: Slow-motion stream into bottom-right corner mascot */}
          {isDissolving && (
            <div className="fixed inset-0 pointer-events-none z-[130] flex items-center justify-center">
              {STAGGERED_PARTICLES.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{
                    x: p.initX,
                    y: p.initY,
                    scale: 0.6,
                    opacity: 0,
                  }}
                  animate={{
                    // 3-point parabolic keyframes for an organic curving comet flight
                    x: [p.initX, p.initX + p.midArcX * 0.45, targetCorner.x + ((p.id % 7) - 3) * 6],
                    y: [p.initY, p.initY + p.midArcY * 0.55, targetCorner.y + ((p.id % 5) - 2) * 6],
                    scale: [0.6, 1.4, 0.25],
                    opacity: [0, 1, 0.9, 0],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    ease: [0.25, 0.1, 0.25, 1], // cinematic cubic-bezier
                    times: [0, 0.35, 1],
                  }}
                  style={{
                    position: 'absolute',
                    width: p.size,
                    height: p.size,
                    borderRadius: '9999px',
                    backgroundColor: p.color,
                    boxShadow: `0 0 ${p.size * 2.5}px ${p.color}, 0 0 ${p.size * 5}px ${p.color}`,
                  }}
                />
              ))}

              {/* Central ethereal plasma shockwave */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0.95 }}
                animate={{
                  scale: [0.7, 1.45, 0],
                  opacity: [0.95, 0.35, 0],
                }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                className="absolute w-52 h-52 rounded-full bg-gradient-to-tr from-cyan-400/40 via-indigo-500/35 to-transparent blur-2xl"
              />

              {/* Target Corner Beacon Ring (lights up as particles converge) */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1.3, 0.9],
                  opacity: [0, 0.85, 0],
                }}
                transition={{ duration: 1.3, delay: 1.0, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  transform: `translate(${targetCorner.x}px, ${targetCorner.y}px)`,
                }}
                className="w-24 h-24 -ml-12 -mt-12 rounded-full border-2 border-cyan-400/80 shadow-[0_0_30px_rgba(56,189,248,0.7)] blur-xs pointer-events-none"
              />
            </div>
          )}

          {/* The Welcome Card (Metamorphosis into stardust) — filter/blur tweens
              are skipped in static mode (touch / reduced-motion): MotionConfig
              strips the transforms, this drops the expensive blur repaints. */}
          <motion.div
            initial={staticMode ? { opacity: 0 } : { scale: 0.92, y: 20, opacity: 0, filter: 'blur(12px)' }}
            animate={
              staticMode
                ? { opacity: isDissolving ? 0 : 1 }
                : {
                    scale: isDissolving ? 0.6 : 1,
                    x: isDissolving ? targetCorner.x * 0.42 : 0,
                    y: isDissolving ? targetCorner.y * 0.42 : 0,
                    opacity: isDissolving ? 0 : 1,
                    filter: isDissolving ? 'blur(26px)' : 'blur(0px)',
                  }
            }
            transition={{
              duration: isDissolving ? 1.6 : 0.65,
              ease: isDissolving ? [0.32, 0, 0.67, 0] : [0.16, 1, 0.3, 1],
            }}
            className={`relative z-10 w-full max-w-sm sm:max-w-md my-auto overflow-hidden rounded-2xl sm:rounded-3xl border shadow-2xl transition-all ${
              isDark
                ? 'bg-gradient-to-b from-[#111827]/95 via-[#0b0f19]/98 to-[#06080e]/98 border-white/10 text-white shadow-blue-500/10'
                : 'bg-gradient-to-b from-white/98 via-slate-50/98 to-slate-100/98 border-slate-200/90 text-slate-800 shadow-indigo-500/10'
            }`}
          >
            {/* Top decorative gradient bar + exact 4.0-second countdown indicator */}
            <div className="relative h-1 w-full bg-slate-800/40 overflow-hidden">
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: existingName ? '0%' : '100%' }}
                transition={{ duration: existingName ? 4.0 : 0.4, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500"
              />
            </div>

            {/* Close / Skip button */}
            <button
              onClick={handleDismissNow}
              className={`absolute top-3 left-3 p-1.5 sm:p-2 rounded-full transition-all duration-200 z-20 cursor-pointer ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                  : 'bg-slate-200/70 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title="ورود به وب‌سایت"
              aria-label="بستن"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-4 sm:p-6 flex flex-col items-center text-center">
              {/* Compact Video Spotlight Portal */}
              <div className="relative mb-3 sm:mb-4">
                <div className="absolute -inset-2 bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 rounded-2xl blur-md opacity-40 animate-pulse-glow" />

                <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-slate-950 flex items-center justify-center">
                  {staticMode ? (
                    <img
                      src="/mascot/confident.webp"
                      alt=""
                      width={640}
                      height={698}
                      decoding="async"
                      onLoad={() => setVideoReady(true)}
                      className={`w-full h-full object-cover object-center transition-all duration-500 ${
                        videoReady ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      }`}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src="/mascot/confident.mp4"
                      poster="/mascot/confident.webp"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      onCanPlay={() => setVideoReady(true)}
                      className={`w-full h-full object-cover object-center transition-all duration-500 ${
                        videoReady ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      }`}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-white/10 pointer-events-none" />
                </div>

                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white shadow-md border border-white/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>دستیار هوشمند پرفورمنس مارکتینگ</span>
                </div>
              </div>

              {/* Dynamic Greetings */}
              <div className="mt-2 space-y-1 sm:space-y-1.5 max-w-sm px-1">
                <motion.h2
                  key={greetingText}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-lg sm:text-xl font-black tracking-tight ${
                    isDark
                      ? 'bg-gradient-to-r from-white via-slate-100 to-slate-200 bg-clip-text text-transparent'
                      : 'text-slate-900'
                  }`}
                >
                  {greetingText}
                </motion.h2>

                <motion.p
                  key={subText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className={`text-xs sm:text-sm leading-relaxed font-normal ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {subText}
                </motion.p>
              </div>

              {/* Form / Actions */}
              <div className="w-full mt-4">
                {!existingName ? (
                  /* First-time visitor: Ask for Name */
                  <form onSubmit={handleSaveName} className="space-y-3 max-w-xs mx-auto">
                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="نام یا نام خانوادگی‌ات رو بنویس..."
                        maxLength={24}
                        disabled={isSubmitting}
                        className={`w-full px-3.5 py-2.5 sm:py-3 rounded-xl text-center text-base font-semibold transition-all duration-200 outline-none border ${
                          isDark
                            ? 'bg-white/5 border-white/15 text-white placeholder-white/40 focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-500/20'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'
                        }`}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="submit"
                        disabled={!userName.trim() || isSubmitting}
                        className={`w-full py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                          !userName.trim() || isSubmitting
                            ? 'opacity-40 cursor-not-allowed bg-slate-700 text-white/50'
                            : 'glow-btn-cyan text-white shadow-md shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                        }`}
                      >
                        {isSubmitting ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>آشنایی و ورود</span>
                            <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDismissNow}
                        className={`w-full py-1.5 px-3 rounded-lg text-[11px] sm:text-xs font-medium transition-colors cursor-pointer ${
                          isDark
                            ? 'text-white/50 hover:text-white hover:bg-white/5'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                        }`}
                      >
                        فعلاً رد شو
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Returning visitor: Smooth Entry Action */
                  <div className="space-y-3 max-w-xs mx-auto">
                    <button
                      type="button"
                      onClick={handleDismissNow}
                      className="w-full py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm glow-btn-cyan text-white shadow-md shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>ورود مستقیم به سایت</span>
                      <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>

                    <div className="flex items-center justify-center gap-1.5 text-[11px] opacity-70">
                      <span>کاربر گرامی: «{existingName}»</span>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                          setExistingName(null);
                          setUserName('');
                          setTimeout(() => inputRef.current?.focus(), 150);
                        }}
                        className="underline hover:text-cyan-400 transition-colors cursor-pointer"
                      >
                        تغییر نام
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Compact Quick Highlights */}
              <div className="mt-4 pt-3.5 w-full border-t border-white/10 grid grid-cols-3 gap-1.5 text-center text-[10px] sm:text-[11px]">
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-slate-100/70'}`}>
                  <span className="block font-bold text-cyan-400">مشاوره رشد</span>
                  <span className="opacity-60 text-[9px] sm:text-[10px]">پاسخ به سوالات</span>
                </div>
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-slate-100/70'}`}>
                  <span className="block font-bold text-blue-400">مارکتینگ</span>
                  <span className="opacity-60 text-[9px] sm:text-[10px]">بهینه‌سازی نرخ تبدیل</span>
                </div>
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-slate-100/70'}`}>
                  <span className="block font-bold text-indigo-400">رزرو جلسه</span>
                  <span className="opacity-60 text-[9px] sm:text-[10px]">همکاری مستقیم</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
