import React from 'react';
import { Theme, Page } from '../types';
import { ChevronLeft, Home, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface PageHeaderProps {
  theme: Theme;
  page: Page;
  title: string;
  subtitle: string;
  badgeText?: string;
  onNavigate: (page: Page) => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  theme,
  page,
  title,
  subtitle,
  badgeText,
  onNavigate,
}) => {
  const isDark = theme === 'dark';

  const pageNames: Record<Page, string> = {
    home: 'صفحه اصلی',
    services: 'خدمات تخصصی',
    portfolio: 'کیس‌استاندی‌ها و نمونه‌کارها',
    about: 'درباره امید عدلی',
    blog: 'مقالات و راهنماها',
    contact: 'تماس و درخواست مشاوره',
    projects: 'پروژه‌های جاری و سابق',
    products: 'محصولات و ابزارها',
    admin: 'پیشخوان مدیریت محتوا (CMS)',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -15, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4 pt-4 pb-8 border-b border-white/10 mb-8 relative"
    >
      {/* Subtle top light ray */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[#8b5cf6]/40 to-transparent pointer-events-none blur-[0.5px]" />

      {/* Breadcrumb Path Bar */}
      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-1 hover:text-[#5ce1e6] transition-colors cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span>صفحه اصلی</span>
        </button>
        <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-[#8b5cf6] font-black">{pageNames[page]}</span>
      </div>

      {/* Main Page Title Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          {badgeText && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5ce1e6]/15 border border-[#5ce1e6]/30 text-[11px] font-bold text-[#5ce1e6] whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>{badgeText}</span>
            </motion.div>
          )}
          <h1 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>
            {title}
          </h1>
          <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {subtitle}
          </p>
        </div>

        {/* Quick Route Buttons */}
        <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-full border border-white/10 self-start md:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => onNavigate('services')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              page === 'services' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            خدمات
          </button>
          <button
            onClick={() => onNavigate('portfolio')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              page === 'portfolio' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            نمونه‌کارها
          </button>
          <button
            onClick={() => onNavigate('about')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              page === 'about' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            درباره
          </button>
          <button
            onClick={() => onNavigate('blog')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              page === 'blog' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            مقالات
          </button>
          <button
            onClick={() => onNavigate('contact')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              page === 'contact' ? 'bg-[#8b5cf6] text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            تماس
          </button>
        </div>
      </div>
    </motion.div>
  );
};

