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

/**
 * A page renders only the sections that are in its stored list, and the admin panel's section manager can toggle
 * visibility and order but neither add nor delete a section. So a section that ships in a later release — the home
 * page's «AI_TOOLS» product showcase — never appeared on a site whose list had been saved before it existed, and
 * nothing the admin could do would bring it back.
 *
 * Insert every default section the stored list does not know yet right after the default section that precedes
 * it; labels are refreshed and everything the admin chose (order, visibility) is kept.
 */
export const reconcileSections = <T extends { name: string; label: string }>(stored: unknown, defaults: readonly T[]): T[] => {
  const known = Array.isArray(stored) ? stored.filter((s) => s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string') : [];
  if (known.length === 0) return [...defaults];
  const out: T[] = refreshSectionLabels<T>(known, defaults);
  defaults.forEach((section, i) => {
    if (out.some((s) => s.name === section.name)) return;
    let at = 0; // no earlier default is present → it belongs at the very top
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((s) => s.name === defaults[j].name);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, { ...section });
  });
  return out;
};
