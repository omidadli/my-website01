import React, { useState, useMemo, useEffect } from 'react';
import { Theme, Page, CaseStudy } from '../types';
import { useContent } from '../context/ContentContext';
import { usePreservedState } from '../utils/statePreserver';
import { SectionEditHeader } from '../components/cms/SectionEditHeader';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { PageHero } from '../components/nd/Kit';
import { ArrowUpLeft, ChevronLeft, X, AlertTriangle, Lightbulb, TrendingUp, Globe, ExternalLink, Sparkles, Target, Rocket, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizeCaseStudies, safeExternalUrl } from '../utils/caseStudies';
import { ProductPromo, ProductPromoStrip } from '../components/ProductPromo';
import { productsForPage } from '../data/productPromo';

interface PortfolioPageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  selectedCaseStudy: CaseStudy | null;
  onSelectCaseStudy: (study: CaseStudy | null) => void;
}

export const PortfolioPage: React.FC<PortfolioPageProps> = ({
  theme,
  onNavigate,
  selectedCaseStudy,
  onSelectCaseStudy,
}) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const caseStudiesList = normalizeCaseStudies(data.CASE_STUDIES);
  const detailStudy = selectedCaseStudy ? normalizeCaseStudies([selectedCaseStudy])[0] : null;
  const detailPreviewUrl = safeExternalUrl(detailStudy?.liveUrl);
  // Modal UX: Escape to close + background scroll lock
  useEffect(() => {
    if (!selectedCaseStudy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelectCaseStudy(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [selectedCaseStudy, onSelectCaseStudy]);

  const [selectedPath, setSelectedPath] = usePreservedState<string>('portfolio_selected_path', 'all');
  const [selectedIndustry, setSelectedIndustry] = usePreservedState<string>('portfolio_selected_industry', 'all');
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => setShowPreview(false), [selectedCaseStudy?.id]);

  const pathFilters = [
    { key: 'all', label: 'همه مسیرها', icon: Layers },
    { key: 'start', label: 'شروع کنیم', icon: Sparkles },
    { key: 'sell', label: 'بهتر بفروشیم', icon: Target },
    { key: 'grow', label: 'رشد کنیم', icon: Rocket },
  ];

  const industries = [
    { key: 'all', label: 'همه صنایع' },
    { key: 'فین‌تک و رمزارز', label: 'فین‌تک و رمزارز', matches: ['فین‌تک و رمزارز', 'رمزارز و فین‌تک'] },
    { key: 'گردشگری و سفر', label: 'گردشگری و سفر', matches: ['گردشگری و سفر', 'خدمات مهاجرت و ویزا'] },
    { key: 'تجارت الکترونیک', label: 'تجارت الکترونیک', matches: ['تجارت الکترونیک', 'صنعتی و فولاد'] },
    { key: 'طراحی وب‌سایت', label: 'طراحی وب‌سایت', matches: ['طراحی وب‌سایت', 'محصولات دیجیتال'] },
    { key: 'تبلیغات و تکنولوژی', label: 'تبلیغات و تکنولوژی', matches: ['پرفورمنس مارکتینگ', 'آژانس تبلیغاتی', 'پلتفرم تبلیغاتی', 'تکنولوژی و بازاریابی', 'هلدینگ دیجیتال'] },
  ];

  const filteredStudies = useMemo(() => {
    return caseStudiesList.filter((study) => {
      const matchPath = selectedPath === 'all' || study.pathCategory === selectedPath;
      let matchIndustry = true;
      if (selectedIndustry !== 'all') {
        const indObj = industries.find((i) => i.key === selectedIndustry);
        if (indObj && indObj.matches) {
          matchIndustry = indObj.matches.includes(study.industryFa) || study.industryFa === selectedIndustry;
        } else {
          matchIndustry = study.industryFa === selectedIndustry;
        }
      }
      return matchPath && matchIndustry;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseStudiesList, selectedPath, selectedIndustry]);

  const resetFilters = () => {
    setSelectedPath('all');
    setSelectedIndustry('all');
  };

  return (
    <div className="space-y-14 py-4">
      <PageHero
        theme={theme}
        page="portfolio"
        title="چند نمونه از پروژه‌هایی که روشون کار کردم"
        subtitle="از فروشگاه‌های کوچیک تا برندهای بزرگ‌تر — هرکدوم یه چالش واقعی داشتن؛ این‌ها نتیجه‌ی کاریه که روشون انجام دادم."
        badge="نمونه‌کارهای واقعی"
        onNavigate={onNavigate}
      />

      {/* Filters */}
      <section className="space-y-4 max-w-4xl mx-auto" id="portfolio-filters">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {pathFilters.map((opt) => {
            const active = selectedPath === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSelectedPath(opt.key)}
                className={`px-5 py-2.5 rounded-full text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                  active
                    ? 'nd-btn nd-btn-accent'
                    : `nd-btn nd-btn-ghost`
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {industries.map((ind) => {
            const active = selectedIndustry === ind.key;
            return (
              <button
                key={ind.key}
                onClick={() => setSelectedIndustry(ind.key)}
                className={`nd-chip cursor-pointer transition-colors ${
                  active ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] border-transparent' : 'hover:text-[color:var(--nd-accent)]'
                }`}
              >
                {ind.label}
              </button>
            );
          })}
        </div>
        {(selectedPath !== 'all' || selectedIndustry !== 'all') && (
          <div className="flex items-center justify-center gap-3 text-xs">
            <span className={isDark ? 'text-slate-400' : 'nd-muted'}>نمایش {filteredStudies.length} نمونه‌کار</span>
            <button onClick={resetFilters} className="text-[color:var(--nd-accent)] hover:underline font-extrabold text-[11px] cursor-pointer">
              پاک کردن فیلترها
            </button>
          </div>
        )}
      </section>

      {/* Grid */}
      <section className="space-y-6">
        <SectionEditHeader title="نمونه‌کارها و کیس‌استادی‌های تخصصی" arrayPath="CASE_STUDIES" />
        {filteredStudies.length === 0 ? (
          <div className={`nd-card p-12 text-center space-y-4`}>
            <p className={`${isDark ? 'text-slate-300' : 'nd-muted'} text-sm`}>با این ترکیب فیلترها، موردی یافت نشد. می‌توانید فیلترها را ریست کنید.</p>
            <button onClick={resetFilters} className="nd-btn nd-btn-accent px-5 py-2.5 text-xs">
              <span>نمایش همه نمونه‌کارها</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudies.map((study, idx) => (
              <motion.button
                key={study.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.55, delay: (idx % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onSelectCaseStudy(study)}
                className="nd-card nd-card-hover p-6 sm:p-7 text-right cursor-pointer flex flex-col gap-5 group h-full"
              >
                <div className="flex items-center justify-between">
                  <span className="nd-chip">{study.industryFa}</span>
                  <IconBadge3D iconName={study.thumbnailIcon} theme={theme} size="sm" glowColor="cyan" floating={false} />
                </div>
                <h2 className={`nd-h2 text-base sm:text-lg leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${isDark ? 'text-white' : ''}`}>
                  {study.title}
                </h2>
                {study.liveUrl && (
                  <span className="nd-chip w-fit bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent">
                    <Globe className="w-3 h-3" />
                    پیش‌نمایش زنده در همین صفحه
                  </span>
                )}
                <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs leading-relaxed line-clamp-3`}>{study.summary}</p>
                {/* آمار و ارقام (ROAS / نرخ تبدیل / CAC) به درخواستِ صاحب سایت از کارت‌ها حذف شد. */}
                <span className={`mt-auto flex items-center justify-between pt-3 border-t text-xs font-extrabold text-[color:var(--nd-accent)] ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                  <span>بررسی کامل نمونه‌کار</span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* ابزار مرتبط: داده‌های این نمونه‌کارها را روی بیزینس خودت پیاده کن */}
      <ProductPromo
        productId="business-therapist"
        theme={theme}
        onNavigate={onNavigate}
        topic="ads-performance"
        variant="banner"
        eyebrow="از نتیجه‌ی دیگران تا نتیجه‌ی خودت"
      />

      {/* Detail modal */}
      <AnimatePresence>
        {detailStudy && (
          <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onSelectCaseStudy(null); }} className={`fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto backdrop-blur-xl ${isDark ? 'bg-black/80' : 'bg-[#17171c]/40'}`}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="case-study-title"
              onMouseDown={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`relative w-full max-w-4xl max-h-[90vh] supports-[max-height:90dvh]:max-h-[90dvh] overflow-y-auto rounded-[var(--nd-radius-panel)] p-6 sm:p-10 border shadow-2xl my-auto no-scrollbar ${
                isDark ? 'bg-[#12121d] border-white/12 text-white' : 'nd-surface-bg border-[color:var(--nd-line)] text-[color:var(--nd-ink)]'
              }`}
            >
              <button
                onClick={() => onSelectCaseStudy(null)}
                aria-label="بستن"
                className={`absolute top-6 left-6 p-3 rounded-full transition-colors cursor-pointer ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-[color:var(--nd-bg)] hover:bg-[color:var(--nd-line)] text-[color:var(--nd-ink)]'}`}
              >
                <X className="w-5 h-5" />
              </button>

              <div className={`space-y-4 pt-2 pb-6 border-b ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="nd-chip">{detailStudy.industryFa}</span>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>مشتری: {detailStudy.client}</span>
                </div>
                <h2 id="case-study-title" className={`nd-h2 text-xl sm:text-3xl leading-tight ${isDark ? 'text-white' : ''}`}>{detailStudy.title}</h2>
              </div>

              {detailPreviewUrl && (
                <section className="my-8 space-y-3" aria-label="پیش‌نمایش وب‌سایت">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className={`nd-h2 text-base flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
                      <Globe className="w-5 h-5 text-[color:var(--nd-accent)]" />
                      پیش‌نمایش زنده وب‌سایت
                    </h3>
                    <a href={detailPreviewUrl} target="_blank" rel="noopener noreferrer" className="nd-chip hover:text-[color:var(--nd-accent)] transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> باز کردن در تب جدید
                    </a>
                  </div>
                  {!showPreview ? (
                    <div className={`rounded-3xl border p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${isDark ? 'border-white/10 bg-white/5' : 'border-[color:var(--nd-line)] bg-[color:var(--nd-bg)]'}`}>
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'nd-muted'}`}>
                        برای جلوگیری از بارگذاری سنگین و نمایش صفحهٔ خالی در سایت‌هایی که iframe را مسدود می‌کنند، پیش‌نمایش فقط با درخواست شما بارگذاری می‌شود.
                      </p>
                      <button type="button" onClick={() => setShowPreview(true)} className="nd-btn nd-btn-accent px-5 py-3 text-xs shrink-0">بارگذاری پیش‌نمایش</button>
                    </div>
                  ) : (
                    <div className={`rounded-3xl border overflow-hidden ${isDark ? 'border-white/12' : 'border-[color:var(--nd-line)]'}`}>
                      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${isDark ? 'bg-white/5 border-white/10' : 'bg-[color:var(--nd-bg)] border-[color:var(--nd-line)]'}`}>
                        <span className={`text-[11px] truncate dir-ltr ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{detailPreviewUrl}</span>
                        <button type="button" onClick={() => setShowPreview(false)} className="text-xs font-bold text-[color:var(--nd-accent)]">بستن پیش‌نمایش</button>
                      </div>
                      <iframe src={detailPreviewUrl} title={detailStudy.title} loading="lazy" referrerPolicy="no-referrer" className="w-full h-[300px] sm:h-[480px] bg-white" sandbox="allow-scripts allow-forms allow-popups" />
                    </div>
                  )}
                </section>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
                {[
                  { icon: AlertTriangle, label: 'چالش اولیه', text: detailStudy.challenge, tint: 'var(--nd-peach-soft)', fg: '#d97706' },
                  { icon: Lightbulb, label: 'راهکار پیاده‌شده', text: detailStudy.solution, tint: 'var(--nd-sky-soft)', fg: '#1d6fd8' },
                  { icon: TrendingUp, label: 'نتایج حاصله', text: detailStudy.results, tint: 'var(--nd-mint-soft)', fg: '#0f9d6e' },
                ].map((b, i) => (
                  <div
                    key={i}
                    className={`p-5 rounded-3xl border space-y-3 ${isDark ? 'bg-white/5 border-white/10' : ''}`}
                    style={isDark ? undefined : { background: b.tint, borderColor: 'transparent' }}
                  >
                    <div className="flex items-center gap-2 font-extrabold text-sm" style={{ color: isDark ? b.fg : b.fg }}>
                      <b.icon className="w-5 h-5" />
                      <span>{b.label}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>{b.text}</p>
                  </div>
                ))}
              </div>

              {/* جدولِ «مقایسه دقیق شاخص‌ها (قبل و بعد)» به درخواستِ صاحب سایت حذف شد —
                  روایتِ پروژه (چالش / راهکار / نتیجه) بدون عدد باقی می‌ماند.
                  داده‌ها همچنان در CMS هستند و با حذف این کامنت برمی‌گردند. */}

              {/* همان متدولوژی، روی کسب‌وکار خودت — پیشنهاد در لحظه‌ی بیشترین علاقه */}
              <ProductPromoStrip
                productIds={productsForPage('portfolio')}
                theme={theme}
                onNavigate={onNavigate}
                topic="ads-performance"
                variant="compact"
                eyebrow="همین متدولوژی، روی بیزینس خودت"
                title="این اعداد با همین روش به دست آمده‌اند"
                desc="همین رویکردِ داده‌محور را می‌توانی روی کمپین و قیف فروش خودت امتحان کنی — بدون انتظار برای جلسه."
                gridClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
              />

              <div className={`pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                <button
                  onClick={() => {
                    onSelectCaseStudy(null);
                    onNavigate('contact');
                  }}
                  className={`nd-btn w-full sm:w-auto px-8 py-3.5 text-xs ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}
                >
                  <span>ببینیم کسب‌وکارتان به چی نیاز دارد</span>
                  <ArrowUpLeft className="w-4 h-4" />
                </button>
                <button onClick={() => onSelectCaseStudy(null)} className="nd-btn nd-btn-ghost px-6 py-3 text-xs">
                  <span>بستن</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
