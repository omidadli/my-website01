import React, { useState } from 'react';
import { X, ShieldCheck, Zap, Loader2, ArrowLeft, Phone } from 'lucide-react';
import { Theme } from '../../types';
import { ToolPlan } from '../../../lib/toolPlans';
import { api } from '../../services/api';
import { navigate, pathForPayment } from '../../utils/router';
import { useUser } from '../../context/UserContext';

interface QuickCheckoutModalProps {
  theme: Theme;
  productId: string;
  productName: string;
  plan: ToolPlan;
  priceLabel: string;
  onClose: () => void;
}

export const QuickCheckoutModal: React.FC<QuickCheckoutModalProps> = ({
  theme,
  productId,
  productName,
  plan,
  priceLabel,
  onClose,
}) => {
  const isDark = theme === 'dark';
  const { profile } = useUser();

  const [phone, setPhone] = useState<string>(() => {
    if (profile?.phone) return profile.phone;
    try {
      return localStorage.getItem('nd_checkout_phone') || '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('لطفاً شماره موبایل خود را وارد کنید تا کد دسترسی به نام شما صادر شود.');
      return;
    }
    setLoading(true);
    const res = await api.startWebsiteCheckout({
      productId,
      planId: plan.id,
      phone: trimmed,
    });
    setLoading(false);

    if (!res.ok || !res.data?.payment_id) {
      setError(res.error || 'خطا در ایجاد فاکتور پرداخت.');
      return;
    }

    try {
      localStorage.setItem('nd_checkout_phone', trimmed);
    } catch {}

    onClose();
    navigate(pathForPayment(res.data.payment_id));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      dir="rtl"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-5 ${
          isDark ? 'bg-slate-900 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">خرید آنی و فعال‌سازی خودکار</h3>
              <p className="text-xs opacity-65">درگاه هوشمند کارت‌به‌کارت بدون نیاز به ارسال رسید</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 transition opacity-70 hover:opacity-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`p-4 rounded-2xl border space-y-1.5 ${
            isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="text-xs opacity-70">{productName}</div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">پلن {plan.name}</span>
            <span className="font-black text-emerald-500 text-base">{priceLabel}</span>
          </div>
          <div className="text-[11px] opacity-65">
            {plan.durationDays} روز اعتبار • {plan.messageQuota ? `${plan.messageQuota} پیام` : 'پیام نامحدود'} • روی{' '}
            {plan.maxDevices} دستگاه
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5">
              شماره موبایل خریدار (جهت صدور آنی کد دسترسی و همگام‌سازی اشتراک):
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 opacity-50 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                autoFocus
                className={`w-full pr-10 pl-4 py-3 rounded-2xl border font-mono text-sm text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                  isDark ? 'bg-slate-800 border-white/15 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 hover:opacity-95 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>ادامه و دریافت مبلغ یکتای کارت‌به‌کارت</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] opacity-65">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>تأیید خودکار از پیامک بانک در چند ثانیه + فعال‌سازی آنی در سایت و تلگرام</span>
          </div>
        </form>
      </div>
    </div>
  );
};
