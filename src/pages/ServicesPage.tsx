import React, { useState } from 'react';
import { Theme, Page, ServiceItem } from '../types';
import { useContent } from '../context/ContentContext';
import { usePreservedState } from '../utils/statePreserver';
import { SectionEditHeader } from '../components/cms/SectionEditHeader';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { PageHero, Head, CtaPanel } from '../components/nd/Kit';
import { FAQSection } from '../components/FAQSection';
import { CheckCircle2, ArrowUpLeft, Sparkles, Target, Rocket, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeRecordArray } from '../utils/contentDefaults';
import { ProductPromo, isProductPromotable } from '../components/ProductPromo';
import { PRODUCT_BY_PATH_TAB, TOPIC_BY_PATH_TAB, productForService, topicForService } from '../data/productPromo';

interface ServicesPageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
}

const GLOWS = ['blue', 'cyan', 'purple', 'emerald', 'gold', 'magenta'] as const;

export const ServicesPage: React.FC<ServicesPageProps> = ({ theme, onNavigate }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const servicesList: ServiceItem[] = safeRecordArray<ServiceItem>(data.SERVICES)
    .filter((service) => typeof service.id === 'string');
  const howIWorkSteps = safeRecordArray<any>(data.HOW_I_WORK_STEPS);
  const [activeTab, setActiveTab] = usePreservedState<'start' | 'sell' | 'grow'>('services_active_tab', 'start');

  const tabs = [
    { id: 'start' as const, label: 'شروع کنیم', sublabel: 'طراحی سایت، تجربه کاربری و شبکه‌های اجتماعی', icon: Sparkles },
    { id: 'sell' as const, label: 'بهتر بفروشیم', sublabel: 'تبلیغات، افزایش نرخ تبدیل و رصد مشتری', icon: Target },
    { id: 'grow' as const, label: 'رشد کنیم', sublabel: 'سئو، استراتژی رشد و اتوماسیون', icon: Rocket },
  ];

  const IDS: Record<typeof activeTab, string[]> = {
    start: ['web-app-design', 'ui-ux-design', 'social-media-strategy'],
    sell: ['performance-marketing', 'cro-optimization', 'tracking-analytics'],
    grow: ['seo-growth', 'growth-strategy', 'marketing-automation', 'retention-strategy'],
  };
  const filtered = servicesList.filter((s) => IDS[activeTab].includes(s.id));

  return (
    <div className="space-y-14 py-4">
      <PageHero
        theme={theme}
        page="services"
        title="خدماتی که در هر مرحله از مسیر بهت کمک می‌کنن"
        subtitle="از طراحی سایت و راه‌اندازی پیج تا تبلیغات، تحلیل و رشد فروش — هرکدوم رو می‌تونی جدا یا در کنار هم داشته باشی."
        badge="خدمات — از شروع تا رشد"
        onNavigate={onNavigate}
      />

      {/* Tabs + cards */}
      <section className="space-y-8" id="services-tabs-section">
        <SectionEditHeader title="خدمات و سرویس‌های تخصصی" arrayPath="SERVICES" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`nd-card nd-card-hover p-4 text-right flex items-center gap-3 cursor-pointer ${
                  active ? 'ring-2 ring-[color:var(--nd-accent)]' : ''
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                    active ? 'text-white' : isDark ? 'bg-white/5 text-slate-400' : 'bg-[color:var(--nd-bg)] text-[color:var(--nd-muted)]'
                  }`}
                  style={active ? { background: 'var(--nd-accent)' } : undefined}
                >
                  <tab.icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-black ${isDark ? 'text-white' : ''}`}>{tab.label}</span>
                  <span className={`block text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{tab.sublabel}</span>
                </span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {filtered.map((service, idx) => (
              <div key={service.id} className={`nd-card nd-card-hover p-7 sm:p-9 flex flex-col gap-6 h-full ${isDark ? '' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <IconBadge3D iconName={service.iconName} theme={theme} size="lg" glowColor={GLOWS[idx % GLOWS.length]} />
                  <span className="nd-chip dir-ltr mt-2">{service.titleEn}</span>
                </div>
                <div className="space-y-4">
                  <h2 className={`nd-h2 text-xl sm:text-2xl ${isDark ? 'text-white' : ''}`}>{service.title}</h2>
                  <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm leading-relaxed`}>{service.fullDesc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(service.tags) ? service.tags : []).map((tag) => (
                      <span key={tag} className="nd-chip dir-ltr">#{tag}</span>
                    ))}
                  </div>
                </div>
                <div className={`space-y-2.5 pt-4 border-t ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                  <span className={`text-[11px] font-extrabold ${isDark ? 'text-slate-400' : 'nd-muted'}`}>دستاوردهای کلیدی این سرویس:</span>
                  {(Array.isArray(service.features) ? service.features : []).map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-[color:var(--nd-success)] shrink-0" />
                      <span className={isDark ? 'text-slate-200' : 'text-[color:var(--nd-ink-2)]'}>{feat}</span>
                    </div>
                  ))}
                </div>
                {Array.isArray(service.packages) && service.packages.length > 0 && (
                  <div className={`space-y-2.5 pt-4 border-t ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                    <span className={`text-[11px] font-extrabold ${isDark ? 'text-amber-300' : 'text-[#b45309]'}`}>تعرفه و پکیج‌های قیمت‌گذاری:</span>
                    {service.packages.map((pkg, pIdx) => (
                      <div
                        key={pIdx}
                        className={`p-3.5 rounded-2xl border ${
                          pkg.isPopular
                            ? isDark
                              ? 'bg-indigo-500/15 border-indigo-400/40'
                              : 'bg-[color:var(--nd-accent-soft)] border-[rgba(79,70,229,0.3)]'
                            : isDark
                              ? 'bg-white/5 border-white/10'
                              : 'bg-[color:var(--nd-bg-soft)] border-[color:var(--nd-line)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="flex items-center gap-2">
                            <span className={`text-xs font-black ${isDark ? 'text-white' : ''}`}>{pkg.title}</span>
                            {pkg.badge && (
                              <span className="nd-chip bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent">{pkg.badge}</span>
                            )}
                          </span>
                          <span className={`text-xs font-black ${isDark ? 'text-amber-300' : 'text-[#b45309]'}`}>{pkg.price}</span>
                        </div>
                        {pkg.description && (
                          <p className={`text-[11px] mt-1 leading-tight ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{pkg.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* ابزار مکمل این خدمت — دقیقاً همان گره‌ای که این سرویس باز می‌کند */}
                {isProductPromotable(data, productForService(service.id)) && (
                  <ProductPromo
                    productId={productForService(service.id)}
                    theme={theme}
                    onNavigate={onNavigate}
                    topic={topicForService(service.id)}
                    variant="row"
                    eyebrow="ابزار مکمل این خدمت"
                  />
                )}
                <button
                  onClick={() => onNavigate('contact')}
                  className={`nd-btn mt-auto w-full py-4 text-xs ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}
                >
                  <span>سفارش این خدمت و مشاوره</span>
                  <ArrowUpLeft className="w-4 h-4" />
                </button>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* ابزار متناسب با مرحله‌ای که کاربر انتخاب کرده */}
        {isProductPromotable(data, PRODUCT_BY_PATH_TAB[activeTab]) && (
          <ProductPromo
            productId={PRODUCT_BY_PATH_TAB[activeTab]}
            theme={theme}
            onNavigate={onNavigate}
            topic={TOPIC_BY_PATH_TAB[activeTab]}
            variant="banner"
            eyebrow={`اگر در مرحله‌ی «${tabs.find((t) => t.id === activeTab)?.label || ''}» هستی`}
          />
        )}
      </section>

      {/* Mid CTA */}
      <section className="max-w-4xl mx-auto">
        <div className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[var(--nd-radius-panel)] p-8 sm:p-12 text-center space-y-5`}>
          <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
            <MessageCircle className="w-4 h-4" />
            <span>مشاوره‌ی اولیه و رایگان</span>
          </span>
          <h3 className={`nd-h2 text-xl sm:text-3xl ${isDark ? 'text-white' : ''}`}>نمی‌دونی دقیقاً به کدوم خدمت نیاز داری؟</h3>
          <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base max-w-xl mx-auto`}>چند دقیقه با هم صحبت می‌کنیم و می‌گم از کجا شروع کنیم.</p>
          <button onClick={() => onNavigate('contact')} className={`nd-btn ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'} px-8 py-4 text-xs sm:text-sm`}>
            <span>ببینیم کسب‌وکارتان به چی نیاز دارد</span>
            <ArrowUpLeft className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Process */}
      <section className="space-y-10">
        <SectionEditHeader title="مراحل فرایند کاری" arrayPath="HOW_I_WORK_STEPS" />
        <Head theme={theme} eyebrow="فرآیند کاری شفاف" title="مسیر ۴ مرحله‌ای همکاری" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {howIWorkSteps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="nd-card nd-card-hover p-6 h-full space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className={`text-2xl font-black dir-ltr ${isDark ? 'nd-text-glow' : 'text-[color:var(--nd-accent)]'}`}>{step.step}</span>
                <IconBadge3D iconName={step.icon} theme={theme} size="sm" glowColor={GLOWS[idx % GLOWS.length]} floating={false} />
              </div>
              <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>{step.title}</h3>
              <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs leading-relaxed`}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <FAQSection theme={theme} />

      <CtaPanel
        theme={theme}
        title="آماده‌ای ببینیم کسب‌وکارت به چی نیاز داره؟"
        desc="یه گفتگوی کوتاه و رایگان، اولین قدمه."
        primaryLabel="ببینیم کسب‌وکارتان به چی نیاز دارد"
        onPrimary={() => onNavigate('contact')}
      />
    </div>
  );
};
