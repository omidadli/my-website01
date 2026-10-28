import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles, Volume2, VolumeX, CheckCircle2 } from 'lucide-react';
import { Theme } from '../../types';

interface CinematicWelcomeModalProps {
  isOpen: boolean;
  theme: Theme;
  onComplete: (name: string) => void;
  onSkip: () => void;
}

/**
 * Returns Persian greeting corresponding to time of day.
 */
export function getTimeGreet(): { label: string; period: string; greetingText: string } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) {
    return { label: 'صبح', period: 'morning', greetingText: 'صبحت بخیر' };
  }
  if (h >= 12 && h < 15) {
    return { label: 'ظهر', period: 'noon', greetingText: 'ظهرت بخیر' };
  }
  if (h >= 15 && h < 19) {
    return { label: 'عصر', period: 'afternoon', greetingText: 'عصرت بخیر' };
  }
  return { label: 'شب', period: 'night', greetingText: 'شبت بخیر' };
}

/**
 * Cinematic Welcome & Waiting Experience.
 * Uses the mascot's signature confident.mp4 clip (putting on sunglasses & arms crossed)
 * with glassmorphism, animated ambient lighting, and greeting workflow.
 */
export const CinematicWelcomeModal: React.FC<CinematicWelcomeModalProps> = ({
  isOpen,
  theme,
  onComplete,
  onSkip,
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [step, setStep] = useState<'welcome' | 'done'>('welcome');
  const [savedName, setSavedName] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeInfo = getTimeGreet();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Auto focus input on mount after animation settles
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 700);
      return () => {
        document.body.style.overflow = '';
        clearTimeout(t);
      };
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = name.trim().slice(0, 24);
    if (!clean) {
      setError('لطفاً اسمت رو وارد کن تا بتونم درست صدات کنم.');
      inputRef.current?.focus();
      return;
    }
    setError('');
    setIsSubmitting(true);
    setSavedName(clean);

    // Save to localStorage and dispatch custom event for site mascot sync
    try {
      localStorage.setItem('nd-mascot-name', clean);
      localStorage.setItem('nd-mascot-v6', '1');
      localStorage.removeItem('nd-mascot-skip');
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent('nd:mascot-name', { detail: clean }));

    // Show celebratory confirmation beat
    setTimeout(() => {
      setStep('done');
      setTimeout(() => {
        onComplete(clean);
      }, 2100);
    }, 450);
  };

  const handleSkip = () => {
    try {
      localStorage.setItem('nd-mascot-skip', '1');
      localStorage.setItem('nd-mascot-v6', '1');
    } catch {
      /* private mode */
    }
    onSkip();
  };

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      <motion.div
        key="cinematic-waiting-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at 50% 35%, rgba(20, 21, 38, 0.94) 0%, rgba(8, 9, 15, 0.98) 100%)'
            : 'radial-gradient(ellipse at 50% 35%, rgba(245, 246, 252, 0.94) 0%, rgba(225, 228, 240, 0.98) 100%)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
        }}
      >
        {/* Ambient atmospheric glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-1/4 -right-20 w-96 h-96 rounded-full blur-3xl opacity-30 animate-pulse-glow"
            style={{ background: 'linear-gradient(135deg, #6366f1, #38bdf8)' }}
          />
          <div
            className="absolute bottom-1/4 -left-20 w-96 h-96 rounded-full blur-3xl opacity-25 animate-float"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          />
          <div
            className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Skip button at top corner */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
          <button
            onClick={handleSkip}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100"
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
              color: isDark ? '#cbd5e1' : '#475569',
            }}
          >
            <span>رد کردن و ورود به سایت</span>
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>

        {/* Main Glass Stage Card */}
        <motion.div
          initial={{ scale: 0.92, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 16, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-2xl z-10"
          style={{
            background: isDark
              ? 'linear-gradient(145deg, rgba(30, 32, 54, 0.75), rgba(16, 17, 30, 0.85))'
              : 'linear-gradient(145deg, rgba(255, 255, 255, 0.85), rgba(240, 242, 250, 0.9))',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(255, 255, 255, 0.95)',
            boxShadow: isDark
              ? '0 30px 80px rgba(0, 0, 0, 0.65), 0 0 40px rgba(99, 102, 241, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
              : '0 30px 80px rgba(100, 110, 180, 0.25), 0 0 30px rgba(99, 102, 241, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 items-center">
            {/* Left: Video Mascot Visual Theater */}
            <div className="md:col-span-6 relative flex flex-col items-center justify-center p-6 sm:p-10 order-1 md:order-2">
              {/* Radial spotlight behind video */}
              <div
                className="absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: isDark
                    ? 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, rgba(14, 165, 233, 0.15) 60%, transparent 80%)'
                    : 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(244, 114, 182, 0.15) 60%, transparent 80%)',
                }}
              />

              {/* Video container framed as cinematic portrait */}
              <div
                className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-2xl transition-transform duration-700 hover:scale-[1.02]"
                style={{
                  background: isDark ? '#111222' : '#ffffff',
                  border: isDark ? '2px solid rgba(255, 255, 255, 0.18)' : '2px solid rgba(255, 255, 255, 0.85)',
                  boxShadow: isDark
                    ? '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 2px rgba(255, 255, 255, 0.3)'
                    : '0 20px 40px rgba(79, 70, 229, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.9)',
                }}
              >
                <video
                  ref={videoRef}
                  src="/mascot/confident.mp4"
                  poster="/mascot/confident.webp"
                  playsInline
                  autoPlay
                  loop
                  muted={isMuted}
                  onLoadedData={() => setVideoLoaded(true)}
                  className="w-full h-full object-cover object-center"
                />

                {/* Film grain / specular vignette */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    boxShadow: 'inset 0 0 24px rgba(0, 0, 0, 0.3)',
                    background:
                      'linear-gradient(180deg, transparent 75%, rgba(0, 0, 0, 0.35) 100%)',
                  }}
                />

                {/* Mute toggle button */}
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className="absolute bottom-2.5 left-2.5 p-1.5 rounded-full backdrop-blur-md transition-all duration-200 cursor-pointer"
                  style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    color: '#f8fafc',
                  }}
                  title={isMuted ? 'فعال‌سازی صدا' : 'قطع صدا'}
                  aria-label="تغییر وضعیت صدا"
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>

                {/* Live Mascot Badge */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white backdrop-blur-md bg-black/40 border border-white/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>دستیار هوشمند</span>
                </div>
              </div>

              {/* Character title tagline below video */}
              <div className="mt-4 text-center">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
                  style={{
                    background: isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.1)',
                    color: isDark ? '#a5b4fc' : '#4f46e5',
                    border: isDark ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(99, 102, 241, 0.2)',
                  }}
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  منتور پرفورمنس مارکتینگ و بهینه‌سازی CRO
                </span>
              </div>
            </div>

            {/* Right: Interactive Dialogue & Name Request */}
            <div className="md:col-span-6 p-6 sm:p-10 order-2 md:order-1 flex flex-col justify-center text-right">
              <AnimatePresence mode="wait">
                {step === 'welcome' ? (
                  <motion.div
                    key="dialogue-form"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.4 }}
                  >
                    {/* Time of day pill */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
                      style={{
                        background: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
                        color: isDark ? '#94a3b8' : '#64748b',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                      <span>{timeInfo.greetingText}! وقت {timeInfo.label} بخیر</span>
                    </div>

                    {/* Headline */}
                    <h2
                      className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-snug mb-3"
                      style={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                    >
                      سلام، خیلی خوش اومدی!
                    </h2>

                    <p
                      className="text-sm sm:text-base leading-relaxed mb-6 font-normal"
                      style={{ color: isDark ? '#cbd5e1' : '#475569' }}
                    >
                      من مسکات و همراه هوشمند امید عدلی‌ام. برای این‌که در طول حضورت در سایت بهتر بشناسمت و بتونم راهنماییت کنم،
                      <span className="font-bold text-indigo-400 mx-1">
                        اسمت چیه؟
                      </span>
                      دوست دارم درست و به اسمت صدات کنم.
                    </p>

                    {/* Name Input Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (error) setError('');
                          }}
                          placeholder="مثلاً: سارا، علی، مریم..."
                          maxLength={24}
                          disabled={isSubmitting}
                          aria-label="نام شما"
                          className="w-full px-5 py-3.5 rounded-2xl text-base font-bold text-right outline-none transition-all duration-300"
                          style={{
                            background: isDark ? 'rgba(15, 17, 30, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                            border: error
                              ? '2px solid #ef4444'
                              : isDark
                              ? '1.5px solid rgba(255, 255, 255, 0.16)'
                              : '1.5px solid rgba(99, 102, 241, 0.25)',
                            color: isDark ? '#f8fafc' : '#0f172a',
                            boxShadow: isDark
                              ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4)'
                              : 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
                          }}
                        />
                      </div>

                      {error && (
                        <p className="text-xs text-rose-500 font-bold px-1 text-right animate-pulse">
                          {error}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-1 py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base text-white shadow-lg cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                          style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 50%, #0284c7 100%)',
                            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.5)',
                          }}
                        >
                          <span>آشنایی و ورود به سایت</span>
                          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
                        </button>

                        <button
                          type="button"
                          onClick={handleSkip}
                          disabled={isSubmitting}
                          className="px-4 py-3.5 rounded-2xl font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer"
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                            color: isDark ? '#94a3b8' : '#64748b',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
                          }}
                        >
                          فعلاً بعداً
                        </button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div
                    key="dialogue-done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="py-6 text-center md:text-right"
                  >
                    <div className="inline-flex p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3
                      className="text-2xl sm:text-3xl font-black mb-2"
                      style={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                    >
                      سلام {savedName} عزیز، {timeInfo.greetingText}!
                    </h3>
                    <p
                      className="text-sm sm:text-base leading-relaxed font-medium mb-4"
                      style={{ color: isDark ? '#cbd5e1' : '#475569' }}
                    >
                      حالت چطوره؟ امروز چه کمکی از دستم برمیاد؟
                      <br />
                      هر زمان سوالی درباره پرفورمنس مارکتینگ، CRO یا پروژه‌هات داشتی، گوشه صفحه منتظرتم!
                    </p>
                    <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-indigo-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                      <span>در حال انتقال به صفحه اصلی سایت...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
