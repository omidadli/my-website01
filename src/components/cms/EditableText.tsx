import React, { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useContent, getByPath } from '../../context/ContentContext';

interface EditableTextProps {
  path: string;
  className?: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'div';
  multiline?: boolean;
  children?: React.ReactNode;
  fallbackText?: string;
  /** Optional legacy alias for fallback content (used by some pages). */
  defaultValue?: string;
  /** Optional edit-label hint (used by admin tooling). */
  label?: string;
}

export const EditableText: React.FC<EditableTextProps> = ({
  path,
  className = '',
  as: Component = 'span',
  multiline = false,
  children,
  fallbackText = '',
  defaultValue = ''
}) => {
  const { data, isAdmin, updateField } = useContent();
  const [isEditing, setIsEditing] = useState(false);

  const currentValue = getByPath(data, path) ?? (fallbackText || defaultValue || (typeof children === 'string' ? children : ''));
  const [tempValue, setTempValue] = useState<string>(String(currentValue));

  if (!isAdmin) {
    return <Component className={className}>{currentValue || children}</Component>;
  }

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateField(path, tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(String(currentValue));
    setIsEditing(false);
  };

  return (
    <span className="relative group/edit inline-block max-w-full">
      {isEditing ? (
        <span className="inline-flex flex-col gap-2 p-2 bg-[color:var(--nd-surface)] border-2 border-[color:var(--nd-accent)] rounded-xl z-50 relative my-1 shadow-2xl text-[color:var(--nd-ink)] w-full min-w-[280px]">
          {multiline ? (
            <textarea
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-lg p-2 text-base text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] min-h-[100px] dir-rtl font-sans"
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-lg px-3 py-1.5 text-base text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] dir-rtl font-sans"
              autoFocus
            />
          )}

          <span className="flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={handleCancel}
              className="px-2.5 py-1 rounded-lg bg-[color:var(--nd-bg-soft)] hover:bg-[color:var(--nd-line)] text-[color:var(--nd-ink-2)] flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>انصراف</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1 rounded-lg bg-[color:var(--nd-accent)] hover:opacity-90 text-white font-bold flex items-center gap-1 shadow-md cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>ثبت</span>
            </button>
          </span>
        </span>
      ) : (
        <span className="relative inline-block group/text hover:outline hover:outline-2 hover:outline-[color:var(--nd-accent)] hover:bg-[color:var(--nd-accent-soft)] rounded px-1 transition-all">
          <Component className={className}>{currentValue || children}</Component>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setTempValue(String(currentValue));
              setIsEditing(true);
            }}
            title="ویرایش این متن"
            className="absolute -top-3 -right-3 z-40 bg-[color:var(--nd-accent)] text-white p-1 rounded-full shadow-lg opacity-0 group-hover/text:opacity-100 hover:scale-125 transition-all cursor-pointer flex items-center justify-center"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </span>
      )}
    </span>
  );
};
