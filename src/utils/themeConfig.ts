/**
 * THEME_CONFIG (admin: «رنگ‌ها و ظاهر») used to be saved but never applied anywhere.
 *
 * The values shipped as the CMS default (violet #8b5cf6) differ from the site's real design
 * tokens (indigo #4f46e5 / #818cf8). The live database stores that default, so applying it
 * blindly would silently repaint the whole site. Only values the admin has CHANGED are applied.
 */
export interface ThemeConfigLike {
  accentColor?: unknown;
  secondaryColor?: unknown;
  fontScale?: unknown;
}

export const SHIPPED_THEME = { accentColor: '#8b5cf6', secondaryColor: '#5ce1e6', fontScale: 1 } as const;

/** CSS custom properties this module may set on <html> (so they can be cleaned up). */
export const THEME_VARS = ['--nd-accent', '--nd-accent-strong', '--nd-accent-soft'] as const;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `#AABBCC` → `#aabbcc`, or null when it is not a valid hex colour. */
export const normalizeHex = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!HEX.test(v)) return null;
  const h = v.slice(1).toLowerCase();
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
};

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

const darken = (hex: string, amount: number): string => {
  const [r, g, b] = toRgb(hex).map((c) => Math.round(c * (1 - amount)));
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
};

export interface ThemeOverrides {
  vars: Record<string, string>;
  /** value for <html style="font-size">, or null to leave the stylesheet's size alone */
  rootFontSize: string | null;
}

export function themeOverrides(cfg: ThemeConfigLike | null | undefined): ThemeOverrides {
  const out: ThemeOverrides = { vars: {}, rootFontSize: null };
  if (!cfg || typeof cfg !== 'object') return out;

  const accent = normalizeHex(cfg.accentColor);
  if (accent && accent !== normalizeHex(SHIPPED_THEME.accentColor)) {
    const [r, g, b] = toRgb(accent);
    out.vars['--nd-accent'] = accent;
    out.vars['--nd-accent-strong'] = darken(accent, 0.14);
    out.vars['--nd-accent-soft'] = `rgba(${r}, ${g}, ${b}, 0.14)`;
  }

  const scale = Number(cfg.fontScale);
  if (Number.isFinite(scale) && scale >= 0.8 && scale <= 1.3 && Math.abs(scale - SHIPPED_THEME.fontScale) > 0.001) {
    out.rootFontSize = `${(scale * 100).toFixed(1)}%`;
  }
  return out;
}
