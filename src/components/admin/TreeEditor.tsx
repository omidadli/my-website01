import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronLeft, 
  FileText, 
  Layers, 
  Edit3, 
  Eye, 
  EyeOff, 
  ChevronUp, 
  Copy, 
  Plus, 
  Trash2, 
  Search, 
  Palette, 
  Sparkles, 
  CheckCircle2, 
  X,
  ExternalLink,
  Info,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useContent, getByPath } from '../../context/ContentContext';
import { FieldInspectorModal } from './FieldInspectorModal';
import { SectionStyleModal } from './SectionStyleModal';

// Friendly Persian titles for data fields
const FIELD_LABELS_FA: Record<string, string> = {
  title: 'عنوان اصلی',
  titleEn: 'عنوان انگلیسی',
  subtitle: 'زیرعنوان',
  client: 'نام مشتری / کارفرما',
  industry: 'صنعت (ارز دیجیتال/فین‌تک...)',
  industryFa: 'صنعت به فارسی',
  summary: 'خلاصه پروژه / معرفی',
  challenge: 'توضیح چالش اولیه',
  solution: 'توضیح راهکار ارائه شده',
  results: 'توضیح نتیجه به دست آمده',
  thumbnailIcon: 'آیکون پروژه / لوگو',
  heroColor: 'رنگ برجسته کیس‌استادی',
  featured: 'نمایش در صفحه اصلی (ویژه)',
  roas: 'شاخص بازگشت سرمایه (ROAS)',
  conversionRate: 'نرخ تبدیل (Conversion Rate)',
  cacReduction: 'میزان کاهش هزینه جذب (CAC)',
  date: 'تاریخ / سال انجام',
  tags: 'تگ‌ها و موضوعات',
  liveUrl: 'لینک زنده وب‌سایت',
  shortDesc: 'توضیحات کوتاه',
  fullDesc: 'توضیحات جامع و کامل',
  iconName: 'نام آیکون',
  value: 'مقدار آمار / عدد',
  label: 'عنوان شاخص',
  subtext: 'توضیح تکمیلی شاخص',
  clientName: 'نام نظر دهنده',
  clientRole: 'سمت شغلی',
  company: 'نام شرکت',
  avatarUrl: 'تصویر آواتار',
  rating: 'امتیاز (از ۵)',
  quote: 'متن نظر مشتری',
  metricHighlight: 'هایلایت نتیجه نظر',
  excerpt: 'خلاصه مقاله',
  content: 'متن کامل مقاله',
  categoryFa: 'دسته مقاله به فارسی',
  readTime: 'زمان مطالعه',
  author: 'نویسنده',
  imageIcon: 'تصویر / آیکون مقاله',
  year: 'سال',
  achievement: 'دستاورد کلیدی',
  description: 'توضیحات تکمیلی',
  targetAudience: 'مخاطبان هدف',
  badge: 'نشان / بج',
  actionText: 'متن دکمه اکشن',
  name: 'نام شخص / ابزار',
  bio: 'بیوگرافی کامل',
  tagline: 'شعار شغلی',
  avatar: 'تصویر پروفایل اصلی',
  experienceYears: 'سابقه کاری (سال)',
  totalCampaigns: 'تعداد کمپین‌های اجراشده',
  totalAdSpend: 'مجموع بودجه مدیریت‌شده',
  phone: 'شماره تماس',
  email: 'ایمیل',
  location: 'موقعیت مکانی',
  linkedin: 'لینک لینکدین',
  github: 'لینک گیت‌هاب',
  telegram: 'لینک تلگرام',
  instagram: 'لینک اینستاگرام',
  whatsapp: 'لینک واتس‌اپ',
};

export const TreeEditor: React.FC = () => {
  const { 
    data, 
    updateField, 
    addItem, 
    removeItem, 
    moveItem, 
    toggleSectionVisibility, 
    reorderPageSection, 
    removePageSection,
    addPageSection,
    duplicateItem,
    duplicateSection,
    duplicatePage,
    updatePageSeo
  } = useContent();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded nodes state
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({ home: true, services: true, portfolio: true });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ 'home_sec-portfolio': true, 'home_sec-services': true });
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Field inspector modal state
  const [activeFieldInspector, setActiveFieldInspector] = useState<{
    isOpen: boolean;
    path: string;
    label: string;
    value: any;
  }>({
    isOpen: false,
    path: '',
    label: '',
    value: null
  });

  // Section style modal state
  const [activeSectionStyle, setActiveSectionStyle] = useState<{
    isOpen: boolean;
    pageKey: string;
    sectionId: string;
    sectionLabel: string;
    style?: any;
  }>({
    isOpen: false,
    pageKey: '',
    sectionId: '',
    sectionLabel: ''
  });

  // Pages definition list
  const pagesList = [
    { key: 'home', title: 'صفحه اصلی (Home)', path: '/' },
    { key: 'services', title: 'خدمات تخصصی (Services)', path: '/services' },
    { key: 'portfolio', title: 'نمونه‌کارها (Portfolio)', path: '/portfolio' },
    { key: 'about', title: 'درباره من (About)', path: '/about' },
    { key: 'projects', title: 'پروژه‌ها (Projects)', path: '/projects' },
    { key: 'blog', title: 'مقالات و آموزش (Blog)', path: '/blog' },
    { key: 'products', title: 'محصولات و دوره‌ها (Products)', path: '/products' },
    { key: 'contact', title: 'تماس با من (Contact)', path: '/contact' },
  ];

  const togglePage = (key: string) => {
    setExpandedPages((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSectionNode = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleItemNode = (key: string) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const pagesObj: Record<string, boolean> = {};
    const secsObj: Record<string, boolean> = {};
    pagesList.forEach((p) => {
      pagesObj[p.key] = true;
      (data.PAGE_SECTIONS[p.key] || []).forEach((s) => {
        secsObj[`${p.key}_${s.id}`] = true;
      });
    });
    setExpandedPages(pagesObj);
    setExpandedSections(secsObj);
  };

  const collapseAll = () => {
    setExpandedPages({});
    setExpandedSections({});
    setExpandedItems({});
  };

  // Helper to map section to its array path or custom data path
  const getSectionDataPath = (pageKey: string, sectionName: string): { arrayPath?: string; singlePath?: string } => {
    const secNameUpper = sectionName.toUpperCase();
    if (secNameUpper.includes('PORTFOLIO') || secNameUpper.includes('CASE')) return { arrayPath: 'CASE_STUDIES' };
    if (secNameUpper.includes('SERVICE')) return { arrayPath: 'SERVICES' };
    if (secNameUpper.includes('STAT')) return { arrayPath: 'STATS' };
    if (secNameUpper.includes('TESTIMONIAL') || secNameUpper.includes('CLIENT')) return { arrayPath: 'TESTIMONIALS' };
    if (secNameUpper.includes('BLOG')) return { arrayPath: 'BLOG_POSTS' };
    if (secNameUpper.includes('PRODUCT')) return { arrayPath: 'PRODUCTS' };
    if (secNameUpper.includes('TIMELINE') || secNameUpper.includes('BIO')) return { arrayPath: 'TIMELINE' };
    if (secNameUpper.includes('PROJECT')) return { arrayPath: 'ONGOING_PROJECTS' };
    if (secNameUpper.includes('HERO') || secNameUpper.includes('HEADER')) return { singlePath: 'PERSONAL_INFO' };
    return { singlePath: 'PERSONAL_INFO' };
  };

  const handleOpenFieldInspector = (path: string, label: string) => {
    const currentValue = getByPath(data, path);
    setActiveFieldInspector({
      isOpen: true,
      path,
      label,
      value: currentValue
    });
  };

  // Render individual fields of an object with pencils
  const renderItemFields = (itemObj: any, basePath: string) => {
    if (!itemObj || typeof itemObj !== 'object') return null;

    const entries = Object.entries(itemObj);

    return (
      <div className="space-y-1.5 pr-4 border-r-2 border-amber-400/30 my-2">
        {entries.map(([key, val]) => {
          // Ignore heavy nested data or fallback
          if (key === 'id') return null;

          const fieldPath = `${basePath}.${key}`;
          const faLabel = FIELD_LABELS_FA[key] || key;

          // Nested metrics object (like metrics.roas)
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            return (
              <div key={key} className="p-2 rounded-xl bg-black/30 border border-white/5 space-y-1 my-1">
                <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                  <span>شاخص‌های {faLabel}:</span>
                </div>
                {Object.entries(val).map(([subKey, subVal]) => {
                  const subPath = `${fieldPath}.${subKey}`;
                  const subLabel = FIELD_LABELS_FA[subKey] || subKey;
                  return (
                    <div
                      key={subKey}
                      className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 truncate flex-1 ml-2">
                        <span className="font-bold text-slate-300 text-[11px] min-w-[120px]">{subLabel}:</span>
                        <span className="text-white font-mono bg-black/40 px-2 py-0.5 rounded border border-white/10 truncate max-w-[200px]">
                          {String(subVal)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenFieldInspector(subPath, subLabel)}
                        className="p-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black shadow-md transition-all flex items-center gap-1 text-[11px] shrink-0 cursor-pointer"
                        title={`ویرایش ${subLabel}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">✏️ ویرایش فیلد</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          }

          return (
            <div
              key={key}
              className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs"
            >
              {/* Field Info & Value Preview */}
              <div className="flex items-center gap-2 truncate flex-1 ml-2">
                <span className="font-black text-amber-300 text-[11px] min-w-[130px] shrink-0">
                  ✏️ {faLabel}:
                </span>

                {/* Preview Value */}
                {typeof val === 'boolean' ? (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {val ? 'فعال (TRUE)' : 'غیرفعال (FALSE)'}
                  </span>
                ) : typeof val === 'string' && (val.startsWith('#') || val.startsWith('rgb')) ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: val }} />
                    <span className="font-mono text-slate-300">{val}</span>
                  </div>
                ) : typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image')) ? (
                  <div className="flex items-center gap-1.5">
                    <img src={val} alt="thumb" loading="lazy" decoding="async" width={24} height={24} className="w-6 h-6 rounded object-cover border border-white/20" />
                    <span className="text-slate-400 font-mono text-[10px] truncate max-w-[150px]">{val}</span>
                  </div>
                ) : Array.isArray(val) ? (
                  <div className="flex flex-wrap gap-1">
                    {val.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 text-[10px]">
                        {String(t)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-200 font-medium truncate max-w-[280px]">
                    {String(val || '—')}
                  </span>
                )}
              </div>

              {/* Dedicated Pencil Button for THIS Field */}
              <button
                type="button"
                onClick={() => handleOpenFieldInspector(fieldPath, faLabel)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black shadow-md transition-all flex items-center gap-1 text-[11px] shrink-0 cursor-pointer"
                title={`ویرایش اختصاصی فیلد ${faLabel}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>✏️ ویرایش فیلد</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans">
      {/* Header & Search Controls */}
      <div className="p-6 rounded-3xl bg-[#120a38]/90 border-2 border-[#8b5cf6] shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-400 text-slate-950 font-black shadow-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>ویرایشگر ساختاریافته محتوا (Structured Tree Editor)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                  مشابه Elementor & Gutenberg
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                درخت کامل صفحات → سکشن‌ها → آیتم‌ها → و تک‌تک فیلدها همراه با مداد ویرایش اختصاصی (✏️)
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>بازکردن همه</span>
            </button>

            <button
              type="button"
              onClick={collapseAll}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>بستن همه</span>
            </button>
          </div>
        </div>

        {/* Filter / Search Box */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی سریع در نام صفحات، سکشن‌ها، پروژه‌ها یا فیلدها (مثلاً: دایان، چالش، ROAS...)"
            className="w-full bg-[#0a0520] border border-white/20 rounded-2xl px-10 py-3 text-xs text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute top-3.5 right-3.5" />
        </div>
      </div>

      {/* Main Hierarchical Tree Container */}
      <div className="space-y-4">
        {pagesList.map((p) => {
          const isPageExpanded = expandedPages[p.key] || searchQuery.length > 0;
          const pageSections = data.PAGE_SECTIONS[p.key] || [];

          return (
            <div
              key={p.key}
              className="rounded-3xl bg-[#120a38]/80 border border-white/10 overflow-hidden transition-all shadow-lg"
            >
              {/* PAGE LEVEL HEADER (سطح ۱: برگه) */}
              <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
                <div
                  onClick={() => togglePage(p.key)}
                  className="flex items-center gap-3 cursor-pointer select-none flex-1"
                >
                  <button type="button" className="p-1 rounded-lg bg-white/10 text-amber-400">
                    {isPageExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
                  <FileText className="w-5 h-5 text-[#5ce1e6]" />
                  <span className="font-black text-sm text-white">{p.title}</span>
                  <span className="text-xs text-slate-400 font-mono">({pageSections.length} سکشن)</span>
                </div>

                {/* Page Level Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const newTitle = prompt('عنوان یا عنوان متای جدید برگه:', p.title);
                      if (newTitle) {
                        updatePageSeo(p.key, { title: newTitle });
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 font-bold text-xs flex items-center gap-1 transition-all"
                    title="ویرایش عنوان و سئوی برگه"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>✏️ مداد برگه</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => duplicatePage(p.key)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    title="شبیه‌سازی برگه (Duplicate)"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const name = prompt('نام لاتین سکشن جدید (مثلا: TESTIMONIALS):');
                      const label = prompt('عنوان فارسی سکشن (مثلا: نظرات مشتریان):');
                      if (name && label) {
                        addPageSection(p.key, name, label);
                      }
                    }}
                    className="px-2 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white font-bold text-xs flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن سکشن</span>
                  </button>
                </div>
              </div>

              {/* SECTION LEVEL (سطح ۲: سکشن‌ها) */}
              {isPageExpanded && (
                <div className="p-4 space-y-3 bg-black/20">
                  {pageSections.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-4 bg-white/5 rounded-2xl">
                      سکشنی برای این برگه تعریف نشده است.
                    </div>
                  ) : (
                    pageSections.map((sec, secIdx) => {
                      const secKey = `${p.key}_${sec.id}`;
                      const isSecExpanded = expandedSections[secKey] || searchQuery.length > 0;
                      const paths = getSectionDataPath(p.key, sec.name);

                      // Get data items corresponding to this section
                      const listItems = paths.arrayPath ? (getByPath(data, paths.arrayPath) || []) : [];
                      const singleItem = paths.singlePath ? getByPath(data, paths.singlePath) : null;

                      return (
                        <div
                          key={sec.id}
                          className={`rounded-2xl border transition-all ${
                            sec.isHidden
                              ? 'bg-rose-950/20 border-rose-500/40 opacity-70'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                        >
                          {/* SECTION HEADER ROW */}
                          <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
                            <div
                              onClick={() => toggleSectionNode(secKey)}
                              className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-[200px]"
                            >
                              <button type="button" className="p-1 rounded bg-white/10 text-amber-400">
                                {isSecExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                              </button>
                              <Layers className="w-4 h-4 text-amber-400" />
                              <span className="font-black text-xs text-amber-300">{sec.label || sec.name}</span>
                              {sec.isHidden && (
                                <span className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 text-[10px] font-bold">
                                  مخفی
                                </span>
                              )}
                              {paths.arrayPath && (
                                <span className="text-[11px] text-slate-400 font-bold bg-white/10 px-2 py-0.5 rounded-full">
                                  {listItems.length} آیتم
                                </span>
                              )}
                            </div>

                            {/* Section Level Actions */}
                            <div className="flex items-center gap-1">
                              {/* Pencil for Section Style (Elementor Inspector) */}
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveSectionStyle({
                                    isOpen: true,
                                    pageKey: p.key,
                                    sectionId: sec.id,
                                    sectionLabel: sec.label,
                                    style: sec.style
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-[#8b5cf6]/20 hover:bg-[#8b5cf6] text-[#8b5cf6] hover:text-white font-bold text-[11px] flex items-center gap-1 transition-all"
                                title="ویرایش استایل و چیدمان سکشن (Elementor)"
                              >
                                <Palette className="w-3.5 h-3.5" />
                                <span>✏️ استایل سکشن</span>
                              </button>

                              {/* Toggle Show/Hide */}
                              <button
                                type="button"
                                onClick={() => toggleSectionVisibility(p.key, sec.id)}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                                title={sec.isHidden ? 'نمایش سکشن' : 'مخفی کردن سکشن'}
                              >
                                {sec.isHidden ? <EyeOff className="w-3.5 h-3.5 text-rose-400" /> : <Eye className="w-3.5 h-3.5 text-emerald-400" />}
                              </button>

                              {/* Reorder Up / Down */}
                              <button
                                type="button"
                                disabled={secIdx === 0}
                                onClick={() => reorderPageSection(p.key, secIdx, secIdx - 1)}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={secIdx === pageSections.length - 1}
                                onClick={() => reorderPageSection(p.key, secIdx, secIdx + 1)}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Duplicate Section */}
                              <button
                                type="button"
                                onClick={() => duplicateSection(p.key, sec.id)}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                                title="شبیه‌سازی سکشن"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              {/* Add Item to Array */}
                              {paths.arrayPath && (
                                <button
                                  type="button"
                                  onClick={() => addItem(paths.arrayPath!)}
                                  className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>آیتم جدید</span>
                                </button>
                              )}

                              {/* Delete Section */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`آیا از حذف سکشن "${sec.label}" مطمئن هستید؟`)) {
                                    removePageSection(p.key, sec.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white"
                                title="حذف سکشن"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* ITEMS & FIELDS EXPANDED CONTENT (سطح ۳ و ۴: آیتم‌ها و تک‌تک فیلدها) */}
                          {isSecExpanded && (
                            <div className="p-3 bg-black/40 border-t border-white/10 space-y-3">
                              {/* Case 1: Repeater / Array List */}
                              {paths.arrayPath && listItems.map((item: any, itemIdx: number) => {
                                const itemNodeKey = `${secKey}_item_${itemIdx}`;
                                const isItemExpanded = expandedItems[itemNodeKey] || searchQuery.length > 0;
                                const itemTitle = item.title || item.client || item.label || item.name || `آیتم شماره ${itemIdx + 1}`;

                                return (
                                  <div
                                    key={item.id || itemIdx}
                                    className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2"
                                  >
                                    {/* ITEM ROW HEADER */}
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div
                                        onClick={() => toggleItemNode(itemNodeKey)}
                                        className="flex items-center gap-2 cursor-pointer select-none flex-1"
                                      >
                                        <button type="button" className="p-1 rounded bg-white/10 text-amber-400">
                                          {isItemExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                                        </button>
                                        <Sparkles className="w-4 h-4 text-amber-400" />
                                        <span className="font-bold text-xs text-white">
                                          آیتم {itemIdx + 1}: {itemTitle}
                                        </span>
                                      </div>

                                      {/* Item Controls */}
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={itemIdx === 0}
                                          onClick={() => moveItem(paths.arrayPath!, itemIdx, itemIdx - 1)}
                                          className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white"
                                        >
                                          <ChevronUp className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          disabled={itemIdx === listItems.length - 1}
                                          onClick={() => moveItem(paths.arrayPath!, itemIdx, itemIdx + 1)}
                                          className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white"
                                        >
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Duplicate Item */}
                                        <button
                                          type="button"
                                          onClick={() => duplicateItem(paths.arrayPath!, itemIdx)}
                                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1"
                                          title="شبیه‌سازی آیتم (Duplicate)"
                                        >
                                          <Copy className="w-3 h-3 text-amber-400" />
                                          <span>شبیه‌سازی</span>
                                        </button>

                                        {/* Delete Item */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (confirm(`آیا از حذف این آیتم مطمئن هستید؟`)) {
                                              removeItem(paths.arrayPath!, itemIdx);
                                            }
                                          }}
                                          className="p-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white"
                                          title="حذف آیتم"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* INDIVIDUAL FIELDS (سطح ۴ - مداد جدا برای هر فیلد) */}
                                    {isItemExpanded && renderItemFields(item, `${paths.arrayPath}.${itemIdx}`)}
                                  </div>
                                );
                              })}

                              {/* Case 2: Single Object (e.g. PERSONAL_INFO) */}
                              {paths.singlePath && renderItemFields(singleItem, paths.singlePath)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Field Inspector Modal Popup */}
      {activeFieldInspector.isOpen && (
        <FieldInspectorModal
          isOpen={activeFieldInspector.isOpen}
          onClose={() => setActiveFieldInspector({ ...activeFieldInspector, isOpen: false })}
          path={activeFieldInspector.path}
          fieldLabel={activeFieldInspector.label}
          value={activeFieldInspector.value}
        />
      )}

      {/* Section Style Modal Popup */}
      {activeSectionStyle.isOpen && (
        <SectionStyleModal
          isOpen={activeSectionStyle.isOpen}
          onClose={() => setActiveSectionStyle({ ...activeSectionStyle, isOpen: false })}
          pageKey={activeSectionStyle.pageKey}
          sectionId={activeSectionStyle.sectionId}
          sectionLabel={activeSectionStyle.sectionLabel}
          initialStyle={activeSectionStyle.style}
        />
      )}
    </div>
  );
};
