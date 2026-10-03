import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Lock,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Check,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { PageHero, CtaPanel } from '../components/nd/Kit';
import { ToolChatModal } from '../components/tools/ToolChatModal';
import { AI_TOOLS, AiToolMeta } from '../data/tools';
import { startingPrice, resolveFreeTrial, INITIAL_FREE_COINS, getNeuromarketingTrigger } from '../../lib/toolPlans';
import { Page, Theme, ProductItem } from '../types';
import { getProductDetail } from '../data/productDetails';
import { productCopy } from '../utils/productCopy';

const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

interface ProductsPageProps {
  theme?: Theme;
  onNavigate: (page: Page) => void;
  onSelectProduct?: (productId: string) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ theme = 'dark', onNavigate, onSelectProduct }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const pageData = data.PRODUCTS_PAGE_DATA;
  const cfg = data.AI_TOOLS_CONFIG;
  const [quickChatTool, setQuickChatTool] = useState<AiToolMeta | null>(null);

  const rawProducts: ProductItem[] = Array.isArray(data.PRODUCTS) && data.PRODUCTS.length > 0 ? data.PRODUCTS : [];
  const publishedProducts = rawProducts.filter((p) => p.status !== 'draft');

  const productList: AiToolMeta[] = publishedProducts.length > 0
    ? publishedProducts.map((p) => ({
        id: p.id,
        name: p.title,
        tagline: p.tagline || '',
        description: p.description,
        audience: p.targetAudience,
        iconName: p.iconName || 'target',
        glow: p.glow || 'magenta',
        badge: p.badge || 'ابزار هوشمند',
        how: p.howItWorks && p.howItWorks.length > 0 ? p.howItWorks : [],
        placeholder: p.placeholder || 'دغدغه یا سوالت رو بنویس…',
        sample: p.sample && p.sample.length > 0 ? p.sample : [],
        whyBuy: p.whyBuy,
        problemSolved: p.problemSolved,
        features: p.features,
        price: p.price,
      }))
    : AI_TOOLS;

  const visibleTools = productList.filter((t) => cfg?.tools?.[t.id]?.enabled !== false);

  return (
    <div className="space-y-16 py-4 max-w-5xl mx-auto dir-rtl font-['Vazirmatn',sans-serif]">
      {/* 1. Standard Page Hero */}
      <PageHero
        theme={theme}
        page="products"
        title={pageData.headline}
        subtitle={pageData.subheadline}
        badge={pageData.badge}
        onNavigate={onNavigate}
      />

      {cfg?.enabled === false || visibleTools.length === 0 ? (
        <section className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[var(--nd-radius-panel)] p-12 text-center space-y-4`}>
          <Sparkles className="w-8 h-8 mx-auto text-[color:var(--nd-accent)]" />
          <h2 className={`nd-h2 text-xl ${isDark ? 'text-white' : ''}`}>ابزارهای هوشمند به‌زودی فعال می‌شوند</h2>
          <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'} max-w-md mx-auto`}>
            این بخش موقتاً در حال به‌روزرسانی است. برای اطلاع از زمان راه‌اندازی با ما در ارتباط باشید.
          </p>
          <button onClick={() => onNavigate('contact')} className="nd-btn nd-btn-accent px-6 py-3 text-sm mx-auto">
            <span>ارتباط با پشتیبانی</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </section>
      ) : (
        <>
          {/* 2. Three Clean Proof Metrics (Zero Clutter) */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Sparkles,
                title: 'هوش مصنوعی بدون توقف',
                desc: 'سیستم ۳ کلید API با اتصال همزمان به گوگل و OpenAI.',
              },
              {
                icon: ShieldCheck,
                title: `${toFa(INITIAL_FREE_COINS)} سکه طلایی هدیه`,
                desc: 'تست زنده قبل از خرید؛ بدون نیاز به ثبت کارت بانکی.',
              },
              {
                icon: TrendingUp,
                title: 'روزی فقط ۱۱ تا ۱۴ هزار تومان',
                desc: 'کمتر از قیمت یک پاکت آدامس! با بازگشت سرمایه فوری.',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="nd-card p-5 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h3 className={`text-sm font-black truncate ${isDark ? 'text-white' : ''}`}>{f.title}</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{f.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* 3. Product Cards Grid — Minimal, Standard Spacing */}
          <section className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className={`nd-h2 text-xl sm:text-2xl ${isDark ? 'text-white' : ''}`}>
                  ابزارهای تخصصی تصمیم‌گیری و رشد
                </h2>
                <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                  روی هر محصول کلیک کنید تا سناریوی شبیه‌سازی‌شده و دمو را مشاهده کنید.
                </p>
              </div>
              <span className="nd-chip self-start sm:self-auto">
                <Sparkles className="w-3 h-3 text-[color:var(--nd-accent)]" /> {toFa(INITIAL_FREE_COINS)} سکه هدیه آماده تست
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleTools.map((tool) => {
                const spec = getProductDetail(tool.id);
                const neuro = getNeuromarketingTrigger(tool.id);
                // What the admin changed in «محصولات» wins over the designed copy; untouched products keep it.
                const copy = productCopy(rawProducts.find((p) => p.id === tool.id));

                return (
                  <div
                    key={tool.id}
                    className="nd-card nd-card-hover p-7 sm:p-8 flex flex-col justify-between gap-6"
                  >
                    {/* Top: 3D Badge + Category */}
                    <div className="flex items-start justify-between gap-4">
                      <IconBadge3D iconName={tool.iconName} theme={theme} size="md" glowColor={tool.glow} floating={false} />
                      <span className="nd-chip">{tool.badge}</span>
                    </div>

                    {/* Middle: Clean Title & Sharp Value Hook */}
                    <div className="space-y-2">
                      <h3 className={`nd-h2 text-xl ${isDark ? 'text-white' : ''}`}>
                        {tool.name}
                      </h3>
                      <p className="text-xs sm:text-[13px] font-extrabold text-[color:var(--nd-accent)] leading-relaxed">
                        {copy.hook || spec?.heroHook || tool.tagline}
                      </p>
                      <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'} line-clamp-2`}>
                        {copy.subhook || spec?.heroSubhook || tool.description}
                      </p>
                    </div>

                    {/* Key Outcome Highlight */}
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{spec?.painsAndGains[0]?.gain || 'پاسخ و چک‌لیست عملیاتی فوری'}</span>
                    </div>

                    {/* Bottom: Price + Single Primary Action */}
                    <div className={`pt-5 border-t flex items-center justify-between gap-4 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                      <div>
                        <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'nd-muted'}`}>تعرفه</span>
                        <span className="text-xs font-black text-amber-500 dark:text-amber-400">{copy.price || neuro.dailyHook}</span>
                      </div>

                      <button
                        onClick={() => {
                          if (onSelectProduct) onSelectProduct(tool.id);
                          else onNavigate(`products/${tool.id}`);
                        }}
                        className="nd-btn nd-btn-accent text-xs py-2.5 px-5 font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
                      >
                        <span>مشاهده ابزار و تست</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. Closing CTA Panel — Matches ServicesPage & ProjectsPage */}
          <CtaPanel
            theme={theme}
            title="می‌خواهی قبل از تصمیم‌گیری کیفیت پاسخ‌ها را بسنجی؟"
            desc={`به محض ورود به هر ابزار، ${toFa(INITIAL_FREE_COINS)} سکه طلایی هدیه به حسابت اضافه می‌شود تا بدون نیاز به پرداخت، عملکرد آن را روی چالش‌های کاری‌ات تست کنی.`}
            primaryLabel="شروع گفتگو با ۵۰۰ سکه هدیه"
            onPrimary={() => {
              if (visibleTools[0]) {
                if (onSelectProduct) onSelectProduct(visibleTools[0].id);
                else onNavigate(`products/${visibleTools[0].id}`);
              }
            }}
          />
        </>
      )}

      {/* Quick Chat Modal if opened */}
      {quickChatTool && (
        <ToolChatModal
          tool={quickChatTool}
          theme={theme}
          data={data}
          channels={cfg?.channels}
          purchaseNote={cfg?.purchaseNote}
          socialProof={cfg?.socialProof}
          urgency={cfg?.urgency}
          onClose={() => setQuickChatTool(null)}
        />
      )}
    </div>
  );
};
