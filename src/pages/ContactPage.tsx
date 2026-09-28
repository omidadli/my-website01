import React, { useState, useEffect } from 'react';
import { Theme, Page } from '../types';
import { useContent } from '../context/ContentContext';
import { useUser } from '../context/UserContext';
import { usePreservedState } from '../utils/statePreserver';
import { api } from '../services/api';
import { whatsappFallbackUrl } from '../utils/leadFallback';
import { EditableText } from '../components/cms/EditableText';
import { BookingCalendar } from '../components/BookingCalendar';
import { PageHero, inputCls } from '../components/nd/Kit';
import { Send, Mail, Linkedin, CheckCircle2, Clock, ArrowUpLeft, MessageCircle, Instagram } from 'lucide-react';
import { motion } from 'motion/react';
import { ProductPromoStrip } from '../components/ProductPromo';
import { pickProductsForTopic, topicForStage } from '../data/productPromo';

interface ContactPageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ theme, onNavigate }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const { isLoggedIn, addConsultation } = useUser();
  const personalInfo = data.PERSONAL_INFO;

  const [activeTab, setActiveTab] = usePreservedState<'form' | 'calendar'>('contact_active_tab', 'form');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [formData, setFormData] = usePreservedState('contact_form_data', {
    name: '',
    email: '', // email OR phone/telegram — the form field accepts both
    serviceNeeded: 'تازه می‌خوام آنلاین شروع کنم',
    details: '',
  });

  // The home page lead magnets hand over the visitor's typed need/site —
  // drop it straight into the form so nothing is lost in the hand-off.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const value = String((e as CustomEvent<string>).detail || '').trim();
      if (!value) return;
      setSubmitted(false);
      setFormData((f) => ({
        ...f,
        details: f.details.trim() ? `${f.details}\n\n${value}` : value,
      }));
      const ta = document.querySelector<HTMLTextAreaElement>('textarea');
      ta?.focus();
    };
    window.addEventListener('nd:prefill-contact', onPrefill);
    return () => window.removeEventListener('nd:prefill-contact', onPrefill);
  }, []);

  // The product suggestions follow the stage the visitor picked in the form.
  const contactTopic = topicForStage(formData.serviceNeeded);

  const whatsappFallback = whatsappFallbackUrl(personalInfo, [
    ['نام', formData.name],
    ['تماس', formData.email],
    ['مرحله', formData.serviceNeeded],
    ['توضیح', formData.details],
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const value = formData.email.trim();
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    // Persist the lead server-side (D1 in prod / .dev-leads.json in dev) so the
    // admin can follow up — and only confirm to the visitor once it is really
    // stored; otherwise offer the WhatsApp fallback so the lead never vanishes.
    setSending(true);
    setSendError(null);
    const res = await api
      .postLead({
        source: 'contact',
        name: formData.name.trim(),
        email: looksLikeEmail ? value : '',
        contact: looksLikeEmail ? '' : value,
        service: formData.serviceNeeded,
        details: formData.details.trim() || `درخواست از فرم تماس — ${formData.serviceNeeded}`,
      })
      .catch(() => ({ ok: false as const, error: 'اتصال به سرور برقرار نشد.' }));
    setSending(false);
    if (!res.ok) {
      setSendError(res.error || 'ارسال پیام ناموفق بود.');
      return;
    }
    // If the user is already logged in, also save the consultation in their profile dashboard
    if (isLoggedIn) {
      addConsultation({
        subject: formData.serviceNeeded,
        message: formData.details.trim() || 'درخواست مشاوره از فرم تماس',
        serviceName: formData.serviceNeeded,
      });
    }
    setSubmitted(true);
    window.dispatchEvent(new CustomEvent('nd:form-success'));
  };

  const channels = [
    { id: 'wa', href: personalInfo.whatsappUrl || `https://wa.me/${personalInfo.phone}`, icon: MessageCircle, tint: { background: 'var(--nd-mint-soft)', color: '#0f9d6e' }, title: 'تماس / واتساپ مستقیم', value: personalInfo.phoneFormatted || personalInfo.phone, path: 'PERSONAL_INFO.phoneFormatted' },
    { id: 'tg', href: personalInfo.telegramUrl || `https://t.me/${String(personalInfo.telegram || '').replace('@', '')}`, icon: Send, tint: { background: 'var(--nd-sky-soft)', color: '#1d6fd8' }, title: 'آیدی تلگرام', value: personalInfo.telegram, path: 'PERSONAL_INFO.telegram' },
    { id: 'mail', href: `mailto:${personalInfo.email}`, icon: Mail, tint: { background: 'var(--nd-accent-soft)', color: '#4f46e5' }, title: 'ارسال ایمیل مستقیم', value: personalInfo.email, path: 'PERSONAL_INFO.email' },
    { id: 'li', href: personalInfo.linkedin, icon: Linkedin, tint: { background: 'var(--nd-sky-soft)', color: '#0a66c2' }, title: 'پروفایل لینکدین', value: 'linkedin.com/in/omidadli01', path: '' },
    { id: 'ig', href: personalInfo.instagram, icon: Instagram, tint: { background: 'var(--nd-peach-soft)', color: '#d97706' }, title: 'اینستاگرام', value: 'instagram.com/omidadli01', path: '' },
  ];

  return (
    <div className="space-y-14 py-4">
      <PageHero
        theme={theme}
        page="contact"
        title="بیاین با هم صحبت کنیم"
        subtitle="چه سوالی داشته باشید، چه آماده‌ی شروع باشید — کافیه پیام بدید تا در کمتر از ۴ ساعت کاری بهتون پاسخ بدم."
        badge="ارتباط و شروع همکاری"
        onNavigate={onNavigate}
      >
        <div className="flex justify-center pt-2">
          <div className={`nd-glass inline-flex p-1.5 rounded-full gap-1`}>
            <button
              onClick={() => setActiveTab('form')}
              className={`px-6 py-2.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'form' ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm' : 'text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)]'
              }`}
            >
              فرم درخواست مشاوره
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-6 py-2.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'calendar' ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm' : 'text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)]'
              }`}
            >
              رزرو آنلاین جلسه میت
            </button>
          </div>
        </div>
      </PageHero>

      {activeTab === 'calendar' ? (
        <div className="max-w-3xl mx-auto">
          <BookingCalendar theme={theme} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Channels */}
          <div className="lg:col-span-5 space-y-5">
            <div className="nd-card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--nd-success)] animate-pulse" />
                <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>وضعیت پذیرش پروژه</h3>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                <EditableText path="PERSONAL_INFO.availability">{personalInfo.availability}</EditableText>
              </p>
              <div className={`text-[11px] flex items-center gap-2 ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>
                <Clock className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" />
                <span>میانگین زمان پاسخ‌گویی: کمتر از ۴ ساعت کاری</span>
              </div>
            </div>

            <h3 className={`nd-h2 text-sm flex items-center gap-3 ${isDark ? 'text-white' : ''}`}>
              <span className="w-1.5 h-6 rounded-full" style={{ background: 'var(--nd-accent)' }} aria-hidden />
              ارتباط مستقیم و شبکه‌های اجتماعی
            </h3>
            <div className="space-y-3">
              {channels.map((c, idx) => (
                <motion.a
                  key={c.id}
                  href={c.href}
                  target={c.id === 'mail' ? undefined : '_blank'}
                  rel="noreferrer"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="nd-card nd-card-hover p-4 flex items-center justify-between group"
                >
                  <span className="flex items-center gap-3">
                    <span className="p-2.5 rounded-xl" style={c.tint}>
                      <c.icon className="w-5 h-5" />
                    </span>
                    <span>
                      <span className={`block font-extrabold text-xs ${isDark ? 'text-white' : ''}`}>{c.title}</span>
                      <span className={`block text-[11px] dir-ltr text-right ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>
                        {c.path ? <EditableText path={c.path}>{c.value}</EditableText> : c.value}
                      </span>
                    </span>
                  </span>
                  <ArrowUpLeft className="w-4 h-4 text-[color:var(--nd-faint)] group-hover:text-[color:var(--nd-accent)] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-7">
            <div className="nd-card p-7 sm:p-9 space-y-5">
              {submitted ? (
                <div className="text-center space-y-4 py-10">
                  <CheckCircle2 className="w-14 h-14 mx-auto text-[color:var(--nd-success)]" />
                  <h3 className={`nd-h2 text-xl ${isDark ? 'text-white' : ''}`}>پیامت رسید!</h3>
                  <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm max-w-md mx-auto`}>
                    ممنون که نوشتی؛ حداکثر تا ۴ ساعت کاری جوابت رو می‌فرستم. اگر عجله داری، از واتساپ یا تلگرام پیام بده.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-extrabold mb-2 ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>نام و نام خانوادگی *</label>
                      <input
                        type="text"
                        required
                        placeholder="مثلاً: علی رضایی"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className={inputCls(isDark)}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-extrabold mb-2 ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>آدرس ایمیل یا شماره تماس *</label>
                      <input
                        type="text"
                        required
                        placeholder="name@example.com یا ۰۹۱۲۳۴۵۶۷۸۹"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={inputCls(isDark)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-xs font-extrabold mb-2 ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>مرحله‌ی کسب‌وکارتون چیه؟</label>
                    <select
                      value={formData.serviceNeeded}
                      onChange={(e) => setFormData({ ...formData, serviceNeeded: e.target.value })}
                      className={inputCls(isDark)}
                    >
                      <option value="تازه می‌خوام آنلاین شروع کنم">تازه می‌خوام آنلاین شروع کنم (سایت/پیج ندارم یا اول راهم)</option>
                      <option value="فروش دارم، می‌خوام بهتر و بیشتر بفروشم">فروش دارم، می‌خوام بهتر و بیشتر بفروشم</option>
                      <option value="می‌خوام با تبلیغات و سئو سریع‌تر رشد کنم">می‌خوام با تبلیغات و سئو سریع‌تر رشد کنم</option>
                      <option value="هنوز مطمئن نیستم، نیاز به راهنمایی دارم">هنوز مطمئن نیستم، نیاز به راهنمایی دارم</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-extrabold mb-2 ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>توضیح کوتاه درباره‌ی کسب‌وکارتون یا چالش فعلی</label>
                    <textarea
                      rows={4}
                      placeholder="مثلاً: فروشگاه آنلاین پوشاک دارم و نرخ خرید سایتم کمه..."
                      value={formData.details}
                      onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                      className={inputCls(isDark)}
                    />
                  </div>
                  {sendError && (
                    <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-500 space-y-2">
                      <p>{sendError} پیامت ذخیره نشد؛ می‌تونی همین متن رو مستقیم در واتساپ بفرستی:</p>
                      <a href={whatsappFallback} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-2">
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>ارسال از طریق واتساپ</span>
                      </a>
                    </div>
                  )}
                  <button type="submit" disabled={sending} aria-busy={sending} className={`nd-btn w-full py-4 text-xs disabled:opacity-60 disabled:cursor-wait ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}>
                    <span>{sending ? 'در حال ارسال…' : 'ارسال پیام و شروع گفتگو'}</span>
                    <ArrowUpLeft className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------- *
       * تا زمانی که پیام را می‌خوانم، ابزارِ متناسب با همان مرحله‌ای که   *
       * در فرم انتخاب کرده پیشنهاد می‌شود — نه یک بنر ثابت.              *
       * -------------------------------------------------------------- */}
      <ProductPromoStrip
        productIds={pickProductsForTopic(contactTopic, 2)}
        theme={theme}
        onNavigate={onNavigate}
        topic={contactTopic}
        eyebrow="تا من جواب بدم، همین الان جواب بگیر"
        title="منتظر نمان؛ همین امشب شروع کن"
        desc={`این ابزارها روی همان مرحله‌ای کار می‌کنند که انتخاب کردی («${formData.serviceNeeded}») و با ۵۰۰ سکه هدیه بدون کارت بانکی تست می‌شوند.`}
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-5"
      />

      {/* بعد از ارسال فرم: پیشنهادِ مستقیمِ ادامه مسیر */}
      {submitted && (
        <ProductPromoStrip
          productIds={['business-therapist']}
          theme={theme}
          onNavigate={onNavigate}
          topic={contactTopic}
          variant="compact"
          eyebrow="قدم بعدی"
          title="تا جلسه‌مان، روی چالشت کار کن"
          desc="چالش اصلی‌ات را همان‌جا مطرح کن؛ یک چک‌لیست عملیاتی برای همین هفته می‌گیری تا در جلسه وقت‌مان صرف اجرا شود، نه شرح مسئله."
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
        />
      )}
    </div>
  );
};
