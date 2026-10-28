import React, { useState, useEffect, useRef } from 'react';
import { Theme, Page } from '../types';
import { useContent } from '../context/ContentContext';
import { EditableText } from './cms/EditableText';
import { ArrowUpLeft, FileText, CheckCircle2, Sparkles, ChevronRight, ChevronLeft, Pause, Play, Target, Rocket, BarChart3, Search } from 'lucide-react';

interface SlideItem {
  id: string;
  badgePath: string;
  badge: string;
  icon: React.ReactNode;
  title1Path: string;
  titlePart1: string;
  title2Path: string;
  titlePart2: string;
  descPath: string;
  description: string;
  primaryCtaText: string;
  primaryCtaType: 'contact' | 'services' | 'portfolio' | 'about';
  secondaryCtaText: string;
  secondaryCtaType: 'resume' | 'portfolio' | 'services' | 'about';
  badges: string[];
  gradientTheme: string;
}

interface HeroSliderProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  onOpenResume: () => void;
}

export const HeroSlider: React.FC<HeroSliderProps> = ({ theme, onNavigate, onOpenResume }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const personal = data.PERSONAL_INFO;

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const slides: SlideItem[] = [
    {
      id: 'main',
      badgePath: 'PERSONAL_INFO.title',
      badge: 'متخصص دیجیتال مارکتینگ و بهینه‌سازی نرخ تبدیل',
      icon: <Rocket className="w-4 h-4 text-[#2563eb]" />,
      title1Path: 'PERSONAL_INFO.name',
      titlePart1: 'کمپین‌های تبلیغاتی‌تون واقعاً مشتری میارن یا',
      title2Path: 'PERSONAL_INFO.experienceYears',
      titlePart2: 'فقط پول خرج می‌کنن؟',
      descPath: 'PERSONAL_INFO.bio',
      description: 'من امید عدلی‌ام. کمک می‌کنم کسب‌وکارها تبلیغاتشون رو هدفمند کنن، نرخ تبدیل سایتشون رو بالا ببرن و از هر هزینه‌ای که برای بازاریابی می‌کنن، نتیجه‌ی واقعی بگیرن.',
      primaryCtaText: 'رزرو جلسه بررسی رایگان',
      primaryCtaType: 'contact',
      secondaryCtaText: 'دیدن نمونه‌کارها',
      secondaryCtaType: 'portfolio',
      badges: ['۵+ سال تجربه عملیاتی', '+۵۰ کمپین موفق', '۳.۵٪ میانگین CTR ارتقایافته', 'گزارش‌دهی شفاف و داده‌محور'],
      gradientTheme: 'from-[#2563eb] via-[#3b82f6] to-[#5ce1e6]'
    },
    {
      id: 'cro',
      badgePath: 'BUSINESS_ANALYSIS_DATA.headline',
      badge: 'بهینه‌سازی نرخ تبدیل (CRO) & تحلیل مسیر خرید',
      icon: <Target className="w-4 h-4 text-[#2563eb]" />,
      title1Path: 'BUSINESS_ANALYSIS_DATA.headline',
      titlePart1: 'کاهش ریزش کاربران در',
      title2Path: 'PERSONAL_INFO.campaignsCount',
      titlePart2: 'مسیر خرید و رزرو آنلاین',
      descPath: 'BUSINESS_ANALYSIS_DATA.subheadline',
      description: 'شناسایی دقیق نقاط افت کاربران با ابزارهای تحلیلی و تست‌های A/B تا بازدیدکننده بیشتری به مشتری تبدیل شود.',
      primaryCtaText: 'درخواست آنالیز Funnel',
      primaryCtaType: 'contact',
      secondaryCtaText: 'مشاهده خدمات',
      secondaryCtaType: 'services',
      badges: ['کاهش Drop-off در مسیر خرید', 'اجرای موفق تست‌های A/B', 'تحلیل رفتار کاربر با ابزارهای روز'],
      gradientTheme: 'from-[#1d4ed8] via-[#2563eb] to-[#3b82f6]'
    }
  ];

  // Auto-slide effect
  useEffect(() => {
    if (!isPlaying || isHovered) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isPlaying, isHovered, slides.length]);

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext(); // swipe left (next in RTL)
      else handlePrev(); // swipe right (prev in RTL)
    }
    touchStartX.current = null;
  };

  const activeSlide = slides[currentSlide];

  const handlePrimaryCta = (type: SlideItem['primaryCtaType']) => {
    onNavigate(type);
  };

  const handleSecondaryCta = (type: SlideItem['secondaryCtaType']) => {
    if (type === 'resume') {
      onOpenResume();
    } else {
      onNavigate(type);
    }
  };

  return (
    <div 
      className="relative space-y-5 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Slider Navigation Header / Indicators */}
      <div className="flex items-center justify-between gap-3">
        {/* Category Badge pill with icon */}
        <div 
          key={`badge-${activeSlide.id}`}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-xl transition-all duration-500 animate-fadeIn ${
            isDark 
              ? 'bg-white/10 border-[#3b82f6]/40 text-[#60a5fa]' 
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}
        >
          {activeSlide.icon}
          <span className="text-[11px] sm:text-xs font-black tracking-wide">{activeSlide.badge}</span>
        </div>
      </div>

      {/* Main Slide Content Wrapper */}
      <div className="min-h-[210px] sm:min-h-[230px] flex flex-col justify-center space-y-3.5">
        {/* Main Headline */}
        <h1 
          key={`title-${activeSlide.id}`}
          className="text-2xl sm:text-4xl lg:text-5xl font-black leading-[1.25] tracking-tight text-white transition-all duration-500 animate-fadeIn"
        >
          <span className={isDark ? 'text-white' : 'text-[#1a1240]'}>
            {activeSlide.titlePart1}
          </span>
          <br />
          <span className={`bg-gradient-to-r ${activeSlide.gradientTheme} bg-clip-text text-transparent`}>
            {activeSlide.titlePart2}
          </span>
        </h1>

        {/* Subheadline Description */}
        <p 
          key={`desc-${activeSlide.id}`}
          className={`text-sm sm:text-base leading-relaxed max-w-2xl transition-all duration-500 animate-fadeIn ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}
        >
          {activeSlide.description}
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-wrap items-center gap-3.5 pt-1">
        <button
          onClick={() => handlePrimaryCta(activeSlide.primaryCtaType)}
          className="glow-btn px-6 py-3 rounded-full text-xs sm:text-sm font-black text-white flex items-center gap-2.5 cursor-pointer group shadow-xl"
        >
          <span>{activeSlide.primaryCtaText}</span>
          <ArrowUpLeft className="w-4 h-4 group-hover:-translate-x-1 group-hover:-translate-y-1 transition-transform" />
        </button>

        <button
          onClick={() => handleSecondaryCta(activeSlide.secondaryCtaType)}
          className={`px-5 py-3 rounded-full text-xs sm:text-sm font-bold border backdrop-blur-xl transition-all duration-300 flex items-center gap-2 cursor-pointer ${
            isDark 
              ? 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-[#3b82f6]/50' 
              : 'bg-white border-slate-300 text-[#1a1240] hover:bg-slate-50 hover:border-blue-400 shadow-md'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-[#2563eb]" />
          <span>{activeSlide.secondaryCtaText}</span>
        </button>
      </div>

      {/* Dynamic Trust Micro-Badges */}
      <div 
        key={`badges-${activeSlide.id}`}
        className="pt-5 border-t border-white/10 flex flex-wrap items-center gap-5 text-[11px] sm:text-xs text-slate-400 transition-all duration-500 animate-fadeIn"
      >
        {activeSlide.badges.map((badgeText, idx) => (
          <div key={idx} className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{badgeText}</span>
          </div>
        ))}
      </div>

      {/* Slide Pagination Dots / Progress Bars */}
      <div className="flex items-center gap-1.5 pt-1">
        {slides.map((s, idx) => {
          const isActive = idx === currentSlide;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`رفتن به اسلاید ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                isActive 
                  ? 'w-8 bg-gradient-to-r from-[#2563eb] to-[#3b82f6]' 
                  : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};
