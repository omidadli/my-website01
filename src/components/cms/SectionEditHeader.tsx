import React, { useState } from 'react';
import { Pencil, Plus, Trash2, Settings, Sparkles, Check, X } from 'lucide-react';
import { useContent, getByPath } from '../../context/ContentContext';
import { linkProps, navigate } from '../../utils/router';

interface SectionEditHeaderProps {
  title: string;
  path?: string; // Path to section title or obj
  arrayPath?: string; // Path to items list if applicable (e.g. 'CASE_STUDIES', 'SERVICES', 'STATS')
  addItemTemplate?: any;
  onOpenCmsTab?: (tabName: string) => void;
  className?: string;
}

export const SectionEditHeader: React.FC<SectionEditHeaderProps> = ({
  title,
  path,
  arrayPath,
  addItemTemplate,
  onOpenCmsTab,
  className = ''
}) => {
  const { isAdmin, addItem, updateField, data } = useContent();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  const currentTitleValue = path ? (getByPath(data, path) || title) : title;
  const [titleInput, setTitleInput] = useState(currentTitleValue);

  if (!isAdmin) return null;

  const handleSaveTitle = () => {
    if (path) {
      updateField(path, titleInput);
    }
    setIsEditingTitle(false);
  };

  return (
    <div className={`relative z-40 my-3 p-3 rounded-2xl bg-[color:var(--nd-surface)] border-2 border-[color:var(--nd-accent)] shadow-lg backdrop-blur-md text-[color:var(--nd-ink)] text-xs dir-rtl flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-xl bg-[color:var(--nd-accent)] text-white font-black flex items-center justify-center">
          <Pencil className="w-3.5 h-3.5" />
        </span>
        
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              className="bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-lg px-2 py-1 text-base text-white focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleSaveTitle}
              className="p-1 rounded bg-[color:var(--nd-accent)] text-white hover:opacity-90 font-bold"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditingTitle(false)}
              className="p-1 rounded bg-slate-700 text-white hover:bg-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[color:var(--nd-accent)]">مدیریت سکشن: {currentTitleValue}</span>
            {path && (
              <button
                onClick={() => {
                  setTitleInput(currentTitleValue);
                  setIsEditingTitle(true);
                }}
                className="p-1 rounded-md bg-[color:var(--nd-bg-soft)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-colors text-[color:var(--nd-ink-2)]"
                title="ویرایش عنوان سکشن"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {arrayPath && (
          <button
            type="button"
            onClick={() => addItem(arrayPath, addItemTemplate)}
            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن آیتم جدید</span>
          </button>
        )}

        <a
          {...linkProps('/admin', () => navigate('/admin'))}
          className="px-3 py-1.5 rounded-xl bg-[color:var(--nd-accent-soft)] hover:bg-[color:var(--nd-accent)] hover:text-white text-[color:var(--nd-accent)] border border-transparent font-bold flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>ویرایش در پیشخوان CMS</span>
        </a>
      </div>
    </div>
  );
};
