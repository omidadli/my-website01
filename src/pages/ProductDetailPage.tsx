import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Zap,
  TrendingUp,
  Check,
  CheckCircle2,
  Lock,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Home,
  Crown,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { Theme, Page } from '../types';
import { Head } from '../components/nd/Kit';
import { ToolChatModal } from '../components/tools/ToolChatModal';
import { getProductDetail } from '../data/productDetails';
import { AI_TOOLS, AiToolMeta } from '../data/tools';
import { getPlans, resolvePlanPrice, ToolPlan, INITIAL_FREE_COINS } from '../../lib/toolPlans';
import { PERSONAL_INFO } from '../data/content';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { ProductPromoStrip } from '../components/ProductPromo';
import { complementaryProducts, relatedPostsForProduct } from '../data/productPromo';
import { linkProps, navigate, postPath } from '../utils/router';
import { safeRecordArray } from '../utils/contentDefaults';
import { mdToPlainText } from '../utils/plainText';
import { hasAboutBlock, productCopy, withPlanCopy } from '../utils/productCopy';
import type { ProductItem } from '../types';

interface Props {
  productId: string;
  theme?: Theme;
  onNavigate: (page: Page) => void;
}

const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export const ProductDetailPage: React.FC<Props> = ({ productId, theme = 'dark', onNavigate }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const cfg = data.AI_TOOLS_CONFIG;

  const spec = getProductDetail(productId) || getProductDetail('business-therapist')!;
  const baseToolMeta: AiToolMeta = AI_TOOLS.find((t) => t.id === productId) || AI_TOOLS[0];
  // What the admin changed in «محصولات» wins over the designed copy below; an untouched product is unchanged.
  const cmsProduct = safeRecordArray<ProductItem>(data.PRODUCTS).find((p) => p.id === baseToolMeta.id);
  const copy = productCopy(cmsProduct);
  const toolMeta: AiToolMeta = copy.title ? { ...baseToolMeta, name: copy.title } : baseToolMeta;
  const shortTitle = copy.title || spec.shortTitle;
  const plans = withPlanCopy(getPlans(toolMeta.id), cmsProduct);

  // Articles that naturally lead to this tool — the way back from product to content.
  const relatedPosts = relatedPostsForProduct(
    safeRecordArray<any>(data.BLOG_POSTS).filter((p) => p && typeof p.id === 'string' && p.status !== 'draft'),
    productId,
    3,
  );

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [selectedPlan, setSelectedPlan] = useState<string>(plans.find((p) => p.popular)?.id || plans[0]?.id || '');

  const selPlan = plans.find((p) => p.id === selectedPlan);
  const purchaseMsg = `سلام امید 👋 می‌خوام پلنِ «${selPlan?.name || ''}» از ابزار «${toolMeta.name}» رو فعال کنم${
    selPlan ? ` (${resolvePlanPrice(toolMeta.id, selPlan, data)} — ${selPlan.dailyCost || ''})` : ''
  } تا سکه‌های باقیمانده‌ام ذخیره بمونه و بدون محدودیت استفاده کنم. لطفاً راهنمایی کن.`;

  const waBase = cfg?.channels?.whatsappUrl || PERSONAL_INFO.whatsappUrl;
  const waUrl = `${waBase}${waBase.includes('?') ? '&' : '?'}text=${encodeURIComponent(purchaseMsg)}`;
  const tgUrl = cfg?.channels?.telegramUrl || PERSONAL_INFO.telegramUrl;
  const baleUrl = cfg?.channels?.baleUrl || 'https://ble.ir/';
  const phoneLabel = cfg?.channels?.phone || PERSONAL_INFO.phoneFormatted;

  return (
    <div className="space-y-16 py-4 max-w-5xl mx-auto dir-rtl font-['Vazirmatn',sans-serif]">
      {/* 1. Standard Minimal Breadcrumb */}
      <nav className="flex items-center justify-between gap-2 text-[11px] font-bold text-[color:var(--nd-faint)] px-1" aria-label="مسیر صفحه">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1 hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">
            <Home className="w-3.5 h-3.5" />
            <span>صفحه اصلی</span>
          </button>
          <ChevronLeft className="w-3 h-3 opacity-60" />
          <button onClick={() => onNavigate('products')} className="hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">
            <span>محصولات</span>
          </button>
          <ChevronLeft className="w-3 h-3 opacity-60" />
          <span className="text-[color:var(--nd-accent)] font-extrabold">{shortTitle}</span>
        </div>

        <span className="nd-chip">
          <Sparkles className="w-3 h-3 text-[color:var(--nd-accent)]" /> {toFa(INITIAL_FREE_COINS)} سکه هدیه تست
        </span>
      </nav>

      {/* 2. Standard Hero Stage */}
      <section className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[32px] sm:rounded-[40px] p-8 sm:p-12 text-center space-y-6 relative overflow-hidden`}>
        <span className="nd-chip">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--nd-accent)] animate-pulse" />
          <span>{copy.badge || spec.categoryBadge}</span>
        </span>

        <h1 className={`nd-h1 text-2xl sm:text-4xl lg:text-[2.6rem] max-w-3xl mx-auto ${isDark ? 'text-white' : ''}`}>
          {copy.hook || spec.heroHook}
        </h1>

        <p className={`${isDark ? 'text-slate-300' : 'nd-muted'} text-sm sm:text-base leading-relaxed max-w-2xl mx-auto`}>
          {copy.subhook || spec.heroSubhook}
        </p>

        {/* Primary CTA button */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => setIsChatOpen(true)}
            className="nd-btn nd-btn-accent px-8 py-3.5 text-sm font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{copy.actionText || 'شروع تست گفتگو با ۵۰۰ سکه هدیه'}</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
        {copy.price && (
          <p className="text-sm font-black text-[color:var(--nd-accent)]">{copy.price}</p>
        )}

        <p className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
          بدون نیاز به ثبت کارت بانکی · کسر ۱۵۰ سکه برای هر تحلیل · فعال‌سازی آنی
        </p>
      </section>

      {/* 2b. About this tool — appears only for the fields the admin filled in «محصولات» */}
      {hasAboutBlock(copy) && (
        <section className="nd-card p-6 sm:p-8 space-y-6 max-w-3xl mx-auto" aria-label="درباره این ابزار">
          {([
            ['برای چه کسانی؟', copy.audience],
            ['چه مشکلی را حل می‌کند؟', copy.problem],
            ['چرا ارزشش را دارد؟', copy.whyBuy],
          ] as const).map(([label, body]) =>
            body ? (
              <div key={label} className="space-y-1.5">
                <h3 className="text-sm font-black text-[color:var(--nd-accent)]">{label}</h3>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>{body}</p>
              </div>
            ) : null,
          )}
          {copy.features && copy.features.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-[color:var(--nd-accent)]">ویژگی‌ها</h3>
              <ul className="space-y-2">
                {copy.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className={isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {copy.howItWorks && copy.howItWorks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-[color:var(--nd-accent)]">چطور کار می‌کند؟</h3>
              <ol className="space-y-2">
                {copy.howItWorks.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] text-xs font-black flex items-center justify-center shrink-0">{toFa(i + 1)}</span>
                    <span className={isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* 3. Interactive Simulated Session — Clean and Standard */}
      <section className="space-y-8">
        <Head
          theme={theme}
          eyebrow="نمونه عملکرد ابزار"
          icon={<Zap className="w-4 h-4" />}
          title={spec.simulatedCase.scenarioTitle}
          desc="یک نمونه واقعی از نحوه تحلیل چالش و تحویل چک‌لیست عملیاتی توسط این دستیار"
        />

        <div className="nd-card p-6 sm:p-8 space-y-6 max-w-3xl mx-auto">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-[color:var(--nd-line)] text-xs">
            <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              محیط تحلیل هوشمند «{shortTitle}»
            </span>
            {spec.simulatedCase.scorecard && (
              <span className="nd-chip text-emerald-600 dark:text-emerald-400 font-bold">
                {spec.simulatedCase.scorecard.label}: {spec.simulatedCase.scorecard.score}
              </span>
            )}
          </div>

          {/* User Input */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block">چالش مطرح‌شده:</span>
            <div className="p-4 rounded-2xl rounded-tr-sm bg-[color:var(--nd-accent)] text-white text-xs sm:text-sm leading-relaxed">
              {spec.simulatedCase.userInput}
            </div>
          </div>

          {/* AI Response */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-[color:var(--nd-accent)] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>تحلیل عمیق دستیار:</span>
            </span>
            <div className={`p-4 rounded-2xl rounded-tl-sm text-xs sm:text-sm leading-relaxed border ${
              isDark ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              {spec.simulatedCase.aiInsight}
            </div>
          </div>

          {/* Action Checklist */}
          <div className={`p-5 rounded-2xl border space-y-3 ${
            isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{spec.simulatedCase.checklistTitle}</span>
            </span>
            <div className="space-y-2">
              {spec.simulatedCase.checklistItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  <span className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                    ✓
                  </span>
                  <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Direct CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[color:var(--nd-line)]">
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
              می‌خواهی مسئله کاری خودت را مطرح کنی؟
            </span>
            <button
              onClick={() => setIsChatOpen(true)}
              className="nd-btn nd-btn-accent text-xs py-2 px-4 font-black flex items-center gap-1.5 cursor-pointer"
            >
              <span>تست زنده چت (۵۰۰ سکه هدیه)</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. The Transformation (Before vs After) — Standard Minimal Cards */}
      <section className="space-y-8">
        <Head
          theme={theme}
          eyebrow="تغییر ملموس"
          icon={<TrendingUp className="w-4 h-4" />}
          title="مقایسه قبل و بعد از این ابزار"
          desc="چرا تهیه این دستیار تصمیمی کاملاً اقتصادی و بازگرداننده سرمایه است؟"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {spec.painsAndGains.map((item, idx) => (
            <div
              key={idx}
              className="nd-card p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-2">
                <span className="text-xs font-black text-red-500 block">❌ روش سنتی و پرهزینه</span>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                  {item.pain}
                </p>
              </div>

              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                  ✓ با «{shortTitle}»
                </span>
                <p className="text-xs font-bold leading-relaxed text-emerald-800 dark:text-emerald-200">
                  {item.gain}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Pricing Tiers — Standard Clean Cards */}
      <section className="space-y-8">
        <Head
          theme={theme}
          eyebrow="تعرفه شفاف"
          icon={<ShieldCheck className="w-4 h-4" />}
          title="پلن‌های فعال‌سازی و دسترسی"
          desc="روزی فقط ۱۱ تا ۱۴ هزار تومان — کمتر از قیمت یک پاکت آدامس!"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {plans.map((p: ToolPlan) => {
            const isSel = selectedPlan === p.id;
            const price = resolvePlanPrice(toolMeta.id, p, data);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`nd-card nd-card-hover p-6 sm:p-7 flex flex-col justify-between gap-4 text-right cursor-pointer transition-all ${
                  isSel ? 'ring-2 ring-[color:var(--nd-accent)]' : ''
                } ${p.popular ? 'md:scale-[1.02]' : ''}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p.id === 'vip' ? (
                        <Crown className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-[color:var(--nd-accent)]" />
                      )}
                      <span className={`text-base font-black ${isDark ? 'text-white' : ''}`}>{p.name}</span>
                    </div>
                    {p.badge && (
                      <span className="nd-chip text-[10px] font-bold text-[color:var(--nd-accent)]">
                        {p.badge}
                      </span>
                    )}
                  </div>

                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{p.tagline}</p>

                  <div className="py-1">
                    <div className="text-[color:var(--nd-accent)] font-black text-xl">{price}</div>
                    {p.dailyCost && (
                      <div className="text-xs font-extrabold text-amber-500 dark:text-amber-400 mt-0.5">
                        {p.dailyCost}
                      </div>
                    )}
                  </div>

                  <ul className={`space-y-2 text-xs pt-3 border-t border-[color:var(--nd-line)] ${isDark ? 'text-slate-300' : 'nd-muted'}`}>
                    {p.perks.map((perk, pi) => (
                      <li key={pi} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <span
                  className={`mt-4 text-center text-xs font-black rounded-xl py-2.5 transition-colors ${
                    isSel
                      ? 'bg-[color:var(--nd-accent)] text-white'
                      : isDark
                      ? 'bg-white/8 text-slate-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {isSel ? 'پلن انتخابی شما ✓' : 'انتخاب'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Contact Funnel */}
        <div className="nd-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className={`text-sm font-black flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>روش سریع فعال‌سازی و دریافت کد اختصاصی:</span>
              </h3>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                روی پیام‌رسان دلخواه کلیک کنید تا پیام آماده ارسال شده و کد دسترسی اختصاصی را تحویل بگیرید.
              </p>
            </div>
            <span className="text-xs font-bold text-[color:var(--nd-accent)]">پشتیبانی: {phoneLabel}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nd-card nd-card-hover p-3 text-center text-xs font-bold flex items-center justify-center gap-2"
            >
              <span>✈️</span>
              <span>فعال‌سازی در تلگرام</span>
            </a>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nd-card nd-card-hover p-3 text-center text-xs font-bold flex items-center justify-center gap-2"
            >
              <span>🟢</span>
              <span>خرید در واتساپ</span>
            </a>
            <a
              href={baleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nd-card nd-card-hover p-3 text-center text-xs font-bold flex items-center justify-center gap-2"
            >
              <span>💬</span>
              <span>فعال‌سازی در بله</span>
            </a>
          </div>
        </div>
      </section>

      {/* 6. Minimal FAQ Accordion */}
      <section className="space-y-6 max-w-2xl mx-auto">
        <Head
          theme={theme}
          eyebrow="پاسخ به سوالات"
          title="سوالات متداول"
          desc="نکات مهم قبل از فعال‌سازی و تست ابزار"
        />

        <div className="space-y-2.5">
          {spec.faq.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div
                key={idx}
                className="nd-card overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="w-full p-4 text-right flex items-center justify-between gap-3 text-xs sm:text-sm font-bold cursor-pointer"
                >
                  <span className={isDark ? 'text-white' : ''}>{item.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 shrink-0 opacity-60" /> : <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />}
                </button>
                {isOpen && (
                  <div className={`px-4 pb-4 text-xs sm:text-[13px] leading-relaxed border-t border-[color:var(--nd-line)] pt-3 ${
                    isDark ? 'text-slate-300' : 'nd-muted'
                  }`}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. مقالاتی که دقیقاً به همین ابزار می‌رسند — مسیر برگشت به محتوا */}
      {relatedPosts.length > 0 && (
        <section className="space-y-6">
          <Head
            theme={theme}
            eyebrow="ادامه‌ی یادگیری"
            title="مقالاتی که همین ابزار را کامل می‌کنند"
            desc={`این نوشته‌ها همان چارچوب‌هایی را آموزش می‌دهند که «${shortTitle}» بر اساس آن‌ها با تو کار می‌کند.`}
          />
          <div className="grid grid-cols-1 gap-3">
            {relatedPosts.map((post) => (
              <a
                key={post.id}
                {...linkProps(postPath(post), () => navigate(postPath(post)))}
                className="nd-card nd-card-hover p-5 flex items-center gap-4 text-right cursor-pointer group"
              >
                <IconBadge3D iconName={post.imageIcon || 'sparkles'} theme={theme} size="sm" glowColor="purple" floating={false} />
                <span className="flex-1 min-w-0 space-y-1">
                  <span className={`block text-sm font-extrabold leading-snug line-clamp-1 group-hover:text-[color:var(--nd-accent)] transition-colors ${isDark ? 'text-white' : ''}`}>
                    {post.title}
                  </span>
                  <span className={`block text-[11px] leading-relaxed line-clamp-1 ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                    {mdToPlainText(post.excerpt)}
                  </span>
                </span>
                <span className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <span className="nd-chip">{post.categoryFa}</span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{post.readTime}</span>
                </span>
                <ChevronLeft className="w-4 h-4 shrink-0 text-[color:var(--nd-faint)] group-hover:text-[color:var(--nd-accent)] transition-colors" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 8. فروش متقابل — بقیه ابزارها */}
      <ProductPromoStrip
        productIds={complementaryProducts(toolMeta.id, 3)}
        theme={theme}
        onNavigate={onNavigate}
        eyebrow="ابزارهای مکمل"
        title="سه ابزار دیگر برای گره‌های دیگر"
        desc="هرکدام روی یک بن‌بست مشخص کار می‌کنند؛ می‌توانی جداگانه یا کنار هم داشته باشی‌شان."
        gridClassName="grid grid-cols-1 md:grid-cols-3 gap-5"
      />

      {/* Chat Modal for Instant Testing */}
      {isChatOpen && (
        <ToolChatModal
          tool={toolMeta}
          theme={theme}
          data={data}
          channels={cfg?.channels}
          purchaseNote={cfg?.purchaseNote}
          socialProof={cfg?.socialProof}
          urgency={cfg?.urgency}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
};
