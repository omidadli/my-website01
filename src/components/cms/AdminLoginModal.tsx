import React, { useState } from 'react';
import { Lock, X, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useContent } from '../../context/ContentContext';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Quick edit-mode login (matches the /#admin gate: username+password in cloud mode). */
export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose }) => {
  const { loginAdmin, persistence, saveState, reconnect } = useContent();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = persistence === 'cloud'
      ? await loginAdmin(username.trim(), password)
      : await loginAdmin(password || username.trim());
    setBusy(false);
    if (ok) {
      setError('');
      setUsername('');
      setPassword('');
      onClose();
    } else {
      setError(persistence === 'cloud' ? 'نام کاربری یا رمز عبور اشتباه است.' : 'رمز وارد شده اشتباه است.');
    }
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 dir-rtl" role="dialog" aria-modal>
      <div className="nd-card max-w-sm w-full p-6 sm:p-8 space-y-5 relative">
        <div className="flex items-center justify-between pb-3 border-b border-[color:var(--nd-line)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[color:var(--nd-accent)] text-white">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="nd-h2 text-base">ورود به حالت ویرایش</h3>
              <p className="text-[11px] nd-muted">سیستم مدیریت محتوای زنده (CMS)</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl nd-muted hover:text-[color:var(--nd-ink)] hover:bg-[color:var(--nd-bg-soft)] cursor-pointer" aria-label="بستن">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {persistence === 'cloud' && (
            <input
              type="text"
              autoComplete="username"
              dir="ltr"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              placeholder="نام کاربری"
              className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-2xl px-4 py-3 text-sm font-bold text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] transition-colors"
              autoFocus
            />
          )}
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="رمز عبور"
            className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-2xl px-4 py-3 text-sm font-bold text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] transition-colors"
            autoFocus={persistence !== 'cloud'}
          />
          {error && (
            <p className="text-xs text-[#b91c1c] font-extrabold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <button type="submit" disabled={busy} className="nd-btn w-full py-3 text-xs nd-btn-accent disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" />
            <span>{busy ? 'در حال بررسی…' : 'ورود'}</span>
          </button>
          {persistence === 'cloud' && saveState.status === 'error' && saveState.message && (
            <p className="text-[11px] text-[#b91c1c] font-extrabold leading-relaxed" role="alert">
              {saveState.message} تغییراتی که هنوز ذخیره نشده بودند بعد از ورود دوباره از نسخهٔ سرور جایگزین می‌شوند.
            </p>
          )}
          {persistence === 'local' && (
            <div className="rounded-xl bg-[#fee2e2] text-[#b91c1c] text-[11px] font-extrabold leading-relaxed p-3 space-y-1.5" role="alert">
              <p>اتصال به سرور برقرار نیست؛ ورود با رمز محلی فقط برای کار آفلاین است و تغییرات روی سایت اعمال نمی‌شود.</p>
              <button type="button" onClick={() => { void reconnect(); }} className="underline underline-offset-2 font-black cursor-pointer">تلاش مجدد برای اتصال</button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
