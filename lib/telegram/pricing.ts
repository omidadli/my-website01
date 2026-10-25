/**
 * lib/telegram/pricing.ts — price/plan helpers for the Telegram sales bot.
 *
 * Plan definitions live in lib/toolPlans.ts (shared with the website). Price
 * labels are Persian display strings (e.g. «۵۹۰٬۰۰۰ تومان»); receipts and the
 * card-to-card flow need the numeric Toman amount, so we parse the label here.
 */
import { TOOL_PLANS, getPlan, type ToolPlan } from '../toolPlans';
import { TOOLS } from '../tools';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian/Arabic digit → Latin. */
export const faDigits = (s: string): string =>
  String(s || '').replace(/[۰-۹٠-٩]/g, (d) => {
    const i = PERSIAN_DIGITS.indexOf(d);
    return String(i >= 0 ? i : Math.max(0, ARABIC_DIGITS.indexOf(d)));
  });

/**
 * Parse a Persian price label into Toman (number).
 * «۵۹۰٬۰۰۰ تومان» -> 590000, «1,290,000 Toman» -> 1290000. 0 when unparseable.
 */
export const priceToToman = (label: string): number => {
  const s = faDigits(String(label || ''))
    .replace(/[٬,،\s]/g, '')
    .replace(/[^\d.]/g, ' ')
    .trim();
  const first = s.split(/\s+/).find((t) => /^\d+(\.\d+)?$/.test(t));
  if (!first) return 0;
  const n = Math.round(Number(first));
  return Number.isFinite(n) ? n : 0;
};

export interface BotProduct {
  id: string;
  name: string;
  tagline: string;
}

export const botProducts = (): BotProduct[] =>
  TOOLS.filter((t) => TOOL_PLANS[t.id]?.length).map((t) => ({ id: t.id, name: t.name, tagline: t.tagline }));

export const botProduct = (id: string): BotProduct | undefined => botProducts().find((p) => p.id === id);

export interface BotPlan extends ToolPlan {
  /** numeric Toman amount parsed from the price label (0 = unpriced) */
  amountToman: number;
}

export const botPlans = (productId: string): BotPlan[] =>
  (TOOL_PLANS[productId] || []).map((p) => ({ ...p, amountToman: priceToToman(p.price) }));

export const botPlan = (productId: string, planId: string): BotPlan | undefined =>
  botPlans(productId).find((p) => p.id === planId);

export const botProductPath = (productId: string): string => `/products/${encodeURIComponent(productId)}`;
