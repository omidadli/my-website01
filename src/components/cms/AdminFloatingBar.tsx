import React, { useEffect, useRef, useState } from 'react';
import { Save, Download, Upload, RotateCcw, Lock, Edit3, CheckCircle, Cloud, RefreshCw, AlertCircle } from 'lucide-react';
import { useContent } from '../../context/ContentContext';

export const AdminFloatingBar: React.FC = () => {
  const {
    isAdmin,
    logoutAdmin,
    resetToDefaults,
    exportJSON,
    importJSON,
    hasUnsavedChanges,
    saveChanges,
    persistence,
    syncStatus,
    lastSyncedAt,
    syncError,
    isRefreshing,
    hasUnsyncedCloudChanges,
    saveToCloudNow,
    refreshFromCloud,
  } = useContent();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ms = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  };

  // A conditional cloud save was rejected because the content changed elsewhere
  // (Claude MCP, another tab, Git sync).
  useEffect(() => {
    const onConflict = (e: Event) => {
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
      showToast(msg || 'محتوا هم‌زمان از جای دیگری تغییر کرده بود؛ آخرین نسخه بارگذاری شد.', 8000);
    };
    window.addEventListener('nd:content-conflict', onConflict);
    return () => window.removeEventListener('nd:content-conflict', onConflict);
  }, []);

  if (!isAdmin) return null;

  const handleSave = async () => {
    saveChanges();
    const result = await saveToCloudNow();
    if (result.status === 'saved') {
      showToast(result.message || 'تغییرات در ابری Cloudflare ذخیره شد! ✨', 4000);
    } else if (result.status === 'conflict') {
      setConflictOpen(true);
    } else if (result.status === 'unauthorized') {
      showToast(result.message || 'نشست منقضی شده. لطفاً دوباره وارد شوید.', 5000);
    } else {
      showToast(result.message || 'ذخیره در ابری با مشکل مواجه شد؛ تغییرات در مرورگر ذخیره شده‌اند.', 5000);
    }
  };

  const handleSaveToCloud = async () => {
    const result = await saveToCloudNow();
    if (result.status === 'saved') {
      showToast(result.message || 'با موفقیت در ابری ذخیره شد ✨', 4000);
    } else if (result.status === 'conflict') {
      setConflictOpen(true);
    } else if (result.status === 'unauthorized') {
      showToast(result.message || 'نشست منقضی شده. لطفاً دوباره وارد شوید.', 5000);
    } else if (result.status === 'skipped') {
      showToast(result.message || 'تغییراتی برای ذخیره‌سازی وجود ندارد.', 3000);
    } else {
      showToast(result.message || 'ذخیره در ابری ناموفق بود.', 5000);
    }
  };

  const handleRefreshFromCloud = async () => {
    const ok = await refreshFromCloud();
    if (ok) {
      showToast('آخرین نسخه از ابری بارگذاری شد.', 4000);
    } else {
      showToast('بازخوانی از ابری ناموفق بود.', 5000);
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

  const keepMyVersion = async () => {
    // Re-save with the new baseUpdatedAt so local changes win.
    const result = await saveToCloudNow();
    setConflictOpen(false);
    if (result.status === 'saved') {
      showToast('نسخه شما با موفقیت ذخیره شد.', 4000);
    } else {
      showToast(result.message || 'ذخیره نسخه شما ناموفق بود.', 5000);
    }
  };

  const loadCloudVersion = async () => {
    setConflictOpen(false);
    const ok = await refreshFromCloud();
    if (ok) {
      showToast('نسخه ابری بارگذاری شد. تغییرات محلی شما در state باقی مانده‌اند.', 4000);
    } else {
      showToast('بارگذاری نسخه ابری ناموفق بود.', 5000);
    }
  };

  const statusLabel = () => {
    switch (syncStatus) {
      case 'synced': return 'همگام‌سازی ابری انجام شد';
      case 'saving': return 'در حال ذخیره‌سازی ابری…';
      case 'error': return 'خطا در ذخیره‌سازی ابری';
      case 'conflict': return 'سنگین شدن نسخه (Conflict)';
      default: return 'هنوز به‌روزرسانی نشده';
    }
  };

  const statusDotColor = () => {
    switch (syncStatus) {
      case 'synced': return 'bg-[color:var(--nd-success)]';
      case 'saving': return 'bg-[color:var(--nd-accent)] animate-pulse';
      case 'error': return 'bg-[#dc2626]';
      case 'conflict': return 'bg-[#d97706]';
      default: return 'bg-[color:var(--nd-line-strong)]';
    }
  };

  const statusTextColor = () => {
    switch (syncStatus) {
      case 'synced': return 'text-[color:var(--nd-success)]';
      case 'saving': return 'text-[color:var(--nd-accent)]';
      case 'error': return 'text-[#dc2626]';
      case 'conflict': return 'text-[#d97706]';
      default: return 'text-[color:var(--nd-ink-2)]';
    }
  };

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10000] w-[95%] max-w-4xl dir-rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-extrabold px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs animate-bounce border border-emerald-300">
          <CheckCircle className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-[color:var(--nd-surface)] backdrop-blur-xl border-2 border-[color:var(--nd-accent)] text-[color:var(--nd-ink)] rounded-2xl px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
        {/* Status Badge */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${syncStatus === 'saving' ? 'bg-[color:var(--nd-accent)]' : 'bg-[color:var(--nd-success)]'} opacity-75`}></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--nd-accent)]"></span>
          </span>
          <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
            <Edit3 className="w-4 h-4" />
            <span className={statusTextColor()}>حالت ویرایش زنده فعال است</span>
          </div>
        </div>

        {/* Cloud Sync Status */}
        {persistence === 'cloud' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs font-extrabold">
            <span className={`w-2 h-2 rounded-full ${statusDotColor()}`}></span>
            <span className={statusTextColor()}>{statusLabel()}</span>
            {lastSyncedAt && (
              <span className="text-[color:var(--nd-faint)]">· آخرین sync: {lastSyncedAt}</span>
            )}
            {syncError && (
              <span className="text-[#dc2626]" title={syncError}>
                <AlertCircle className="w-3 h-3" />
              </span>
            )}
          </div>
        )}

        {/* Unsynced changes warning */}
        {persistence === 'cloud' && hasUnsyncedCloudChanges && (
          <span className="text-xs font-extrabold text-[#d97706] bg-[#fef3c7] px-2 py-1 rounded-lg border border-[#d97706]/30">
            تغییرات ذخیره‌نشده در ابری
          </span>
        )}

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={syncStatus === 'saving' || isRefreshing}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer ${
              (hasUnsavedChanges || hasUnsyncedCloudChanges || syncStatus === 'saving')
                ? 'bg-[color:var(--nd-accent)] text-white hover:opacity-90 scale-105 animate-pulse'
                : 'bg-[color:var(--nd-accent)] text-white hover:opacity-90'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>ذخیره تغییرات</span>
          </button>

          {/* Save to Cloud Now */}
          {persistence === 'cloud' && (
            <button
              type="button"
              onClick={handleSaveToCloud}
              disabled={syncStatus === 'saving' || isRefreshing}
              title="ذخیره فوری در Cloudflare D1 (بدون انتظار ۱.۲ ثانیه)"
              className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer disabled:opacity-50 ${
                syncStatus === 'synced'
                  ? 'bg-[color:var(--nd-success)] text-white hover:opacity-90'
                  : 'bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-[color:var(--nd-ink)] hover:bg-[color:var(--nd-bg-soft)]'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ذخیره در ابری</span>
            </button>
          )}

          {/* Refresh from Cloud */}
          {persistence === 'cloud' && (
            <button
              type="button"
              onClick={handleRefreshFromCloud}
              disabled={syncStatus === 'saving' || isRefreshing}
              title="بازخوانی آخرین نسخه از Cloudflare D1 (بیگذر از کش)"
              className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer disabled:opacity-50 ${
                syncStatus === 'synced'
                  ? 'bg-[color:var(--nd-accent)] text-white hover:opacity-90'
                  : 'bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-[color:var(--nd-ink)] hover:bg-[color:var(--nd-bg-soft)]'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">بازخوانی ابری</span>
            </button>
          )}

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

      {/* Conflict resolution modal */}
      {conflictOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal>
          <div className="bg-[color:var(--nd-surface)] border border-[color:var(--nd-line)] rounded-2xl p-6 sm:p-8 w-full max-w-md dir-rtl shadow-2xl">
            <h3 className="nd-h2 text-base mb-2 text-[color:var(--nd-ink)]">سنگین شدن نسخه — تغییرات Concurrent</h3>
            <p className="text-xs nd-muted mb-4 leading-relaxed">
              محتوای ابری از زمان اینکه شما تغییرات را خوانده‌اید، تغییر کرده است. لطفاً انتخاب کنید:
            </p>
            <div className="space-y-3">
              <button
                onClick={keepMyVersion}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[color:var(--nd-accent)] text-white font-bold text-sm hover:opacity-90 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>نسخه من بماند (ذخیره مجدد)</span>
              </button>
              <button
                onClick={loadCloudVersion}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] text-[color:var(--nd-ink-2)] font-bold text-sm hover:bg-[color:var(--nd-line)] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>نسخه ابری بیاید (بازنویسی)</span>
              </button>
            </div>
            <button
              onClick={() => setConflictOpen(false)}
              className="w-full py-2 rounded-xl text-[color:var(--nd-faint)] text-xs font-bold hover:text-[color:var(--nd-ink)] transition-colors"
            >
            لغو
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
