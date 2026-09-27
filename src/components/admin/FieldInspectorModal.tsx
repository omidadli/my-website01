import React, { useState, useEffect } from 'react';
import { Edit3, X, Check, ImageIcon, Palette, Sparkles, Hash, ToggleLeft, ToggleRight, Plus, Trash2, Layers } from 'lucide-react';
import { useContent } from '../../context/ContentContext';
import { MediaPickerModal } from '../cms/MediaPickerModal';

interface FieldInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  path: string;
  fieldLabel: string;
  value: any;
  onSave?: (newValue: any) => void;
}

const COMMON_PRESET_COLORS = [
  '#8b5cf6', '#5ce1e6', '#f59e0b', '#10b981', '#ef4444', 
  '#ec4899', '#3b82f6', '#6366f1', '#14b8a6', '#06b6d4',
  '#1e1b4b', '#0f172a', '#18181b', '#ffffff', '#000000'
];

const COMMON_3D_ICONS = [
  'rocket', 'chart', 'target', 'zap', 'shield', 'award', 
  'sparkles', 'brain', 'line-chart', 'pie-chart', 'users', 
  'trending-up', 'cpu', 'layers', 'search', 'settings'
];

export const FieldInspectorModal: React.FC<FieldInspectorModalProps> = ({
  isOpen,
  onClose,
  path,
  fieldLabel,
  value: initialValue,
  onSave
}) => {
  const { updateField } = useContent();
  const [val, setVal] = useState<any>(initialValue);
  const [showMediaPicker, setShowMediaPicker] = useState<boolean>(false);
  const [tagInput, setTagInput] = useState<string>('');

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue, path]);

  if (!isOpen) return null;

  // Determine field type automatically
  const isImageField = 
    typeof val === 'string' && 
    (path.toLowerCase().includes('url') || path.toLowerCase().includes('avatar') || path.toLowerCase().includes('image') || path.toLowerCase().includes('thumbnail') || val.startsWith('http') || val.startsWith('data:image'));

  const isIconField = 
    typeof val === 'string' && 
    (path.toLowerCase().includes('icon') || COMMON_3D_ICONS.includes(val.toLowerCase()));

  const isColorField = 
    typeof val === 'string' && 
    (path.toLowerCase().includes('color') || path.toLowerCase().includes('bg') || val.startsWith('#') || val.startsWith('rgb'));

  const isBooleanField = typeof val === 'boolean';
  const isNumberField = typeof val === 'number';
  const isArrayField = Array.isArray(val);
  const isMultilineText = typeof val === 'string' && (val.length > 60 || val.includes('\n'));

  const handleSave = () => {
    if (onSave) {
      onSave(val);
    } else {
      updateField(path, val);
    }
    onClose();
  };

  const handleAddTag = () => {
    if (tagInput.trim() && Array.isArray(val)) {
      setVal([...val, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (idx: number) => {
    if (Array.isArray(val)) {
      setVal(val.filter((_, i) => i !== idx));
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 dir-rtl text-right font-sans">
        <div className="bg-[#120a38] border-2 border-amber-400/80 rounded-3xl p-6 max-w-xl w-full shadow-[0_0_60px_rgba(245,158,11,0.25)] text-white space-y-5">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-400 text-slate-950 font-black shadow-lg">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-amber-300">ویرایش دقیق فیلد (Field Inspector)</h3>
                <p className="text-xs text-slate-400 font-bold">{fieldLabel || path}</p>
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

          {/* Path Badge */}
          <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 font-mono text-[11px] text-[#5ce1e6] dir-ltr text-left truncate flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Path: {path}</span>
          </div>

          {/* Field Editor Controls */}
          <div className="space-y-4">
            {/* 1. IMAGE FIELD */}
            {isImageField && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 block">تصویر انتخاب‌شده:</label>
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10">
                  <img
                    src={val}
                    alt="Preview"
                    loading="lazy"
                    decoding="async"
                    width={80}
                    height={80}
                    className="w-20 h-20 object-cover rounded-xl border border-white/20 bg-black/40"
                  />
                  <div className="space-y-2 flex-1">
                    <button
                      type="button"
                      onClick={() => setShowMediaPicker(true)}
                      className="px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>انتخاب از کتابخانه رسانه / آپلود</span>
                    </button>

                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="آدرس URL مستقیم تصویر..."
                      className="w-full bg-[#0a0520] border border-white/20 rounded-xl p-2 text-base font-mono text-slate-300 dir-ltr"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. ICON FIELD */}
            {isIconField && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 block">آیکون انتخاب‌شده:</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shadow-lg">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    className="flex-1 bg-[#0a0520] border border-white/20 rounded-xl p-2.5 text-xs font-bold text-white dir-ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 block font-bold">آیکون‌های محبوب سه بعدی و لوکاید:</span>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_3D_ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setVal(ic)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          val === ic
                            ? 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-400/50'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3. COLOR FIELD */}
            {isColorField && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 block">رنگ انتخاب‌شده:</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={val.startsWith('#') ? val : '#8b5cf6'}
                    onChange={(e) => setVal(e.target.value)}
                    className="w-12 h-12 rounded-2xl bg-transparent border-0 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    className="flex-1 bg-[#0a0520] border border-white/20 rounded-xl p-2.5 text-xs font-mono text-white dir-ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 block font-bold">پالت رنگ‌های سازمانی پیش‌فرض:</span>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setVal(c)}
                        style={{ backgroundColor: c }}
                        className={`w-7 h-7 rounded-xl border border-white/20 transition-all ${
                          val === c ? 'scale-125 ring-2 ring-amber-400 shadow-lg' : 'hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. BOOLEAN FIELD */}
            {isBooleanField && (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-xs font-bold text-slate-200">وضعیت فعال / غیرفعال:</span>
                <button
                  type="button"
                  onClick={() => setVal(!val)}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
                    val
                      ? 'bg-emerald-500 text-slate-950 shadow-lg'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {val ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  <span>{val ? 'فعال (TRUE)' : 'غیرفعال (FALSE)'}</span>
                </button>
              </div>
            )}

            {/* 5. NUMBER FIELD */}
            {isNumberField && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">مقدار عددی:</label>
                <div className="relative">
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setVal(Number(e.target.value))}
                    className="w-full bg-[#0a0520] border border-white/20 rounded-xl px-4 py-3 text-base font-bold text-white dir-ltr focus:border-amber-400 focus:outline-none"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute top-3.5 left-3" />
                </div>
              </div>
            )}

            {/* 6. ARRAY FIELD */}
            {isArrayField && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300 block">لیست آیتم‌ها / تگ‌ها:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="عنوان آیتم جدید..."
                    className="flex-1 bg-[#0a0520] border border-white/20 rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>افزودن</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 min-h-[60px]">
                  {val.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 rounded-xl bg-[#8b5cf6]/30 border border-[#8b5cf6]/50 text-white text-xs font-bold flex items-center gap-2"
                    >
                      <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(idx)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. TEXT FIELD (Single or Multiline) */}
            {!isImageField && !isIconField && !isColorField && !isBooleanField && !isNumberField && !isArrayField && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">متن فیلد:</label>
                {isMultilineText ? (
                  <textarea
                    value={val || ''}
                    onChange={(e) => setVal(e.target.value)}
                    rows={5}
                    className="w-full bg-[#0a0520] border border-white/20 rounded-xl p-3 text-base text-white focus:border-amber-400 focus:outline-none leading-relaxed"
                  />
                ) : (
                  <input
                    type="text"
                    value={val || ''}
                    onChange={(e) => setVal(e.target.value)}
                    className="w-full bg-[#0a0520] border border-white/20 rounded-xl p-3 text-base font-bold text-white focus:border-amber-400 focus:outline-none"
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>ذخیره نهایی فیلد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Media Picker Modal Sub-popup */}
      {showMediaPicker && (
        <MediaPickerModal
          isOpen={showMediaPicker}
          onClose={() => setShowMediaPicker(false)}
          currentUrl={val}
          onSelect={(url) => setVal(url)}
        />
      )}
    </>
  );
};
