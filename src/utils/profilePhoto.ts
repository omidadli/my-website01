/**
 * Profile photo shown on the public pages.
 *
 * The admin field PERSONAL_INFO.avatar ("تصویر پروفایل اصلی") used to be ignored by the
 * public pages, which hard-coded the bundled /profile-photo-*.webp files. Now a photo
 * uploaded through the CMS wins; the bundled responsive ladder is only the default.
 */

/** The files shipped in /public (the default photo and its resized variants). */
const BUNDLED = /^\/profile-photo(-web|-hero|-\d+)?\.(jpe?g|png|webp)$/i;

/** True when the admin set their own photo (an upload, a data URL or another URL). */
export const isCustomAvatar = (avatar: unknown): avatar is string =>
  typeof avatar === 'string' &&
  avatar.trim() !== '' &&
  !BUNDLED.test(avatar.trim()) &&
  !/unsplash\.com/i.test(avatar); // legacy placeholder value, treated as "not set"

export type PhotoSlot = 'hero' | 'card' | 'pill';

const LADDERS: Record<PhotoSlot, { src: string; srcSet: string }> = {
  hero: {
    src: '/profile-photo-hero.webp',
    srcSet: '/profile-photo-400.webp 400w, /profile-photo-800.webp 800w, /profile-photo-hero.webp 1254w',
  },
  card: {
    src: '/profile-photo-160.webp',
    srcSet: '/profile-photo-64.webp 64w, /profile-photo-160.webp 160w',
  },
  pill: {
    src: '/profile-photo-64.webp',
    srcSet: '/profile-photo-64.webp 64w, /profile-photo-160.webp 160w',
  },
};

/** `src` (+ `srcSet` only for the bundled photo) to spread onto an <img>. */
export const profilePhotoProps = (avatar: unknown, slot: PhotoSlot): { src: string; srcSet?: string } =>
  isCustomAvatar(avatar) ? { src: avatar.trim() } : LADDERS[slot];
