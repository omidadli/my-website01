import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Sparkles,
  Zap,
  TrendingUp,
  Cpu,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  Bot,
  Sliders,
  DollarSign,
  Activity,
  Layers,
  FileText,
  UserCheck,
} from 'lucide-react';
import { ProductItem, ProductApiKey, ProductPlan } from '../../types';
import { createDefaultSectionKeys, KEYS_PER_SECTION } from '../../../lib/aiKeys';
import { api } from '../../services/api';
import { ACard, ASectionTitle, ALabel, AInput, ATextarea, ASelect, AToggle, ABadge } from './ui';

interface Props {
  products: ProductItem[];
  data: any;
  updateField: (path: string, val: any) => void;
  onToast: (msg: string) => void;
}

type TabType = 'sell' | 'keys' | 'plans' | 'ai' | 'license';

export const ProductSyncManager: React.FC<Props> = ({ products = [], data, updateField, onToast }) => {
  const [selectedId, setSelectedId] = useState<string>(products[0]?.id || 'business-therapist');
  const [activeSubTab, setActiveSubTab] = useState<TabType>('sell');

  // Multi-key state per product
  const [toolSettings, setToolSettings] = useState<any[]>([]);
  const [envKeyPresent, setEnvKeyPresent] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Form for the 5 key slots of the selected product
  const [keysForm, setKeysForm] = useState<ProductApiKey[]>(
    createDefaultSectionKeys('business-therapist').map((k) => ({ ...k }))
  );
  const [savingKeys, setSavingKeys] = useState(false);

  // Test status per key slot (0 … 4)
  const [testResults, setTestResults] = useState<Record<number, { busy: boolean; ok?: boolean; latencyMs?: number; model?: string; reply?: string; error?: string }>>({});
  const [testingAll, setTestingAll] = useState(false);

  // Grants state
  const [grants, setGrants] = useState<any[]>([]);
  const [grantPhone, setGrantPhone] = useState('');
  const [grantPlanId, setGrantPlanId] = useState('pro');
  const [grantBusy, setGrantBusy] = useState(false);
  const [lastGrantResult, setLastGrantResult] = useState<{ phone: string; code: string; expiresAt?: string } | null>(null);

  // Selected product index & object
  const currentProductIndex = products.findIndex((p) => p.id === selectedId);
  const currentProduct: ProductItem | undefined = products[currentProductIndex] || products[0];

  // Load tool settings from server
  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await api.listToolSettings();
      setToolSettings(res.items || []);
      setEnvKeyPresent(res.envKeyPresent);
    } catch {
      /* ignore */
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadGrants = async () => {
    try {
      const items = await api.listToolAccess();
      setGrants(items || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadSettings();
    loadGrants();
  }, []);

  // Sync keysForm when selected product or toolSettings change
  useEffect(() => {
    if (!currentProduct) return;
    const setting = toolSettings.find((s) => s.productId === currentProduct.id);
    const defaults: ProductApiKey[] = createDefaultSectionKeys(currentProduct.id).map((k) => ({ ...k }));

    if (setting?.keys && Array.isArray(setting.keys) && setting.keys.length > 0) {
      const filled = defaults.map((def, i) => {
        const found = setting.keys.find((k: any) => k.id === `key-${i + 1}`) || setting.keys[i];
        return {
          id: `key-${i + 1}`,
          label: found?.label || def.label,
          provider: (found?.provider === 'openai' ? 'openai' : 'gemini') as 'gemini' | 'openai',
          baseUrl: found?.baseUrl || def.baseUrl,
          model: found?.model || def.model,
          apiKey: '', // never exposed from server
          hasKey: !!found?.hasKey,
          keyMask: found?.keyMask || '',
          enabled: found?.enabled !== false,
        };
      });
      setKeysForm(filled);
    } else {
      setKeysForm(defaults);
    }
    setTestResults({});
  }, [currentProduct?.id, toolSettings]);

  // Update a field on the current product inside data.PRODUCTS
  const updateProductProp = (prop: keyof ProductItem | string, value: any) => {
    if (currentProductIndex < 0) return;
    updateField(`PRODUCTS.${currentProductIndex}.${prop}`, value);

    // If it's behavior, also keep AI_TOOLS_CONFIG.tools[id].behavior in sync
    if (prop === 'behavior') {
      updateField(`AI_TOOLS_CONFIG.tools.${currentProduct.id}.behavior`, value);
    }
  };

  // Save the 5 keys to server
  const handleSaveKeys = async () => {
    if (!currentProduct) return;
    setSavingKeys(true);
    const res = await api.setProductKeys({
      productId: currentProduct.id,
      keys: keysForm.map((k) => ({
        id: k.id,
        label: k.label,
        provider: k.provider,
        baseUrl: k.baseUrl,
        model: k.model,
        apiKey: k.apiKey,
        enabled: k.enabled,
      })),
    });
    setSavingKeys(false);

    if (res.ok) {
      onToast(`اتصال ۵ کلید API برای «${currentProduct.title}» با موفقیت ذخیره شد.`);
      await loadSettings();
    } else {
      onToast(res.error || 'خطا در ذخیره کلیدها');
    }
  };

  // Test a single key slot (0 … 4)
  const handleTestKey = async (slotIndex: number) => {
    if (!currentProduct) return;
    const target = keysForm[slotIndex];
    if (!target) return;

    setTestResults((prev) => ({ ...prev, [slotIndex]: { busy: true } }));

    const res = await api.testToolKey({
      productId: currentProduct.id,
      keyIndex: slotIndex,
      provider: target.provider,
      baseUrl: target.baseUrl,
      model: target.model,
      apiKey: target.apiKey || undefined,
    });

    setTestResults((prev) => ({
      ...prev,
      [slotIndex]: {
        busy: false,
        ok: res.ok,
        latencyMs: res.latencyMs,
        model: res.model,
        reply: res.reply,
        error: res.error,
      },
    }));

    if (res.ok) {
      onToast(`کلید ${slotIndex + 1} متصل است (${res.latencyMs}ms)`);
    } else {
      onToast(`خطا در تست کلید ${slotIndex + 1}: ${res.error || 'عدم ارتباط'}`);
    }
  };

  // Test all 5 key slots
  const handleTestAllKeys = async () => {
    setTestingAll(true);
    await Promise.all(Array.from({ length: KEYS_PER_SECTION }, (_, i) => handleTestKey(i)));
    setTestingAll(false);
  };

  // Clear a key slot
  const handleClearKeySlot = async (slotIndex: number) => {
    if (!currentProduct) return;
    const ok = await api.clearToolKey(currentProduct.id, slotIndex);
    if (ok) {
      onToast(`کلید ${slotIndex + 1} حذف شد.`);
      setKeysForm((prev) =>
        prev.map((k, i) => (i === slotIndex ? { ...k, apiKey: '', hasKey: false, keyMask: '' } : k))
      );
      setTestResults((prev) => ({ ...prev, [slotIndex]: { busy: false } }));
      await loadSettings();
    }
  };

  // Grant access
  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct || !grantPhone.trim()) return;
    setGrantBusy(true);
    const plan = currentProduct.plans?.find((p) => p.id === grantPlanId) || currentProduct.plans?.[0];
    const res = await api.grantToolAccess({
      phone: grantPhone,
      productId: currentProduct.id,
      planId: grantPlanId,
      days: plan?.durationDays || 30,
      maxDevices: plan?.maxDevices || 1,
      messageQuota: plan?.messageQuota || 0,
      note: `صدور از پنل مدیریت — پلن ${plan?.name || ''}`,
    });
    setGrantBusy(false);

    if (res.ok && res.code) {
      setLastGrantResult({ phone: grantPhone, code: res.code, expiresAt: res.expiresAt });
      onToast(`کد دسترسی «${res.code}» برای شماره ${grantPhone} صادر شد.`);
      setGrantPhone('');
      await loadGrants();
    } else {
      onToast(res.error || 'صدور دسترسی ناموفق بود.');
    }
  };

  if (!currentProduct) {
    return (
      <ACard>
        <p className="text-center text-sm nd-muted py-8">هیچ محصولی در دیتابیس یافت نشد.</p>
      </ACard>
    );
  }

  // Calculate health badge for a product
  const getProductKeyHealth = (prodId: string) => {
    const s = toolSettings.find((x) => x.productId === prodId);
    if (!s) return { count: 0, text: 'نامشخص', tone: 'muted' as const };
    const validCount = (s.keys || []).filter((k: any) => k.hasKey && k.enabled).length;
    if (validCount === 3) return { count: 3, text: '۳ از ۳ کلید متصل', tone: 'ok' as const };
    if (validCount > 0) return { count: validCount, text: `${validCount} کلید متصل`, tone: 'warn' as const };
    if (s.usingEnvFallback) return { count: 0, text: 'فال‌بک محیطی (GEMINI)', tone: 'warn' as const };
    return { count: 0, text: 'بدون کلید', tone: 'muted' as const };
  };

  const productGrants = grants.filter((g) => g.productId === currentProduct.id || g.productId === 'all');

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Banner: Sync & Overview */}
      <ACard className="bg-gradient-to-r from-[color:var(--nd-accent-soft)] via-transparent to-transparent border-[color:var(--nd-accent)]/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[color:var(--nd-accent)]" />
              <h2 className="text-base sm:text-lg font-black">مدیریت و همگام‌سازی محصولات هوشمند (۳ کلید API)</h2>
              <span className="nd-chip bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[11px] font-bold">
                ✓ همگام با دیتابیس و فروشگاه
              </span>
            </div>
            <p className="text-xs nd-muted leading-relaxed">
              هر محصول دارای اطلاعات بازاریابی و فروش، توجیه اقتصادی، پلن‌های قیمت‌گذاری، و ۳ کلید API اختصاصی (Failover سه‌گانه) است.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                loadSettings();
                loadGrants();
                onToast('اطلاعات محصولات و اتصال‌ها بازخوانی شد.');
              }}
              disabled={loadingSettings}
              className="nd-btn nd-btn-ghost px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSettings ? 'animate-spin' : ''}`} />
              <span>بازخوانی اتصال‌ها</span>
            </button>
          </div>
        </div>
      </ACard>

      {/* Product Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {products.map((p) => {
          const isSelected = p.id === selectedId;
          const health = getProductKeyHealth(p.id);
          return (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setTestResults({});
              }}
              className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                isSelected
                  ? 'border-[color:var(--nd-accent)] bg-[color:var(--nd-surface)] ring-2 ring-[color:var(--nd-accent)]/30 shadow-md'
                  : 'border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] hover:border-[color:var(--nd-line-strong)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <span className="text-xs font-black text-[color:var(--nd-ink)] line-clamp-1">{p.title}</span>
                <ABadge tone={p.status === 'draft' ? 'warn' : 'ok'}>
                  {p.status === 'draft' ? 'پیش‌نویس' : 'منتشرشده'}
                </ABadge>
              </div>

              <p className="text-[11px] nd-muted line-clamp-2 leading-relaxed">{p.tagline || p.description}</p>

              <div className="flex items-center justify-between gap-1 w-full pt-2 border-t border-[color:var(--nd-line)]/50 text-[10.5px]">
                <span className="font-extrabold text-[color:var(--nd-accent)]">{p.price || 'تماس'}</span>
                <span className={`inline-flex items-center gap-1 font-bold ${health.count > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <KeyRound className="w-3 h-3" />
                  {health.text}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Product Workspace */}
      <ACard className="space-y-6">
        {/* Product Workspace Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[color:var(--nd-line)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs nd-chip bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] border-transparent font-black">
                {currentProduct.badge || 'محصول'}
              </span>
              <h3 className="text-lg font-black text-[color:var(--nd-ink)]">{currentProduct.title}</h3>
            </div>
            <p className="text-xs nd-muted">{currentProduct.tagline}</p>
          </div>

          {/* Subtabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[color:var(--nd-bg-soft)] rounded-xl border border-[color:var(--nd-line)]">
            <button
              onClick={() => setActiveSubTab('sell')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'sell' ? 'bg-[color:var(--nd-accent)] text-white shadow-sm' : 'nd-muted hover:text-[color:var(--nd-ink)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>اطلاعات و توجیه فروش</span>
            </button>
            <button
              onClick={() => setActiveSubTab('keys')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'keys' ? 'bg-[color:var(--nd-accent)] text-white shadow-sm' : 'nd-muted hover:text-[color:var(--nd-ink)]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>اتصال ۳ کلید API</span>
            </button>
            <button
              onClick={() => setActiveSubTab('plans')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'plans' ? 'bg-[color:var(--nd-accent)] text-white shadow-sm' : 'nd-muted hover:text-[color:var(--nd-ink)]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>پلن‌های قیمت‌گذاری</span>
            </button>
            <button
              onClick={() => setActiveSubTab('ai')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'ai' ? 'bg-[color:var(--nd-accent)] text-white shadow-sm' : 'nd-muted hover:text-[color:var(--nd-ink)]'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>شخصیت و رفتار AI</span>
            </button>
            <button
              onClick={() => setActiveSubTab('license')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'license' ? 'bg-[color:var(--nd-accent)] text-white shadow-sm' : 'nd-muted hover:text-[color:var(--nd-ink)]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>صدور لایسنس ({productGrants.length})</span>
            </button>
          </div>
        </div>

        {/* ---------------- SUBTAB 1: SELLABLE INFO & ROI ---------------- */}
        {activeSubTab === 'sell' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <ALabel>نام کامل محصول</ALabel>
                <AInput
                  value={currentProduct.title || ''}
                  onChange={(e) => updateProductProp('title', e.target.value)}
                  placeholder="مثال: تراپیست بیزینسی و منتور مارکتینگ"
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>وضعیت انتشار</ALabel>
                <ASelect
                  value={currentProduct.status || 'published'}
                  onChange={(e) => updateProductProp('status', e.target.value)}
                >
                  <option value="published">منتشرشده (نمایش در سایت)</option>
                  <option value="draft">پیش‌نویس (مخفی از دید کاربران)</option>
                </ASelect>
              </div>

              <div className="space-y-1.5 sm:col-span-3">
                <ALabel>شعار و قلاب ارزش‌آفرین (Tagline)</ALabel>
                <AInput
                  value={currentProduct.tagline || ''}
                  onChange={(e) => updateProductProp('tagline', e.target.value)}
                  placeholder="یک خط توضیح جذاب و محرک خرید..."
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>نشان هدر (Badge)</ALabel>
                <AInput
                  value={currentProduct.badge || ''}
                  onChange={(e) => updateProductProp('badge', e.target.value)}
                  placeholder="مثال: مشاور مارکتینگ اختصاصی"
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>نام آیکون 3D (Icon Name)</ALabel>
                <AInput
                  dir="ltr"
                  value={currentProduct.iconName || 'target'}
                  onChange={(e) => updateProductProp('iconName', e.target.value)}
                  placeholder="megaphone / rocket / target / chart"
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>رنگ جلوه (Glow)</ALabel>
                <ASelect
                  dir="ltr"
                  value={currentProduct.glow || 'magenta'}
                  onChange={(e) => updateProductProp('glow', e.target.value)}
                >
                  <option value="magenta">Magenta (صورتی بنفش)</option>
                  <option value="blue">Blue (آبی نئونی)</option>
                  <option value="purple">Purple (بنفش عمیق)</option>
                  <option value="emerald">Emerald (سبز زمردی)</option>
                </ASelect>
              </div>
            </div>

            {/* Crucial Section: Why Buy / Justification & ROI */}
            <div className="rounded-2xl border-2 border-[color:var(--nd-accent)]/30 bg-[color:var(--nd-accent-soft)]/20 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[color:var(--nd-accent)]" />
                <h4 className="text-sm font-black text-[color:var(--nd-ink)]">
                  توجیه خرید و ارزش اقتصادی محصول (ROI Justification)
                </h4>
                <span className="text-[10px] nd-chip bg-[color:var(--nd-accent)] text-white border-transparent">
                  مهم‌ترین بخش برای توجیه خرید کاربر
                </span>
              </div>
              <p className="text-xs nd-muted leading-relaxed">
                این متن دقیقاً به خریدار نشان می‌دهد چرا هزینه کردن برای این ابزار، سرمایه‌گذاری پرسود است و چگونه در برابر مشاوره انسانی یا خطاهای پرهزینه، ده‌ها میلیون تومان صرفه‌جویی ایجاد می‌کند.
              </p>
              <ATextarea
                rows={4}
                value={currentProduct.whyBuy || ''}
                onChange={(e) => updateProductProp('whyBuy', e.target.value)}
                placeholder="مثال: هزینه ۱ ساعت مشاوره اختصاصی بین ۲.۵ تا ۱۰ میلیون تومان است؛ با هزینه تنها ۱ اشتراک ماهانه، ۲۴ ساعته بدون اتلاف وقت مشاور ارشد در اختیار دارید..."
              />
            </div>

            {/* Pain point & Audience */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <ALabel>درد و چالش مشتری که ابزار حل می‌کند (Problem Solved)</ALabel>
                <ATextarea
                  rows={3}
                  value={currentProduct.problemSolved || ''}
                  onChange={(e) => updateProductProp('problemSolved', e.target.value)}
                  placeholder="سوختن بودجه ادز، سردرگمی در تحلیل داده‌ها، افت نرخ تبدیل..."
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>این محصول برای چه کسانی ضروری است؟ (Target Audience)</ALabel>
                <ATextarea
                  rows={3}
                  value={currentProduct.targetAudience || ''}
                  onChange={(e) => updateProductProp('targetAudience', e.target.value)}
                  placeholder="مارکترها، صاحبان فروشگاه، فریلنسرها..."
                />
              </div>
            </div>

            {/* Full Description */}
            <div className="space-y-1.5">
              <ALabel>توضیحات کامل و متقاعدکننده محصول (Full Description)</ALabel>
              <ATextarea
                rows={4}
                value={currentProduct.description || ''}
                onChange={(e) => updateProductProp('description', e.target.value)}
              />
            </div>

            {/* Features list */}
            <div className="space-y-2">
              <ALabel hint="هر مورد در یک خط">ویژگی‌ها و قابلیت‌های کلیدی (Features & Deliverables)</ALabel>
              <ATextarea
                rows={4}
                value={(currentProduct.features || []).join('\n')}
                onChange={(e) =>
                  updateProductProp(
                    'features',
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="تحلیل عمیق فانل فروش&#10;محاسبه و تحلیل متریک‌های پیشرفته (ROAS, CAC)&#10;چک‌لیست ۳ مرحله‌ای عملیاتی..."
              />
            </div>

            {/* How it works */}
            <div className="space-y-2">
              <ALabel hint="۳ مرحله گام‌به‌گام (هر مرحله در یک خط)">مراحل نحوه کارکرد (How it works)</ALabel>
              <ATextarea
                rows={3}
                value={(currentProduct.howItWorks || []).join('\n')}
                onChange={(e) =>
                  updateProductProp(
                    'howItWorks',
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="۱. چالش یا متریک کمپینت را بنویس&#10;۲. دستیار ریشه مسئله را با دید تحلیلی کالبدشکافی می‌کند&#10;۳. چک‌لیست ۳ اقدام مشخص همین هفته را تحویل بگیر"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <ALabel>برچسب قیمت پایه روی کارت</ALabel>
                <AInput
                  value={currentProduct.price || ''}
                  onChange={(e) => updateProductProp('price', e.target.value)}
                  placeholder="شروع از ۵۹۰٬۰۰۰ تومان"
                />
              </div>
              <div className="space-y-1.5">
                <ALabel>متن دکمه اکشن (CTA Button)</ALabel>
                <AInput
                  value={currentProduct.actionText || 'شروع گفتگو و تست رایگان'}
                  onChange={(e) => updateProductProp('actionText', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ---------------- SUBTAB 2: 3 API KEYS CONNECTION ---------------- */}
        {activeSubTab === 'keys' && (
          <div className="space-y-6">
            {/* Architecture Banner */}
            <div className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <h4 className="text-sm font-black text-[color:var(--nd-ink)]">
                  معماری اتصال ۵ کلید API با سیستم Failover خودکار
                </h4>
              </div>
              <p className="text-xs nd-muted leading-relaxed">
                برای محصول «{currentProduct.title}» ۵ کلید مستقل با اولویت ۱ (اصلی) تا ۵ (پشتیبان چهارم) تعریف کنید. در گفتگوی کاربر، سیستم ابتدا از کلیدِ همان گفتگو استفاده می‌کند؛ اگر کلید به سقف مصرف (Rate Limit 429) بخورد یا خطای شبکه رخ دهد، خودکار روی کلید سالم بعدی سوئیچ می‌کند — و پیش از پاسخ، چت‌های قبلی همان گفتگو را مرور می‌کند تا ادامه‌ی مکالمه طبیعی بماند. مدیریت متمرکز همه‌ی بخش‌ها (این محصول، دستیار سایت و اسلاگ سئو) در تب «کلیدهای API» است.
              </p>
              {envKeyPresent && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 text-[11px] font-bold">
                  <span>فال‌بک نهایی: کلید محیطی GEMINI_API_KEY در صورت در دسترس نبودن کلیدهای اختصاصی فعال است.</span>
                </div>
              )}
            </div>

            {/* 5 key slots */}
            <div className="space-y-4">
              {keysForm.map((k, slotIdx) => {
                const priorityLabels = [
                  { title: 'کلید ۱ (اصلی - Primary)', desc: 'اولویت اول در کلیه درخواست‌های کاربران', badge: 'اولویت ۱', tone: 'accent' as const },
                  { title: 'کلید ۲ (پشتیبان اول - Secondary)', desc: 'جایگزین فوری در صورت خطای ۴۲۹ یا اتمام سهمیه کلید ۱', badge: 'اولویت ۲', tone: 'ok' as const },
                  { title: 'کلید ۳ (پشتیبان دوم - Backup 2)', desc: 'سومین گزینه‌ی چرخش خودکار کلیدها', badge: 'اولویت ۳', tone: 'warn' as const },
                  { title: 'کلید ۴ (پشتیبان سوم - Backup 3)', desc: 'چهارمین گزینه؛ توصیه می‌شود روی سرویس‌دهنده‌ی دیگری باشد', badge: 'اولویت ۴', tone: 'warn' as const },
                  { title: 'کلید ۵ (پشتیبان چهارم - Backup 4)', desc: 'آخرین خط دفاعی پیش از کلید محیطی', badge: 'اولویت ۵', tone: 'warn' as const },
                ];
                const meta = priorityLabels[slotIdx] || { title: `کلید ${slotIdx + 1}`, desc: 'اسلات پشتیبان', badge: `اولویت ${slotIdx + 1}`, tone: 'warn' as const };
                const test = testResults[slotIdx];

                return (
                  <div
                    key={k.id}
                    className={`rounded-2xl border p-5 space-y-4 transition-all ${
                      k.hasKey
                        ? 'border-emerald-500/40 bg-emerald-500/[0.02]'
                        : 'border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-[color:var(--nd-accent)]/15 text-[color:var(--nd-accent)] flex items-center justify-center font-black text-xs">
                          {slotIdx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[color:var(--nd-ink)]">{meta.title}</span>
                            <ABadge tone={meta.tone}>{meta.badge}</ABadge>
                            {k.hasKey ? (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> متصل (<code dir="ltr">{k.keyMask}</code>)
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> تنظیم نشده
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] nd-faint mt-0.5">{meta.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <AToggle
                          checked={k.enabled !== false}
                          onChange={(v) => {
                            setKeysForm((prev) =>
                              prev.map((item, idx) => (idx === slotIdx ? { ...item, enabled: v } : item))
                            );
                          }}
                          label={k.enabled !== false ? 'فعال' : 'غیرفعال'}
                        />
                        {k.hasKey && (
                          <button
                            type="button"
                            onClick={() => handleClearKeySlot(slotIdx)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer"
                            title="حذف کلید این اسلات"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                      <div className="space-y-1">
                        <ALabel>سرویس‌دهنده هوش مصنوعی</ALabel>
                        <ASelect
                          value={k.provider}
                          onChange={(e) => {
                            const val = e.target.value as 'gemini' | 'openai';
                            setKeysForm((prev) =>
                              prev.map((item, idx) =>
                                idx === slotIdx
                                  ? {
                                      ...item,
                                      provider: val,
                                      model: val === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash',
                                      baseUrl: val === 'openai' ? 'https://api.openai.com/v1' : '',
                                    }
                                  : item
                              )
                            );
                          }}
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="openai">OpenAI / پروکسی سازگار</option>
                        </ASelect>
                      </div>

                      <div className="space-y-1">
                        <ALabel>مدل انتخابی</ALabel>
                        <AInput
                          dir="ltr"
                          placeholder={k.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'}
                          value={k.model || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKeysForm((prev) =>
                              prev.map((item, idx) => (idx === slotIdx ? { ...item, model: val } : item))
                            );
                          }}
                        />
                      </div>

                      {k.provider === 'openai' && (
                        <div className="space-y-1 sm:col-span-2">
                          <ALabel>آدرس Base URL (پروکسی یا سرور اختصاصی)</ALabel>
                          <AInput
                            dir="ltr"
                            placeholder="https://api.openai.com/v1"
                            value={k.baseUrl || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setKeysForm((prev) =>
                                prev.map((item, idx) => (idx === slotIdx ? { ...item, baseUrl: val } : item))
                              );
                            }}
                          />
                        </div>
                      )}

                      <div className={`space-y-1 ${k.provider === 'openai' ? 'sm:col-span-4' : 'sm:col-span-2'}`}>
                        <ALabel>
                          کلید API {k.hasKey && <span className="nd-muted font-normal">(خالی = بدون تغییر)</span>}
                        </ALabel>
                        <AInput
                          dir="ltr"
                          type="password"
                          placeholder={k.hasKey ? `کلید ثبت شده: ${k.keyMask} (برای تغییر بنویسید)` : 'کلید API را اینجا وارد کنید...'}
                          value={k.apiKey || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKeysForm((prev) =>
                              prev.map((item, idx) => (idx === slotIdx ? { ...item, apiKey: val } : item))
                            );
                          }}
                        />
                      </div>
                    </div>

                    {/* Test Button & Result */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[color:var(--nd-line)]/50">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTestKey(slotIdx)}
                          disabled={test?.busy || (!k.hasKey && !k.apiKey?.trim())}
                          className="nd-btn nd-btn-ghost px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Zap className={`w-3.5 h-3.5 ${test?.busy ? 'animate-spin text-amber-500' : 'text-emerald-500'}`} />
                          <span>{test?.busy ? 'در حال ارسال پینگ تست…' : 'تست اتصال این کلید'}</span>
                        </button>
                      </div>

                      {test && !test.busy && (
                        <div className="text-xs">
                          {test.ok ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> اتصال موفق! زمان پاسخ: {test.latencyMs}ms (مدل: {test.model})
                            </span>
                          ) : (
                            <span className="text-red-500 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {test.error || 'خطا در برقراری اتصال'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save & Test All buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[color:var(--nd-line)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveKeys}
                  disabled={savingKeys}
                  className="nd-btn nd-btn-accent px-6 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{savingKeys ? 'در حال ذخیره ۳ کلید…' : 'ذخیره اتصال ۳ کلید این محصول'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestAllKeys}
                  disabled={testingAll}
                  className="nd-btn nd-btn-ghost px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-4 h-4 ${testingAll ? 'animate-spin text-amber-500' : 'text-[color:var(--nd-accent)]'}`} />
                  <span>{testingAll ? 'در حال تست ۳ کلید…' : 'تست همزمان هر ۳ کلید'}</span>
                </button>
              </div>

              <p className="text-[11px] nd-faint">
                🔒 کلیدهای API روی سرور ذخیره می‌شوند و هیچ‌گاه به‌صورت کامل به مرورگر کاربران بازگردانده نمی‌شوند.
              </p>
            </div>
          </div>
        )}

        {/* ---------------- SUBTAB 3: PRICING PLANS ---------------- */}
        {activeSubTab === 'plans' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black">پلن‌های قیمت‌گذاری ۳ گانه (پایه، حرفه‌ای، VIP)</h4>
                <p className="text-xs nd-muted">هر محصول دارای سه پلن با سهمیه پیام، تعداد دستگاه و برچسب قیمت مشخص است.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(currentProduct.plans || []).map((plan, planIdx) => (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    plan.popular
                      ? 'border-[color:var(--nd-accent)] bg-[color:var(--nd-accent-soft)]/10 ring-1 ring-[color:var(--nd-accent)]'
                      : 'border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">{plan.name}</span>
                    {plan.badge && <ABadge tone="accent">{plan.badge}</ABadge>}
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <ALabel>قیمت نمایش داده‌شده</ALabel>
                      <AInput
                        value={plan.price}
                        onChange={(e) => {
                          const val = e.target.value;
                          const nextPlans = [...(currentProduct.plans || [])];
                          nextPlans[planIdx] = { ...plan, price: val };
                          updateProductProp('plans', nextPlans);
                          // Sync to AI_TOOLS_CONFIG
                          updateField(`AI_TOOLS_CONFIG.tools.${currentProduct.id}.planPrices.${plan.id}`, val);
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <ALabel>شعار کوتاه پلن</ALabel>
                      <AInput
                        value={plan.tagline}
                        onChange={(e) => {
                          const val = e.target.value;
                          const nextPlans = [...(currentProduct.plans || [])];
                          nextPlans[planIdx] = { ...plan, tagline: val };
                          updateProductProp('plans', nextPlans);
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <ALabel hint="۰ = نامحدود">سهمیه پیام</ALabel>
                        <AInput
                          dir="ltr"
                          type="number"
                          value={String(plan.messageQuota)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            const nextPlans = [...(currentProduct.plans || [])];
                            nextPlans[planIdx] = { ...plan, messageQuota: val };
                            updateProductProp('plans', nextPlans);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <ALabel>اعتبار (روز)</ALabel>
                        <AInput
                          dir="ltr"
                          type="number"
                          value={String(plan.durationDays)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 30;
                            const nextPlans = [...(currentProduct.plans || [])];
                            nextPlans[planIdx] = { ...plan, durationDays: val };
                            updateProductProp('plans', nextPlans);
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <ALabel>تعداد دستگاه مجاز</ALabel>
                      <AInput
                        dir="ltr"
                        type="number"
                        value={String(plan.maxDevices)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          const nextPlans = [...(currentProduct.plans || [])];
                          nextPlans[planIdx] = { ...plan, maxDevices: val };
                          updateProductProp('plans', nextPlans);
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <ALabel hint="هر مورد در یک خط">مزایا و ویژگی‌های پلن (Perks)</ALabel>
                      <ATextarea
                        rows={3}
                        value={(plan.perks || []).join('\n')}
                        onChange={(e) => {
                          const val = e.target.value.split('\n').filter(Boolean);
                          const nextPlans = [...(currentProduct.plans || [])];
                          nextPlans[planIdx] = { ...plan, perks: val };
                          updateProductProp('plans', nextPlans);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- SUBTAB 4: AI BEHAVIOR & PROMPTS ---------------- */}
        {activeSubTab === 'ai' && (
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-black">مدیریت رفتار، دستورالعمل و پرامپت هوش مصنوعی</h4>
              <p className="text-xs nd-muted">شخصیت این محصول را ویرایش کنید تا پاسخ‌ها دقیق، متناسب با لحن امید عدلی و ارزشمند باشند.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <ALabel hint="دستورالعمل سیستمی که به مدل هوش مصنوعی ارسال می‌شود">شخصیت و پرامپت سیستمی (System Prompt)</ALabel>
                <ATextarea
                  rows={8}
                  value={currentProduct.behavior?.persona || ''}
                  onChange={(e) => {
                    const beh = { ...(currentProduct.behavior || {}), persona: e.target.value };
                    updateProductProp('behavior', beh);
                  }}
                  placeholder="تو «تراپیست بیزینسی» هستی..."
                />
              </div>

              <div className="space-y-1.5">
                <ALabel>پیام خوش‌آمدگویی اولیه (Welcome Message)</ALabel>
                <ATextarea
                  rows={3}
                  value={currentProduct.behavior?.welcome || ''}
                  onChange={(e) => {
                    const beh = { ...(currentProduct.behavior || {}), welcome: e.target.value };
                    updateProductProp('behavior', beh);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <ALabel hint="هر سوال پیشنهادی در یک خط">سوالات پیشنهادی (Starter Chips)</ALabel>
                <ATextarea
                  rows={3}
                  value={(currentProduct.behavior?.suggestions || []).join('\n')}
                  onChange={(e) => {
                    const val = e.target.value.split('\n').filter(Boolean);
                    const beh = { ...(currentProduct.behavior || {}), suggestions: val };
                    updateProductProp('behavior', beh);
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <ALabel>دمای پاسخ‌دهی (Temperature: ۰ تا ۱.۵)</ALabel>
                  <AInput
                    dir="ltr"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1.5"
                    value={String(currentProduct.behavior?.temperature ?? 0.7)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0.7;
                      const beh = { ...(currentProduct.behavior || {}), temperature: val };
                      updateProductProp('behavior', beh);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)]">
                  <div>
                    <span className="text-xs font-bold block">اتصال به دانش سایت (Site Digest)</span>
                    <span className="text-[10px] nd-faint">دسترسی دستیار به مقالات و رزومه امید عدلی جهت ارجاع کاربر</span>
                  </div>
                  <AToggle
                    checked={currentProduct.behavior?.useDigest ?? true}
                    onChange={(v) => {
                      const beh = { ...(currentProduct.behavior || {}), useDigest: v };
                      updateProductProp('behavior', beh);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- SUBTAB 5: LICENSE & GRANTS ---------------- */}
        {activeSubTab === 'license' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-black">صدور دسترسی اختصاصی برای «{currentProduct.title}»</h4>
              <p className="text-xs nd-muted">پس از دریافت فیش واریزی، دسترسی روی شماره موبایل مشتری باز و کد ارسال می‌شود.</p>
            </div>

            <form onSubmit={handleGrantSubmit} className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <ALabel>شماره موبایل مشتری</ALabel>
                  <AInput
                    dir="ltr"
                    placeholder="09xxxxxxxxx"
                    value={grantPhone}
                    onChange={(e) => setGrantPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <ALabel>انتخاب پلن</ALabel>
                  <ASelect value={grantPlanId} onChange={(e) => setGrantPlanId(e.target.value)}>
                    {(currentProduct.plans || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.price} — {p.messageQuota || 'نامحدود'} پیام)
                      </option>
                    ))}
                  </ASelect>
                </div>
              </div>

              <button
                type="submit"
                disabled={grantBusy || !grantPhone.trim()}
                className="nd-btn nd-btn-accent px-5 py-2.5 text-xs font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                <span>{grantBusy ? 'در حال صدور…' : 'صدور و دریافت کد دسترسی'}</span>
              </button>
            </form>

            {lastGrantResult && (
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-700">دسترسی با موفقیت صادر شد!</span>
                  <button
                    onClick={() => {
                      const msg = `سلام! دسترسی شما به «${currentProduct.title}» فعال شد.\nشماره موبایل: ${lastGrantResult.phone}\nکد اختصاصی فعال‌سازی: ${lastGrantResult.code}\nهمین حالا در سایت وارد کنید: https://omidadli.com/products`;
                      navigator.clipboard?.writeText(msg);
                      onToast('متن پیام کپی شد.');
                    }}
                    className="nd-btn nd-btn-ghost px-3 py-1 text-[11px] flex items-center gap-1 text-emerald-700"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی پیام مشتری</span>
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span>شماره: <b dir="ltr">{lastGrantResult.phone}</b></span>
                  <span>کد فعال‌سازی: <b dir="ltr" className="text-base font-black text-emerald-800">{lastGrantResult.code}</b></span>
                </div>
              </div>
            )}

            {/* List of active licenses for this tool */}
            <div className="space-y-2">
              <h5 className="text-xs font-black">لایسنس‌های فعال برای این محصول ({productGrants.length})</h5>
              {productGrants.length === 0 ? (
                <p className="text-xs nd-muted py-4 text-center">هنوز دسترسی‌ای برای این ابزار صادر نشده است.</p>
              ) : (
                <div className="space-y-2">
                  {productGrants.slice(0, 10).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span dir="ltr" className="font-bold">{g.phone}</span>
                        <code dir="ltr" className="px-2 py-0.5 rounded bg-[color:var(--nd-bg-soft)] font-black text-[color:var(--nd-accent)]">{g.code}</code>
                        <span className="nd-muted text-[11px]">دستگاه‌ها: {g.devicesUsed || 0} از {g.maxDevices}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ABadge tone={g.status === 'active' ? 'ok' : 'warn'}>
                          {g.status === 'active' ? 'فعال' : 'لغو شده'}
                        </ABadge>
                        <button
                          onClick={async () => {
                            await api.resetToolDevices(g.id);
                            onToast('دستگاه‌های متصل ریست شدند.');
                            await loadGrants();
                          }}
                          className="nd-chip cursor-pointer hover:bg-slate-200"
                        >
                          ریست دستگاه
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ACard>
    </div>
  );
};
