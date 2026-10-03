import React, { useState, useEffect, useRef } from 'react';
import { useContent } from '../../context/ContentContext';
import { api, CloudMediaItem } from '../../services/api';
import { AInput, ALabel, AModal } from './ui';
import { ImagePlus, Upload, Link2, Trash2, Cloud } from 'lucide-react';

interface MediaFieldProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  /** Short explanation under the field (e.g. where on the site this picture appears). */
  hint?: string;
  /** Offers a one-click way back to the site's built-in picture. */
  resetTo?: { value: string; label: string };
}

/** Image URL field + media-library picker (local library + Cloudflare R2). */
export const MediaField: React.FC<MediaFieldProps> = ({ value, onChange, label = 'تصویر', hint, resetTo }) => {
  const { data, persistence, isAdmin, addMediaItem, removeMediaItem, logActivity } = useContent();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cloudItems, setCloudItems] = useState<CloudMediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen && persistence === 'cloud') {
      api.listMedia().then((items) => setCloudItems(items || []));
    }
  }, [pickerOpen, persistence]);

  const library = data.MEDIA_LIBRARY || [];
  const cloudUrls = new Set(library.map((m) => m.url));
  const merged = [...library.map((m) => ({ id: m.id, url: m.url, title: m.title, alt: m.alt || '', cloud: false })), ...cloudItems.filter((c) => !cloudUrls.has(c.url)).map((c) => ({ id: c.id, url: c.url, title: c.title, alt: c.alt || '', cloud: true }))];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true);
    setUploadError('');
    if (persistence === 'cloud') {
      const res = await api.uploadMediaResult(file, file.name, file.name);
      const uploaded = res.ok ? res.item : undefined;
      if (uploaded) {
        addMediaItem(uploaded.url, uploaded.title, uploaded.sizeKb, undefined, ['cloud', 'r2']);
        setCloudItems((prev) => [uploaded, ...prev]);
        onChange(uploaded.url);
      } else {
        // Used to fail silently — the admin saw nothing happen and assumed the site was updated.
        setUploadError(res.error || 'آپلود ناموفق بود.');
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          addMediaItem(reader.result, file.name, Math.round(file.size / 1024));
          onChange(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
    setBusy(false);
  };

  return (
    <div>
      <ALabel>{label}</ALabel>
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <AInput dir="ltr" placeholder="https://… یا از کتابخانه انتخاب کنید" value={value || ''} onChange={(e) => onChange(e.target.value)} className="pr-10 text-left" />
          {value ? (
            <img src={value} alt="" loading="lazy" decoding="async" width={28} height={28} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg object-cover border border-[color:var(--nd-line)]" referrerPolicy="no-referrer" />
          ) : (
            <ImagePlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--nd-faint)]" />
          )}
        </div>
        <button type="button" onClick={() => setPickerOpen(true)} className="nd-btn nd-btn-ghost px-4 py-2.5 text-[11px] shrink-0 cursor-pointer">
          <span>کتابخانه</span>
        </button>
      </div>
      {hint && <p className="text-[10px] nd-muted mt-1.5 leading-relaxed">{hint}</p>}
      {resetTo && (value || '') !== resetTo.value && (
        <button type="button" onClick={() => onChange(resetTo.value)} className="mt-1.5 text-[11px] font-extrabold text-[color:var(--nd-accent)] underline underline-offset-2 cursor-pointer">
          {resetTo.label}
        </button>
      )}
      {uploadError && !pickerOpen && <p role="alert" className="text-[11px] font-bold text-[#dc2626] mt-1.5">{uploadError}</p>}

      <AModal open={pickerOpen} onClose={() => setPickerOpen(false)} title="کتابخانه رسانه" wide>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] nd-muted">
            {persistence === 'cloud' ? (
              <span className="inline-flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" /> فایل‌ها روی Cloudflare R2 ذخیره می‌شوند.</span>
            ) : (
              'حالت محلی: فایل‌ها داخل مرورگر ذخیره می‌شوند (برای توسعه).'
            )}
          </p>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="nd-btn nd-btn-accent px-4 py-2 text-[11px] shrink-0 cursor-pointer disabled:opacity-50">
            <Upload className="w-3.5 h-3.5" />
            <span>{busy ? 'در حال آپلود…' : 'آپلود فایل جدید'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
        </div>

        {uploadError && <p role="alert" className="text-[11px] font-bold text-[#dc2626]">{uploadError}</p>}

        {merged.length === 0 ? (
          <p className="text-xs nd-muted text-center py-10">کتابخانه خالی است — اولین فایل را آپلود کنید.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {merged.map((m) => (
              <div key={m.id + m.url.slice(0, 30)} className={`group relative rounded-2xl overflow-hidden border cursor-pointer transition-all ${value === m.url ? 'border-[color:var(--nd-accent)] ring-2 ring-[color:var(--nd-accent-soft)]' : 'border-[color:var(--nd-line)] hover:border-[color:var(--nd-accent)]'}`}>
                <button type="button" className="block w-full" onClick={() => { onChange(m.url); setPickerOpen(false); }} title={m.title}>
                  <img src={m.url} alt={m.alt || m.title} loading="lazy" decoding="async" className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                  <span className="block px-2 py-1.5 text-[10px] font-bold truncate text-right text-[color:var(--nd-ink-2)]">{m.title || m.url.slice(0, 30)}</span>
                </button>
                {isAdmin && (
                  <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="کپی لینک"
                      onClick={() => navigator.clipboard.writeText(m.url)}
                      className="p-1.5 rounded-lg bg-black/60 text-white cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="حذف"
                      onClick={async () => {
                        if (!confirm('این فایل از کتابخانه حذف شود؟')) return;
                        if (m.cloud) {
                          const key = (m as any).key || (m.url.includes('key=') ? new URL(m.url, window.location.origin).searchParams.get('key') : decodeURIComponent(m.url.replace('/api/media/file/', '')));
                          if (key) await api.deleteMedia(key);
                        }
                        removeMediaItem(m.id);
                        setCloudItems((prev) => prev.filter((c) => c.url !== m.url));
                        logActivity('حذف رسانه', `فایل ${m.title} از کتابخانه رسانه حذف شد.`);
                      }}
                      className="p-1.5 rounded-lg bg-[#dc2626]/90 text-white cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AModal>
    </div>
  );
};
