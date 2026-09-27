import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useContent, getByPath } from '../../context/ContentContext';
import { MediaPickerModal } from './MediaPickerModal';
import { imageFallback } from '../../utils/imageFallback';
import { responsiveImageProps } from '../../utils/responsiveImage';

interface EditableImageProps {
  path: string;
  className?: string;
  alt?: string;
  fallbackSrc?: string;
  /** Legacy aliases kept for backward compatibility with older pages. */
  defaultSrc?: string;
  src?: string;
  aspectRatio?: string;
}

export const EditableImage: React.FC<EditableImageProps> = ({
  path,
  className = '',
  alt = 'Image',
  fallbackSrc = '/image-fallback.svg',
  defaultSrc = '',
  src = '',
  aspectRatio
}) => {
  const { data, isAdmin, updateField } = useContent();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currentValue = getByPath(data, path) || defaultSrc || src || fallbackSrc;

  if (!isAdmin) {
    return <img alt={alt} {...responsiveImageProps(currentValue, { sizes: '100vw' })} className={className} referrerPolicy="no-referrer" onError={imageFallback()} />;
  }

  const handleSelectImage = (newUrl: string) => {
    updateField(path, newUrl);
  };

  return (
    <div className="relative group/img inline-block overflow-visible">
      <img alt={alt} {...responsiveImageProps(currentValue, { sizes: '100vw' })} className={className} referrerPolicy="no-referrer" onError={imageFallback()} />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsModalOpen(true);
        }}
        title="تغییر عکس (کتابخانه رسانه)"
        className="absolute top-2 right-2 z-40 bg-[color:var(--nd-accent)] text-white p-2 rounded-full shadow-xl opacity-0 group-hover/img:opacity-100 hover:scale-110 transition-all cursor-pointer flex items-center justify-center "
      >
        <Pencil className="w-4 h-4" />
      </button>

      <MediaPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelectImage}
        currentUrl={currentValue}
      />
    </div>
  );
};

