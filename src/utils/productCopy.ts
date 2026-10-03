import type { ProductItem, ProductPlan } from '../types';
import { PRODUCTS as BUILT_IN_PRODUCTS } from '../data/contentCore';

/**
 * Product copy: what the admin changed vs. what the page designs already say.
 *
 * The /products cards and the product landing pages carry hand-written, designed copy (src/data/productDetails.ts,
 * lib/toolPlans.ts) that is richer than the CMS defaults. The CMS product record ("محصولات" in the admin panel) used
 * to be ignored for most fields — edits to the description, price, plans… changed nothing on the site.
 *
 * Rule: a CMS field overrides the designed copy only when the admin actually changed it, i.e. when it differs
 * from the product's built-in default. Unedited products keep the designed copy exactly as it is; an edit
 * always shows up. (Same idea for plans, compared per plan id.)
 */

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** `true` when `value` is non-empty and differs from the built-in default. */
export const isEditedText = (value: unknown, builtIn: unknown): boolean => text(value) !== '' && text(value) !== text(builtIn);

const cleanList = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

/** `true` when the list has real items and differs from the built-in default list. */
export const isEditedList = (value: unknown, builtIn: unknown): boolean => {
  const next = cleanList(value);
  return next.length > 0 && JSON.stringify(next) !== JSON.stringify(cleanList(builtIn));
};

export const builtInProduct = (id: string): ProductItem | undefined => BUILT_IN_PRODUCTS.find((p) => p.id === id);

export interface ProductCopy {
  title?: string;
  /** replaces the designed hero headline / card hook */
  hook?: string;
  /** replaces the designed hero sub-headline / card description */
  subhook?: string;
  badge?: string;
  actionText?: string;
  price?: string;
  audience?: string;
  problem?: string;
  whyBuy?: string;
  features?: string[];
  howItWorks?: string[];
}

/** Fields of `cms` the admin changed. `{}` when the product is untouched (or unknown). */
export const productCopy = (cms: ProductItem | null | undefined): ProductCopy => {
  if (!cms || typeof cms !== 'object') return {};
  const base = builtInProduct(cms.id);
  const out: ProductCopy = {};
  if (isEditedText(cms.title, base?.title)) out.title = text(cms.title);
  if (isEditedText(cms.tagline, base?.tagline)) out.hook = text(cms.tagline);
  if (isEditedText(cms.description, base?.description)) out.subhook = text(cms.description);
  if (isEditedText(cms.badge, base?.badge)) out.badge = text(cms.badge);
  if (isEditedText(cms.actionText, base?.actionText)) out.actionText = text(cms.actionText);
  if (isEditedText(cms.price, base?.price)) out.price = text(cms.price);
  if (isEditedText(cms.targetAudience, base?.targetAudience)) out.audience = text(cms.targetAudience);
  if (isEditedText(cms.problemSolved, base?.problemSolved)) out.problem = text(cms.problemSolved);
  if (isEditedText(cms.whyBuy, base?.whyBuy)) out.whyBuy = text(cms.whyBuy);
  if (isEditedList(cms.features, base?.features)) out.features = cleanList(cms.features);
  if (isEditedList(cms.howItWorks, base?.howItWorks)) out.howItWorks = cleanList(cms.howItWorks);
  return out;
};

/** Does the landing page need its extra "about this tool" block? */
export const hasAboutBlock = (c: ProductCopy): boolean => !!(c.audience || c.problem || c.whyBuy || c.features?.length || c.howItWorks?.length);

export interface PlanCopy {
  name?: string;
  tagline?: string;
  badge?: string;
  perks?: string[];
}

/** Display fields of one plan the admin changed (price has its own override: AI_TOOLS_CONFIG…planPrices). */
export const planCopy = (cms: ProductItem | null | undefined, planId: string): PlanCopy => {
  if (!cms || !Array.isArray(cms.plans)) return {};
  const plan: ProductPlan | undefined = cms.plans.find((p) => p && p.id === planId);
  if (!plan) return {};
  const base = builtInProduct(cms.id)?.plans?.find((p) => p.id === planId);
  const out: PlanCopy = {};
  if (isEditedText(plan.name, base?.name)) out.name = text(plan.name);
  if (isEditedText(plan.tagline, base?.tagline)) out.tagline = text(plan.tagline);
  if (isEditedText(plan.badge, base?.badge)) out.badge = text(plan.badge);
  if (isEditedList(plan.perks, base?.perks)) out.perks = cleanList(plan.perks);
  return out;
};

/** Merge the admin's plan edits over the designed plans (only the fields that were edited). */
export const withPlanCopy = <T extends { id: string; name: string; tagline: string; perks: string[]; badge?: string }>(
  plans: readonly T[],
  cms: ProductItem | null | undefined,
): T[] =>
  plans.map((p) => {
    const c = planCopy(cms, p.id);
    return { ...p, ...c };
  });
