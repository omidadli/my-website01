import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Smartphone,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Trash2,
  Copy,
  Check,
  Zap,
  MessageSquare,
  ShieldCheck,
  BatteryCharging,
  Power,
  Eye,
  Send,
  Loader2,
} from 'lucide-react';
import { api } from '../../services/api';

type SubTab = 'transactions' | 'cards' | 'devices' | 'smslogs' | 'apikeys';

const fmtFa = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const fmtMoney = (rial: number) =>
  fmtFa(Math.floor((rial || 0) / 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

const fmtRial = (rial: number) =>
  fmtFa(Math.round(rial || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

export const PaymentGatewayManager: React.FC<{ onToast?: (msg: string) => void }> = ({ onToast }) => {
  const [subTab, setSubTab] = useState<SubTab>('transactions');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [copied, setCopied] = useState('');

  // Forms
  const [cardForm, setCardForm] = useState({ cardNumber: '', holderName: '', iban: '', priority: '1' });
  const [deviceForm, setDeviceForm] = useState({ name: 'گوشی اندروید اصلی (دریافت پیامک بانک)', deviceSerial: '' });
  const [newDeviceSecret, setNewDeviceSecret] = useState<{ token: string; connectPayload: string; name: string } | null>(null);
  const [keyForm, setKeyForm] = useState({ name: 'وب‌سایت / ربات تلگرام', allowedOrigins: '' });
  const [newApiKeySecret, setNewApiKeySecret] = useState<string>('');

  // Simulator
  const [simPaymentId, setSimPaymentId] = useState('');
  const [simSmsText, setSimSmsText] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<string>('');

  // Receipt modal
  const [previewReceiptImg, setPreviewReceiptImg] = useState<string>('');

  const toast = (m: string) => {
    if (onToast) onToast(m);
  };

  const copyText = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? '' : c)), 2000);
      toast('در کلیپ‌بورد کپی شد.');
    } catch {}
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.adminGetGatewayOverview();
    setLoading(false);
    if (res.ok) setOverview(res);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.adminGatewayAction('cards', {
      op: 'save',
      cardNumber: cardForm.cardNumber,
      holderName: cardForm.holderName,
      iban: cardForm.iban,
      priority: Number(cardForm.priority || 1),
    });
    if (!res.ok) return toast(res.error || 'خطا در ثبت کارت');
    setCardForm({ cardNumber: '', holderName: '', iban: '', priority: '1' });
    toast(`کارت بانکی (${res.bank?.name || 'شتاب'}) ثبت شد.`);
    load();
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.adminGatewayAction('devices', {
      op: 'create',
      name: deviceForm.name,
      deviceSerial: deviceForm.deviceSerial,
    });
    if (!res.ok) return toast(res.error || 'خطا در ساخت توکن دستگاه');
    setNewDeviceSecret({
      token: res.deviceToken,
      connectPayload: res.connectPayload,
      name: res.name,
    });
    setDeviceForm({ name: 'گوشی اندروید دریافت پیامک', deviceSerial: '' });
    toast('توکن اختصاصی دستگاه اندروید صادر شد.');
    load();
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.adminGatewayAction('keys', {
      op: 'create',
      name: keyForm.name,
      allowedOrigins: keyForm.allowedOrigins,
    });
    if (!res.ok) return toast(res.error || 'خطا در صدور کلید API');
    setNewApiKeySecret(res.apiKey);
    toast('کلید API جدید صادر شد.');
    load();
  };

  const handlePaymentDecision = async (paymentId: string, op: 'approve' | 'reject') => {
    const res = await api.adminGatewayAction('payments', { op, paymentId });
    if (!res.ok) return toast(res.error || 'خطا در بروزرسانی تراکنش');
    toast(op === 'approve' ? 'تراکنش تأیید و اشتراک خریدار صادر شد ✅' : 'تراکنش رد شد.');
    load();
  };

  const handleSimulateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimBusy(true);
    setSimResult('');
    const res = await api.adminGatewayAction('simulate-sms', {
      paymentId: simPaymentId || undefined,
      body: simSmsText.trim() || undefined,
    });
    setSimBusy(false);
    if (!res.ok) {
      setSimResult(`❌ خطا: ${res.error || 'ناموفق'}`);
      return;
    }
    const st = res.outcome?.status;
    if (st === 'matched') {
      setSimResult(`✅ پیامک با موفقیت تطبیق یافت! تراکنش ${res.outcome.matchedPaymentId} پرداخت شد و کد دسترسی صادر گردید.`);
      setSimSmsText('');
      setSimPaymentId('');
    } else {
      setSimResult(`ℹ️ نتیجه پردازش پیامک: ${st} (مبلغ استخراج‌شده: ${res.outcome?.parsed?.amountRial || 0} ریال)`);
    }
    load();
  };

  const pendingPayments = (overview?.payments || []).filter((p: any) => p.status === 'pending');

  return (
    <div className="space-y-6 dir-rtl">
      {/* Header */}
      <div className="nd-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-500" />
            <span>درگاه اختصاصی کارت‌به‌کارت خودکار (مبتنی بر پیامک بانکی)</span>
          </h2>
          <p className="text-xs nd-muted mt-1">
            تولید مبلغ یکتای ریالی با کول‌داون ۲ ساعته • تطبیق خودکار پیامک واریز از اپلیکیشن اندروید • تحویل آنی در وب‌سایت و تلگرام
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="nd-btn nd-btn-ghost px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>بروزرسانی زنده</span>
        </button>
      </div>

      {/* KPI Row */}
      {overview?.stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="nd-card p-4 space-y-1">
            <div className="text-xs nd-muted">مجموع دریافتی تأییدشده</div>
            <div className="text-xl font-black text-emerald-500">{fmtMoney(overview.stats.paidTotalRial)} تومان</div>
            <div className="text-[11px] nd-faint">{fmtFa(overview.stats.paidCount)} تراکنش موفق</div>
          </div>
          <div className="nd-card p-4 space-y-1">
            <div className="text-xs nd-muted">در انتظار واریز (باز)</div>
            <div className="text-xl font-black text-amber-500">{fmtFa(overview.stats.pendingCount)} فاکتور</div>
            <div className="text-[11px] nd-faint">پنجره زمانی ۳۰ دقیقه‌ای</div>
          </div>
          <div className="nd-card p-4 space-y-1">
            <div className="text-xs nd-muted">رسیدهای جبرانی در انتظار بررسی</div>
            <div className="text-xl font-black text-sky-500">{fmtFa(overview.stats.reviewCount)} مورد</div>
            <div className="text-[11px] nd-faint">تأیید ۱-کلیکی از همین پنل یا تلگرام</div>
          </div>
          <div className="nd-card p-4 space-y-1">
            <div className="text-xs nd-muted">گوشی‌های اندروید متصل (SMS)</div>
            <div className="text-xl font-black flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  overview.stats.onlineDevices > 0 ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>
                {fmtFa(overview.stats.onlineDevices)} از {fmtFa(overview.stats.totalDevices)} آنلاین
              </span>
            </div>
            <div className="text-[11px] nd-faint">اپلیکیشن OmidPay SMS Uploader</div>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'transactions', label: 'تراکنش‌ها و شبیه‌ساز پیامک', icon: Zap },
          { id: 'cards', label: 'کارت‌های بانکی مقصد', icon: CreditCard },
          { id: 'devices', label: 'اپلیکیشن اندروید و گوشی‌ها', icon: Smartphone },
          { id: 'smslogs', label: 'لاگ پیامک‌های بانکی', icon: MessageSquare },
          { id: 'apikeys', label: 'کلیدهای API و وب‌هوک (v2)', icon: KeyRound },
        ].map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as SubTab)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-[color:var(--nd-accent)] text-white shadow-md'
                  : 'nd-card hover:border-[color:var(--nd-accent)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= 1. TRANSACTIONS & SANDBOX ================= */}
      {subTab === 'transactions' && (
        <div className="space-y-6">
          {/* Live SMS Simulator */}
          <form onSubmit={handleSimulateSms} className="nd-card p-5 space-y-3 border-emerald-500/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-500" />
                <span>شبیه‌ساز زنده دریافت پیامک واریز بانکی (تست انتها-به-انتها بدون نیاز به گوشی)</span>
              </h3>
            </div>
            <p className="text-xs nd-muted">
              یک فاکتور «در انتظار پرداخت» را انتخاب کنید (یا متن پیامک دلخواه بنویسید) تا دقیقاً همان مسیر اپلیکیشن اندروید اجرا شده و تطبیق خودکار + صدور اشتراک را زنده ببینید:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={simPaymentId}
                onChange={(e) => setSimPaymentId(e.target.value)}
                className="nd-input text-xs rounded-xl px-3 py-2.5 bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)]"
              >
                <option value="">— انتخاب خودکار متن پیامک از روی تراکنش باز —</option>
                {pendingPayments.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    #{p.id.slice(0, 8)} — {p.productName || p.description} — مبلغ یکتا: {p.payableAmountRial.toLocaleString('en-US')} ریال ({p.phone || 'بدون شماره'})
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={simSmsText}
                onChange={(e) => setSimSmsText(e.target.value)}
                placeholder="یا متن خام پیامک بانک (مثلاً: بانک سامان واریز به حساب مبلغ 5,899,420 ریال)"
                className="nd-input text-xs rounded-xl px-3 py-2.5 bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)]"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={simBusy || (!simPaymentId && !simSmsText.trim())}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {simBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>ارسال پیامک شبیه‌سازی‌شده به هسته درگاه</span>
              </button>
              {simResult && <span className="text-xs font-bold">{simResult}</span>}
            </div>
          </form>

          {/* Payments List */}
          <div className="nd-card p-5 space-y-4">
            <h3 className="text-sm font-black">فهرست تراکنش‌های اخیر درگاه</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--nd-line)] nd-muted">
                    <th className="py-2.5 px-2">شناسه / مبدأ</th>
                    <th className="py-2.5 px-2">محصول / مشتری</th>
                    <th className="py-2.5 px-2">مبلغ یکتا (ریال / تومان)</th>
                    <th className="py-2.5 px-2">وضعیت</th>
                    <th className="py-2.5 px-2">کد دسترسی / رسید</th>
                    <th className="py-2.5 px-2">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.payments || []).map((p: any) => (
                    <tr key={p.id} className="border-b border-[color:var(--nd-line)]/60 hover:bg-white/[0.02]">
                      <td className="py-3 px-2 font-mono">
                        <div className="font-bold">{p.id.slice(0, 10)}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400">
                          {p.source}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-bold">{p.productName || p.description || p.orderId}</div>
                        {p.planName && <div className="text-[11px] nd-muted">{p.planName}</div>}
                        {p.phone && <div className="font-mono text-[11px] text-emerald-400" dir="ltr">{p.phone}</div>}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-extrabold">{fmtRial(p.payableAmountRial)} ریال</div>
                        <div className="text-[11px] nd-muted">{fmtMoney(p.payableAmountRial)} تومان</div>
                      </td>
                      <td className="py-3 px-2">
                        {p.status === 'paid' && (
                          <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 font-bold">پرداخت‌شده ✅</span>
                        )}
                        {p.status === 'pending' && (
                          <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-500 font-bold">در انتظار واریز ⏳</span>
                        )}
                        {p.status === 'needs_review' && (
                          <span className="px-2 py-1 rounded-lg bg-sky-500/15 text-sky-400 font-bold">بررسی رسید 🧾</span>
                        )}
                        {(p.status === 'expired' || p.status === 'canceled' || p.status === 'rejected') && (
                          <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 font-bold">{p.status}</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {p.accessCode && (
                          <code className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-mono font-bold" dir="ltr">
                            {p.accessCode}
                          </code>
                        )}
                        {p.receiptRef && <div className="text-[11px] font-mono">پیگیری: {p.receiptRef}</div>}
                        {p.receiptNote && <div className="text-[10px] nd-muted max-w-[200px] truncate">{p.receiptNote}</div>}
                        {p.receiptImageB64 && (
                          <button
                            type="button"
                            onClick={() => setPreviewReceiptImg(`data:image/jpeg;base64,${p.receiptImageB64}`)}
                            className="mt-1 text-[11px] text-sky-400 underline flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" /> مشاهده تصویر رسید
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {p.status !== 'paid' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handlePaymentDecision(p.id, 'approve')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500 cursor-pointer"
                            >
                              تأیید و صدور کد
                            </button>
                            {p.status === 'needs_review' && (
                              <button
                                onClick={() => handlePaymentDecision(p.id, 'reject')}
                                className="px-2 py-1.5 rounded-lg bg-rose-600/20 text-rose-400 text-[11px] font-bold hover:bg-rose-600/30 cursor-pointer"
                              >
                                رد
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!overview?.payments || overview.payments.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center nd-muted">
                        هنوز تراکنشی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= 2. DESTINATION BANK CARDS ================= */}
      {subTab === 'cards' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveCard} className="nd-card p-5 space-y-4">
            <h3 className="text-sm font-black">افزودن کارت بانکی مقصد (عضو شبکه شتاب)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                dir="ltr"
                value={cardForm.cardNumber}
                onChange={(e) => setCardForm({ ...cardForm, cardNumber: e.target.value })}
                placeholder="شماره کارت ۱۶ رقمی"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs font-mono"
                required
              />
              <input
                type="text"
                value={cardForm.holderName}
                onChange={(e) => setCardForm({ ...cardForm, holderName: e.target.value })}
                placeholder="نام صاحب حساب (مثلاً امید عدلی)"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs"
                required
              />
              <input
                type="text"
                dir="ltr"
                value={cardForm.iban}
                onChange={(e) => setCardForm({ ...cardForm, iban: e.target.value })}
                placeholder="شبا اختیاری (IR...)"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[color:var(--nd-accent)] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> افزودن کارت بانکی
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(overview?.cards || []).map((c: any) => (
              <div key={c.id} className="nd-card p-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm">{c.bank_name || 'شتاب'}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        c.is_active ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {c.is_active ? 'فعال در درگاه' : 'غیرفعال'}
                    </span>
                  </div>
                  <div className="font-mono text-base font-extrabold tracking-wider" dir="ltr">
                    {String(c.card_number || '').replace(/(\d{4})(?=\d)/g, '$1 ')}
                  </div>
                  <div className="text-xs nd-muted">به نام: {c.holder_name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await api.adminGatewayAction('cards', { op: 'toggle', id: c.id });
                      load();
                    }}
                    className="p-2 rounded-xl border border-[color:var(--nd-line)] hover:bg-white/5 cursor-pointer"
                    title="تغییر وضعیت فعال/غیرفعال"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('این کارت حذف شود؟')) return;
                      await api.adminGatewayAction('cards', { op: 'delete', id: c.id });
                      load();
                    }}
                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. ANDROID SMS UPLOADER DEVICES ================= */}
      {subTab === 'devices' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateDevice} className="nd-card p-5 space-y-4">
            <h3 className="text-sm font-black flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>افزودن گوشی اندروید جدید (اپلیکیشن OmidPay SMS Uploader)</span>
            </h3>
            <p className="text-xs nd-muted leading-relaxed">
              پروژه‌ی کامل اندروید در پوشه‌ی <code dir="ltr">android-sms-uploader/</code> قرار دارد (و فایل APK در GitHub Actions به‌صورت خودکار کامپایل می‌شود). توکن زیر را بسازید و در اپلیکیشن گوشی خود وارد کنید تا پیامک‌های واریز بانکی را لحظه‌ای به سایت گزارش دهد.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                placeholder="نام دستگاه (مثلاً Samsung S23 ادمین)"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs"
                required
              />
              <input
                type="text"
                dir="ltr"
                value={deviceForm.deviceSerial}
                onChange={(e) => setDeviceForm({ ...deviceForm, deviceSerial: e.target.value })}
                placeholder="سریال یا توضیح اختیاری"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-extrabold hover:bg-indigo-500 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> صدور توکن اتصال گوشی
              </button>
            </div>
          </form>

          {newDeviceSecret && (
            <div className="nd-card p-5 border-2 border-emerald-500/40 bg-emerald-500/5 space-y-3">
              <div className="text-sm font-black text-emerald-500">
                ✅ توکن امنیتی گوشی «{newDeviceSecret.name}» صادر شد (فقط همین یک‌بار نمایش داده می‌شود!):
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-black/20 space-y-1">
                  <div className="opacity-70">آدرس سرور در اپلیکیشن (Server URL):</div>
                  <div className="flex items-center justify-between gap-2 font-mono" dir="ltr">
                    <span className="truncate">{overview?.serverOrigin}/api/payment</span>
                    <button
                      onClick={() => copyText('srv', `${overview?.serverOrigin}/api/payment`)}
                      className="px-2 py-1 rounded bg-white/10 text-[11px]"
                    >
                      {copied === 'srv' ? 'کپی شد' : 'کپی'}
                    </button>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-black/20 space-y-1">
                  <div className="opacity-70">توکن اختصاصی دستگاه (Device Token):</div>
                  <div className="flex items-center justify-between gap-2 font-mono" dir="ltr">
                    <span className="truncate text-emerald-400 font-bold">{newDeviceSecret.token}</span>
                    <button
                      onClick={() => copyText('devtok', newDeviceSecret.token)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px]"
                    >
                      {copied === 'devtok' ? 'کپی شد' : 'کپی توکن'}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => copyText(' devjson', newDeviceSecret.connectPayload)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>کپی رشته اتصال ۱-کلیکی (Paste Config در اپ اندروید)</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(overview?.devices || []).map((d: any) => (
              <div key={d.id} className="nd-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${d.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="font-black text-sm">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.batteryLevel >= 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                        <BatteryCharging className="w-3 h-3" /> {d.batteryLevel}%
                      </span>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm('این دستگاه حذف شود؟')) return;
                        await api.adminGatewayAction('devices', { op: 'delete', id: d.id });
                        load();
                      }}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-xs nd-muted space-y-1">
                  <div>توکن: <code dir="ltr" className="font-mono">{d.tokenMask}</code></div>
                  <div>مدل گوشی: {d.deviceModel || 'هنوز متصل نشده'} {d.appVersion ? `(نسخه ${d.appVersion})` : ''}</div>
                  <div>آخرین پینگ: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('fa-IR') : 'در انتظار اولین اتصال'}</div>
                  <div>پیامک‌های بررسی‌شده: {fmtFa(d.smsCount)} | واریزهای تطبیق‌یافته: <b className="text-emerald-500">{fmtFa(d.matchedCount)}</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 4. SMS AUDIT LOGS ================= */}
      {subTab === 'smslogs' && (
        <div className="nd-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">لاگ امنیتی پیامک‌های دریافتی از گوشی اندروید</h3>
            <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> رمزهای پویا (OTP) فیلتر و سانسور می‌شوند
            </span>
          </div>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {(overview?.smsLogs || []).map((log: any) => (
              <div key={log.id} className="p-3 rounded-xl border border-[color:var(--nd-line)] text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-400" dir="ltr">{log.sender || 'BANK'}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.status === 'matched'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : log.status === 'ignored_otp'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {log.status}
                    </span>
                    {log.parsed_amount_rial > 0 && (
                      <span className="font-bold text-emerald-400">{fmtRial(log.parsed_amount_rial)} ریال</span>
                    )}
                  </div>
                  <div className="nd-muted text-[11px] leading-relaxed">{log.body_sanitized || log.raw_text_redacted}</div>
                </div>
                <div className="text-[10px] nd-faint font-mono" dir="ltr">
                  {log.matched_payment_id ? `PAY: ${log.matched_payment_id.slice(0, 8)}` : log.created_at?.slice(11, 19)}
                </div>
              </div>
            ))}
            {(!overview?.smsLogs || overview.smsLogs.length === 0) && (
              <p className="text-xs nd-muted py-6 text-center">هنوز پیامکی دریافت نشده است.</p>
            )}
          </div>
        </div>
      )}

      {/* ================= 5. MERCHANT API KEYS (PAYEXA V2) ================= */}
      {subTab === 'apikeys' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateKey} className="nd-card p-5 space-y-4">
            <h3 className="text-sm font-black">صدور کلید وب‌سرویس درگاه (سازگار با استاندارد Payexa API v2)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={keyForm.name}
                onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                placeholder="عنوان کلید (مثلاً ربات تلگرام دوم یا سایت دیگر)"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs"
                required
              />
              <input
                type="text"
                dir="ltr"
                value={keyForm.allowedOrigins}
                onChange={(e) => setKeyForm({ ...keyForm, allowedOrigins: e.target.value })}
                placeholder="دامنه‌های مجاز اختیاری (https://example.com)"
                className="px-3 py-2.5 rounded-xl bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] text-xs font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[color:var(--nd-accent)] text-white text-xs font-extrabold cursor-pointer"
              >
                ایجاد کلید API جدید
              </button>
            </div>
          </form>

          {newApiKeySecret && (
            <div className="nd-card p-4 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-3">
              <code className="font-mono text-xs font-bold text-emerald-400 break-all" dir="ltr">
                {newApiKeySecret}
              </code>
              <button
                onClick={() => copyText('apikey', newApiKeySecret)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shrink-0"
              >
                {copied === 'apikey' ? 'کپی شد' : 'کپی کلید'}
              </button>
            </div>
          )}

          <div className="nd-card p-5 space-y-3">
            <h4 className="text-xs font-black">کلیدهای فعال</h4>
            {(overview?.apiKeys || []).map((k: any) => (
              <div key={k.id} className="flex items-center justify-between py-2 border-b border-[color:var(--nd-line)] last:border-0 text-xs">
                <div>
                  <span className="font-bold">{k.name}</span>
                  <span className="mx-2 font-mono opacity-70" dir="ltr">{k.key_mask}</span>
                </div>
                <button
                  onClick={async () => {
                    await api.adminGatewayAction('keys', { op: 'delete', id: k.id });
                    load();
                  }}
                  className="text-rose-500 hover:underline text-[11px] cursor-pointer"
                >
                  حذف
                </button>
              </div>
            ))}
            {(!overview?.apiKeys || overview.apiKeys.length === 0) && (
              <p className="text-xs nd-muted">توجه: خریدهای داخلی خودِ وب‌سایت و ربات تلگرام متصل به همین دیتابیس بدون نیاز به کلید خارجی مستقیماً به هسته درگاه متصل هستند. این کلیدها برای اتصال سایت‌ها یا ربات‌های دیگر شماست.</p>
            )}
          </div>
        </div>
      )}

      {/* Receipt Image Lightbox */}
      {previewReceiptImg && (
        <div
          onClick={() => setPreviewReceiptImg('')}
          className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4"
        >
          <img src={previewReceiptImg} alt="Receipt" className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
};
