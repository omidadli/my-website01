import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Theme, Page } from '../types';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import {
  User,
  Mail,
  Calendar,
  BookMarked,
  CreditCard,
  MessageSquare,
  Activity,
  Settings,
  LogOut,
  Bookmark,
  BookmarkCheck,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarClock,
  Sparkles,
  ChevronLeft,
  Edit3,
  Save,
  Phone,
  FileText,
  Star,
  Zap,
  ArrowUpLeft,
} from 'lucide-react';
import { linkProps, pathForPage, postPath } from '../utils/router';

type ProfileTab = 'dashboard' | 'saved' | 'subscriptions' | 'consultations' | 'activity' | 'settings';

const TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'saved', label: 'مقالات ذخیره شده', icon: <BookMarked className="w-4 h-4" /> },
  { id: 'subscriptions', label: 'اشتراک‌های من', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'consultations', label: 'درخواست‌های مشاوره', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'activity', label: 'فعالیت‌ها', icon: <Activity className="w-4 h-4" /> },
  { id: 'settings', label: 'تنظیمات حساب', icon: <Settings className="w-4 h-4" /> },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'همین الان';
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} روز پیش`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    // Subscription statuses
    active: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'فعال' },
    expired: { bg: 'bg-red-500/15', text: 'text-red-500', icon: <XCircle className="w-3.5 h-3.5" />, label: 'منقضی شده' },
    cancelled: { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: <XCircle className="w-3.5 h-3.5" />, label: 'لغو شده' },
    pending: { bg: 'bg-amber-500/15', text: 'text-amber-500', icon: <Clock className="w-3.5 h-3.5" />, label: 'در انتظار بررسی' },
    trial: { bg: 'bg-sky-500/15', text: 'text-sky-500', icon: <Zap className="w-3.5 h-3.5" />, label: 'آزمایشی' },
    reviewing: { bg: 'bg-indigo-500/15', text: 'text-indigo-500', icon: <Clock className="w-3.5 h-3.5" />, label: 'در حال بررسی' },
    scheduled: { bg: 'bg-violet-500/15', text: 'text-violet-500', icon: <CalendarClock className="w-3.5 h-3.5" />, label: 'وقت تنظیم شده' },
    completed: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'انجام شده' },
  };
  const cfg = configs[status] || configs.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="nd-glass rounded-2xl p-4 sm:p-5 flex items-center gap-4"
    >
      <div
        className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
        style={{ background: color, color: 'white' }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[11px] font-bold text-[color:var(--nd-muted)] mb-0.5">{label}</div>
        <div className="text-xl font-black text-[color:var(--nd-ink)]">{value}</div>
      </div>
    </motion.div>
  );
}

function LoginPrompt() {
  const { login, register } = useUser();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetError = () => setError('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetError();
    if (mode === 'register') {
      if (!fullName.trim() || fullName.trim().length < 2) return setError('لطفاً نام و نام خانوادگی را وارد کنید.');
      if (!email.trim() && !phone.trim()) return setError('لطفاً حداقل ایمیل یا شماره تلفن را وارد کنید.');
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('فرمت ایمیل صحیح نیست.');
      if (phone.trim() && !/^(\+98|0)?9\d{9}$/.test(phone.trim().replace(/[\s-]/g, ''))) return setError('شماره موبایل باید با 09 شروع شود (مثل 09123456789).');
      if (!password || password.length < 6) return setError('رمز ورود باید حداقل ۶ کاراکتر باشد.');
      setLoading(true);
      const res = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      setLoading(false);
      if (!res.ok) setError(res.error || 'ثبت‌نام ناموفق بود.');
    } else {
      if (!email.trim() && !phone.trim()) return setError('لطفاً ایمیل یا شماره تلفن را وارد کنید.');
      if (!password) return setError('رمز ورود را وارد کنید.');
      setLoading(true);
      const res = await login({
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      setLoading(false);
      if (!res.ok) setError(res.error || 'ورود ناموفق بود.');
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 sm:py-12">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="nd-glass rounded-3xl p-6 sm:p-9"
      >
        <div className="w-20 h-20 mx-auto rounded-full nd-gradient-accent grid place-items-center mb-5 shadow-lg">
          <User className="w-10 h-10 text-white" />
        </div>

        {/* Mode switch */}
        <div className="nd-glass rounded-full p-1.5 flex gap-1 mb-6">
          <button
            onClick={() => { setMode('login'); resetError(); }}
            className={`flex-1 px-4 py-2.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
              mode === 'login' ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm' : 'text-[color:var(--nd-muted)]'
            }`}
          >
            ورود
          </button>
          <button
            onClick={() => { setMode('register'); resetError(); }}
            className={`flex-1 px-4 py-2.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
              mode === 'register' ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] shadow-sm' : 'text-[color:var(--nd-muted)]'
            }`}
          >
            ثبت‌نام
          </button>
        </div>

        <h2 className="text-xl font-black text-[color:var(--nd-ink)] mb-2 text-center">
          {mode === 'login' ? 'ورود به حساب کاربری' : 'ایجاد حساب کاربری جدید'}
        </h2>
        <p className="text-sm text-[color:var(--nd-muted)] mb-5 text-center">
          {mode === 'login'
            ? 'با ورود به مقالات ذخیره شده و درخواست‌هایتان دسترسی داشته باشید.'
            : 'با ساخت حساب، تمام فعالیت‌های شما در یک مکان ذخیره می‌شود.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-right">
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">نام و نام خانوادگی *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثلاً: علی رضایی"
                className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)]"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">ایمیل {mode === 'register' && <span className="text-[color:var(--nd-faint)] font-normal">(اختیاری، اگر شماره می‌دهید)</span>}</label>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)] text-right"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">شماره موبایل {mode === 'register' && <span className="text-[color:var(--nd-faint)] font-normal">(اختیاری، اگر ایمیل می‌دهید)</span>}</label>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09123456789"
              className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)] text-right"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">رمز ورود *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'حداقل ۶ کاراکتر' : 'رمز عبور'}
              className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)]"
            />
          </div>

          {mode === 'login' && (
            <p className="text-[11px] text-[color:var(--nd-faint)]">با ایمیل یا شماره موبایلی که ثبت‌نام کرده‌اید وارد شوید.</p>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full nd-btn nd-btn-accent py-3 text-sm disabled:opacity-60 disabled:cursor-wait mt-2"
          >
            <span>{loading ? 'در حال ارسال…' : mode === 'login' ? 'ورود به حساب' : 'ثبت‌نام و ورود'}</span>
            <ArrowUpLeft className="w-4 h-4" />
          </button>
        </form>

        <p className="mt-4 text-[11px] text-[color:var(--nd-faint)] text-center">
          {mode === 'login' ? 'حساب ندارید؟ ' : 'قبلاً ثبت‌نام کرده‌اید؟ '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); resetError(); }}
            className="text-[color:var(--nd-accent)] font-bold underline underline-offset-2 cursor-pointer"
          >
            {mode === 'login' ? 'ثبت‌نام کنید' : 'وارد شوید'}
          </button>
        </p>
        <p className="mt-2 text-[11px] text-[color:var(--nd-faint)] text-center">
          با {mode === 'login' ? 'ورود' : 'ثبت‌نام'}، قوانین استفاده از سایت را می‌پذیرید.
        </p>
      </motion.div>
    </div>
  );
}

interface ProfilePageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  onSelectPost: (postId: string) => void;
}

export function ProfilePage({ theme, onNavigate, onSelectPost }: ProfilePageProps) {
  const {
    profile,
    isLoggedIn,
    logout,
    updateProfile,
    savedArticles,
    subscriptions,
    consultations,
    activities,
    removeSavedArticle,
    markArticleAsRead,
  } = useUser();
  const { data } = useContent();
  const [activeTab, setActiveTab] = useState<ProfileTab>('dashboard');
  const [editName, setEditName] = useState(profile?.fullName || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editing, setEditing] = useState(false);

  if (!isLoggedIn || !profile) {
    return <LoginPrompt />;
  }

  const postsById = useMemo(() => {
    const map = new Map();
    (data.BLOG_POSTS || []).forEach((p) => {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    });
    return map;
  }, [data.BLOG_POSTS]);

  const readCount = savedArticles.filter((a) => a.read).length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const pendingConsults = consultations.filter((c) => c.status === 'pending' || c.status === 'reviewing').length;

  const handleSaveProfile = () => {
    updateProfile({ fullName: editName, phone: editPhone, bio: editBio });
    setEditing(false);
  };

  return (
    <div className="min-h-[70vh]">
      {/* Breadcrumb / Back */}
      <div className="mb-6">
        <button
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-sm text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          بازگشت به صفحه اصلی
        </button>
      </div>

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="nd-glass rounded-3xl p-5 sm:p-8 mb-6 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-64 h-64 bg-[var(--nd-accent)] opacity-10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full nd-gradient-accent grid place-items-center shadow-xl shrink-0">
            <User className="w-12 h-12 text-white" />
          </div>
          <div className="flex-1 text-center sm:text-right">
            <h1 className="text-2xl sm:text-3xl font-black text-[color:var(--nd-ink)] mb-1">{profile.fullName}</h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm text-[color:var(--nd-muted)] mb-3">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {profile.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                عضو از {formatDate(profile.joinedAt)}
              </span>
            </div>
            {profile.bio && <p className="text-sm text-[color:var(--nd-ink-2)] max-w-xl">{profile.bio}</p>}
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-bold">
                <Star className="w-3.5 h-3.5" />
                کاربر ویژه
              </div>
              {activeSubs > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-bold">
                  <Zap className="w-3.5 h-3.5" />
                  {activeSubs} اشتراک فعال
                </div>
              )}
            </div>
          </div>
          <button
            onClick={logout}
            className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            خروج
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[color:var(--nd-accent)] text-white shadow-lg shadow-[color:var(--nd-accent)]/25'
                : 'nd-glass text-[color:var(--nd-muted)] hover:text-[color:var(--nd-ink)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard icon={<BookMarked className="w-5 h-5" />} label="مقالات ذخیره شده" value={savedArticles.length} color="linear-gradient(135deg,#6366f1,#8b5cf6)" />
                <StatCard icon={<BookmarkCheck className="w-5 h-5" />} label="مقالات خوانده شده" value={readCount} color="linear-gradient(135deg,#10b981,#059669)" />
                <StatCard icon={<CreditCard className="w-5 h-5" />} label="اشتراک فعال" value={activeSubs} color="linear-gradient(135deg,#f59e0b,#d97706)" />
                <StatCard icon={<MessageSquare className="w-5 h-5" />} label="درخواست در حال بررسی" value={pendingConsults} color="linear-gradient(135deg,#ec4899,#db2777)" />
              </div>

              {/* Quick actions */}
              <div className="nd-glass rounded-2xl p-5">
                <h3 className="text-sm font-black text-[color:var(--nd-ink)] mb-4">دسترسی سریع</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button onClick={() => setActiveTab('saved')} className="p-4 rounded-xl bg-[color:var(--nd-line)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-all text-center cursor-pointer group">
                    <BookMarked className="w-6 h-6 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-[11px] font-bold">لیست مقالات</div>
                  </button>
                  <button onClick={() => setActiveTab('subscriptions')} className="p-4 rounded-xl bg-[color:var(--nd-line)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-all text-center cursor-pointer group">
                    <CreditCard className="w-6 h-6 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-[11px] font-bold">اشتراک‌ها</div>
                  </button>
                  <button onClick={() => onNavigate('blog')} className="p-4 rounded-xl bg-[color:var(--nd-line)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-all text-center cursor-pointer group">
                    <FileText className="w-6 h-6 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-[11px] font-bold">وبلاگ</div>
                  </button>
                  <button onClick={() => onNavigate('contact')} className="p-4 rounded-xl bg-[color:var(--nd-line)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-all text-center cursor-pointer group">
                    <MessageSquare className="w-6 h-6 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-[11px] font-bold">مشاوره جدید</div>
                  </button>
                </div>
              </div>

              {/* Recent activity preview */}
              <div className="nd-glass rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-[color:var(--nd-ink)]">آخرین فعالیت‌ها</h3>
                  <button onClick={() => setActiveTab('activity')} className="text-xs text-[color:var(--nd-accent)] font-bold">مشاهده همه</button>
                </div>
                {activities.length === 0 ? (
                  <p className="text-sm text-[color:var(--nd-muted)] text-center py-6">هنوز فعالیتی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-3">
                    {activities.slice(0, 4).map((act) => (
                      <div key={act.id} className="flex items-center gap-3 p-3 rounded-xl bg-[color:var(--nd-line)]">
                        <div className="w-9 h-9 rounded-full bg-[color:var(--nd-accent)]/15 text-[color:var(--nd-accent)] grid place-items-center shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[color:var(--nd-ink)] truncate">{act.description}</p>
                          <p className="text-[11px] text-[color:var(--nd-faint)]">{timeAgo(act.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="space-y-3">
              {savedArticles.length === 0 ? (
                <div className="nd-glass rounded-2xl p-10 text-center">
                  <Bookmark className="w-12 h-12 mx-auto text-[color:var(--nd-faint)] mb-3" />
                  <h3 className="text-base font-black text-[color:var(--nd-ink)] mb-1">هنوز مقاله‌ای ذخیره نکرده‌اید</h3>
                  <p className="text-sm text-[color:var(--nd-muted)] mb-4">مقالات جالب را از وبلاگ ذخیره کنید تا بعداً بخوانید.</p>
                  <button onClick={() => onNavigate('blog')} className="nd-btn nd-btn-accent px-5 py-2.5 text-xs">
                    مشاهده وبلاگ
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                savedArticles.map((saved) => {
                  const post = postsById.get(saved.postId);
                  return (
                    <motion.div
                      key={saved.postId}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="nd-glass rounded-2xl p-4 sm:p-5 flex items-start gap-4 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[color:var(--nd-accent)]/15 text-[color:var(--nd-accent)] grid place-items-center shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4
                            className="text-sm font-black text-[color:var(--nd-ink)] hover:text-[color:var(--nd-accent)] cursor-pointer truncate"
                            onClick={() => onSelectPost(saved.postId)}
                          >
                            {post ? post.title : 'مقاله'}
                          </h4>
                          {saved.read && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              خوانده شده
                            </span>
                          )}
                        </div>
                        {post && <p className="text-xs text-[color:var(--nd-muted)] line-clamp-2 mb-2">{post.excerpt}</p>}
                        <p className="text-[11px] text-[color:var(--nd-faint)]">ذخیره شده در {formatDate(saved.savedAt)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!saved.read && (
                          <button
                            onClick={() => markArticleAsRead(saved.postId)}
                            title="علامت‌گذاری به عنوان خوانده شده"
                            className="w-9 h-9 rounded-lg grid place-items-center text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                          >
                            <BookmarkCheck className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (post) onSelectPost(saved.postId);
                          }}
                          title="خواندن مقاله"
                          className="w-9 h-9 rounded-lg grid place-items-center text-[color:var(--nd-accent)] hover:bg-[color:var(--nd-accent)]/10 transition-colors"
                        >
                          <ArrowUpLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeSavedArticle(saved.postId)}
                          title="حذف از لیست"
                          className="w-9 h-9 rounded-lg grid place-items-center text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              {subscriptions.length === 0 ? (
                <div className="nd-glass rounded-2xl p-10 text-center">
                  <CreditCard className="w-12 h-12 mx-auto text-[color:var(--nd-faint)] mb-3" />
                  <h3 className="text-base font-black text-[color:var(--nd-ink)] mb-1">اشتراک فعالی ندارید</h3>
                  <p className="text-sm text-[color:var(--nd-muted)] mb-4">با خرید پلن‌های ویژه از خدمات اختصاصی بهره‌مند شوید.</p>
                  <button onClick={() => onNavigate('products')} className="nd-btn nd-btn-accent px-5 py-2.5 text-xs">
                    مشاهده پلن‌ها
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                subscriptions.map((sub) => (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="nd-glass rounded-2xl p-5 sm:p-6 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--nd-accent)] opacity-5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-black text-[color:var(--nd-ink)]">{sub.productName}</h3>
                            <StatusBadge status={sub.status} />
                          </div>
                          <p className="text-sm text-[color:var(--nd-muted)]">پلن: <span className="font-bold text-[color:var(--nd-ink)]">{sub.planName}</span></p>
                        </div>
                        <div className="text-left">
                          <div className="text-lg font-black text-[color:var(--nd-accent)]">{sub.price}</div>
                          {sub.autoRenew && <div className="text-[11px] text-[color:var(--nd-faint)]">تمدید خودکار فعال</div>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-[color:var(--nd-line)]">
                          <div className="text-[11px] text-[color:var(--nd-faint)] mb-1">تاریخ شروع</div>
                          <div className="text-xs font-bold text-[color:var(--nd-ink)]">{formatDate(sub.startDate)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-[color:var(--nd-line)]">
                          <div className="text-[11px] text-[color:var(--nd-faint)] mb-1">تاریخ پایان</div>
                          <div className="text-xs font-bold text-[color:var(--nd-ink)]">{formatDate(sub.endDate)}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold text-[color:var(--nd-muted)] mb-2">امکانات این پلن:</div>
                        <div className="flex flex-wrap gap-2">
                          {sub.features.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[color:var(--nd-accent)]/10 text-[color:var(--nd-accent)] text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {activeTab === 'consultations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[color:var(--nd-muted)]">وضعیت درخواست‌های مشاوره شما توسط امید عدلی</p>
                <button onClick={() => onNavigate('contact')} className="nd-btn nd-btn-accent px-4 py-2 text-xs shrink-0">
                  درخواست جدید
                  <ArrowUpLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              {consultations.length === 0 ? (
                <div className="nd-glass rounded-2xl p-10 text-center">
                  <MessageSquare className="w-12 h-12 mx-auto text-[color:var(--nd-faint)] mb-3" />
                  <h3 className="text-base font-black text-[color:var(--nd-ink)] mb-1">هنوز درخواست مشاوره‌ای ارسال نکرده‌اید</h3>
                  <p className="text-sm text-[color:var(--nd-muted)]">برای دریافت مشاوره تخصصی مارکتینگ درخواست خود را ثبت کنید.</p>
                </div>
              ) : (
                consultations.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="nd-glass rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <h3 className="text-base font-black text-[color:var(--nd-ink)]">{req.subject}</h3>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.serviceName && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[color:var(--nd-line)] text-[11px] font-bold text-[color:var(--nd-muted)] mb-3">
                        {req.serviceName}
                      </div>
                    )}
                    <p className="text-sm text-[color:var(--nd-ink-2)] leading-relaxed mb-4">{req.message}</p>
                    {req.adminNotes && (
                      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-3">
                        <div className="text-[11px] font-bold text-indigo-500 mb-1">پاسخ امید عدلی:</div>
                        <p className="text-xs text-[color:var(--nd-ink)] leading-relaxed">{req.adminNotes}</p>
                      </div>
                    )}
                    {req.scheduledDate && (
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 text-violet-500 text-xs font-bold mb-3">
                        <CalendarClock className="w-4 h-4" />
                        وقت ملاقات: {formatDate(req.scheduledDate)} - {req.scheduledTime}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-[color:var(--nd-faint)]">
                      <span>ارسال شده در {formatDate(req.createdAt)}</span>
                      <span>آخرین بروزرسانی: {timeAgo(req.updatedAt)}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-2">
              {activities.length === 0 ? (
                <div className="nd-glass rounded-2xl p-10 text-center">
                  <Activity className="w-12 h-12 mx-auto text-[color:var(--nd-faint)] mb-3" />
                  <p className="text-sm text-[color:var(--nd-muted)]">فعالیتی ثبت نشده است.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute right-6 top-2 bottom-2 w-px bg-[color:var(--nd-line)]" />
                  {activities.map((act) => (
                    <motion.div
                      key={act.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative flex items-start gap-4 p-3"
                    >
                      <div className="relative z-10 w-10 h-10 rounded-full bg-[color:var(--nd-accent)] grid place-items-center shrink-0 shadow-lg">
                        <Activity className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 pt-1.5">
                        <p className="text-sm font-bold text-[color:var(--nd-ink)]">{act.description}</p>
                        <p className="text-[11px] text-[color:var(--nd-faint)] mt-0.5">{timeAgo(act.timestamp)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="nd-glass rounded-2xl p-5 sm:p-6 max-w-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-[color:var(--nd-ink)]">اطلاعات حساب کاربری</h3>
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--nd-line)] text-xs font-bold text-[color:var(--nd-ink)] hover:bg-[color:var(--nd-accent)] hover:text-white transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                    ویرایش
                  </button>
                ) : (
                  <button onClick={handleSaveProfile} className="inline-flex items-center gap-1.5 nd-btn nd-btn-accent px-3 py-1.5 text-xs">
                    <Save className="w-3.5 h-3.5" />
                    ذخیره
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">نام و نام خانوادگی</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)]"
                    />
                  ) : (
                    <div className="px-4 py-3 rounded-xl bg-[color:var(--nd-line)] text-sm text-[color:var(--nd-ink)] flex items-center gap-2">
                      <User className="w-4 h-4 text-[color:var(--nd-faint)]" />
                      {profile.fullName}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">ایمیل</label>
                  <div className="px-4 py-3 rounded-xl bg-[color:var(--nd-line)] text-sm text-[color:var(--nd-ink)] flex items-center gap-2 opacity-70">
                    <Mail className="w-4 h-4 text-[color:var(--nd-faint)]" />
                    {profile.email}
                    <span className="text-[10px] text-[color:var(--nd-faint)] ms-auto">غیر قابل ویرایش</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">شماره تماس</label>
                  {editing ? (
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="09123456789"
                      className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)]"
                    />
                  ) : (
                    <div className="px-4 py-3 rounded-xl bg-[color:var(--nd-line)] text-sm text-[color:var(--nd-ink)] flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[color:var(--nd-faint)]" />
                      {profile.phone || 'وارد نشده'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[color:var(--nd-muted)] mb-1.5">درباره من</label>
                  {editing ? (
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={3}
                      placeholder="کمی درباره خودتان بنویسید..."
                      className="w-full px-4 py-3 rounded-xl bg-[color:var(--nd-line)] border border-transparent focus:border-[color:var(--nd-accent)] outline-none text-sm text-[color:var(--nd-ink)] resize-none"
                    />
                  ) : (
                    <div className="px-4 py-3 rounded-xl bg-[color:var(--nd-line)] text-sm text-[color:var(--nd-ink)] min-h-[80px]">
                      {profile.bio || 'نوشته نشده'}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[color:var(--nd-line)]">
                  <div className="text-[11px] text-[color:var(--nd-faint)]">
                    شناسه کاربری: <span className="font-mono text-[color:var(--nd-muted)]">{profile.id}</span>
                  </div>
                  <div className="text-[11px] text-[color:var(--nd-faint)] mt-1">
                    تاریخ عضویت: {formatDate(profile.joinedAt)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
