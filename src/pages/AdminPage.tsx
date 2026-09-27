import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '../types';
import { useContent } from '../context/ContentContext';
import { usePreservedState } from '../utils/statePreserver';
import { api } from '../services/api';
import { CollectionEditor } from '../components/admin/CollectionEditor';
import { FieldsForm, FieldDef } from '../components/admin/FieldsForm';
import { SeoBox } from '../components/admin/SeoBox';
import { ProductSyncManager } from '../components/admin/ProductSyncManager';
import { ACard, ASectionTitle, AInput, ATextarea, ASelect, ALabel, ABadge, AConfirm, AModal } from '../components/admin/ui';
import {
  LayoutDashboard, BookOpen, MessageSquare, Sparkles, Briefcase, ShoppingBag,
  FolderKanban, UserRound, Home, FileText, Image as ImageIcon, Search, Palette,
  Settings, Lock, ShieldCheck, Cloud, HardDrive, ExternalLink, LogOut, Plus, Bot,
  Trash2, ChevronUp, ChevronDown, Download, Copy, CheckCircle2, XCircle, RotateCcw,
  History, Eye, EyeOff, Wand2, Link2, Upload, Reply, Menu, Target,
  KeyRound, Smartphone, ShieldOff,
} from 'lucide-react';
import { AI_TOOLS } from '../data/tools';
import { getPlans, getPlan } from '../../lib/toolPlans';

interface AdminPageProps {
  onNavigate: (page: Page) => void;
}

/* ------------------------------------------------------------------ */
/* Field configurations — every content collection, WordPress-style.  */
/* ------------------------------------------------------------------ */

const PAGES_LIST = [
  { key: 'home', label: 'صفحه اصلی' },
  { key: 'services', label: 'خدمات' },
  { key: 'portfolio', label: 'نمونه‌کارها' },
  { key: 'about', label: 'درباره من' },
  { key: 'blog', label: 'وبلاگ' },
  { key: 'contact', label: 'تماس' },
  { key: 'projects', label: 'پروژه‌ها' },
  { key: 'products', label: 'محصولات' },
];

const POST_FIELDS: FieldDef[] = [
  { key: 'title', label: 'عنوان مقاله' },
  { key: 'seo', label: 'سئو', type: 'seo', urlPrefix: 'blog' },
  { key: 'excerpt', label: 'خلاصه (در کارت‌های لیست نمایش داده می‌شود)', type: 'textarea', rows: 3 },
  { key: 'content', label: 'متن کامل (پشتیبان)', type: 'textarea', rows: 8 },
  { key: 'sections', label: 'بخش‌های مقاله (بدنه اصلی)', type: 'items', singular: 'بخش', defaults: { heading: '', content: '' }, fields: [
    { key: 'id', label: 'شناسه بخش (انگلیسی)', dir: 'ltr' },
    { key: 'heading', label: 'عنوان بخش' },
    { key: 'content', label: 'متن بخش', type: 'textarea', rows: 6 },
    { key: 'callout', label: 'جعبه نکته (اختیاری)', type: 'textarea', rows: 2 },
    { key: 'keyPoints', label: 'نکات کلیدی', type: 'tags' },
  ] },
  { key: 'tableOfContents', label: 'فهرست مطالب', type: 'items', singular: 'ردیف فهرست', defaults: { id: '', title: '' }, fields: [
    { key: 'id', label: 'شناسه بخش', dir: 'ltr' },
    { key: 'title', label: 'عنوان در فهرست' },
  ] },
  { key: 'faq', label: 'پرسش‌های پرتکرار (FAQ)', type: 'items', singular: 'پرسش', defaults: { question: '', answer: '' }, fields: [
    { key: 'question', label: 'پرسش' },
    { key: 'answer', label: 'پاسخ', type: 'textarea', rows: 3 },
  ] },
  { key: 'coverImage', label: 'تصویر شاخص', type: 'image' },
  { key: 'category', label: 'دسته‌بندی مقاله', type: 'category' },
  { key: 'pathCategory', label: 'مسیر مخاطب', type: 'select', options: [
    { value: '', label: '— بدون مسیر —' },
    { value: 'start', label: 'شروع (start)' },
    { value: 'sell', label: 'فروش (sell)' },
    { value: 'grow', label: 'رشد (grow)' },
  ] },
  { key: 'date', label: 'تاریخ انتشار', placeholder: 'شهریور ۱۴۰۴' },
  { key: 'readTime', label: 'زمان مطالعه', placeholder: '۵ دقیقه' },
  { key: 'author', label: 'نویسنده' },
  { key: 'authorRole', label: 'سمت نویسنده' },
  { key: 'authorAvatar', label: 'آواتار نویسنده', type: 'image' },
  { key: 'tags', label: 'برچسب‌ها', type: 'tags' },
  { key: 'viewsCount', label: 'تعداد بازدید', type: 'number', half: true, min: 0 },
  { key: 'featured', label: 'مقاله ویژه', type: 'toggle' },
  { key: 'isPopular', label: '«محبوب‌ترین مقاله» باشد', type: 'toggle', hint: 'فقط یک مقاله را انتخاب کنید' },
];

const SERVICE_FIELDS: FieldDef[] = [
  { key: 'title', label: 'عنوان خدمت' },
  { key: 'seo', label: 'سئو', type: 'seo', urlPrefix: 'services' },
  { key: 'titleEn', label: 'عنوان انگلیسی', dir: 'ltr' },
  { key: 'iconName', label: 'نام آیکون', dir: 'ltr', hint: 'code / sparkles / target / chart …' },
  { key: 'shortDesc', label: 'توضیح کوتاه', type: 'textarea', rows: 2 },
  { key: 'fullDesc', label: 'توضیح کامل', type: 'textarea', rows: 4 },
  { key: 'features', label: 'امکانات و ویژگی‌ها', type: 'tags' },
  { key: 'deliverables', label: 'خروجی‌های تحویلی', type: 'tags' },
  { key: 'tags', label: 'برچسب‌های تخصصی', type: 'tags' },
  { key: 'packages', label: 'پکیج‌ها و قیمت‌ها', type: 'items', singular: 'پکیج', defaults: { title: '', price: '', description: '' }, fields: [
    { key: 'title', label: 'نام پکیج' },
    { key: 'price', label: 'قیمت' },
    { key: 'badge', label: 'نشان (اختیاری)', placeholder: 'پیشنهادی' },
    { key: 'description', label: 'توضیح پکیج', type: 'textarea', rows: 2 },
    { key: 'isPopular', label: 'پکیج محبوب (هایلایت شود)', type: 'toggle' },
  ] },
];

const PRODUCT_FIELDS: FieldDef[] = [
  { key: 'title', label: 'نام محصول' },
  { key: 'seo', label: 'سئو', type: 'seo', urlPrefix: 'products' },
  { key: 'description', label: 'توضیحات', type: 'textarea', rows: 3 },
  { key: 'targetAudience', label: 'برای چه کسانی مناسب است؟', type: 'textarea', rows: 2 },
  { key: 'iconName', label: 'نام آیکون', dir: 'ltr', hint: 'target / chart / book / calendar …' },
  { key: 'badge', label: 'نشان', placeholder: 'رایگان' },
  { key: 'price', label: 'قیمت' },
  { key: 'actionText', label: 'متن دکمه' },
];

const CASE_FIELDS: FieldDef[] = [
  { key: 'title', label: 'عنوان کیس‌استادی' },
  { key: 'seo', label: 'سئو', type: 'seo', urlPrefix: 'portfolio' },
  { key: 'client', label: 'نام مشتری/برند' },
  { key: 'industry', label: 'صنعت (انگلیسی)', type: 'select', options: ['Fintech', 'Crypto', 'Travel', 'E-commerce', 'SaaS', 'Web Design'] },
  { key: 'industryFa', label: 'صنعت (فارسی)' },
  { key: 'pathCategory', label: 'مسیر مخاطب', type: 'select', options: [
    { value: '', label: '— بدون مسیر —' },
    { value: 'start', label: 'شروع (start)' },
    { value: 'sell', label: 'فروش (sell)' },
    { value: 'grow', label: 'رشد (grow)' },
  ] },
  { key: 'liveUrl', label: 'لینک زنده پروژه', dir: 'ltr' },
  { key: 'summary', label: 'خلاصه', type: 'textarea', rows: 2 },
  { key: 'challenge', label: 'چالش', type: 'textarea', rows: 3 },
  { key: 'solution', label: 'راهکار', type: 'textarea', rows: 3 },
  { key: 'results', label: 'نتایج', type: 'textarea', rows: 3 },
  { key: 'metrics', label: 'شاخص‌های اصلی', type: 'group', fields: [
    { key: 'roas', label: 'ROAS' },
    { key: 'conversionRate', label: 'نرخ تبدیل' },
    { key: 'cacReduction', label: 'کاهش CAC' },
  ] },
  { key: 'metricsComparison', label: 'مقایسه قبل/بعد', type: 'items', singular: 'شاخص', defaults: { label: '', before: '', after: '' }, fields: [
    { key: 'label', label: 'نام شاخص' },
    { key: 'before', label: 'قبل' },
    { key: 'after', label: 'بعد' },
  ] },
  { key: 'thumbnailIcon', label: 'نام آیکون کاور', dir: 'ltr' },
  { key: 'heroColor', label: 'رنگ غالب', dir: 'ltr', placeholder: 'indigo' },
  { key: 'tags', label: 'برچسب‌ها', type: 'tags' },
  { key: 'date', label: 'تاریخ' },
  { key: 'featured', label: 'در صفحه اصلی نمایش داده شود', type: 'toggle' },
];

const newPost = () => ({
  id: 'post-' + Date.now(),
  title: 'مقاله‌ی جدید',
  excerpt: '',
  content: '',
  category: 'growth',
  categoryFa: 'رشد',
  date: new Date().toLocaleDateString('fa-IR'),
  readTime: '۵ دقیقه',
  author: 'امید عدلی',
  imageIcon: 'book',
  featured: false,
  isPopular: false,
  status: 'draft' as const,
  slug: '',
  seo: {},
  sections: [],
  tableOfContents: [],
  tags: [],
  viewsCount: 0,
});

/* ------------------------------------------------------------------ */

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {
  const {
    data, isAdmin, persistence, pinCode, changePin, loginAdmin, logoutAdmin,
    updateField, addItem, removeItem, moveItem, duplicateItem,
    exportJSON, importJSON, createSnapshot, rollbackSnapshot, deleteSnapshot,
    resetToDefaults, addMediaItem, removeMediaItem, logActivity,
    toggleSectionVisibility, reorderPageSection, updatePageSeo,
    generateSitemapXml, generateRobotsTxt,
    toggleCommentApproval, deleteBlogComment, replyBlogComment,
  } = useContent();

  type TabId = 'dashboard' | 'posts' | 'comments' | 'services' | 'portfolio' | 'products' | 'projects' | 'about' | 'home' | 'pages' | 'media' | 'seo' | 'chat' | 'leads' | 'toolaccess' | 'appearance' | 'settings';
  const [activeTab, setActiveTab] = usePreservedState<TabId>('admin_active_tab', 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedSeoPage, setSelectedSeoPage] = usePreservedState<string>('admin_selected_seo_page', 'home');
  const [commentFilter, setCommentFilter] = usePreservedState<'all' | 'pending' | 'approved'>('admin_comment_filter', 'all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sitemapOut, setSitemapOut] = useState('');
  const [robotsOut, setRobotsOut] = useState('');
  const [importText, setImportText] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [chatLog, setChatLog] = useState<{ id: string; question: string; answer: string; mode: string; created_at: string; ip: string }[] | null>(null);
  const [leads, setLeads] = useState<Array<{
    id: string; source: string; name: string; email: string; contact: string; website: string;
    goal: string; service: string; details: string; booking_date: string; booking_time: string;
    created_at: string; ip: string;
  }> | null>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // AI tool access management
  const [grants, setGrants] = useState<Array<{ id: string; phone: string; productId: string; code: string; status: string; maxDevices: number; messageQuota?: number; devicesUsed: number; note: string; createdAt: string; expiresAt: string }> | null>(null);
  const [grantForm, setGrantForm] = useState({ phone: '', productId: 'all', planId: '', days: '30', maxDevices: '1', messageQuota: '0', note: '' });
  const [grantBusy, setGrantBusy] = useState(false);
  const [lastGrant, setLastGrant] = useState<{ phone: string; productId: string; code: string; expiresAt?: string } | null>(null);
  const [toolMsgs, setToolMsgs] = useState<Array<{ id: string; phone: string; product_id: string; question: string; answer: string; created_at: string }> | null>(null);
  // Per-tool behavior + AI connection management
  const [selectedTool, setSelectedTool] = useState<string>(AI_TOOLS[0]?.id || '');
  const [toolSettings, setToolSettings] = useState<Array<{ productId: string; name: string; provider: string; baseUrl: string; model: string; hasKey: boolean; keyMask: string; usingEnvFallback: boolean }>>([]);
  const [envKeyPresent, setEnvKeyPresent] = useState(false);
  const [keyForm, setKeyForm] = useState({ provider: 'gemini', baseUrl: '', model: '', apiKey: '' });
  const [keyBusy, setKeyBusy] = useState(false);

  const loadGrants = async () => setGrants(await api.listToolAccess());
  const loadToolSettings = async () => {
    const r = await api.listToolSettings();
    setToolSettings(r.items);
    setEnvKeyPresent(r.envKeyPresent);
  };
  // Load AI-connection status when the tab opens (once).
  useEffect(() => {
    if (activeTab === 'toolaccess' && isAdmin) loadToolSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin]);
  // Populate the key form from the selected tool's stored settings.
  useEffect(() => {
    const s = toolSettings.find((x) => x.productId === selectedTool);
    setKeyForm({ provider: s?.provider || 'gemini', baseUrl: s?.baseUrl || '', model: s?.model || '', apiKey: '' });
  }, [selectedTool, toolSettings]);

  const currentSetting = toolSettings.find((x) => x.productId === selectedTool);
  const handleSaveKey = async () => {
    setKeyBusy(true);
    const r = await api.setToolKey({ productId: selectedTool, provider: keyForm.provider, baseUrl: keyForm.baseUrl, model: keyForm.model, apiKey: keyForm.apiKey });
    setKeyBusy(false);
    if (r.ok) { showToast('اتصال هوش مصنوعی ذخیره شد.'); await loadToolSettings(); }
    else showToast(r.error || 'ذخیره ناموفق بود.');
  };
  const handleClearKey = async () => {
    if (await api.clearToolKey(selectedTool)) { showToast('کلید حذف شد؛ به کلید پیش‌فرض بازگشت.'); await loadToolSettings(); }
  };
  const toolName = (id: string) => (id === 'all' ? 'همه ابزارها' : (AI_TOOLS.find((t) => t.id === id)?.name || id));
  // Apply a plan's defaults into the grant form (still editable afterwards).
  const applyPlan = (productId: string, planId: string) => {
    const plan = planId ? getPlan(productId, planId) : undefined;
    setGrantForm((f) => ({
      ...f,
      productId,
      planId,
      days: plan ? String(plan.durationDays) : f.days,
      maxDevices: plan ? String(plan.maxDevices) : f.maxDevices,
      messageQuota: plan ? String(plan.messageQuota) : f.messageQuota,
    }));
  };
  const handleGrant = async () => {
    setGrantBusy(true);
    const r = await api.grantToolAccess({
      phone: grantForm.phone,
      productId: grantForm.productId,
      planId: grantForm.planId || undefined,
      days: parseInt(grantForm.days, 10) || 30,
      maxDevices: parseInt(grantForm.maxDevices, 10) || 1,
      messageQuota: parseInt(grantForm.messageQuota, 10) || 0,
      note: grantForm.note,
    });
    setGrantBusy(false);
    if (r.ok && r.code) {
      setLastGrant({ phone: grantForm.phone, productId: grantForm.productId, code: r.code, expiresAt: r.expiresAt });
      showToast('دسترسی صادر شد — کد را برای مشتری بفرست.');
      await loadGrants();
    } else {
      showToast(r.error || 'صدور دسترسی ناموفق بود.');
    }
  };

  // login form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  // local PIN manager (dev mode only)
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    const ok = persistence === 'cloud'
      ? await loginAdmin(loginUser.trim(), loginPass)
      : await loginAdmin(loginPass || loginUser.trim());
    setLoginBusy(false);
    if (ok) {
      setLoginError('');
      setLoginUser('');
      setLoginPass('');
      showToast('خوش آمدید! ورود به پیشخوان مدیریت با موفقیت انجام شد.');
    } else {
      setLoginError(persistence === 'cloud' ? 'نام کاربری یا رمز عبور اشتباه است.' : 'رمز محلی وارد شده اشتباه است.');
    }
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (oldPinInput !== pinCode) {
      setPinChangeMsg('رمز فعلی اشتباه است.');
      return;
    }
    if (newPinInput.length < 4) {
      setPinChangeMsg('رمز جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    changePin(newPinInput);
    setPinChangeMsg('رمز محلی با موفقیت تغییر کرد.');
    setOldPinInput('');
    setNewPinInput('');
  };

  const pendingComments = (data.BLOG_COMMENTS || []).filter((c) => !c.isApproved).length;
  const counts = useMemo(
    () => [
      { label: 'مقالات', value: (data.BLOG_POSTS || []).length, tab: 'posts' as TabId, icon: BookOpen },
      { label: 'خدمات', value: (data.SERVICES || []).length, tab: 'services' as TabId, icon: Sparkles },
      { label: 'نمونه‌کارها', value: (data.CASE_STUDIES || []).length, tab: 'portfolio' as TabId, icon: Briefcase },
      { label: 'محصولات', value: (data.PRODUCTS || []).length, tab: 'products' as TabId, icon: ShoppingBag },
      { label: 'دیدگاه‌های در انتظار', value: pendingComments, tab: 'comments' as TabId, icon: MessageSquare },
      { label: 'فایل‌های رسانه', value: (data.MEDIA_LIBRARY || []).length, tab: 'media' as TabId, icon: ImageIcon },
    ],
    [data, pendingComments],
  );

  const NAV_GROUPS: { group: string; items: { id: TabId; label: string; icon: any; badge?: number }[] }[] = [
    {
      group: 'محتوا',
      items: [
        { id: 'dashboard', label: 'پیشخوان', icon: LayoutDashboard },
        { id: 'posts', label: 'مقالات', icon: BookOpen },
        { id: 'comments', label: 'دیدگاه‌ها', icon: MessageSquare, badge: pendingComments },
        { id: 'services', label: 'خدمات', icon: Sparkles },
        { id: 'portfolio', label: 'نمونه‌کارها', icon: Briefcase },
        { id: 'products', label: 'محصولات', icon: ShoppingBag },
        { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
        { id: 'home', label: 'صفحه اصلی', icon: Home },
        { id: 'about', label: 'درباره من', icon: UserRound },
      ],
    },
    {
      group: 'دستیار و لیدها',
      items: [
        { id: 'chat', label: 'دستیار هوشمند', icon: Bot },
        { id: 'leads', label: 'لیدها (تماس و رزرو)', icon: Target },
        { id: 'toolaccess', label: 'دسترسی ابزارهای هوشمند', icon: KeyRound },
      ],
    },
    {
      group: 'مدیریت سایت',
      items: [
        { id: 'pages', label: 'برگه‌ها و سئوی صفحات', icon: FileText },
        { id: 'media', label: 'کتابخانه رسانه', icon: ImageIcon },
        { id: 'seo', label: 'سئویسراسری و نقشه سایت', icon: Search },
        { id: 'appearance', label: 'منوها و ظاهر', icon: Palette },
        { id: 'settings', label: 'پشتیبان‌گیری و تنظیمات', icon: Settings },
      ],
    },
  ];

  /* ------------------------- LOGIN GATE ------------------------- */
  if (!isAdmin) {
    return (
      <div className="min-h-[85vh] supports-[min-height:85dvh]:min-h-[85dvh] flex items-center justify-center py-12 px-4 dir-rtl">
        <div className="nd-card max-w-md w-full p-8 sm:p-10 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[color:var(--nd-accent)] text-white flex items-center justify-center shadow-md">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="nd-h2 text-xl sm:text-2xl">ورود به پیشخوان مدیریت</h1>
            <p className="text-xs leading-relaxed nd-muted">
              {persistence === 'cloud'
                ? 'نام کاربری و رمز عبوری را وارد کنید که در Secrets پنل Cloudflare تنظیم کرده‌اید.'
                : 'حالت توسعه (بدون اتصال به Cloudflare): رمز محلی مدیریت را وارد کنید.'}
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {persistence === 'cloud' && (
              <div>
                <label className="block text-xs font-extrabold mb-1.5 text-[color:var(--nd-ink-2)]">نام کاربری</label>
                <input
                  type="text"
                  autoComplete="username"
                  dir="ltr"
                  value={loginUser}
                  onChange={(e) => { setLoginUser(e.target.value); setLoginError(''); }}
                  placeholder="username"
                  className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-2xl px-4 py-3 text-sm font-bold text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] transition-colors"
                  autoFocus
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-extrabold mb-1.5 text-[color:var(--nd-ink-2)]">رمز عبور</label>
              <input
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={loginPass}
                onChange={(e) => { setLoginPass(e.target.value); setLoginError(''); }}
                placeholder="••••••••"
                className="w-full bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] rounded-2xl px-4 py-3 text-sm font-bold text-[color:var(--nd-ink)] focus:outline-none focus:border-[color:var(--nd-accent)] transition-colors"
                autoFocus={persistence !== 'cloud'}
              />
            </div>
            {loginError && <div className="p-3 rounded-xl bg-[#fee2e2] text-[#b91c1c] text-xs font-extrabold text-center">{loginError}</div>}
            <button type="submit" disabled={loginBusy} className="nd-btn w-full py-3.5 text-sm nd-btn-accent disabled:opacity-50">
              <ShieldCheck className="w-5 h-5" />
              <span>{loginBusy ? 'در حال بررسی…' : 'ورود به پیشخوان'}</span>
            </button>
          </form>
          <div className="pt-4 border-t border-[color:var(--nd-line)] text-center">
            <button onClick={() => onNavigate('home')} className="text-xs nd-muted hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">
              بازگشت به صفحه اصلی سایت
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------- PANEL SHELL ------------------------- */
  const comments = (data.BLOG_COMMENTS || []).filter((c) =>
    commentFilter === 'all' ? true : commentFilter === 'pending' ? !c.isApproved : c.isApproved,
  );

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setMediaBusy(true);
    if (persistence === 'cloud') {
      const item = await api.uploadMedia(file, file.name, file.name);
      if (item) {
        addMediaItem(item.url, item.title, item.sizeKb, undefined, ['cloud', 'r2']);
        showToast('فایل با موفقیت در Cloudflare R2 ذخیره شد.');
      } else {
        showToast('آپلود ناموفق بود.');
      }
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          addMediaItem(reader.result, file.name, Math.round(file.size / 1024));
          showToast('فایل به‌صورت محلی ذخیره شد (حالت توسعه).');
        }
      };
      reader.readAsDataURL(file);
    }
    setMediaBusy(false);
  };

  const sidebar = (
    <aside className="w-64 shrink-0 space-y-6">
      <div className="nd-card p-4 space-y-1.5">
        <div className="flex items-center gap-2.5 pb-2">
          <span className="w-9 h-9 rounded-xl bg-[color:var(--nd-accent)] text-white flex items-center justify-center text-sm font-black">ع</span>
          <div className="min-w-0">
            <span className="block text-xs font-extrabold truncate">پیشخوان مدیریت</span>
            <span className="block text-[10px] nd-muted truncate">
              {persistence === 'cloud' ? 'متصل به Cloudflare D1' : 'حالت محلی (توسعه)'}
            </span>
          </div>
        </div>
        {persistence === 'cloud' ? (
          <span className="nd-chip w-full justify-center bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent text-[10px]">
            <Cloud className="w-3 h-3" /> ذخیره‌سازی ابری فعال — تغییرات خودکار ذخیره می‌شوند
          </span>
        ) : (
          <span className="nd-chip w-full justify-center bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent text-[10px]">
            <HardDrive className="w-3 h-3" /> ذخیره در مرورگر — برای اتصال، راهنمای CMS-DEPLOY.md را ببینید
          </span>
        )}
      </div>

      {NAV_GROUPS.map((g) => (
        <nav key={g.group} className="space-y-1">
          <span className="block px-3 pb-1 text-[10px] font-black nd-faint tracking-wide">{g.group}</span>
          {g.items.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-[color:var(--nd-accent)] text-white shadow-sm'
                  : 'text-[color:var(--nd-ink-2)] hover:bg-[color:var(--nd-bg-soft)]'
              }`}
            >
              <t.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-right">{t.label}</span>
              {!!t.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${activeTab === t.id ? 'bg-white/25' : 'bg-[color:var(--nd-peach-soft)] text-[#d97706]'}`}>{t.badge}</span>
              )}
            </button>
          ))}
        </nav>
      ))}

      <div className="space-y-1.5">
        <button onClick={() => onNavigate('home')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-extrabold text-[color:var(--nd-ink-2)] hover:bg-[color:var(--nd-bg-soft)] transition-all cursor-pointer">
          <ExternalLink className="w-4 h-4" />
          <span>مشاهده سایت</span>
        </button>
        <button onClick={() => { logoutAdmin(); showToast('از پیشخوان خارج شدید.'); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-extrabold text-[#dc2626] hover:bg-[#fee2e2] transition-all cursor-pointer">
          <LogOut className="w-4 h-4" />
          <span>خروج از حساب</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen py-6 px-2 sm:px-4 dir-rtl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[130] nd-card py-3! px-5! flex items-center gap-2.5 shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-[color:var(--nd-success)] shrink-0" />
          <span className="text-xs font-extrabold">{toastMsg}</span>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between mb-4">
        <button onClick={() => setSidebarOpen(true)} className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs cursor-pointer">
          <Menu className="w-4 h-4" />
          <span>منوی مدیریت</span>
        </button>
        <ABadge tone={persistence === 'cloud' ? 'ok' : 'warn'}>{persistence === 'cloud' ? '☁️ ابری' : 'محلی'}</ABadge>
      </div>
      <AModal open={sidebarOpen} onClose={() => setSidebarOpen(false)} title="منوی مدیریت">
        <div className="[&>aside]:w-full">{sidebar}</div>
      </AModal>

      <div className="flex gap-6 items-start max-w-[1500px] mx-auto">
        <div className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] supports-[height:1dvh]:max-h-[calc(100dvh-7rem)] overflow-y-auto">{sidebar}</div>

        <main className="flex-1 min-w-0 space-y-6 pb-24">
          {/* ---------------- DASHBOARD ---------------- */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <ASectionTitle title="پیشخوان" desc="خلاصه وضعیت محتوای سایت و ذخیره‌سازی" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {counts.map((c) => (
                  <button key={c.label} onClick={() => setActiveTab(c.tab)} className="nd-card nd-card-hover p-5 text-right cursor-pointer space-y-2">
                    <c.icon className="w-5 h-5 text-[color:var(--nd-accent)]" />
                    <span className="block text-2xl font-black dir-ltr text-right">{c.value}</span>
                    <span className="block text-[11px] font-extrabold nd-muted">{c.label}</span>
                  </button>
                ))}
              </div>
              <ACard>
                <ASectionTitle title="آخرین تغییرات" desc="۸ رویداد اخیر" />
                <div className="space-y-2">
                  {(data.AUDIT_LOGS || []).slice(0, 8).map((log) => (
                    <div key={log.id} className="flex items-start justify-between gap-3 text-xs border-b border-[color:var(--nd-line)] pb-2 last:border-0">
                      <span>
                        <span className="font-extrabold block">{log.action}</span>
                        <span className="nd-muted text-[10px] block mt-0.5">{log.details}</span>
                      </span>
                      <span className="text-[10px] nd-faint shrink-0 dir-ltr">{log.timestamp}</span>
                    </div>
                  ))}
                  {(data.AUDIT_LOGS || []).length === 0 && <p className="text-xs nd-muted">رویدادی ثبت نشده است.</p>}
                </div>
              </ACard>
            </div>
          )}

          {/* ---------------- POSTS ---------------- */}
          {activeTab === 'posts' && (
            <div className="space-y-8">
              <CollectionEditor
                title="مقالات"
                desc="هر مقاله: عنوان، متن بخش‌بندی‌شده، تصویر شاخص، وضعیت انتشار، آدرس انگلیسی و سئوی کامل"
                arrayPath="BLOG_POSTS"
                fields={POST_FIELDS}
                defaults={newPost}
                addLabel="نوشتن مقاله جدید"
                searchPlaceholder="جستجو در مقالات…"
                preview={(p) => ({
                  title: p.title,
                  subtitle: `${p.categoryFa || ''} · ${p.date || ''} · ${p.readTime || ''}`,
                  image: p.coverImage,
                  badges: [
                    p.status === 'draft' ? { text: 'پیش‌نویس', tone: 'warn' as const } : { text: 'منتشرشده', tone: 'ok' as const },
                    ...(p.isPopular ? [{ text: 'محبوب‌ترین', tone: 'accent' as const }] : []),
                  ],
                })}
                extraActions={(p, idx) => (
                  <button
                    type="button"
                    onClick={() => {
                      const sections = (p.sections || []).map((s: any, i: number) => ({ ...s, id: s.id || `section-${i + 1}` }));
                      const toc = sections.filter((s: any) => s.heading).map((s: any) => ({ id: s.id, title: s.heading }));
                      updateField(`BLOG_POSTS.${idx}.sections`, sections);
                      updateField(`BLOG_POSTS.${idx}.tableOfContents`, toc);
                      showToast('فهرست مطالب از بخش‌های مقاله ساخته شد.');
                    }}
                    className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>ساخت خودکار فهرست مطالب از بخش‌ها</span>
                  </button>
                )}
              />
              <ACard>
                <ASectionTitle title="تنظیمات صفحه وبلاگ" desc="متن‌های هدر، جستجو و خبرنامه" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="BLOG_PAGE_DATA" item={data.BLOG_PAGE_DATA} fields={[
                    { key: 'badge', label: 'نشان هدر' },
                    { key: 'headline', label: 'تیتر اصلی' },
                    { key: 'subheadline', label: 'زیرتیتر', type: 'textarea', rows: 2 },
                    { key: 'searchPlaceholder', label: 'متن جای‌نما جستجو' },
                    { key: 'newsletterHeadline', label: 'تیتر خبرنامه' },
                    { key: 'newsletterSubheadline', label: 'توضیح خبرنامه', type: 'textarea', rows: 2 },
                    { key: 'newsletterPlaceholder', label: 'جای‌نما ایمیل' },
                    { key: 'newsletterCta', label: 'متن دکمه عضویت' },
                    { key: 'newsletterSuccess', label: 'پیام موفقیت عضویت', type: 'textarea', rows: 2 },
                  ]} />
                </div>
              </ACard>
            </div>
          )}

          {/* ---------------- COMMENTS ---------------- */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <ASectionTitle
                title={`دیدگاه‌ها (${(data.BLOG_COMMENTS || []).length})`}
                desc="تایید، پاسخ و مدیریت دیدگاه‌های مقالات"
                action={
                  <span className="flex gap-1.5">
                    {(['all', 'pending', 'approved'] as const).map((f) => (
                      <button key={f} onClick={() => setCommentFilter(f)} className={`nd-chip cursor-pointer ${commentFilter === f ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] border-transparent' : ''}`}>
                        {f === 'all' ? 'همه' : f === 'pending' ? `در انتظار (${pendingComments})` : 'تاییدشده'}
                      </button>
                    ))}
                  </span>
                }
              />
              {comments.length === 0 && <ACard className="text-center py-10"><p className="text-xs nd-muted">دیدگاهی در این دسته نیست.</p></ACard>}
              {comments.map((c) => {
                const post = (data.BLOG_POSTS || []).find((p: any) => p.id === c.postId);
                return (
                  <ACard key={c.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-extrabold">{c.authorName}</span>
                        <span className="text-[10px] nd-muted dir-ltr">{c.authorEmail}</span>
                        {c.isApproved ? <ABadge tone="ok">تاییدشده</ABadge> : <ABadge tone="warn">در انتظار</ABadge>}
                      </span>
                      <span className="text-[10px] nd-faint">{c.date} · {post?.title || 'مقاله حذف‌شده'}</span>
                    </div>
                    <p className="text-xs nd-muted leading-relaxed">{c.content}</p>
                    {c.reply && (
                      <div className="p-3 rounded-xl bg-[color:var(--nd-accent-soft)] text-[11px] font-bold text-[color:var(--nd-ink-2)]">
                        <span className="text-[color:var(--nd-accent)] block mb-1">پاسخ شما:</span>{c.reply}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => { toggleCommentApproval(c.id); showToast(c.isApproved ? 'دیدگاه به حالت در انتظار برگشت.' : 'دیدگاه تایید و منتشر شد.'); }} className={`nd-btn px-4 py-2 text-[11px] cursor-pointer ${c.isApproved ? 'nd-btn-ghost' : 'nd-btn-accent'}`}>
                        {c.isApproved ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{c.isApproved ? 'لغو تایید' : 'تایید و انتشار'}</span>
                      </button>
                      <div className="flex-1 min-w-[200px] flex gap-2">
                        <AInput placeholder="پاسخ شما…" value={replyDrafts[c.id] || c.reply || ''} onChange={(e) => setReplyDrafts({ ...replyDrafts, [c.id]: e.target.value })} />
                        <button onClick={() => { const txt = (replyDrafts[c.id] || '').trim(); if (!txt) return; replyBlogComment(c.id, txt); setReplyDrafts({ ...replyDrafts, [c.id]: '' }); showToast('پاسخ ثبت شد.'); }} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] shrink-0 cursor-pointer">
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button onClick={() => { if (confirm('این دیدگاه حذف شود؟')) { deleteBlogComment(c.id); showToast('دیدگاه حذف شد.'); } }} className="p-2 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </ACard>
                );
              })}
            </div>
          )}

          {/* ---------------- SERVICES ---------------- */}
          {activeTab === 'services' && (
            <CollectionEditor
              title="خدمات"
              desc="هر خدمت: توضیحات، ویژگی‌ها، پکیج‌های قیمت و سئوی اختصاصی"
              arrayPath="SERVICES"
              fields={SERVICE_FIELDS}
              defaults={() => ({ id: 'service-' + Date.now(), title: 'خدمت جدید', titleEn: '', iconName: 'sparkles', shortDesc: '', fullDesc: '', features: [], deliverables: [], tags: [], packages: [], status: 'draft', slug: '', seo: {} })}
              addLabel="افزودن خدمت"
              preview={(s) => ({ title: s.title, subtitle: s.shortDesc, badges: [s.status === 'draft' ? { text: 'پیش‌نویس', tone: 'warn' as const } : { text: 'منتشرشده', tone: 'ok' as const }] })}
            />
          )}

          {/* ---------------- PORTFOLIO ---------------- */}
          {activeTab === 'portfolio' && (
            <CollectionEditor
              title="نمونه‌کارها و کیس‌استادی‌ها"
              desc="چالش، راهکار، نتیجه و شاخص‌های عددی هر پروژه"
              arrayPath="CASE_STUDIES"
              fields={CASE_FIELDS}
              defaults={() => ({ id: 'case-' + Date.now(), title: 'کیس‌استادی جدید', client: '', industry: 'E-commerce' as const, industryFa: 'فروشگاهی', pathCategory: 'grow' as const, summary: '', challenge: '', solution: '', results: '', thumbnailIcon: 'chart', heroColor: 'indigo', featured: false, metrics: { roas: '', conversionRate: '', cacReduction: '' }, metricsComparison: [], tags: [], date: new Date().toLocaleDateString('fa-IR'), status: 'draft', slug: '', seo: {} })}
              addLabel="افزودن نمونه‌کار"
              preview={(c) => ({ title: c.title, subtitle: `${c.client || ''} · ${c.industryFa || ''}`, badges: [c.featured ? { text: 'ویژه', tone: 'accent' as const } : { text: 'عادی', tone: 'muted' as const }, c.status === 'draft' ? { text: 'پیش‌نویس', tone: 'warn' as const } : { text: 'منتشرشده', tone: 'ok' as const }] })}
            />
          )}

          {/* ---------------- PRODUCTS ---------------- */}
          {activeTab === 'products' && (
            <div className="space-y-8">
              <ProductSyncManager
                products={data.PRODUCTS || []}
                data={data}
                updateField={updateField}
                onToast={showToast}
              />

              <ACard>
                <ASectionTitle title="تنظیمات صفحه ویترین محصولات" desc="نشان، تیتر و زیرتیتر صفحه /products در سایت" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="PRODUCTS_PAGE_DATA" item={data.PRODUCTS_PAGE_DATA} fields={[
                    { key: 'badge', label: 'نشان هدر' },
                    { key: 'headline', label: 'تیتر اصلی' },
                    { key: 'subheadline', label: 'زیرتیتر', type: 'textarea', rows: 2 },
                  ]} />
                </div>
              </ACard>
            </div>
          )}

          {/* ---------------- PROJECTS ---------------- */}
          {activeTab === 'projects' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle title="تنظیمات صفحه پروژه‌ها" desc="بنر ظرفیت همکاری و متن‌های صفحه" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="PROJECTS_PAGE_DATA" item={data.PROJECTS_PAGE_DATA} fields={[
                    { key: 'badge', label: 'نشان هدر' },
                    { key: 'headline', label: 'تیتر اصلی' },
                    { key: 'subheadline', label: 'زیرتیتر', type: 'textarea', rows: 2 },
                    { key: 'capacityStatus', label: 'وضعیت ظرفیت پذیرش پروژه', type: 'select', options: [
                      { value: 'active', label: 'فعال — پروژه جدید می‌گیرم' },
                      { value: 'limited', label: 'محدود — ظرفیت کم' },
                      { value: 'full', label: 'تکمیل — فعلاً ظرفیت ندارم' },
                    ] },
                    { key: 'capacityText', label: 'متن بنر ظرفیت', type: 'textarea', rows: 2 },
                    { key: 'sectionTitle', label: 'عنوان بخش پروژه‌ها' },
                    { key: 'portfolioHeadline', label: 'تیتر ارجاع به نمونه‌کارها' },
                    { key: 'portfolioBody', label: 'متن ارجاع به نمونه‌کارها', type: 'textarea', rows: 2 },
                    { key: 'portfolioCta', label: 'متن دکمه نمونه‌کارها' },
                  ]} />
                </div>
              </ACard>
              <CollectionEditor
                title="پروژه‌های جاری و سابق"
                arrayPath="ONGOING_PROJECTS"
                fields={[
                  { key: 'title', label: 'عنوان پروژه' },
                  { key: 'status', label: 'وضعیت', type: 'select', options: ['در حال اجرا', 'تکمیل‌شده'] },
                  { key: 'description', label: 'توضیحات', type: 'textarea', rows: 2 },
                  { key: 'isPlaceholder', label: 'آیتم جای‌نما (کم‌رنگ نمایش داده شود)', type: 'toggle' },
                ]}
                defaults={() => ({ id: 'prj-' + Date.now(), title: 'پروژه جدید', status: 'در حال اجرا', description: '', isPlaceholder: false })}
                addLabel="افزودن پروژه"
                preview={(p) => ({ title: p.title, subtitle: p.description, badges: [{ text: p.status, tone: p.status === 'در حال اجرا' ? 'ok' as const : 'muted' as const }] })}
              />
              <CollectionEditor
                title="همکاری‌های منتخب (لیست «چند پروژه دیگه»)"
                arrayPath="SELECT_PROJECTS"
                fields={[
                  { key: 'title', label: 'عنوان' },
                  { key: 'desc', label: 'توضیح کوتاه', type: 'textarea', rows: 2 },
                  { key: 'date', label: 'تاریخ' },
                ]}
                defaults={() => ({ title: 'همکاری جدید', desc: '', date: '' })}
                addLabel="افزودن همکاری"
                preview={(p) => ({ title: p.title, subtitle: `${p.date || ''} — ${p.desc || ''}` })}
              />
            </div>
          )}

          {/* ---------------- HOME ---------------- */}
          {activeTab === 'home' && (
            <div className="space-y-8">
              <CollectionEditor
                title="آمار و ارقام (نوار اثبات)"
                arrayPath="STATS"
                fields={[
                  { key: 'value', label: 'مقدار', placeholder: '۲.۹ برابر' },
                  { key: 'label', label: 'عنوان' },
                  { key: 'subtext', label: 'توضیح' },
                  { key: 'icon', label: 'نام آیکون', dir: 'ltr' },
                ]}
                defaults={() => ({ value: '', label: '', subtext: '', icon: 'trending-up' })}
                addLabel="افزودن آمار"
                preview={(s) => ({ title: `${s.value} — ${s.label}`, subtitle: s.subtext })}
              />
              <CollectionEditor
                title="مسیر همکاری در صفحه اصلی"
                desc="مراحل «چطور کار می‌کنیم» که در صفحه اصلی نمایش داده می‌شود"
                arrayPath="HOMEPAGE_HOW_I_WORK_STEPS"
                fields={[
                  { key: 'step', label: 'شماره مرحله', half: true },
                  { key: 'icon', label: 'نام آیکون', dir: 'ltr', half: true },
                  { key: 'title', label: 'عنوان' },
                  { key: 'desc', label: 'توضیح', type: 'textarea', rows: 2 },
                ]}
                defaults={() => ({ step: '', title: '', desc: '', icon: 'rocket' })}
                addLabel="افزودن مرحله"
                preview={(s) => ({ title: `${s.step}. ${s.title}`, subtitle: s.desc })}
              />
              <CollectionEditor
                title="مسیر ۴ مرحله‌ای همکاری (صفحه خدمات)"
                arrayPath="HOW_I_WORK_STEPS"
                fields={[
                  { key: 'step', label: 'شماره مرحله', half: true },
                  { key: 'icon', label: 'نام آیکون', dir: 'ltr', half: true },
                  { key: 'title', label: 'عنوان' },
                  { key: 'desc', label: 'توضیح', type: 'textarea', rows: 2 },
                ]}
                defaults={() => ({ step: '', title: '', desc: '', icon: 'rocket' })}
                addLabel="افزودن مرحله"
                preview={(s) => ({ title: `${s.step}. ${s.title}`, subtitle: s.desc })}
              />
              <CollectionEditor
                title="چرا امید؟ (نقاط تمایز)"
                arrayPath="WHY_OMID_POINTS"
                fields={[
                  { key: 'title', label: 'عنوان' },
                  { key: 'description', label: 'توضیح', type: 'textarea', rows: 3 },
                  { key: 'icon', label: 'نام آیکون', dir: 'ltr' },
                ]}
                defaults={() => ({ title: '', description: '', icon: 'target' })}
                addLabel="افزودن نقطه تمایز"
                preview={(p) => ({ title: p.title, subtitle: p.description })}
              />
              <CollectionEditor
                title="نقل‌قول مشتریان"
                arrayPath="TESTIMONIALS"
                fields={[
                  { key: 'clientName', label: 'نام مشتری/تیم' },
                  { key: 'clientRole', label: 'سمت' },
                  { key: 'company', label: 'شرکت' },
                  { key: 'avatarUrl', label: 'آواتار', type: 'image' },
                  { key: 'rating', label: 'امتیاز (۱ تا ۵)', type: 'number', min: 1, max: 5, half: true },
                  { key: 'metricHighlight', label: 'نشان دستاورد' },
                  { key: 'quote', label: 'متن نقل‌قول', type: 'textarea', rows: 4 },
                ]}
                defaults={() => ({ id: 't-' + Date.now(), clientName: '', clientRole: '', company: '', avatarUrl: '', rating: 5, quote: '', metricHighlight: '' })}
                addLabel="افزودن نقل‌قول"
                preview={(t) => ({ title: `${t.clientName} — ${t.company}`, subtitle: t.quote, image: t.avatarUrl })}
              />
              <ACard>
                <ASectionTitle title="بخش تحلیل کسب‌وکار" desc="«قبل از پیشنهاد، وضعیتت رو می‌فهمم»" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="BUSINESS_ANALYSIS_DATA" item={data.BUSINESS_ANALYSIS_DATA} fields={[
                    { key: 'headline', label: 'تیتر' },
                    { key: 'subheadline', label: 'زیرتیتر', type: 'textarea', rows: 2 },
                    { key: 'steps', label: 'مراحل تحلیل', type: 'items', singular: 'مرحله', defaults: { step: '', title: '', desc: '' }, fields: [
                      { key: 'step', label: 'شماره', half: true },
                      { key: 'title', label: 'عنوان' },
                      { key: 'desc', label: 'توضیح', type: 'textarea', rows: 2 },
                    ] },
                    { key: 'checklist', label: 'چک‌لیست سوالات', type: 'tags' },
                  ]} />
                </div>
              </ACard>
            </div>
          )}

          {/* ---------------- ABOUT ---------------- */}
          {activeTab === 'about' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle title="اطلاعات فردی و راه‌های ارتباطی" desc="این اطلاعات در کل سایت (هدر، تماس، فوتر و سئو) استفاده می‌شود" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="PERSONAL_INFO" item={data.PERSONAL_INFO} fields={[
                    { key: 'name', label: 'نام و نام خانوادگی' },
                    { key: 'title', label: 'عنوان شغلی' },
                    { key: 'avatar', label: 'عکس پروفایل', type: 'image' },
                    { key: 'tagline', label: 'تگ‌لاین', type: 'textarea', rows: 2 },
                    { key: 'bio', label: 'بیوگرافی کامل', type: 'textarea', rows: 5 },
                    { key: 'shortBio', label: 'بیوگرافی کوتاه', type: 'textarea', rows: 3 },
                    { key: 'experienceYears', label: 'سال‌های تجربه', half: true },
                    { key: 'campaignsCount', label: 'تعداد کمپین‌ها', half: true },
                    { key: 'avgRoasBoost', label: 'میانگین رشد ROAS', half: true },
                    { key: 'totalAdSpendManaged', label: 'برندهای مدیریت‌شده', half: true },
                    { key: 'availability', label: 'وضعیت پذیرش همکاری', type: 'textarea', rows: 2 },
                    { key: 'location', label: 'موقعیت مکانی' },
                    { key: 'email', label: 'ایمیل', dir: 'ltr' },
                    { key: 'phone', label: 'شماره تماس (انگلیسی)', dir: 'ltr' },
                    { key: 'phoneFormatted', label: 'شماره تماس (نمایش فارسی)' },
                    { key: 'telegram', label: 'آیدی تلگرام', dir: 'ltr' },
                    { key: 'telegramUrl', label: 'لینک تلگرام', dir: 'ltr' },
                    { key: 'whatsappUrl', label: 'لینک واتساپ', dir: 'ltr' },
                    { key: 'linkedin', label: 'لینکدین', dir: 'ltr' },
                    { key: 'instagram', label: 'اینستاگرام', dir: 'ltr' },
                    { key: 'xTwitter', label: 'توییتر/ایکس', dir: 'ltr' },
                    { key: 'website', label: 'دامنه سایت', dir: 'ltr' },
                  ]} />
                </div>
              </ACard>
              <CollectionEditor
                title="تایم‌لاین مسیر حرفه‌ای"
                arrayPath="TIMELINE"
                fields={[
                  { key: 'year', label: 'بازه زمانی' },
                  { key: 'title', label: 'عنوان شغلی' },
                  { key: 'company', label: 'شرکت / مکان' },
                  { key: 'description', label: 'توضیح (چالش و دستاورد)', type: 'textarea', rows: 4 },
                  { key: 'achievement', label: 'دستاوردها' },
                ]}
                defaults={() => ({ year: '', title: '', company: '', description: '', achievement: '' })}
                addLabel="افزودن سابقه"
                preview={(t) => ({ title: `${t.title} — ${t.company}`, subtitle: t.year, badges: t.achievement ? [{ text: 'با دستاورد', tone: 'ok' as const }] : [] })}
              />
              <CollectionEditor
                title="ابزارها و مهارت‌ها (نوار درصد)"
                arrayPath="SKILLS_TOOLS"
                fields={[
                  { key: 'name', label: 'نام ابزار', dir: 'ltr' },
                  { key: 'category', label: 'دسته', type: 'select', options: ['Ads', 'Analytics', 'CRO', 'Tech'] },
                  { key: 'icon', label: 'نام آیکون', dir: 'ltr' },
                  { key: 'proficiency', label: 'درصد تسلط', type: 'number', min: 0, max: 100 },
                ]}
                defaults={() => ({ name: '', category: 'Ads', icon: 'chart', proficiency: 80 })}
                addLabel="افزودن ابزار"
                preview={(s) => ({ title: s.name, subtitle: `${s.category} — ${s.proficiency}٪` })}
              />
              <ACard>
                <ASectionTitle title="لیست کامل مهارت‌ها" desc="دو ستون «مهارت‌های تخصصی» و «مهارت‌های نرم» در صفحه درباره من" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="ALL_SKILLS_LIST" item={data.ALL_SKILLS_LIST} fields={[
                    { key: 'hard', label: 'مهارت‌های تخصصی', type: 'items', singular: 'گروه', defaults: { title: '', tags: [] }, fields: [
                      { key: 'title', label: 'عنوان گروه', dir: 'ltr' },
                      { key: 'tags', label: 'مهارت‌ها', type: 'tags' },
                    ] },
                    { key: 'soft', label: 'مهارت‌های نرم', type: 'items', singular: 'گروه', defaults: { title: '', tags: [] }, fields: [
                      { key: 'title', label: 'عنوان گروه' },
                      { key: 'tags', label: 'مهارت‌ها', type: 'tags' },
                    ] },
                  ]} />
                </div>
              </ACard>
              <CollectionEditor
                title="همکاری‌های دیگر"
                arrayPath="OTHER_COLLABORATIONS"
                fields={[
                  { key: 'company', label: 'نام شرکت' },
                  { key: 'role', label: 'نقش همکاری' },
                ]}
                defaults={() => ({ company: '', role: '' })}
                addLabel="افزودن همکاری"
                preview={(c) => ({ title: c.company, subtitle: c.role })}
              />
              <ACard>
                <ASectionTitle title="تحصیلات و دوره‌ها" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="EDUCATION_AND_COURSES" item={data.EDUCATION_AND_COURSES} fields={[
                    { key: 'education', label: 'تحصیلات', type: 'items', singular: 'مقطع', defaults: { title: '', institute: '', year: '', grade: '' }, fields: [
                      { key: 'title', label: 'عنوان مقطع' },
                      { key: 'institute', label: 'موسسه' },
                      { key: 'year', label: 'سال', half: true },
                      { key: 'grade', label: 'معدل/دستاورد', half: true },
                    ] },
                    { key: 'courses', label: 'دوره‌های تخصصی', type: 'items', singular: 'دوره', defaults: { title: '', provider: '', date: '' }, fields: [
                      { key: 'title', label: 'نام دوره' },
                      { key: 'provider', label: 'موسسه برگزارکننده' },
                      { key: 'date', label: 'تاریخ' },
                    ] },
                  ]} />
                </div>
              </ACard>
            </div>
          )}

          {/* ---------------- PAGES ---------------- */}
          {activeTab === 'pages' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle
                  title="سئوی صفحات"
                  desc="عنوان، توضیحات متا و تنظیمات گوگل برای هر صفحه"
                  action={
                    <ASelect value={selectedSeoPage} onChange={(e) => setSelectedSeoPage(e.target.value)} className="w-auto!">
                      {PAGES_LIST.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      {(data.CUSTOM_PAGES || []).map((cp) => <option key={cp.id} value={cp.slug}>{cp.title} (برگه سفارشی)</option>)}
                    </ASelect>
                  }
                />
                <SeoBox
                  defaultOpen
                  showStatus={false}
                  showSlug={false}
                  values={{ ...(data.PAGE_SEO?.[selectedSeoPage] || {}) }}
                  onChange={(k, v) => updatePageSeo(selectedSeoPage, { [k]: v } as any)}
                />
              </ACard>

              <ACard>
                <ASectionTitle title="سکشن‌های صفحه اصلی" desc="نمایش/عدم نمایش و ترتیب بخش‌ها — محتوا از تب‌های دیگر مدیریت می‌شود" />
                <div className="space-y-2">
                  {(data.PAGE_SECTIONS?.['home'] || []).map((sec: any, i: number, arr: any[]) => (
                    <div key={sec.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] p-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-extrabold truncate">{sec.label}</span>
                        <span className="block text-[10px] nd-faint dir-ltr font-mono">{sec.name}</span>
                      </span>
                      <button
                        onClick={() => toggleSectionVisibility('home', sec.id)}
                        className={`nd-chip cursor-pointer ${sec.isHidden ? 'bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent' : 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent'}`}
                      >
                        {sec.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{sec.isHidden ? 'مخفی' : 'نمایش'}</span>
                      </button>
                      <span className="flex gap-0.5">
                        <button disabled={i === 0} onClick={() => reorderPageSection('home', i, i - 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
                        <button disabled={i === arr.length - 1} onClick={() => reorderPageSection('home', i, i + 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </ACard>

              <CollectionEditor
                title="برگه‌های سفارشی"
                desc="صفحه‌های جدید با آدرس دلخواه — مثل وردپرس «برگه» بسازید"
                arrayPath="CUSTOM_PAGES"
                fields={[
                  { key: 'title', label: 'عنوان برگه' },
                  { key: 'slug', label: 'آدرس (URL Slug)', dir: 'ltr', hint: 'مثلاً: free-analysis' },
                  { key: 'description', label: 'توضیح کوتاه', type: 'textarea', rows: 2 },
                  { key: 'showInMenu', label: 'در منوی سایت نمایش داده شود', type: 'toggle' },
                  { key: 'blocks', label: 'بلوک‌های محتوا', type: 'items', singular: 'بلوک', defaults: { type: 'text', title: '', content: '' }, fields: [
                    { key: 'type', label: 'نوع بلوک', type: 'select', options: [
                      { value: 'text', label: 'متن' },
                      { value: 'image', label: 'تصویر' },
                      { value: 'cta', label: 'دکمه فراخوان (CTA)' },
                      { value: 'features', label: 'لیست ویژگی‌ها' },
                      { value: 'faq', label: 'سوالات متداول' },
                    ] },
                    { key: 'title', label: 'عنوان بلوک' },
                    { key: 'content', label: 'متن بلوک', type: 'textarea', rows: 4 },
                    { key: 'imageUrl', label: 'تصویر بلوک', type: 'image' },
                    { key: 'buttonText', label: 'متن دکمه (برای CTA)' },
                    { key: 'buttonLink', label: 'لینک دکمه', dir: 'ltr' },
                    { key: 'items', label: 'آیتم‌ها (برای ویژگی‌ها/FAQ)', type: 'items', singular: 'آیتم', defaults: { title: '', desc: '' }, fields: [
                      { key: 'title', label: 'عنوان' },
                      { key: 'desc', label: 'توضیح', type: 'textarea', rows: 2 },
                    ] },
                  ] },
                ]}
                defaults={() => ({ id: 'custom-' + Date.now(), slug: 'page-' + Date.now().toString().slice(-5), title: 'برگه جدید', description: '', showInMenu: false, blocks: [] })}
                addLabel="ساخت برگه جدید"
                preview={(cp) => ({ title: cp.title, subtitle: `/${cp.slug}`, badges: [cp.showInMenu ? { text: 'در منو', tone: 'ok' as const } : { text: 'بدون منو', tone: 'muted' as const }] })}
              />
            </div>
          )}

          {/* ---------------- MEDIA ---------------- */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              <ASectionTitle
                title={`کتابخانه رسانه (${(data.MEDIA_LIBRARY || []).length})`}
                desc={persistence === 'cloud' ? 'فایل‌ها روی Cloudflare R2 ذخیره می‌شوند و از هر دستگاهی در دسترس‌اند' : 'حالت محلی: فایل‌ها فقط در همین مرورگر ذخیره می‌شوند'}
                action={
                  <button onClick={() => mediaFileRef.current?.click()} disabled={mediaBusy} className="nd-btn nd-btn-accent px-5 py-2.5 text-xs cursor-pointer disabled:opacity-50">
                    <Upload className="w-4 h-4" />
                    <span>{mediaBusy ? 'در حال آپلود…' : 'آپلود فایل جدید'}</span>
                  </button>
                }
              />
              <input ref={mediaFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleMediaUpload} />
              {(data.MEDIA_LIBRARY || []).length === 0 ? (
                <ACard className="text-center py-12"><p className="text-xs nd-muted">کتابخانه خالی است.</p></ACard>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(data.MEDIA_LIBRARY || []).map((m, i) => (
                    <ACard key={m.id} className="p-3! space-y-2">
                      <div className="aspect-square rounded-xl overflow-hidden bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)]">
                        <img src={m.url} alt={m.alt || m.title} loading="lazy" decoding="async" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <span className="block text-[10px] font-extrabold truncate">{m.title}</span>
                      <AInput placeholder="متن جایگزین (alt)…" value={m.alt || ''} onChange={(e) => updateField(`MEDIA_LIBRARY.${i}.alt`, e.target.value)} className="py-1.5! text-[10px]!" />
                      <span className="flex gap-1.5">
                        <button onClick={() => { navigator.clipboard.writeText(m.url); showToast('لینک کپی شد.'); }} className="nd-btn nd-btn-ghost px-2.5 py-1.5 text-[10px] grow cursor-pointer"><Link2 className="w-3 h-3" /><span>کپی لینک</span></button>
                        <button
                          onClick={async () => {
                            if (!confirm('این فایل حذف شود؟')) return;
                            const key = (m as any).key || (m.url.includes('key=') ? new URL(m.url, window.location.origin).searchParams.get('key') : decodeURIComponent(m.url.replace('/api/media/file/', '')));
                            if (key) await api.deleteMedia(key);
                            removeMediaItem(m.id);
                            showToast('فایل حذف شد.');
                          }}
                          className="p-1.5 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </ACard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------- SEO ---------------- */}
          {activeTab === 'seo' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle title="سئویسراسری سایت" desc="مقادیر پیش‌فرض برای همه صفحات" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="GLOBAL_SEO" item={data.GLOBAL_SEO} fields={[
                    { key: 'siteTitle', label: 'نام سایت' },
                    { key: 'titleTemplate', label: 'قالب عنوان صفحات', hint: 'مثلاً: %s | امید عدلی' },
                    { key: 'defaultMetaDesc', label: 'توضیحات متای پیش‌فرض', type: 'textarea', rows: 3 },
                    { key: 'defaultKeywords', label: 'کلمات کلیدی پیش‌فرض', hint: 'با کاما جدا کنید' },
                    { key: 'faviconUrl', label: 'فاوآیکون', type: 'image' },
                    { key: 'ogImage', label: 'تصویر پیش‌فرض اشتراک‌گذاری', type: 'image' },
                    { key: 'canonicalBaseUrl', label: 'آدرس پایه سایت', dir: 'ltr' },
                    { key: 'robotsTxt', label: 'متن robots.txt', type: 'textarea', rows: 4 },
                  ]} />
                </div>
              </ACard>
              <ACard>
                <ASectionTitle title="نقشه سایت و robots.txt" desc="خروجی آماده برای Google Search Console" />
                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => { setSitemapOut(generateSitemapXml()); showToast('sitemap.xml تولید شد.'); }} className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs cursor-pointer"><Wand2 className="w-4 h-4" /><span>ساخت sitemap.xml</span></button>
                  <button onClick={() => { setRobotsOut(generateRobotsTxt()); showToast('robots.txt تولید شد.'); }} className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs cursor-pointer"><Wand2 className="w-4 h-4" /><span>ساخت robots.txt</span></button>
                  {sitemapOut && <button onClick={() => downloadText('sitemap.xml', sitemapOut)} className="nd-btn nd-btn-accent px-4 py-2.5 text-xs cursor-pointer"><Download className="w-4 h-4" /><span>دانلود sitemap</span></button>}
                  {robotsOut && <button onClick={() => downloadText('robots.txt', robotsOut)} className="nd-btn nd-btn-accent px-4 py-2.5 text-xs cursor-pointer"><Download className="w-4 h-4" /><span>دانلود robots</span></button>}
                </div>
                {sitemapOut && <ATextarea rows={8} dir="ltr" readOnly value={sitemapOut} className="font-mono text-[10px]! text-left" />}
                {robotsOut && <ATextarea rows={4} dir="ltr" readOnly value={robotsOut} className="font-mono text-[10px]! text-left mt-3" />}
              </ACard>
            </div>
          )}

          {/* ---------------- CHAT / AI ASSISTANT ---------------- */}
          {activeTab === 'chat' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle
                  title="رفتار دستیار هوشمند"
                  desc="شخصیت، لحن و قوانین پاسخ‌دهی AI مشاور — ответы همیشه از داده‌های خود سایت ساخته می‌شوند"
                  action={
                    <button
                      onClick={async () => { setChatLog(await api.listChats()); showToast('تاریخچه گفتگوها دریافت شد.'); }}
                      className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>دریافت تاریخچه گفتگوها</span>
                    </button>
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="CHAT_CONFIG" item={data.CHAT_CONFIG} fields={[
                    { key: 'enabled', label: 'دستیار در سایت فعال باشد', type: 'toggle', hint: 'خاموش = ویجت چت به بازدیدکنندگان نمایش داده نمی‌شود' },
                    { key: 'title', label: 'نام دستیار (در هدر چت)' },
                    { key: 'greeting', label: 'پیام خوش‌آمدگویی', type: 'textarea', rows: 3 },
                    { key: 'persona', label: 'شخصیت و قوانین پاسخ‌دهی (System Prompt)', type: 'textarea', rows: 8, hint: 'لحن، مرزها و CTA را اینجا تعریف کنید' },
                    { key: 'quickQuestions', label: 'سوال‌های پیشنهادی (چیپ‌های سریع)', type: 'tags' },
                    { key: 'ctaText', label: 'متن دعوت به اقدام (انتهای پاسخ‌ها)', type: 'textarea', rows: 2 },
                    { key: 'fallbackMessage', label: 'پاسخ پیش‌فرض (وقتی جوابی پیدا نشد)', type: 'textarea', rows: 2 },
                  ]} />
                </div>
              </ACard>

              <ACard>
                <ASectionTitle title="تاریخچه گفتگوها (پایش رفتار)" desc="۲۰۰ گفتگوی آخر بازدیدکنندگان — ببینید چه چیزی می‌پرسند" />
                {chatLog === null ? (
                  <p className="text-xs nd-muted">برای دیدن تاریخچه، دکمه «دریافت تاریخچه گفتگوها» را بزنید.</p>
                ) : chatLog.length === 0 ? (
                  <p className="text-xs nd-muted">گفتگویی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {chatLog.map((c) => (
                      <div key={c.id} className="rounded-xl border border-[color:var(--nd-line)] p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold text-[color:var(--nd-accent)]">سوال: <span className="text-[color:var(--nd-ink)]">{c.question}</span></span>
                          <span className="text-[9px] nd-faint dir-ltr shrink-0">{new Date(c.created_at).toLocaleString('fa-IR')}</span>
                        </div>
                        <p className="text-[11px] nd-muted leading-relaxed whitespace-pre-wrap line-clamp-4">{c.answer}</p>
                        <span className="nd-chip text-[9px]">{c.mode === 'ai' ? '🤖 پاسخ Gemini' : '📚 پاسخ از داده سایت'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ACard>
            </div>
          )}

          {/* ---------------- LEADS ---------------- */}
          {activeTab === 'leads' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle
                  title="لیدها — درخواست‌های تماس و رزرو"
                  desc="۲۰۰ درخواست آخر ارسالی از فرم صفحه تماس و تقویم رزرو جلسه"
                  action={
                    <button
                      onClick={async () => { setLeads(await api.listLeads()); showToast('لیدها دریافت شد.'); }}
                      className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>دریافت لیدها</span>
                    </button>
                  }
                />
                {leads === null ? (
                  <p className="text-xs nd-muted">برای دیدن لیست، دکمه «دریافت لیدها» را بزنید.</p>
                ) : leads.length === 0 ? (
                  <p className="text-xs nd-muted">هنوز لیدی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-3 max-h-[28rem] overflow-y-auto pl-1">
                    {leads.map((l) => (
                      <div key={l.id} className="rounded-xl border border-[color:var(--nd-line)] p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold">{l.name}</span>
                            <span className="nd-chip text-[9px]">{l.source === 'booking' ? '📅 رزرو جلسه' : '✉️ فرم تماس'}</span>
                          </div>
                          <span className="text-[9px] nd-faint dir-ltr shrink-0">{new Date(l.created_at).toLocaleString('fa-IR')}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] nd-muted">
                          {l.email && <span>📧 <span className="dir-ltr inline-block">{l.email}</span></span>}
                          {l.contact && <span>📱 <span className="dir-ltr inline-block">{l.contact}</span></span>}
                          {l.website && <span>🔗 <span className="dir-ltr inline-block">{l.website}</span></span>}
                        </div>
                        {(l.service || l.goal) && <p className="text-[11px] font-bold text-[color:var(--nd-ink-2)]">{l.service || l.goal}</p>}
                        {l.booking_date && (
                          <p className="text-[11px] font-bold text-[color:var(--nd-accent)]">🗓 {l.booking_date} — ساعت {l.booking_time}</p>
                        )}
                        <p className="text-[11px] nd-muted leading-relaxed whitespace-pre-wrap">{l.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ACard>
            </div>
          )}

          {/* ---------------- AI TOOL ACCESS ---------------- */}
          {activeTab === 'toolaccess' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle
                  title="تنظیمات و تعرفه ابزارهای هوشمند"
                  desc="روشن/خاموش کردن کل بخش، قیمت هر ابزار، متن راهنمای خرید و کانال‌های ارتباطی (تلگرام، واتساپ، بله)."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="AI_TOOLS_CONFIG" item={data.AI_TOOLS_CONFIG} fields={[
                    { key: 'enabled', label: 'بخش ابزارهای هوشمند فعال باشد', type: 'toggle', hint: 'خاموش = به‌جای ابزارها پیام «به‌زودی» نمایش داده می‌شود' },
                    { key: 'purchaseNote', label: 'متن راهنمای خرید (داخل قفلِ ابزار)', type: 'textarea', rows: 3 },
                  ]} />
                </div>
                <div className="mt-4">
                  <ALabel>کانال‌های ارتباطی خرید</ALabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
                    <FieldsForm basePath="AI_TOOLS_CONFIG.channels" item={data.AI_TOOLS_CONFIG.channels} fields={[
                      { key: 'telegramUrl', label: 'لینک تلگرام' },
                      { key: 'whatsappUrl', label: 'لینک واتساپ' },
                      { key: 'baleUrl', label: 'لینک بله' },
                      { key: 'phone', label: 'شماره تماس (نمایشی)' },
                    ]} />
                  </div>
                </div>
                {/* Gamification: free trial + persuasion copy */}
                <div className="mt-5 rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-3">
                  <p className="text-xs font-black flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[color:var(--nd-accent)]" /> بازی‌وارسازی و تشویق به خرید</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="space-y-1.5">
                      <ALabel>پیام‌های رایگان (اقتصاد ۵۰۰ سکه هدیه / کسر ۱۵۰ سکه)</ALabel>
                      <AInput dir="ltr" type="number" min={0} value={String(data.AI_TOOLS_CONFIG.freeTrialCount ?? 3)} onChange={(e) => updateField('AI_TOOLS_CONFIG.freeTrialCount', parseInt(e.target.value, 10) || 0)} />
                      <p className="text-[10px] nd-faint">۳ پیام = ۵۰۰ سکه شروع (۱۵۰ کسر در هر پیام، ۵۰ سکه باقی‌مانده جهت تبدیل)</p>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <ALabel>جمله‌ی اعتمادساز (Social Proof)</ALabel>
                      <AInput value={data.AI_TOOLS_CONFIG.socialProof || ''} onChange={(e) => updateField('AI_TOOLS_CONFIG.socialProof', e.target.value)} placeholder="مثلاً: به بیش از ۱۲۰ مارکتر کمک کرده‌ایم" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <ALabel>جمله‌ی فوریت (Urgency)</ALabel>
                      <AInput value={data.AI_TOOLS_CONFIG.urgency || ''} onChange={(e) => updateField('AI_TOOLS_CONFIG.urgency', e.target.value)} placeholder="مثلاً: ظرفیت پشتیبانی این ماه محدود است" />
                    </div>
                  </div>
                </div>

                {/* Per-tool pricing (3 plans) + visibility */}
                <div className="mt-4 space-y-2">
                  <ALabel>قیمت پلن‌ها و نمایش هر ابزار</ALabel>
                  <p className="text-[10.5px] nd-faint">هر ابزار سه پلن بر اساس میزان مصرف دارد. برچسبِ قیمت هر پلن را می‌توانی اینجا بازنویسی کنی؛ خالی = قیمت پیش‌فرض.</p>
                  {AI_TOOLS.map((t) => {
                    const tc = (data.AI_TOOLS_CONFIG.tools?.[t.id] || { enabled: true }) as any;
                    return (
                      <div key={t.id} className="rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold">{t.name}</span>
                          <button
                            onClick={() => updateField(`AI_TOOLS_CONFIG.tools.${t.id}.enabled`, !(tc.enabled !== false))}
                            className={`nd-chip cursor-pointer ${tc.enabled !== false ? 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent' : 'bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent'}`}
                          >
                            {tc.enabled !== false ? 'نمایش' : 'مخفی'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {getPlans(t.id).map((p) => (
                            <div key={p.id} className="space-y-1">
                              <span className="text-[10.5px] font-bold nd-muted">{p.name}{p.popular ? ' ⭐' : ''}</span>
                              <AInput
                                dir="rtl"
                                placeholder={p.price}
                                value={tc.planPrices?.[p.id] || ''}
                                onChange={(e) => updateField(`AI_TOOLS_CONFIG.tools.${t.id}.planPrices.${p.id}`, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ACard>

              <ACard>
                <ASectionTitle
                  title="مدیریت رفتار و اتصال هوش مصنوعی (هر ابزار جداگانه)"
                  desc="برای هر ابزار، شخصیت و پیام‌ها را ویرایش کن و کلید API اختصاصیِ خودش را وصل کن. فیلدهای رفتار اگر خالی باشند، از مقدار پیش‌فرض ابزار استفاده می‌شود."
                />
                <div className="space-y-1.5 mb-4">
                  <ALabel>انتخاب ابزار</ALabel>
                  <ASelect value={selectedTool} onChange={(e) => setSelectedTool(e.target.value)}>
                    {AI_TOOLS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </ASelect>
                </div>

                {/* Behavior */}
                <div className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-3">
                  <p className="text-xs font-black flex items-center gap-1.5"><Bot className="w-4 h-4 text-[color:var(--nd-accent)]" /> مدیریت رفتار</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <FieldsForm
                      key={`beh-${selectedTool}`}
                      basePath={`AI_TOOLS_CONFIG.tools.${selectedTool}.behavior`}
                      item={(data.AI_TOOLS_CONFIG.tools?.[selectedTool] as any)?.behavior || {}}
                      fields={[
                        { key: 'persona', label: 'شخصیت و دستورالعمل (System Prompt)', type: 'textarea', rows: 8, hint: 'خالی = پرامپت پیش‌فرضِ همین ابزار' },
                        { key: 'welcome', label: 'پیام خوش‌آمدگویی', type: 'textarea', rows: 3 },
                        { key: 'suggestions', label: 'سوال‌های پیشنهادی (چیپ‌ها)', type: 'tags' },
                        { key: 'temperature', label: 'دما / خلاقیت (۰ تا ۲)', type: 'number', min: 0, max: 2, half: true },
                        { key: 'useDigest', label: 'اتصال به داده‌های سایت (Digest)', type: 'toggle', hint: 'برای ارجاع به خدمات امید عدلی' },
                      ]}
                    />
                  </div>
                </div>

                {/* AI connection / API token */}
                <div className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-3 mt-4">
                  <p className="text-xs font-black flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-emerald-500" /> اتصال و توکن API</p>
                  <div className={`text-[11px] rounded-lg px-3 py-2 ${currentSetting?.hasKey ? 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)]' : currentSetting?.usingEnvFallback ? 'bg-[color:var(--nd-peach-soft)] text-[#d97706]' : 'bg-red-50 text-red-600'}`}>
                    {currentSetting?.hasKey
                      ? <>کلید اختصاصی فعال است — <code dir="ltr">{currentSetting.keyMask}</code> ({currentSetting.provider})</>
                      : currentSetting?.usingEnvFallback
                        ? 'کلید اختصاصی ندارد؛ از کلید پیش‌فرض GEMINI_API_KEY استفاده می‌شود.'
                        : 'هیچ کلیدی تنظیم نشده — بدون کلید، ابزار با پاسخ‌های نمونه‌ی محلی کار می‌کند.'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <ALabel>سرویس‌دهنده</ALabel>
                      <ASelect value={keyForm.provider} onChange={(e) => setKeyForm((f) => ({ ...f, provider: e.target.value }))}>
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI / سازگار با OpenAI</option>
                      </ASelect>
                    </div>
                    <div className="space-y-1.5">
                      <ALabel>مدل (اختیاری)</ALabel>
                      <AInput dir="ltr" placeholder={keyForm.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'} value={keyForm.model} onChange={(e) => setKeyForm((f) => ({ ...f, model: e.target.value }))} />
                    </div>
                    {keyForm.provider === 'openai' && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <ALabel>Base URL (برای پروکسی‌های سازگار با OpenAI)</ALabel>
                        <AInput dir="ltr" placeholder="https://api.openai.com/v1" value={keyForm.baseUrl} onChange={(e) => setKeyForm((f) => ({ ...f, baseUrl: e.target.value }))} />
                      </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                      <ALabel>کلید API {currentSetting?.hasKey && '(خالی = بدون تغییر)'}</ALabel>
                      <AInput dir="ltr" type="password" placeholder="کلید API را اینجا وارد کن…" value={keyForm.apiKey} onChange={(e) => setKeyForm((f) => ({ ...f, apiKey: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleSaveKey} disabled={keyBusy} className="nd-btn nd-btn-accent px-5 py-2.5 text-[12px] cursor-pointer disabled:opacity-50">
                      <KeyRound className="w-4 h-4" /><span>{keyBusy ? 'در حال ذخیره…' : 'ذخیره اتصال'}</span>
                    </button>
                    {currentSetting?.hasKey && (
                      <button onClick={handleClearKey} className="nd-btn nd-btn-ghost px-4 py-2.5 text-[11px] cursor-pointer text-red-500">
                        <Trash2 className="w-3.5 h-3.5" /><span>حذف کلید</span>
                      </button>
                    )}
                    <button onClick={loadToolSettings} className="nd-btn nd-btn-ghost px-4 py-2.5 text-[11px] cursor-pointer">
                      <RotateCcw className="w-3.5 h-3.5" /><span>بازخوانی وضعیت</span>
                    </button>
                  </div>
                  <p className="text-[10.5px] nd-faint leading-relaxed">🔒 کلیدهای API فقط روی سرور و به‌صورت امن ذخیره می‌شوند و هرگز به‌صورت کامل به مرورگر برنمی‌گردند (فقط نمایش ماسک‌شده).</p>
                </div>
              </ACard>

              <ACard>
                <ASectionTitle
                  title="صدور دسترسی ابزار هوشمند"
                  desc="بعد از دریافت فیش واریزی، دسترسی را روی شماره‌ی موبایل مشتری باز کن. یک کد اختصاصی ساخته می‌شود که باید برای مشتری بفرستی."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <ALabel>شماره موبایل مشتری</ALabel>
                    <AInput dir="ltr" placeholder="09xxxxxxxxx" value={grantForm.phone} onChange={(e) => setGrantForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <ALabel>ابزار</ALabel>
                    <ASelect value={grantForm.productId} onChange={(e) => applyPlan(e.target.value, '')}>
                      <option value="all">همه ابزارها (اشتراک کامل)</option>
                      {AI_TOOLS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </ASelect>
                  </div>
                  <div className="space-y-1.5">
                    <ALabel>پلن (اختیاری — مقادیر زیر را پر می‌کند)</ALabel>
                    <ASelect value={grantForm.planId} onChange={(e) => applyPlan(grantForm.productId, e.target.value)} disabled={grantForm.productId === 'all'}>
                      <option value="">— دستی —</option>
                      {getPlans(grantForm.productId).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {p.price}</option>
                      ))}
                    </ASelect>
                    {grantForm.productId === 'all' && <p className="text-[10px] nd-faint">برای انتخاب پلن، یک ابزار مشخص را انتخاب کن.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <ALabel>مدت اعتبار (روز)</ALabel>
                    <AInput dir="ltr" type="number" value={grantForm.days} onChange={(e) => setGrantForm((f) => ({ ...f, days: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <ALabel>حداکثر دستگاه مجاز</ALabel>
                    <AInput dir="ltr" type="number" value={grantForm.maxDevices} onChange={(e) => setGrantForm((f) => ({ ...f, maxDevices: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <ALabel>سهمیه‌ی پیام (۰ = نامحدود)</ALabel>
                    <AInput dir="ltr" type="number" value={grantForm.messageQuota} onChange={(e) => setGrantForm((f) => ({ ...f, messageQuota: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <ALabel>یادداشت (اختیاری — مثلاً نام یا مبلغ)</ALabel>
                    <AInput value={grantForm.note} onChange={(e) => setGrantForm((f) => ({ ...f, note: e.target.value }))} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button onClick={handleGrant} disabled={grantBusy} className="nd-btn nd-btn-accent px-5 py-2.5 text-[12px] cursor-pointer disabled:opacity-50">
                    <KeyRound className="w-4 h-4" /><span>{grantBusy ? 'در حال صدور…' : 'صدور / تمدید دسترسی'}</span>
                  </button>
                  <button onClick={loadGrants} className="nd-btn nd-btn-ghost px-4 py-2.5 text-[11px] cursor-pointer">
                    <History className="w-3.5 h-3.5" /><span>دریافت لیست دسترسی‌ها</span>
                  </button>
                </div>

                {lastGrant && (
                  <div className="mt-4 rounded-xl border border-[color:var(--nd-success)]/40 bg-[color:var(--nd-mint-soft)] p-4 space-y-2">
                    <p className="text-[12px] font-black text-[color:var(--nd-success)] flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> دسترسی صادر شد</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                      <span>شماره: <b dir="ltr" className="inline-block">{lastGrant.phone}</b></span>
                      <span>ابزار: <b>{toolName(lastGrant.productId)}</b></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px]">کد دسترسی:</span>
                      <code dir="ltr" className="px-3 py-1 rounded-lg bg-white text-[color:var(--nd-ink)] font-black tracking-widest text-sm border border-[color:var(--nd-line)]">{lastGrant.code}</code>
                      <button onClick={() => { navigator.clipboard?.writeText(lastGrant.code); showToast('کد کپی شد.'); }} className="nd-btn nd-btn-ghost px-3 py-1.5 text-[11px] cursor-pointer"><Copy className="w-3.5 h-3.5" /><span>کپی</span></button>
                    </div>
                    <p className="text-[11px] nd-muted">این کد و شماره را به مشتری بده تا داخل ابزار وارد کند. دسترسی فقط روی {grantForm.maxDevices} دستگاه فعال می‌شود.</p>
                  </div>
                )}
              </ACard>

              <ACard>
                <ASectionTitle title="دسترسی‌های صادرشده" desc="مدیریت اشتراک‌ها — لغو یا آزادسازی دستگاه‌ها" />
                {grants === null ? (
                  <p className="text-xs nd-muted">برای دیدن لیست، دکمه «دریافت لیست دسترسی‌ها» را بزنید.</p>
                ) : grants.length === 0 ? (
                  <p className="text-xs nd-muted">هنوز دسترسی‌ای صادر نشده است.</p>
                ) : (
                  <div className="space-y-3 max-h-[30rem] overflow-y-auto pl-1">
                    {grants.map((g) => {
                      const expired = g.expiresAt && new Date(g.expiresAt).getTime() < Date.now();
                      return (
                        <div key={g.id} className="rounded-xl border border-[color:var(--nd-line)] p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-extrabold flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /><span dir="ltr">{g.phone}</span></span>
                              <span className="nd-chip text-[9px]">{toolName(g.productId)}</span>
                              <code dir="ltr" className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--nd-bg-soft)] border border-[color:var(--nd-line)] tracking-widest">{g.code}</code>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${g.status !== 'active' ? 'bg-red-100 text-red-600' : expired ? 'bg-amber-100 text-amber-700' : 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)]'}`}>
                              {g.status !== 'active' ? 'لغو‌شده' : expired ? 'منقضی' : 'فعال'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] nd-muted">
                            <span>دستگاه‌ها: <b>{g.devicesUsed}/{g.maxDevices}</b></span>
                            <span>سهمیه پیام: <b>{g.messageQuota ? g.messageQuota : 'نامحدود'}</b></span>
                            {g.expiresAt && <span>انقضا: <span dir="ltr">{new Date(g.expiresAt).toLocaleDateString('fa-IR')}</span></span>}
                            {g.note && <span>یادداشت: {g.note}</span>}
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button onClick={async () => { if (await api.resetToolDevices(g.id)) { showToast('دستگاه‌ها آزاد شد.'); loadGrants(); } }} className="nd-btn nd-btn-ghost px-3 py-1.5 text-[10px] cursor-pointer"><RotateCcw className="w-3 h-3" /><span>آزادسازی دستگاه‌ها</span></button>
                            {g.status === 'active' && (
                              <button onClick={async () => { if (await api.revokeToolAccess(g.id)) { showToast('دسترسی لغو شد.'); loadGrants(); } }} className="nd-btn nd-btn-ghost px-3 py-1.5 text-[10px] cursor-pointer text-red-500"><ShieldOff className="w-3 h-3" /><span>لغو دسترسی</span></button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ACard>

              <ACard>
                <ASectionTitle
                  title="تاریخچه استفاده از ابزارها"
                  desc="۲۰۰ پیام آخرِ کاربران در ابزارهای هوشمند — برای پایش کیفیت و رفتار."
                  action={
                    <button
                      onClick={async () => { setToolMsgs(await api.listToolMessages()); showToast('تاریخچه دریافت شد.'); }}
                      className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" /><span>دریافت تاریخچه</span>
                    </button>
                  }
                />
                {toolMsgs === null ? (
                  <p className="text-xs nd-muted">برای دیدن تاریخچه، دکمه «دریافت تاریخچه» را بزنید.</p>
                ) : toolMsgs.length === 0 ? (
                  <p className="text-xs nd-muted">هنوز پیامی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pl-1">
                    {toolMsgs.map((m) => (
                      <div key={m.id} className="rounded-xl border border-[color:var(--nd-line)] p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="nd-chip text-[9px]">{toolName(m.product_id)}</span>
                          <span className="text-[9px] nd-faint dir-ltr shrink-0">{m.phone} — {new Date(m.created_at).toLocaleString('fa-IR')}</span>
                        </div>
                        <p className="text-[11px] font-extrabold text-[color:var(--nd-accent)]">سوال: <span className="text-[color:var(--nd-ink)] font-normal">{m.question}</span></p>
                        <p className="text-[11px] nd-muted leading-relaxed whitespace-pre-wrap line-clamp-4">{m.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ACard>
            </div>
          )}

          {/* ---------------- APPEARANCE ---------------- */}
          {activeTab === 'appearance' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle
                  title="منوی اصلی سایت"
                  desc="ترتیب و عنوان آیتم‌های ناوبری"
                  action={
                    <button
                      onClick={() => {
                        addItem('NAVIGATION_MENU', { id: 'nav-' + Date.now(), label: 'آیتم جدید', pageSlug: 'home', isHidden: true, order: (data.NAVIGATION_MENU || []).length });
                        showToast('آیتم جدید اضافه شد (به‌صورت مخفی — وقتی آماده شد نمایشش دهید).');
                      }}
                      className="nd-btn nd-btn-accent px-4 py-2 text-[11px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /><span>افزودن آیتم منو</span>
                    </button>
                  }
                />
                <div className="space-y-2">
                  {(data.NAVIGATION_MENU || []).map((nav, nIdx) => (
                    <div key={nav.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] p-3">
                      <AInput className="w-40!" value={nav.label} onChange={(e) => updateField(`NAVIGATION_MENU.${nIdx}.label`, e.target.value)} />
                      <ASelect className="w-44!" value={nav.pageSlug} onChange={(e) => updateField(`NAVIGATION_MENU.${nIdx}.pageSlug`, e.target.value)}>
                        {PAGES_LIST.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        {(data.CUSTOM_PAGES || []).map((cp) => <option key={cp.id} value={cp.slug}>{cp.title} (سفارشی)</option>)}
                      </ASelect>
                      <button
                        onClick={() => updateField(`NAVIGATION_MENU.${nIdx}.isHidden`, !nav.isHidden)}
                        className={`nd-chip cursor-pointer ${!nav.isHidden ? 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent' : 'bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent'}`}
                      >
                        {!nav.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        <span>{!nav.isHidden ? 'نمایش' : 'مخفی'}</span>
                      </button>
                      <span className="flex gap-0.5 mr-auto">
                        <button disabled={nIdx === 0} onClick={() => moveItem('NAVIGATION_MENU', nIdx, nIdx - 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
                        <button disabled={nIdx === (data.NAVIGATION_MENU || []).length - 1} onClick={() => moveItem('NAVIGATION_MENU', nIdx, nIdx + 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => removeItem('NAVIGATION_MENU', nIdx)} className="p-1.5 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </ACard>

              <ACard>
                <ASectionTitle title="رنگ‌ها و ظاهر" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FieldsForm basePath="THEME_CONFIG" item={data.THEME_CONFIG} fields={[
                    { key: 'accentColor', label: 'رنگ اصلی برند', dir: 'ltr', hint: '#4f46e5' },
                    { key: 'secondaryColor', label: 'رنگ ثانویه', dir: 'ltr' },
                    { key: 'fontScale', label: 'ضریب اندازه فونت', type: 'number', min: 0.8, max: 1.3, half: true },
                  ]} />
                </div>
              </ACard>

              {persistence === 'local' && (
                <ACard>
                  <ASectionTitle title="رمز محلی مدیریت" desc="فقط در حالت توسعه (بدون اتصال به Cloudflare) استفاده می‌شود" />
                  <form onSubmit={handleChangePin} className="flex flex-wrap items-end gap-3">
                    <div className="w-40">
                      <ALabel>رمز فعلی</ALabel>
                      <AInput type="password" dir="ltr" value={oldPinInput} onChange={(e) => setOldPinInput(e.target.value)} />
                    </div>
                    <div className="w-40">
                      <ALabel>رمز جدید</ALabel>
                      <AInput type="password" dir="ltr" value={newPinInput} onChange={(e) => setNewPinInput(e.target.value)} />
                    </div>
                    <button type="submit" className="nd-btn nd-btn-accent px-5 py-2.5 text-xs cursor-pointer"><span>تغییر رمز</span></button>
                    {pinChangeMsg && <span className="text-[11px] font-extrabold text-[color:var(--nd-accent)] w-full">{pinChangeMsg}</span>}
                  </form>
                </ACard>
              )}
            </div>
          )}

          {/* ---------------- SETTINGS ---------------- */}
          {activeTab === 'settings' && (
            <div className="space-y-8">
              <ACard>
                <ASectionTitle title="پشتیبان‌گیری و بازیابی" desc="خروجی/ورود کامل محتوا به‌صورت JSON" />
                <div className="flex flex-wrap gap-2 mb-3">
                  <button onClick={() => { createSnapshot(); showToast('اسنپ‌شات ذخیره شد.'); }} className="nd-btn nd-btn-accent px-4 py-2.5 text-xs cursor-pointer"><Copy className="w-4 h-4" /><span>ایجاد اسنپ‌شات فوری</span></button>
                  <button onClick={() => { exportJSON(); showToast('فایل بکاپ دانلود شد.'); }} className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs cursor-pointer"><Download className="w-4 h-4" /><span>دانلود بکاپ JSON</span></button>
                  <button onClick={() => importFileRef.current?.click()} className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs cursor-pointer"><Upload className="w-4 h-4" /><span>بازیابی از فایل</span></button>
                  <input ref={importFileRef} type="file" accept="application/json" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onloadend = () => {
                      if (typeof r.result === 'string' && importJSON(r.result)) showToast('بکاپ با موفقیت بازیابی شد.');
                      else showToast('فایل JSON معتبر نیست.');
                    };
                    r.readAsText(f);
                    e.target.value = '';
                  }} />
                </div>
                <ALabel>یا JSON را مستقیم اینجا paste کنید</ALabel>
                <ATextarea rows={4} dir="ltr" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "PERSONAL_INFO": … }' className="font-mono text-[10px]! text-left" />
                <button onClick={() => { if (!importText.trim()) return; if (importJSON(importText)) { showToast('بازیابی انجام شد.'); setImportText(''); } else showToast('JSON نامعتبر است.'); }} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] mt-2 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /><span>بازیابی از متن</span></button>
              </ACard>

              <ACard>
                <ASectionTitle title="تاریخچه نسخه‌ها (اسنپ‌شات‌ها)" desc="۲۰ نسخه آخر — امکان بازگشت فوری" />
                <div className="space-y-2">
                  {(data.VERSION_HISTORY || []).map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--nd-line)] p-3">
                      <span className="min-w-0">
                        <span className="block text-xs font-extrabold truncate">{snap.label}</span>
                        <span className="block text-[10px] nd-faint">{snap.timestamp}</span>
                      </span>
                      <span className="flex gap-1.5 shrink-0">
                        <button onClick={() => { if (confirm('بازگشت به این نسخه؟ تغییرات بعد از آن از دست می‌رود.')) { rollbackSnapshot(snap.id); showToast('به نسخه انتخابی بازگشتید.'); } }} className="nd-btn nd-btn-ghost px-3 py-1.5 text-[10px] cursor-pointer"><History className="w-3 h-3" /><span>بازگشت</span></button>
                        <button onClick={() => deleteSnapshot(snap.id)} className="p-1.5 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    </div>
                  ))}
                  {(data.VERSION_HISTORY || []).length === 0 && <p className="text-xs nd-muted">اسنپ‌شاتی وجود ندارد.</p>}
                </div>
              </ACard>

              <ACard>
                <ASectionTitle title="گزارش رویدادها" desc="۵۰ رویداد اخیر پنل" />
                <div className="max-h-72 overflow-y-auto space-y-1.5">
                  {(data.AUDIT_LOGS || []).map((log) => (
                    <div key={log.id} className="flex items-start justify-between gap-3 text-[11px] border-b border-[color:var(--nd-line)] pb-1.5 last:border-0">
                      <span><span className="font-extrabold">{log.action}</span> <span className="nd-muted">— {log.details}</span></span>
                      <span className="nd-faint shrink-0 dir-ltr text-[10px]">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              </ACard>

              <ACard className="border-[#dc2626]/40">
                <ASectionTitle title="منطقه خطر" desc="بازنشانی کل سایت به محتوای کارخانه" />
                <button onClick={() => setConfirmReset(true)} className="nd-btn px-5 py-2.5 text-xs bg-[#dc2626] text-white hover:bg-[#b91c1c] cursor-pointer">
                  <RotateCcw className="w-4 h-4" />
                  <span>بازنشانی کامل محتوا</span>
                </button>
              </ACard>
            </div>
          )}
        </main>
      </div>

      <AConfirm
        open={confirmReset}
        message="همه‌ی تغییرات محتوا حذف و سایت به حالت اولیه برمی‌گردد. قبل از ادامه مطمئن شوید بکاپ گرفته‌اید. ادامه می‌دهید؟"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { resetToDefaults(); setConfirmReset(false); showToast('سایت به حالت اولیه بازنشانی شد.'); }}
      />
    </div>
  );

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};
