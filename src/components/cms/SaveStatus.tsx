import React, { useState } from 'react';
import { Cloud, CloudOff, Loader2, AlertTriangle, CheckCircle2, FlaskConical } from 'lucide-react';
import { useContent } from '../../context/ContentContext';

const formatTime = (at?: number): string =>
  at ? new Date(at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '';

interface SaveStatusChipProps {
  /** Single-line pill (floating bar) instead of the full-width card (admin sidebar). */
  compact?: boolean;
  className?: string;
}

/**
 * The admin's window into "is what I typed actually on the site?".
 * It renders the REAL state of the admin → server sync (see ContentContext.saveState), so a
 * failed or impossible save can never hide behind a generic "auto-save is on" label.
 */
export const SaveStatusChip: React.FC<SaveStatusChipProps> = ({ compact = false, className = '' }) => {
  const { saveState, backend, persistence, contentReady, saveNow, reconnect } = useContent();
  const [busy, setBusy] = useState(false);
  const [stillDown, setStillDown] = useState(false);
  const { status, message, at } = saveState;

  const retrySave = async () => {
    setBusy(true);
    try {
      await saveNow();
    } finally {
      setBusy(false);
    }
  };

  const retryConnect = async () => {
    setBusy(true);
    setStillDown(false);
    try {
      const ok = await reconnect(); // reloads the page when the server answers
      if (!ok) setStillDown(true);
    } finally {
      setBusy(false);
    }
  };

  const base = compact
    ? 'inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold'
    : 'flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl px-3 py-2.5 text-[11px] font-extrabold leading-relaxed';
  const danger = 'bg-[#fee2e2] text-[#b91c1c]';
  const ok = 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)]';
  const neutral = 'bg-[color:var(--nd-bg-soft)] text-[color:var(--nd-ink-2)]';
  const actionBtn = 'underline underline-offset-2 font-black cursor-pointer disabled:opacity-50 disabled:cursor-wait';

  let body: React.ReactNode;
  let tone = neutral;

  if (status === 'offline') {
    tone = danger;
    body = (
      <>
        <CloudOff className="w-3.5 h-3.5 shrink-0" />
        <span>{message}</span>
        <button type="button" onClick={retryConnect} disabled={busy} className={actionBtn}>
          {busy ? 'در حال بررسی…' : 'تلاش مجدد برای اتصال'}
        </button>
        {stillDown && <span className="basis-full font-bold">هنوز به سرور دسترسی نیست.</span>}
      </>
    );
  } else if (status === 'error') {
    tone = danger;
    body = (
      <>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>روی سایت ذخیره نشد: {message}</span>
        <button type="button" onClick={retrySave} disabled={busy} className={actionBtn}>
          {busy ? 'در حال ذخیره…' : 'تلاش مجدد'}
        </button>
      </>
    );
  } else if (status === 'saving') {
    body = (
      <>
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        <span>در حال ذخیره روی سایت…</span>
      </>
    );
  } else if (status === 'saved') {
    tone = ok;
    body = (
      <>
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>ذخیره شد و روی سایت اعمال شد{at ? ` · ${formatTime(at)}` : ''}</span>
      </>
    );
  } else if (!contentReady) {
    body = (
      <>
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        <span>در حال اتصال به سرور…</span>
      </>
    );
  } else if (persistence === 'cloud') {
    tone = ok;
    body = (
      <>
        <Cloud className="w-3.5 h-3.5 shrink-0" />
        <span>متصل به سایت — هر تغییر خودکار ذخیره می‌شود</span>
      </>
    );
  } else {
    body = <span>حالت محلی</span>;
  }

  return (
    <div className={`space-y-1.5 ${className}`} role="status" aria-live="polite">
      <div className={`${base} ${tone}`}>{body}</div>
      {backend === 'dev' && (
        <div className={`${base} bg-[color:var(--nd-peach-soft)] text-[#b45309]`}>
          <FlaskConical className="w-3.5 h-3.5 shrink-0" />
          <span>شبیه‌ساز محلی (سرور توسعه) — این تغییرات روی سایت اصلی اعمال نمی‌شود.</span>
        </div>
      )}
    </div>
  );
};
