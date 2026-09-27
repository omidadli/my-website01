import React, { useState } from 'react';
import { Pencil, Link, X, Check } from 'lucide-react';
import { useContent, getByPath } from '../../context/ContentContext';

interface EditableButtonProps {
  labelPath?: string;
  linkPath?: string;
  defaultLabel?: string;
  defaultLink?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onNavigate?: (page: any) => void;
}

export const EditableButton: React.FC<EditableButtonProps> = ({
  labelPath,
  linkPath,
  defaultLabel = 'کلیک کنید',
  defaultLink = '',
  className = '',
  children,
  onClick,
  onNavigate
}) => {
  const { data, isAdmin, updateField } = useContent();
  const [isOpen, setIsOpen] = useState(false);

  const currentLabel = labelPath ? getByPath(data, labelPath) || defaultLabel : defaultLabel;
  const currentLink = linkPath ? getByPath(data, linkPath) || defaultLink : defaultLink;

  const [tempLabel, setTempLabel] = useState(currentLabel);
  const [tempLink, setTempLink] = useState(currentLink);

  if (!isAdmin) {
    return (
      <button
        onClick={onClick}
        className={className}
      >
        {children || currentLabel}
      </button>
    );
  }

  const handleSave = () => {
    if (labelPath) updateField(labelPath, tempLabel);
    if (linkPath) updateField(linkPath, tempLink);
    setIsOpen(false);
  };

  return (
    <div className="relative group/btn inline-block">
      <button
        onClick={onClick}
        className={className}
      >
        {children || currentLabel}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setTempLabel(currentLabel);
          setTempLink(currentLink);
          setIsOpen(true);
        }}
        title="ویرایش دکمه و لینک"
        className="absolute -top-2 -right-2 z-40 bg-[color:var(--nd-accent)] text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover/btn:opacity-100 hover:scale-110 transition-all cursor-pointer "
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 text-right dir-rtl">
          <div className="bg-[color:var(--nd-surface)] border-2 border-[color:var(--nd-accent)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-lg flex items-center gap-2 text-[color:var(--nd-accent)]">
                <Link className="w-5 h-5" />
                <span>ویرایش دکمه و لینک</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {labelPath && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    متن روی دکمه:
                  </label>
                  <input
                    type="text"
                    value={tempLabel}
                    onChange={(e) => setTempLabel(e.target.value)}
                    className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-xl px-3 py-2 text-base dir-rtl text-white focus:outline-none focus:border-[color:var(--nd-accent)]"
                  />
                </div>
              )}

              {linkPath && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    لینک یا مقصد دکمه (URL یا نام صفحه مثل services / contact):
                  </label>
                  <input
                    type="text"
                    value={tempLink}
                    onChange={(e) => setTempLink(e.target.value)}
                    placeholder="https://... یا contact / services"
                    className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-xl px-3 py-2 text-base dir-ltr text-white focus:outline-none focus:border-[color:var(--nd-accent)]"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-[color:var(--nd-accent)] hover:opacity-90 text-xs font-bold text-white shadow-lg flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>ثبت تغییرات</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
