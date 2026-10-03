import { migrateGlobalSeo, migrateLegacySiteHost, type SeoGlobalLike } from '../../lib/seoDefaults';
import { isStockPortrait } from './profilePhoto';

/**
 * Repairs for values an old CMS seed left in stored content. They run whenever content is adopted
 * (browser cache and cloud), so the admin panel shows the corrected value and the next save writes it
 * back to D1 — the edge applies the same SEO repair independently (functions/_seo.ts), so crawlers
 * are right even before anybody re-saves.
 */

interface PersonalInfoLike {
  website?: string;
  avatar?: string;
}

/**
 * - `website` (shown in the footer) pointing at a dead domain → the real one.
 * - `avatar` empty, or a stock portrait of a stranger → the built-in portrait (`defaults.avatar`).
 */
export const migratePersonalInfo = <T extends PersonalInfoLike>(info: T, defaults: PersonalInfoLike): T => {
  const out: T = { ...info };
  if (typeof out.website === 'string') out.website = migrateLegacySiteHost(out.website);
  if (typeof out.avatar !== 'string' || !out.avatar.trim() || isStockPortrait(out.avatar)) out.avatar = defaults.avatar;
  return out;
};

/** Defaults under the stored block, then the stale-seed repair on top. */
export const reconcileGlobalSeo = <T extends SeoGlobalLike>(defaults: T, stored: Partial<T> | null | undefined): T =>
  migrateGlobalSeo({ ...defaults, ...(stored || {}) });

/**
 * Section lists are stored with their admin-facing labels, so a label that described a block which was later
 * removed from the page ("آنالیز رایگان", "نقل‌قول مشتری") would live on in the database forever. Re-apply the
 * current labels by section `name`; visibility and order the admin chose are kept.
 */
export const refreshSectionLabels = <T extends { name: string; label: string }>(stored: unknown, defaults: readonly T[]): T[] => {
  if (!Array.isArray(stored)) return [...defaults];
  return stored.map((section: T) => {
    const current = defaults.find((d) => d.name === section?.name);
    return current ? { ...section, label: current.label } : section;
  });
};
