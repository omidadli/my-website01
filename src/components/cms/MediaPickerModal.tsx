import React, { useState } from 'react';
import { ImageIcon, Upload, Check, X, AlertTriangle, Search, Trash2 } from 'lucide-react';
import { useContent } from '../../context/ContentContext';
import { MediaItem } from '../../types';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  currentUrl?: string;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentUrl = ''
}) => {
  const { data, addMediaItem, removeMediaItem } = useContent();
  const mediaLibrary = data.MEDIA_LIBRARY || [];

  const [activeTab, setActiveTab] = useState<'select' | 'upload'>('select');
  const [selectedUrl, setSelectedUrl] = useState<string>(currentUrl);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploadedTitle, setUploadedTitle] = useState<string>('');
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [dimensions, setDimensions] = useState<string>('');
  const [sizeWarning, setSizeWarning] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const kb = Math.round(file.size / 1024);
      setFileSizeKb(kb);
      setSizeWarning(kb > 1024); // > 1MB warning
      setUploadedTitle(file.name.replace(/\.[^/.]+$/, ''));

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const resultStr = reader.result;
          setUploadedPreview(resultStr);

          // Get dimensions
          const img = new Image();
          img.onload = () => {
            setDimensions(`${img.width}x${img.height}`);
          };
          img.src = resultStr;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmUpload = () => {
    if (uploadedPreview) {
      addMediaItem(uploadedPreview, uploadedTitle || 'تصویر جدید', fileSizeKb, dimensions);
      onSelect(uploadedPreview);
      onClose();
    }
  };

  const filteredMedia = mediaLibrary.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 text-right dir-rtl font-sans">
      <div className="bg-[color:var(--nd-surface)] border-2 border-[color:var(--nd-accent)] rounded-3xl p-6 max-w-2xl w-full shadow-xl text-[color:var(--nd-ink)] space-y-5 max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[color:var(--nd-accent)] text-white font-black">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-white">کتابخانه رسانه‌ها و تصاویر</h3>
              <p className="text-xs text-slate-400">انتخاب از تصاویر قبلی یا آپلود تصویر جدید</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Switcher */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('select')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'select'
                ? 'bg-[color:var(--nd-accent)] text-white shadow-lg'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>انتخاب از کتابخانه ({mediaLibrary.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'bg-[color:var(--nd-accent)] text-white shadow-lg'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>آپلود فایل جدید</span>
          </button>
        </div>

        {/* Tab 1: Select existing from library */}
        {activeTab === 'select' && (
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو بر اساس عنوان یا تگ..."
                className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-xl px-10 py-2.5 text-base text-white focus:outline-none focus:border-[color:var(--nd-accent)]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute top-3 right-3" />
            </div>

            {/* Media Grid */}
            {filteredMedia.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-white/5 rounded-2xl">
                تصویری یافت نشد. می‌توانید از تب آپلود تصویر جدید اضافه کنید.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredMedia.map((item) => {
                  const isSelected = selectedUrl === item.url;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedUrl(item.url)}
                      className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[color:var(--nd-accent)] ring-4 ring-[color:var(--nd-accent-soft)] scale-[1.02]'
                          : 'border-white/10 hover:border-white/40'
                      }`}
                    >
                      <img
                        src={item.url}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-28 object-cover bg-black/40"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMediaItem(item.id);
                          }}
                          className="self-end p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-500"
                          title="حذف از کتابخانه"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="text-[10px] text-white font-bold truncate">
                          {item.title}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[color:var(--nd-accent)] text-white flex items-center justify-center font-black shadow-lg">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Upload new */}
        {activeTab === 'upload' && (
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-[color:var(--nd-accent)]/50 hover:border-[color:var(--nd-accent)] rounded-2xl cursor-pointer transition-all bg-white/5 hover:bg-white/10 text-center">
              <Upload className="w-10 h-10 text-[color:var(--nd-accent)] animate-pulse" />
              <div>
                <span className="font-bold text-sm text-white block">برای آپلود تصویر کلیک کنید</span>
                <span className="text-xs text-slate-400">فرمت‌های مجاز: JPG, PNG, WEBP, SVG</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {sizeWarning && (
              <div className="p-3.5 rounded-2xl bg-[color:var(--nd-peach-soft)] border border-transparent text-[#d97706] text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[color:var(--nd-accent)] shrink-0" />
                <span>
                  هشدار حجم فایل: حجم تصویر ({fileSizeKb} KB) بیشتر از ۱ مگابایت است. پیشنهاد می‌شود جهت حفظ سرعت بالایش سایت، تصویر را فشرده کنید.
                </span>
              </div>
            )}

            {uploadedPreview && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center gap-4">
                  <img
                    src={uploadedPreview}
                    alt="Preview"
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={96}
                    className="w-24 h-24 object-cover rounded-xl border border-white/20"
                  />
                  <div className="space-y-1.5 text-xs flex-1">
                    <div>
                      <label className="text-slate-400 block mb-1">نام تصویر:</label>
                      <input
                        type="text"
                        value={uploadedTitle}
                        onChange={(e) => setUploadedTitle(e.target.value)}
                        className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-lg p-2 text-white font-bold"
                      />
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-300">
                      <span>حجم: <strong className="text-[color:var(--nd-accent)]">{fileSizeKb} KB</strong></span>
                      <span>ابعاد: <strong className="text-[color:var(--nd-accent)]">{dimensions}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white"
          >
            انصراف
          </button>

          {activeTab === 'select' ? (
            <button
              type="button"
              disabled={!selectedUrl}
              onClick={() => {
                onSelect(selectedUrl);
                onClose();
              }}
              className="px-6 py-2.5 rounded-xl bg-[color:var(--nd-accent)] hover:opacity-90 text-white font-black text-xs shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تأیید و انتخاب تصویر</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!uploadedPreview}
              onClick={handleConfirmUpload}
              className="px-6 py-2.5 rounded-xl bg-[color:var(--nd-accent)] hover:opacity-90 text-white font-black text-xs shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>ذخیره در کتابخانه و اعمال</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
