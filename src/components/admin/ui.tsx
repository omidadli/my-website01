import React, { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* ND-styled admin primitives — used by the whole CMS panel.          */
/* ------------------------------------------------------------------ */

export const ACard: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`nd-card p-5 sm:p-6 ${className}`}>{children}</div>
);

export const ASectionTitle: React.FC<{ title: string; desc?: string; action?: React.ReactNode }> = ({ title, desc, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
    <div>
      <h3 className="nd-h2 text-base sm:text-lg">{title}</h3>
      {desc && <p className="nd-muted text-xs mt-1">{desc}</p>}
    </div>
    {action}
  </div>
);

export const ALabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className="flex items-center gap-2 text-xs font-extrabold text-[color:var(--nd-ink-2)] mb-1.5">
    <span>{children}</span>
    {hint && <span className="text-[10px] font-bold text-[color:var(--nd-faint)]">{hint}</span>}
  </label>
);

export const aInputCls =
  'w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)] focus:outline-none focus:border-[color:var(--nd-accent)] transition-colors';

export const AInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`${aInputCls} ${props.className || ''}`} />
);

export const ATextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea rows={props.rows || 3} {...props} className={`${aInputCls} leading-relaxed ${props.className || ''}`} />
);

export const ASelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`${aInputCls} cursor-pointer ${props.className || ''}`} />
);

export const AToggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2.5 cursor-pointer select-none ${label ? '' : ''}`}
    aria-pressed={checked}
  >
    <span className={`w-10 h-5.5 rounded-full p-0.5 transition-colors ${checked ? 'bg-[color:var(--nd-accent)]' : 'bg-[color:var(--nd-line-strong)]'}`} style={{ height: 22 }}>
      <span className={`block w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-4' : 'translate-x-0'}`} />
    </span>
    {label && <span className="text-xs font-extrabold text-[color:var(--nd-ink-2)]">{label}</span>}
  </button>
);

export const ABadge: React.FC<{ tone?: 'ok' | 'warn' | 'muted' | 'accent'; children: React.ReactNode }> = ({ tone = 'muted', children }) => {
  const tones = {
    ok: 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent',
    warn: 'bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent',
    accent: 'bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] border-transparent',
    muted: '',
  };
  return <span className={`nd-chip text-[10px] ${tones[tone]}`}>{children}</span>;
};

export const ACollapse: React.FC<{ title: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; tone?: string }> = ({ title, defaultOpen = false, children, tone }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-2xl border overflow-hidden ${tone || 'border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'}`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 p-4 cursor-pointer text-right">
        <span className="text-xs font-extrabold text-[color:var(--nd-ink)]">{title}</span>
        <ChevronDown className={`w-4 h-4 text-[color:var(--nd-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0">{children}</div>
        </div>
      </div>
    </div>
  );
};

export const AModal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }> = ({ open, onClose, title, children, wide }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative nd-card p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[85dvh] overflow-y-auto space-y-4`}>
        <div className="flex items-center justify-between sticky -top-6 pt-0">
          <h3 className="nd-h2 text-base">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-[color:var(--nd-bg-soft)] cursor-pointer" aria-label="بستن">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const AConfirm: React.FC<{ open: boolean; message: string; onConfirm: () => void; onCancel: () => void }> = ({ open, message, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <AModal open={open} onClose={onCancel} title="تایید حذف">
      <p className="text-xs nd-muted leading-relaxed">{message}</p>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="nd-btn nd-btn-ghost px-5 py-2.5 text-xs cursor-pointer">انصراف</button>
        <button type="button" onClick={onConfirm} className="nd-btn px-5 py-2.5 text-xs bg-[#dc2626] text-white hover:bg-[#b91c1c] cursor-pointer">حذف قطعی</button>
      </div>
    </AModal>
  );
};
