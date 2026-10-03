import React, { useEffect, useRef, useState } from 'react';
import { Save, Download, Upload, RotateCcw, Lock, Edit3, CheckCircle, Sparkles } from 'lucide-react';
import { useContent } from '../../context/ContentContext';
import { SaveStatusChip } from './SaveStatus';

export const AdminFloatingBar: React.FC = () => {
  const {
    isAdmin,
    logoutAdmin,
    resetToDefaults,
    exportJSON,
    importJSON,
    hasUnsavedChanges,
    saveNow,
  } = useContent();

  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ms = 3000, tone: 'ok' | 'error' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), ms);
  };

  // A conditional cloud save was rejected because the content changed elsewhere
  // (Claude MCP, another tab, Git sync) — the context already reloaded the latest
  // version; tell the admin so they can re-apply their last change.
  useEffect(() => {
    const onConflict = (e: Event) => {
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
      showToast(msg || 'محتوا هم‌زمان از جای دیگری تغییر کرده بود؛ آخرین نسخه بارگذاری شد.', 8000, 'error');
    };
    window.addEventListener('nd:content-conflict', onConflict);
    return () => window.removeEventListener('nd:content-conflict', onConflict);
  }, []);

  if (!isAdmin) return null;

  // Only claim success when the server confirmed it. This button used to write the browser's
  // localStorage and toast "all changes saved" regardless — even with no connection at all.
  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveNow();
      if (result.ok) showToast('ذخیره شد و روی سایت اعمال شد ✓');
      else showToast(result.error || 'ذخیره روی سایت انجام نشد.', 9000, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('آیا از بازنشانی محتوا به داده‌های اولیه سایت اطمینان دارید؟ تمامی تغییرات دستی شما پاک خواهد شد.')) {
      resetToDefaults();
      showToast('محتوای سایت به حالت اولیه بازنشانی شد.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const success = importJSON(content);
          if (success) {
            showToast('فایل JSON با موفقیت بارگذاری و اعمال شد.');
          } else {
            alert('خطا در خواندن فایل JSON. لطفاً فرمت فایل را بررسی کنید.');
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10000] w-[95%] max-w-4xl dir-rtl">
      {/* Toast Notification */}
      {toast && (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`absolute -top-14 left-1/2 -translate-x-1/2 max-w-[95vw] font-extrabold px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs border ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-300'
              : 'bg-emerald-500 text-slate-950 border-emerald-300 animate-bounce'
          }`}
        >
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="bg-[color:var(--nd-surface)] backdrop-blur-xl border-2 border-[color:var(--nd-accent)] text-[color:var(--nd-ink)] rounded-2xl px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
        {/* Status Badge */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--nd-accent)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--nd-accent)]"></span>
          </span>
          <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-[color:var(--nd-accent)]">
            <Edit3 className="w-4 h-4" />
            <span>حالت ویرایش زنده فعال است</span>
          </div>
          <SaveStatusChip compact />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
              hasUnsavedChanges
                ? 'bg-[color:var(--nd-accent)] text-white hover:opacity-90 scale-105 animate-pulse'
                : 'bg-[color:var(--nd-accent)] text-white hover:opacity-90'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</span>
          </button>

          {/* Export JSON */}
          <button
            type="button"
            onClick={exportJSON}
            title="دانلود نسخه پشتیبان از داده‌های ادیت‌شده"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" />
            <span className="hidden sm:inline">خروجی JSON</span>
          </button>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="بارگذاری داده‌ها از فایل JSON"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" />
            <span className="hidden sm:inline">ورود JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            title="بازنشانی به داده‌های اولیه"
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">بازنشانی</span>
          </button>

          {/* Exit Edit Mode */}
          <button
            type="button"
            onClick={logoutAdmin}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ml-1"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>خروج از ویرایش</span>
          </button>
        </div>
      </div>
    </div>
  );
};
