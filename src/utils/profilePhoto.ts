/**
 * Which photo of the owner the public pages show.
 *
 * `PERSONAL_INFO.avatar` ("عکس پروفایل" in the admin panel) is the single source of truth: whatever
 * the owner uploads there is what visitors see on the About page, the home page and next to the author
 * name of an article. When the field is empty — or still holds one of the placeholder/built-in values
 * the CMS was ever seeded with — the site falls back to the portrait that ships with it, in the
 * responsive sizes under /public.
 *
 * (It used to be hard-coded in the pages, so uploading a new photo in the admin never changed the site.)
 */

/** Static portrait that ships in /public (see `PROFILE_PHOTO_LADDER` for the sizes). */
export const BUILT_IN_PROFILE_PHOTO = '/profile-photo-hero.webp';

/** Paths that all mean "use the built-in portrait" when stored in the CMS. */
const BUILT_IN_PATHS = new Set([
  '/profile-photo-hero.webp',
  '/profile-photo-web.jpg',
  '/profile-photo.png',
  '/profile-photo-800.webp',
  '/profile-photo-400.webp',
  '/profile-photo-160.webp',
  '/profile-photo-64.webp',
]);

/** Stock portraits of strangers that earlier seeds wrote where the owner's own photo belongs. */
const STOCK_PORTRAIT = /images\.unsplash\.com\/photo-(?:1507003211169-0a1dd7228f2d|1534528741775-53994a69daeb)/;

export const isStockPortrait = (url: unknown): boolean => typeof url === 'string' && STOCK_PORTRAIT.test(url);

/** The owner's own upload (data: URI or URL), or `null` when the built-in portrait should be used. */
export const customProfilePhoto = (avatar: unknown): string | null => {
  const value = typeof avatar === 'string' ? avatar.trim() : '';
  if (!value || BUILT_IN_PATHS.has(value) || isStockPortrait(value)) return null;
  return value;
};

export type ProfilePhotoVariant = 'hero' | 'chip' | 'card';

/** Responsive files of the built-in portrait for each place the photo is shown. */
export const PROFILE_PHOTO_LADDER: Record<ProfilePhotoVariant, { src: string; srcSet: string; sizes: string }> = {
  hero: {
    src: '/profile-photo-hero.webp',
    srcSet: '/profile-photo-400.webp 400w, /profile-photo-800.webp 800w, /profile-photo-hero.webp 1254w',
    sizes: '(max-width: 640px) 90vw, 480px',
  },
  chip: {
    src: '/profile-photo-64.webp',
    srcSet: '/profile-photo-64.webp 64w, /profile-photo-160.webp 160w',
    sizes: '28px',
  },
  card: {
    src: '/profile-photo-160.webp',
    srcSet: '/profile-photo-64.webp 64w, /profile-photo-160.webp 160w',
    sizes: '64px',
  },
};

/**
 * Photo for an article's author box: the article's own `authorAvatar` when it is a real picture, otherwise
 * the owner's profile photo (never a stock portrait of somebody else).
 */
export const resolveAuthorPhoto = (authorAvatar: unknown, siteAvatar: unknown): string => {
  const own = typeof authorAvatar === 'string' ? authorAvatar.trim() : '';
  if (own && !isStockPortrait(own)) return own;
  return customProfilePhoto(siteAvatar) || '/profile-photo-160.webp';
};
