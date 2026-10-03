import React from 'react';
import { imageFallback } from '../utils/imageFallback';
import { PROFILE_PHOTO_LADDER, customProfilePhoto, type ProfilePhotoVariant } from '../utils/profilePhoto';

interface ProfilePhotoProps {
  /** `PERSONAL_INFO.avatar` — the photo chosen in the admin panel. */
  avatar: unknown;
  /** `PERSONAL_INFO.name`, used as the alt text. */
  name: string;
  variant: ProfilePhotoVariant;
  className?: string;
}

/**
 * The owner's photo. Shows the upload from the admin panel when there is one, the built-in
 * portrait (with its responsive sizes) otherwise.
 */
export const ProfilePhoto: React.FC<ProfilePhotoProps> = ({ avatar, name, variant, className }) => {
  const custom = customProfilePhoto(avatar);
  const eager = variant !== 'chip';
  if (custom) {
    return (
      <img
        alt={name}
        src={custom}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={imageFallback('/profile-photo-web.jpg')}
        className={className}
        data-profile-photo="custom"
      />
    );
  }
  const ladder = PROFILE_PHOTO_LADDER[variant];
  return (
    <img
      alt={name}
      src={ladder.src}
      srcSet={ladder.srcSet}
      sizes={ladder.sizes}
      loading={eager ? 'eager' : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={imageFallback('/profile-photo-web.jpg')}
      className={className}
      data-profile-photo="built-in"
    />
  );
};
