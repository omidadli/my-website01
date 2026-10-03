import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowLeft, Check, MessageCircle, Gift } from 'lucide-react';
import type { Page, ProductItem, Theme } from '../types';
import { useContent } from '../context/ContentContext';
import { IconBadge3D } from './3D/3DIconBadge';
import { linkProps, navigate, pathForProduct } from '../utils/router';
import { AI_TOOLS } from '../data/tools';
import { getProductDetail } from '../data/productDetails';
import { INITIAL_FREE_COINS, startingPrice } from '../../lib/toolPlans';
import { fromPriceLabel } from '../utils/productCopy';
import { angleFor, isCurrentProductId, type ProductAngle, type ProductId, type PromoTopic } from '../data/productPromo';

/**
 * Native product placements.
 *
 * Every block here reads the live CMS product (name, icon, badge, price) and
 * pairs it with copy chosen for the surrounding context (see
 * src/data/productPromo.ts), so an article about CAC advertises the
 * business-therapist with a CAC-specific hook instead of a generic banner.
 *
 * Rules that keep this non-annoying:
 *  - a product that the admin disabled (or the whole tools section being off)
 *    renders nothing;
 *  - every block is a real <a href="/products/<id>"> so it is crawlable,
 *    middle-clickable and works before hydration;
 *  - at most one promo block per screen in the reading flow.
 */

const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export interface ResolvedProduct {
  id: string;
  name: string;
  iconName: string;
  glow: 'magenta' | 'blue' | 'purple' | 'emerald';
  badge: string;
  price: string;
}

/** Merge the CMS product (admin-editable) with the built-in display metadata. */
export const resolveProduct = (data: any, id: string): ResolvedProduct => {
  const cms: Partial<ProductItem> | undefined = (Array.isArray(data?.PRODUCTS) ? data.PRODUCTS : []).find(
    (p: any) => p && p.id === id,
  );
  const meta = AI_TOOLS.find((t) => t.id === id);
  const spec = getProductDetail(id);
  return {
    id,
    name: cms?.title || meta?.name || spec?.shortTitle || id,
    iconName: cms?.iconName || meta?.iconName || 'sparkles',
    glow: (cms?.glow || meta?.glow || 'magenta') as ResolvedProduct['glow'],
    badge: cms?.badge || meta?.badge || 'ابزار هوشمند',
    price: cms?.price || startingPrice(id, data) || '',
  };
};

/** A product is promotable when it exists, is published and the admin kept it on. */
export const isProductPromotable = (data: any, id: string): boolean => {
  // A stale CMS row must never make a retired product eligible for a promo.
  if (!isCurrentProductId(id)) return false;
  if (data?.AI_TOOLS_CONFIG?.enabled === false) return false;
  if (data?.AI_TOOLS_CONFIG?.tools?.[id]?.enabled === false) return false;
  const cms = (Array.isArray(data?.PRODUCTS) ? data.PRODUCTS : []).find((p: any) => p && p.id === id);
  if (cms && cms.status === 'draft') return false;
  return !!(cms || AI_TOOLS.some((t) => t.id === id));
};

/** Filter a ranked list down to the products that are actually promotable. */
export const usePromotable = (ids: ProductId[]): ProductId[] => {
  const { data } = useContent();
  const list = Array.isArray(ids) ? ids : [];
  return list.filter((id) => isProductPromotable(data, id));
};

export interface ProductPromoProps {
  productId: ProductId;
  theme: Theme;
  onNavigate: (page: Page) => void;
  /** Context that picks the copy (article cluster, service, page…). */
  topic?: PromoTopic;
  variant?: 'inline' | 'banner' | 'compact' | 'row' | 'card';
  /** Fully override the auto-selected copy. */
  angle?: ProductAngle;
  /** Override the small chip above the title. */
  eyebrow?: string;
  className?: string;
}

export const ProductPromo: React.FC<ProductPromoProps> = ({
  productId,
  theme,
  onNavigate,
  topic,
  variant = 'card',
  angle,
  eyebrow,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const { data } = useContent();

  if (!isProductPromotable(data, productId)) return null;

  const product = resolveProduct(data, productId);
  const copy = angle || angleFor(productId, topic);
  const href = pathForProduct(productId);
  // `navigate()` pushes the real path and fires NAVIGATE_EVENT, which the app
  // turns into page + productId state — so this works from any surface (blog
  // post, service card, home section) without every page needing a new prop
  // and without `pathForPage()` escaping the "/" in "products/<id>".
  const go = () => {
    navigate(href);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const link = linkProps(href, go);

  const mutedCls = isDark ? 'text-slate-400' : 'nd-muted';
  const titleCls = isDark ? 'text-white' : '';

  /* ---------------------------------------------------------------- */
  /*  Inline — sits inside an article body, reads like part of the text */
  /* ---------------------------------------------------------------- */
  if (variant === 'inline') {
    return (
      <motion.aside
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`nd-card overflow-hidden ${className}`}
      >
        <a {...link} className="block p-6 sm:p-7 space-y-4 text-right group cursor-pointer">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black ${
                isDark ? 'bg-indigo-500/15 text-indigo-200' : 'bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>{eyebrow || 'یک ابزار برای همین مسئله'}</span>
            </span>
            <span className="nd-chip">{product.badge}</span>
          </div>

          <div className="flex items-start gap-4">
            <IconBadge3D iconName={product.iconName} theme={theme} size="md" glowColor={product.glow} floating={false} />
            <div className="space-y-2 min-w-0 flex-1">
              <h3 className={`nd-h2 text-base sm:text-lg leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${titleCls}`}>
                {product.name}
              </h3>
              <p className={`text-xs sm:text-sm font-extrabold leading-relaxed ${isDark ? 'text-indigo-200' : 'text-[color:var(--nd-accent)]'}`}>
                {copy.hook}
              </p>
            </div>
          </div>

          <p className={`text-xs leading-relaxed ${mutedCls}`}>{copy.relevance}</p>

          <ul className="space-y-2">
            {copy.bullets.slice(0, 3).map((b, i) => (
              <li key={i} className={`flex items-start gap-2 text-[11px] sm:text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>
                <Check className="w-3.5 h-3.5 text-[color:var(--nd-success)] shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 border-t ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-amber-500 dark:text-amber-400">
              <Gift className="w-3.5 h-3.5" />
              <span>{toFa(INITIAL_FREE_COINS)} سکه هدیه · تست بدون کارت بانکی</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[color:var(--nd-accent)] group-hover:gap-2.5 transition-all">
              <span>{copy.cta}</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </a>
      </motion.aside>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Banner — full-width band, used on list/landing pages            */
  /* ---------------------------------------------------------------- */
  if (variant === 'banner') {
    return (
      <motion.section
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} relative rounded-[var(--nd-radius-panel)] p-7 sm:p-10 overflow-hidden ${className}`}
      >
        <div className="absolute w-72 h-72 -top-24 -left-16 rounded-full blur-3xl opacity-25 nd-float-slow" style={{ background: 'radial-gradient(circle, rgba(99,91,255,0.55), transparent 65%)' }} aria-hidden />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          <IconBadge3D iconName={product.iconName} theme={theme} size="lg" glowColor={product.glow} floating={false} />

          <div className="space-y-2.5 flex-1 min-w-0 text-right">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black ${isDark ? 'nd-glass-dark text-indigo-200' : 'nd-eyebrow'}`}>
              <Sparkles className="w-3 h-3" />
              <span>{eyebrow || product.badge}</span>
            </span>
            <h3 className={`nd-h2 text-lg sm:text-2xl leading-snug ${titleCls}`}>{copy.hook}</h3>
            <p className={`text-xs sm:text-sm leading-relaxed max-w-2xl ${mutedCls}`}>{copy.relevance}</p>
            {product.price && (
              <p className="text-[11px] font-extrabold text-amber-500 dark:text-amber-400">{product.price} · {toFa(INITIAL_FREE_COINS)} سکه هدیه</p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 w-full md:w-auto shrink-0">
            <a {...link} className="nd-btn nd-btn-accent px-6 py-3.5 text-xs whitespace-nowrap justify-center">
              <MessageCircle className="w-4 h-4" />
              <span>{copy.cta}</span>
            </a>
            <a {...linkProps('/products', () => onNavigate('products'))} className={`nd-btn ${isDark ? 'nd-glass-dark bg-white/5 border-white/15 text-white hover:bg-white/10' : 'nd-btn-ghost'} px-6 py-3 text-[11px] justify-center`}>
              <span>دیدن همه ابزارها</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </motion.section>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Row — one slim line, meant to live INSIDE another card (services) */
  /* ---------------------------------------------------------------- */
  if (variant === 'row') {
    return (
      <a
        {...link}
        className={`flex items-start gap-3 p-3.5 rounded-2xl border text-right group cursor-pointer ${
          isDark ? 'bg-white/5 border-white/10 hover:border-indigo-400/40' : 'bg-[color:var(--nd-bg-soft)] border-[color:var(--nd-line)] hover:border-[color:var(--nd-accent)]'
        } ${className}`}
      >
        <IconBadge3D iconName={product.iconName} theme={theme} size="sm" glowColor={product.glow} floating={false} />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={`block text-[10px] font-black ${isDark ? 'text-indigo-200' : 'text-[color:var(--nd-accent)]'}`}>
            {eyebrow || 'ابزار مکمل این خدمت'}
          </span>
          <span className={`block text-xs font-extrabold leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${titleCls}`}>
            {product.name}
          </span>
          <span className={`block text-[11px] leading-relaxed line-clamp-2 ${mutedCls}`}>{copy.hook}</span>
        </span>
        <ArrowLeft className="w-4 h-4 mt-1 shrink-0 text-[color:var(--nd-faint)] group-hover:text-[color:var(--nd-accent)] group-hover:translate-x-0.5 transition-transform" />
      </a>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Compact — sidebar / single row                                   */
  /* ---------------------------------------------------------------- */
  if (variant === 'compact') {
    return (
      <a {...link} className={`nd-card nd-card-hover p-4 flex items-start gap-3 text-right group cursor-pointer ${className}`}>
        <IconBadge3D iconName={product.iconName} theme={theme} size="sm" glowColor={product.glow} floating={false} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className={`block text-[11px] font-black ${isDark ? 'text-indigo-200' : 'text-[color:var(--nd-accent)]'}`}>
            {eyebrow || product.badge}
          </span>
          <span className={`block text-xs font-extrabold leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${titleCls}`}>
            {product.name}
          </span>
          <span className={`block text-[11px] leading-relaxed ${mutedCls}`}>{copy.hook}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-[color:var(--nd-accent)] pt-1">
            <span>{copy.cta}</span>
            <ArrowLeft className="w-3 h-3" />
          </span>
        </span>
      </a>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Card — the default grid card (home, related, cross-sell)         */
  /* ---------------------------------------------------------------- */
  return (
    <motion.a
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      {...link}
      className={`nd-card nd-card-hover p-6 sm:p-7 flex flex-col gap-5 text-right group cursor-pointer ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <IconBadge3D iconName={product.iconName} theme={theme} size="md" glowColor={product.glow} floating={false} />
        <span className="nd-chip">{product.badge}</span>
      </div>

      <div className="space-y-2">
        <h3 className={`nd-h2 text-base sm:text-lg leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${titleCls}`}>
          {product.name}
        </h3>
        <p className={`text-xs font-extrabold leading-relaxed ${isDark ? 'text-indigo-200' : 'text-[color:var(--nd-accent)]'}`}>
          {copy.hook}
        </p>
        <p className={`text-[11px] leading-relaxed ${mutedCls}`}>{copy.relevance}</p>
      </div>

      <ul className="space-y-2">
        {copy.bullets.slice(0, 3).map((b, i) => (
          <li key={i} className={`flex items-start gap-2 text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>
            <Check className="w-3.5 h-3.5 text-[color:var(--nd-success)] shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className={`pt-4 mt-auto border-t flex items-center justify-between gap-3 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
        <span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400">
          {product.price ? fromPriceLabel(product.price) : `${toFa(INITIAL_FREE_COINS)} سکه هدیه`}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-[color:var(--nd-accent)] group-hover:gap-2.5 transition-all">
          <span>{copy.cta}</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </span>
      </div>
    </motion.a>
  );
};

/* ------------------------------------------------------------------ */
/*  Strip — headline + a grid of product promos                        */
/* ------------------------------------------------------------------ */

export interface ProductPromoStripProps {
  productIds: ProductId[];
  theme: Theme;
  onNavigate: (page: Page) => void;
  topic?: PromoTopic;
  variant?: 'card' | 'compact';
  eyebrow?: string;
  title?: string;
  desc?: string;
  /** Tailwind grid classes for the card variant. */
  gridClassName?: string;
  className?: string;
}

export const ProductPromoStrip: React.FC<ProductPromoStripProps> = ({
  productIds,
  theme,
  onNavigate,
  topic,
  variant = 'card',
  eyebrow,
  title,
  desc,
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 gap-5',
  className = '',
}) => {
  const isDark = theme === 'dark';
  const available = usePromotable(productIds);
  if (available.length === 0) return null;

  return (
    <section className={`space-y-6 ${className}`}>
      {(title || desc || eyebrow) && (
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          {eyebrow && (
            <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>{eyebrow}</span>
            </span>
          )}
          {title && <h2 className={`nd-h2 text-xl sm:text-2xl lg:text-3xl ${isDark ? 'text-white' : ''}`}>{title}</h2>}
          {desc && <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{desc}</p>}
        </div>
      )}
      <div className={gridClassName}>
        {available.map((id) => (
          <ProductPromo key={id} productId={id} theme={theme} onNavigate={onNavigate} topic={topic} variant={variant} />
        ))}
      </div>
    </section>
  );
};
