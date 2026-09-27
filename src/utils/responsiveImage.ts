/**
 * responsiveImage.ts — srcset/sizes + intrinsic dimensions for the site's
 * known image families, so mobiles download a 20 kB WebP instead of a 130 kB
 * full-size JPEG and the browser can reserve layout space before decode
 * (CLS = 0 even before the image arrives).
 *
 * Variant files are generated next to the originals:
 *   /blog/<name>.jpg        1376×768 original (kept as universal `src` fallback)
 *   /blog/<name>-640.webp   mobile
 *   /blog/<name>-1024.webp  tablet / small laptop
 *   /blog/<name>.webp       desktop (full size, WebP)
 *   /profile-photo-{64,160,400,800}.webp  avatar crops (square 800×800 source)
 *
 * URLs that don't match these families (remote CMS uploads, data URLs) pass
 * through untouched — the helpers must never invent a 404 srcset candidate.
 */

export interface ResponsiveImgProps {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
}

interface Variant {
  /** intrinsic pixel size of the ORIGINAL */
  width: number;
  height: number;
  /** [descriptor, url] candidates for srcset (without the original) */
  candidates: [string, string][];
}

/** `/blog/foo.jpg` → the pre-generated WebP ladder. */
const blogCoverVariants = (src: string): Variant | null => {
  const m = src.match(/^\/blog\/([\w-]+)\.jpe?g$/i);
  if (!m) return null;
  const base = `/blog/${m[1]}`;
  return {
    width: 1376,
    height: 768,
    candidates: [
      ['640w', `${base}-640.webp`],
      ['1024w', `${base}-1024.webp`],
      ['1376w', `${base}.webp`],
    ],
  };
};

/** `/profile-photo-web.jpg` / `/profile-photo.png` → square avatar ladder. */
const avatarVariants = (src: string): Variant | null => {
  if (!/^\/profile-photo(-web)?\.(jpe?g|png|webp)$/i.test(src)) return null;
  return {
    width: 800,
    height: 800,
    candidates: [
      ['64w', '/profile-photo-64.webp'],
      ['160w', '/profile-photo-160.webp'],
      ['400w', '/profile-photo-400.webp'],
      ['800w', '/profile-photo-800.webp'],
    ],
  };
};

const variantsFor = (src: string): Variant | null =>
  blogCoverVariants(src) ?? avatarVariants(src);

export interface ResponsiveOptions {
  /** `sizes` attribute describing the rendered slot width */
  sizes?: string;
  /** reserve layout space (defaults to the source's intrinsic size) */
  displayWidth?: number;
  displayHeight?: number;
  /** above-the-fold LCP image → eager + fetchpriority=high */
  priority?: boolean;
}

/**
 * Build `<img>` props for a known local image family (srcset + width/height +
 * lazy-by-default). Unknown URLs still get width/height/loading when given.
 *
 *   <img alt={...} {...responsiveImageProps(post.coverImage, { sizes: COVER_SIZES })} />
 */
export function responsiveImageProps(src: string, opts: ResponsiveOptions = {}): ResponsiveImgProps {
  const v = variantsFor(src);
  const props: ResponsiveImgProps = {
    src,
    loading: opts.priority ? 'eager' : 'lazy',
    decoding: 'async',
  };
  if (opts.priority) props.fetchPriority = 'high';
  if (v) {
    props.srcSet = [...v.candidates.map(([d, u]) => `${u} ${d}`)].join(', ');
    props.sizes = opts.sizes ?? '100vw';
    props.width = opts.displayWidth ?? v.width;
    props.height = opts.displayHeight ?? v.height;
  } else {
    if (opts.displayWidth) props.width = opts.displayWidth;
    if (opts.displayHeight) props.height = opts.displayHeight;
    if (opts.sizes) props.sizes = opts.sizes;
  }
  return props;
}

/* Shared `sizes` strings matching the actual CSS slots. */
export const BLOG_COVER_SIZES = '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw';
export const BLOG_FEATURED_SIZES = '(max-width: 768px) 100vw, 42vw';
export const BLOG_DETAIL_COVER_SIZES = '(max-width: 1024px) 100vw, 896px';
