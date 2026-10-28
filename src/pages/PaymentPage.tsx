import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Upload,
  Send,
  ArrowRight,
  Sparkles,
  KeyRound,
  CreditCard,
  Loader2,
  FileImage,
  HelpCircle,
} from 'lucide-react';
import { Theme, Page } from '../types';
import { api } from '../services/api';
import { navigate, pathForProduct } from '../utils/router';
import { useUser } from '../context/UserContext';

interface PaymentPageProps {
  theme: Theme;
  paymentId: string;
  onNavigate: (page: Page) => void;
}

const DEVICE_KEY = 'nd_tool_device_id';
const getBrowserDeviceId = (): string => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch {
    return 'dev-local';
  }
};

const toFaDigits = (s: string | number): string =>
  String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const formatMoneyFa = (n: number): string =>
  toFaDigits(Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

const BANK_COLORS: Record<string, string> = {
  saman: '#0284c7',
  mellat: '#e11d48',
  melli: '#d97706',
  parsian: '#b45309',
  pasargad: '#ca8a04',
  tejarat: '#2563eb',
  saderat: '#1d4ed8',
  sepah: '#ea580c',
  keshavarzi: '#16a34a',
  maskan: '#ea580c',
  blu: '#3b82f6',
  ayandeh: '#92400e',
  shahr: '#dc2626',
  resalat: '#0d9488',
  gardeshgari: '#be123c',
  shetab: '#6366f1',
};

export const PaymentPage: React.FC<PaymentPageProps> = ({ theme, paymentId, onNavigate }) => {
  const isDark = theme === 'dark';
  const { refresh } = useUser();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<any | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copiedField, setCopiedField] = useState<string>('');

  // Fallback manual receipt state
  const [showFallback, setShowFallback] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptImageB64, setReceiptImageB64] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [receiptFeedback, setReceiptFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const syncedPaidRef = useRef(false);

  const copyValue = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(key);
      setTimeout(() => setCopiedField((prev) => (prev === key ? '' : prev)), 2200);
    } catch {
      /* ignore */
    }
  };

  const fetchStatus = useCallback(
    async (manual = false) => {
      if (!paymentId) return;
      if (manual) setRefreshing(true);
      const devId = getBrowserDeviceId();
      const res = await api.fetchPaymentClientStatus(paymentId, devId);
      if (manual) setRefreshing(false);
      setLoading(false);

      if (!res.ok || !res.data) {
        setError(res.error || 'اطلاعات این تراکنش یافت نشد.');
        return;
      }

      setError('');
      setPayment(res.data);
      setSecondsLeft(Number(res.data.seconds_remaining || 0));

      // Auto-store signed tool session token when paid!
      if (res.data.status === 'paid' && !syncedPaidRef.current) {
        syncedPaidRef.current = true;
        if (res.data.product_id && res.data.fulfillment?.tool_token) {
          try {
            localStorage.setItem(`nd_tool_token_${res.data.product_id}`, res.data.fulfillment.tool_token);
          } catch {}
        }
        refresh().catch(() => {});
      }
    },
    [paymentId, refresh]
  );

  // Initial load + 5s live polling while pending / needs_review
  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => {
      setPayment((cur: any) => {
        if (!cur || cur.status === 'pending' || cur.status === 'needs_review') {
          fetchStatus(false);
        }
        return cur;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Smooth 1-second countdown
  useEffect(() => {
    if (!payment || payment.status !== 'pending') return;
    const t = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchStatus(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [payment?.status, fetchStatus]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setReceiptFeedback({ ok: false, msg: 'حجم تصویر نباید بیشتر از ۴ مگابایت باشد.' });
      return;
    }
    setReceiptFileName(file.name);
    // Compress via canvas if large image so upload is instant
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          setReceiptImageB64(compressed);
        } else {
          setReceiptImageB64(dataUrl);
        }
      };
      img.onerror = () => setReceiptImageB64(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode.trim() && !receiptImageB64) {
      setReceiptFeedback({ ok: false, msg: 'لطفاً شماره پیگیری یا تصویر رسید بانکی را وارد کنید.' });
      return;
    }
    setSubmittingReceipt(true);
    setReceiptFeedback(null);
    const res = await api.submitPaymentReceipt(paymentId, {
      refCode: refCode.trim(),
      note: receiptNote.trim(),
      imageBase64: receiptImageB64,
    });
    setSubmittingReceipt(false);
    if (res.ok) {
      setReceiptFeedback({
        ok: true,
        msg: res.data?.message || 'رسید شما ثبت شد و برای بررسی به پشتیبانی ارسال گردید.',
      });
      fetchStatus(false);
    } else {
      setReceiptFeedback({ ok: false, msg: res.error || 'خطا در ارسال رسید.' });
    }
  };

  const handleCancel = async () => {
    if (!confirm('آیا از لغو این فاکتور پرداخت مطمئن هستید؟')) return;
    await api.cancelPaymentSession(paymentId);
    fetchStatus(true);
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timerStr = `${toFaDigits(String(mins).padStart(2, '0'))}:${toFaDigits(String(secs).padStart(2, '0'))}`;
  const bankColor = BANK_COLORS[payment?.card?.bank_slug || 'shetab'] || '#6366f1';

  if (loading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className={isDark ? 'text-slate-300 text-sm' : 'text-slate-600 text-sm'}>
          در حال اتصال به درگاه پرداخت خودکار...
        </p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 rounded-3xl border text-center space-y-4 bg-rose-500/5 border-rose-500/20">
        <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold">تراکنش یافت نشد</h2>
        <p className="text-sm opacity-80">{error || 'شناسه پرداخت معتبر نیست.'}</p>
        <button
          onClick={() => onNavigate('products')}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition"
        >
          بازگشت به محصولات هوشمند
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8 px-2" dir="rtl">
      {/* Top Security Bar */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold">درگاه خودکار کارت‌به‌کارت (تأیید آنی پیامکی)</h1>
            <p className="text-[11px] opacity-65">بدون نیاز به ارسال رسید • فعال‌سازی در چند ثانیه</p>
          </div>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20">
          #{payment.payment_id.slice(0, 8)}
        </span>
      </div>

      {/* Main Card */}
      <div
        className={`rounded-3xl border overflow-hidden shadow-2xl transition-all ${
          isDark
            ? 'bg-slate-900/90 border-white/10 shadow-black/40'
            : 'bg-white border-slate-200/90 shadow-slate-200/70'
        }`}
      >
        {/* Order Header */}
        <div
          className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
            isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200/80'
          }`}
        >
          <div>
            <div className="text-xs opacity-60 mb-0.5">عنوان سفارش</div>
            <div className="font-bold text-sm sm:text-base">
              {payment.description || payment.product_name || `سفارش ${payment.order_id}`}
            </div>
          </div>

          {payment.status === 'pending' && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
              <Clock className="w-4 h-4 animate-pulse" />
              <span className="font-extrabold text-sm tabular-nums">{timerStr}</span>
            </div>
          )}
          {payment.status === 'paid' && (
            <span className="px-3.5 py-1.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-extrabold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> پرداخت موفق و تأیید شده
            </span>
          )}
          {payment.status === 'needs_review' && (
            <span className="px-3.5 py-1.5 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-500 text-xs font-extrabold">
              ⏳ در انتظار تأیید رسید
            </span>
          )}
          {(payment.status === 'expired' || payment.status === 'canceled' || payment.status === 'rejected') && (
            <span className="px-3.5 py-1.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 text-xs font-extrabold">
              {payment.status === 'canceled' ? 'لغو شده' : payment.status === 'rejected' ? 'رد شده' : 'منقضی شده'}
            </span>
          )}
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* ================= PAID CELEBRATION STATE ================= */}
          {payment.status === 'paid' && (
            <div className="space-y-5 py-2">
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h2 className="text-lg font-black text-emerald-500">واریز شما به‌صورت خودکار تأیید شد!</h2>
                <p className="text-xs opacity-80 leading-relaxed">
                  اشتراک شما همین لحظه فعال گردید و مرورگر شما به‌صورت خودکار به ابزار متصل شد.
                </p>
              </div>

              {payment.fulfillment?.access_code && (
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    isDark ? 'bg-slate-800/70 border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs opacity-75">
                    <span className="flex items-center gap-1.5 font-bold">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                      کد دسترسی اختصاصی شما (جهت نگهداری):
                    </span>
                    {payment.fulfillment.phone && <span dir="ltr">{payment.fulfillment.phone}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25">
                    <code className="font-mono text-base font-black tracking-wider text-indigo-400" dir="ltr">
                      {payment.fulfillment.access_code}
                    </code>
                    <button
                      onClick={() => copyValue('code', payment.fulfillment.access_code)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-500 transition"
                    >
                      {copiedField === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'code' ? 'کپی شد' : 'کپی کد'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {payment.product_id ? (
                  <button
                    onClick={() => navigate(pathForProduct(payment.product_id))}
                    className="flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 hover:opacity-95 transition flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    ورود مستقیم به ابزار هوشمند (فعال شد)
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>
                ) : (
                  <button
                    onClick={() => onNavigate('profile')}
                    className="flex-1 py-3.5 px-5 rounded-2xl bg-indigo-600 text-white font-extrabold text-sm hover:bg-indigo-500 transition"
                  >
                    مشاهده اشتراک‌ها در پروفایل
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================= PENDING ACTIVE CHECKOUT STATE ================= */}
          {payment.status === 'pending' && payment.card && (
            <>
              {/* Step 1: Exact Unique Payable Amount */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border-2 space-y-3 ${
                  isDark ? 'bg-indigo-500/[0.07] border-indigo-500/40' : 'bg-indigo-50/70 border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-400">
                    ۱. مبلغ دقیق و یکتای قابل انتقال
                  </span>
                  {payment.amount > payment.payable_amount && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold">
                      {formatMoneyFa(Math.floor((payment.amount - payment.payable_amount) / 10))} تومان تخفیف شناسایی خودکار
                    </span>
                  )}
                </div>

                {/* Toman Row */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-2xl sm:text-3xl font-black tracking-tight">
                      {formatMoneyFa(payment.payable_amount_toman)}{' '}
                      <span className="text-sm font-bold opacity-75">تومان</span>
                    </div>
                    <div className="text-xs opacity-70 mt-0.5">
                      معادل دقیق ریالی: <b>{formatMoneyFa(payment.payable_amount)} ریال</b>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => copyValue('rial', String(payment.payable_amount))}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-500 transition shadow-sm"
                    >
                      {copiedField === 'rial' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'rial' ? 'ریال کپی شد' : 'کپی مبلغ (ریال)'}
                    </button>
                    <button
                      onClick={() => copyValue('toman', String(payment.payable_amount_toman))}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                        isDark ? 'border-white/15 hover:bg-white/10' : 'border-slate-300 bg-white hover:bg-slate-100'
                      }`}
                    >
                      {copiedField === 'toman' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'toman' ? 'تومان کپی شد' : 'کپی مبلغ (تومان)'}
                    </button>
                  </div>
                </div>

                {/* Red DO NOT ROUND warning */}
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-start gap-2.5 text-rose-500">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-relaxed">
                    مبلغ بالا را <u>به هیچ‌وجه رُند نکنید</u>! سامانه دقیقاً از روی همین رقمِ یکتا، پیامک واریز بانکی شما را در چند ثانیه شناسایی و اشتراک را خودکار فعال می‌کند.
                  </p>
                </div>
              </div>

              {/* Step 2: Destination Bank Card */}
              <div
                className="p-5 rounded-2xl border relative overflow-hidden"
                style={{
                  borderColor: `${bankColor}55`,
                  background: isDark
                    ? `linear-gradient(135deg, ${bankColor}22 0%, rgba(15,23,42,0.92) 100%)`
                    : `linear-gradient(135deg, ${bankColor}14 0%, #ffffff 100%)`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: bankColor }}
                    />
                    <span className="font-extrabold text-sm">{payment.card.bank || 'کارت بانکی عضو شتاب'}</span>
                  </div>
                  <CreditCard className="w-5 h-5 opacity-50" />
                </div>

                <div className="flex items-center justify-between gap-2 my-3">
                  <div
                    dir="ltr"
                    className="font-mono text-lg sm:text-2xl font-black tracking-widest select-all"
                  >
                    {payment.card.formatted}
                  </div>
                  <button
                    onClick={() => copyValue('card', payment.card.number)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5 hover:bg-emerald-500 transition shrink-0 shadow-md shadow-emerald-600/20"
                  >
                    {copiedField === 'card' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedField === 'card' ? 'کپی شد!' : 'کپی کارت'}
                  </button>
                </div>

                <div className="text-xs opacity-80 flex items-center justify-between pt-2 border-t border-white/10">
                  <span>به نام صاحب حساب:</span>
                  <span className="font-extrabold text-sm">{payment.card.holder_name}</span>
                </div>
              </div>

              {/* Live SMS Radar Indicator */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                  isDark ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <div className="text-xs">
                    <div className="font-bold">در انتظار دریافت پیامک واریز از بانک...</div>
                    <div className="opacity-65 text-[11px]">
                      این صفحه هر ۵ ثانیه خودکار بروزرسانی می‌شود؛ پس از کارت‌به‌کارت، چند ثانیه صبر کنید.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => fetchStatus(true)}
                  disabled={refreshing}
                  className="px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-500/20 transition shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  بررسی الان
                </button>
              </div>
            </>
          )}

          {/* ================= NEEDS REVIEW STATE ================= */}
          {payment.status === 'needs_review' && (
            <div className="p-5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-center space-y-2">
              <Clock className="w-10 h-10 text-sky-400 mx-auto" />
              <h3 className="font-extrabold text-base text-sky-400">رسید شما در صف بررسی فوری قرار گرفت</h3>
              <p className="text-xs opacity-80 leading-relaxed">
                اطلاعات رسید برای مدیریت ارسال شده است. به محض تأیید، همین صفحه به‌صورت خودکار به‌روز شده و کد دسترسی نمایش داده می‌شود (همچنین در تلگرام برایتان ارسال خواهد شد).
              </p>
            </div>
          )}

          {/* ================= FALLBACK MANUAL RECEIPT SECTION ================= */}
          {payment.status !== 'paid' && (
            <div className="pt-2 border-t border-slate-500/15 space-y-3">
              {payment.status === 'pending' ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFallback((v) => !v)}
                    className="text-xs text-amber-500 hover:underline font-bold flex items-center gap-1.5"
                  >
                    <HelpCircle className="w-4 h-4" />
                    مبلغ را اشتباهاً رُند زدید یا پس از ۲ دقیقه تأیید نشد؟ ثبت دستی رسید
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="text-xs opacity-55 hover:opacity-100 hover:text-rose-500 transition"
                  >
                    انصراف از پرداخت
                  </button>
                </div>
              ) : (
                payment.status !== 'needs_review' && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs leading-relaxed">
                    مهلت زمانی این فاکتور تمام شده است. اگر وجه را واریز کرده‌اید، در فرم زیر تصویر رسید یا شماره پیگیری را بفرستید تا پشتیبانی برایتان فعال کند:
                  </div>
                )
              )}

              {(showFallback || payment.status === 'expired') && payment.status !== 'needs_review' && (
                <form
                  onSubmit={handleReceiptSubmit}
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'bg-slate-800/50 border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="text-xs font-extrabold">ثبت رسید جبرانی (بررسی توسط پشتیبانی)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] opacity-70 mb-1">شماره پیگیری / ارجاع بانکی</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={refCode}
                        onChange={(e) => setRefCode(e.target.value)}
                        placeholder="مثلاً 1234567890"
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                          isDark ? 'bg-slate-900 border-white/15' : 'bg-white border-slate-300'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] opacity-70 mb-1">تصویر رسید بانکی (اختیاری)</label>
                      <label
                        className={`w-full px-3 py-2 rounded-xl border text-xs flex items-center gap-2 cursor-pointer truncate ${
                          isDark ? 'bg-slate-900 border-white/15 hover:bg-slate-800' : 'bg-white border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <FileImage className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="truncate">{receiptFileName || 'انتخاب عکس رسید...'}</span>
                        <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                    placeholder="توضیح کوتاه (مثلاً ۴ رقم آخر کارت مبدأ یا ساعت واریز)"
                    className={`w-full px-3 py-2 rounded-xl border text-xs ${
                      isDark ? 'bg-slate-900 border-white/15' : 'bg-white border-slate-300'
                    }`}
                  />

                  {receiptFeedback && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-bold ${
                        receiptFeedback.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {receiptFeedback.msg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submittingReceipt}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs hover:bg-amber-400 transition flex items-center justify-center gap-1.5"
                  >
                    {submittingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    ارسال رسید برای بررسی و فعال‌سازی
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Return link */}
      <div className="mt-5 text-center">
        <button
          onClick={() => (payment.product_id ? navigate(pathForProduct(payment.product_id)) : onNavigate('products'))}
          className="text-xs opacity-65 hover:opacity-100 transition inline-flex items-center gap-1.5"
        >
          بازگشت به صفحه محصول
        </button>
      </div>
    </div>
  );
};
