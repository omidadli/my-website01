import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Trash2,
  Loader2,
  Bot,
  Sparkles,
  Activity,
  ArrowLeftRight,
  Info,
} from 'lucide-react';
import { api } from '../../services/api';
import { ACard, ASectionTitle, AInput, ASelect, ALabel, ABadge, AToggle } from './ui';
import {
  AI_SECTIONS,
  KEYS_PER_SECTION,
  createDefaultSectionKeys,
  HEALTH_LABEL_FA,
  cooldownLabelFa,
  type AiKeyHealth,
  type AiSectionDef,
  type SectionStatus,
} from '../../../lib/aiKeys';

/**
 * «کلیدهای API» — the central key-management screen of the admin panel.
 *
 * Every part of the site that needs an AI key is a *section* with 5 key slots:
 *   • دستیار هوشمند سایت (چت ماسکوت)   • تولید اسلاگ سئو
 *   • and the 4 paid products
 *
 * The keys are tried in order (sticky → next healthy → cooling down), health and
 * cooldowns are shown live, and each slot can be tested with one click.
 */

interface Props {
  onToast: (msg: string) => void;
  /** which section to open first (e.g. coming from the products tab) */
  initialSectionId?: string;
}

interface KeyDraft {
  id: string;
  slot: number;
  label: string;
  provider: 'gemini' | 'openai';
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  hasKey: boolean;
  keyMask: string;
}

interface TestResult {
  busy?: boolean;
  ok?: boolean;
  latencyMs?: number;
  model?: string;
  reply?: string;
  error?: string;
}

const healthTone = (h: AiKeyHealth): 'ok' | 'warn' | 'muted' | 'accent' => {
  if (h === 'healthy') return 'ok';
  if (h === 'rate_limited' || h === 'invalid' || h === 'error') return 'warn';
  return 'muted';
};

const sectionIcon = (section: AiSectionDef) =>
  section.kind === 'product' ? <Sparkles className="w-4 h-4" /> : <Bot className="w-4 h-4" />;

const draftsFromSection = (section: SectionStatus): KeyDraft[] =>
  section.keys.map((k) => ({
    id: k.id,
    slot: k.slot,
    label: k.label,
    provider: k.provider,
    baseUrl: k.baseUrl,
    model: k.model,
    apiKey: '',
    enabled: k.enabled,
    hasKey: k.hasKey,
    keyMask: k.keyMask,
  }));

export const ApiKeysManager: React.FC<Props> = ({ onToast, initialSectionId }) => {
  const [sections, setSections] = useState<SectionStatus[]>([]);
  const [meta, setMeta] = useState<AiSectionDef[]>(AI_SECTIONS);
  const [envKeyPresent, setEnvKeyPresent] = useState(false);
  const [activeId, setActiveId] = useState<string>(initialSectionId || AI_SECTIONS[0].id);
  const [drafts, setDrafts] = useState<Record<string, KeyDraft[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [showEvents, setShowEvents] = useState(false);

  const active = useMemo(() => sections.find((s) => s.sectionId === activeId), [sections, activeId]);
  const activeDrafts = drafts[activeId] || [];

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const r = await api.listToolSettings();
    setSections(r.sections || []);
    if (r.sectionsMeta?.length) setMeta(r.sectionsMeta);
    setEnvKeyPresent(r.envKeyPresent);
    setDrafts((prev) => {
      const next: Record<string, KeyDraft[]> = { ...prev };
      for (const section of r.sections || []) {
        // keep what the admin has already typed (merged by key id)
        const stored = prev[section.sectionId] || [];
        next[section.sectionId] = draftsFromSection(section).map((d) => {
          const typed = stored.find((x) => x.id === d.id);
          // keep whatever the admin already typed in the form; refresh the rest
          return typed ? { ...d, apiKey: typed.apiKey, label: typed.label || d.label } : d;
        });
      }
      return next;
    });
    if (initialSectionId && r.sections?.some((s) => s.sectionId === initialSectionId)) setActiveId(initialSectionId);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchDraft = (keyId: string, patch: Partial<KeyDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [activeId]: (prev[activeId] || []).map((d) => (d.id === keyId ? { ...d, ...patch } : d)),
    }));
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    const r = await api.setSectionKeys({
      sectionId: active.sectionId,
      keys: activeDrafts.map((d) => ({
        id: d.id,
        label: d.label,
        provider: d.provider,
        baseUrl: d.baseUrl,
        model: d.model,
        apiKey: d.apiKey || undefined,
        enabled: d.enabled,
      })),
    });
    setSaving(false);
    if (r.ok) {
      onToast(`۵ اسلات کلید «${active.name}» ذخیره شد.`);
      await load(true);
    } else {
      onToast(r.error || 'ذخیره‌ی کلیدها ناموفق بود.');
    }
  };

  const handleTest = async (draft: KeyDraft) => {
    const cacheKey = `${activeId}:${draft.id}`;
    setTestResults((prev) => ({ ...prev, [cacheKey]: { busy: true } }));
    const r = await api.testToolKey({
      sectionId: activeId,
      productId: activeId,
      keyIndex: draft.slot - 1,
      provider: draft.provider,
      baseUrl: draft.baseUrl,
      model: draft.model,
      apiKey: draft.apiKey || undefined,
    });
    setTestResults((prev) => ({
      ...prev,
      [cacheKey]: { busy: false, ok: r.ok, latencyMs: r.latencyMs, model: r.model, reply: r.reply, error: r.error },
    }));
    onToast(r.ok ? `کلید ${draft.slot} سالم است (${r.latencyMs}ms)` : `کلید ${draft.slot} خطا داد: ${r.error || 'عدم ارتباط'}`);
    await load(true);
  };

  const handleTestAll = async () => {
    if (!active) return;
    setTestingAll(true);
    const r = await api.testAllSectionKeys(active.sectionId);
    setTestingAll(false);
    if (!r.ok) {
      onToast(r.error || 'تست کلیدها ناموفق بود.');
      return;
    }
    const next: Record<string, TestResult> = { ...testResults };
    for (const res of r.results || []) {
      next[`${activeId}:${res.id}`] = { busy: false, ok: res.ok, latencyMs: res.latencyMs, model: res.model, reply: res.reply, error: res.error };
    }
    setTestResults(next);
    onToast(`${r.passed}/${r.total} کلید سالم است.`);
    await load(true);
  };

  const handleClear = async (draft: KeyDraft) => {
    const ok = await api.clearToolKey(activeId, draft.slot - 1);
    if (ok) {
      onToast(`کلید ${draft.slot} حذف شد.`);
      patchDraft(draft.id, { apiKey: '', hasKey: false, keyMask: '' });
      await load(true);
    } else {
      onToast('حذف کلید ناموفق بود.');
    }
  };

  const handleResetHealth = async (draft?: KeyDraft) => {
    const ok = await api.resetSectionKeyState(activeId, draft ? draft.slot - 1 : undefined);
    if (ok) {
      onToast(draft ? `وضعیت کلید ${draft.slot} صفر شد.` : 'وضعیت و کول‌داون همه‌ی کلیدهای این بخش صفر شد.');
      await load(true);
    }
  };

  const toggleEvents = async () => {
    if (!showEvents) setEvents(await api.listKeyEvents(40));
    setShowEvents((v) => !v);
  };

  const totalReady = sections.reduce((sum, s) => sum + (s.configuredCount > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-8">
      <ACard>
        <ASectionTitle
          title="کلیدهای API — ۵ اسلات برای هر بخش"
          desc="هر بخشی از سایت که کلید هوش مصنوعی می‌خواهد، ۵ اسلات کلید دارد. اگر کلیدی به سقف مصرف بخورد یا خطا بدهد، سیستم خودکار سراغ کلید سالم بعدی می‌رود و پیش از پاسخ، چت‌های قبلی همان گفتگو را مرور می‌کند تا مکالمه طبیعی ادامه پیدا کند."
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => load()} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>بازخوانی</span>
              </button>
              <button onClick={toggleEvents} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer">
                <Activity className="w-3.5 h-3.5" />
                <span>{showEvents ? 'بستن رویدادها' : 'رویدادهای کلیدها'}</span>
              </button>
            </div>
          }
        />

        <div className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 flex flex-wrap items-center gap-3 text-[11px] font-bold">
          <span className="flex items-center gap-1.5 text-[color:var(--nd-ink-2)]">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            {sections.length || AI_SECTIONS.length} بخش × {KEYS_PER_SECTION} کلید = {(sections.length || AI_SECTIONS.length) * KEYS_PER_SECTION} اسلات
          </span>
          <ABadge tone={totalReady === sections.length && sections.length > 0 ? 'ok' : 'warn'}>
            {totalReady}/{sections.length || AI_SECTIONS.length} بخش کلید دارد
          </ABadge>
          <ABadge tone={envKeyPresent ? 'ok' : 'muted'}>
            کلید محیطی GEMINI_API_KEY: {envKeyPresent ? 'فعال (آخرین گزینه)' : 'تنظیم نشده'}
          </ABadge>
          <span className="text-[10.5px] nd-faint flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            کلیدها فقط روی سرور ذخیره می‌شوند و همیشه ماسک‌شده نمایش داده می‌شوند.
          </span>
        </div>
      </ACard>

      {showEvents && (
        <ACard>
          <ASectionTitle title="رویدادهای کلیدها" desc="۴۰ رویداد آخر: لیمیت‌خوردن کلیدها و جا‌به‌جایی‌های خودکار (Failover)." />
          {events.length === 0 ? (
            <p className="text-xs nd-muted">رویدادی ثبت نشده است.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="rounded-xl border border-[color:var(--nd-line)] px-3 py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[color:var(--nd-accent)] shrink-0" />
                    <span className="text-[11px] font-extrabold truncate">
                      {AI_SECTIONS.find((s) => s.id === e.section_id)?.name || e.section_id} — {e.key_id}
                    </span>
                    <ABadge tone={e.code === 'handoff' ? 'accent' : 'warn'}>
                      {e.code === 'handoff' ? 'ادامه روی کلید پشتیبان' : e.code === 'rate_limit' ? 'لیمیت' : e.code === 'quota' ? 'سهمیه تمام' : e.code}
                    </ABadge>
                  </div>
                  <span className="text-[9px] nd-faint dir-ltr shrink-0">{new Date(e.created_at).toLocaleString('fa-IR')}</span>
                </div>
              ))}
            </div>
          )}
        </ACard>
      )}

      {/* ---- section picker ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {sections.map((s) => {
          const isActive = s.sectionId === activeId;
          return (
            <button
              key={s.sectionId}
              onClick={() => setActiveId(s.sectionId)}
              className={`text-right rounded-2xl border p-4 space-y-2 transition-all cursor-pointer ${
                isActive
                  ? 'border-[color:var(--nd-accent)] bg-[color:var(--nd-accent)]/5 shadow-sm'
                  : 'border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] hover:border-[color:var(--nd-accent)]/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-black">
                  {sectionIcon(meta.find((m) => m.id === s.sectionId) || AI_SECTIONS[0])}
                  <span className="line-clamp-2">{s.name}</span>
                </span>
                <ABadge tone={s.configuredCount > 0 ? 'ok' : s.envKeyPresent ? 'warn' : 'muted'}>
                  {s.configuredCount}/{s.totalKeys}
                </ABadge>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] nd-faint font-bold">
                <span>{s.healthyCount} کلید آماده</span>
                <span>•</span>
                <span>{s.keys.filter((k) => k.cooldownRemainingMs > 0).length} در کول‌داون</span>
              </div>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <span
                    key={k.id}
                    title={`${k.label} — ${HEALTH_LABEL_FA[k.health]}`}
                    className={`h-1.5 flex-1 rounded-full ${
                      !k.hasKey || !k.enabled
                        ? 'bg-[color:var(--nd-line)]'
                        : k.health === 'healthy'
                          ? 'bg-emerald-500'
                          : k.health === 'rate_limited' || k.health === 'invalid' || k.health === 'error'
                            ? 'bg-amber-500'
                            : 'bg-sky-400'
                    }`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- the 5 slots of the selected section ---- */}
      {active && (
        <ACard>
          <ASectionTitle
            title={active.name}
            desc={active.description}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleTestAll} disabled={testingAll} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer disabled:opacity-50">
                  {testingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>تست همه‌ی ۵ کلید</span>
                </button>
                <button onClick={() => handleResetHealth()} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px] cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>صفر کردن کول‌داون‌ها</span>
                </button>
                <button onClick={handleSave} disabled={saving} className="nd-btn nd-btn-accent px-5 py-2.5 text-[12px] cursor-pointer disabled:opacity-50">
                  <KeyRound className="w-4 h-4" />
                  <span>{saving ? 'در حال ذخیره…' : 'ذخیره‌ی ۵ کلید'}</span>
                </button>
              </div>
            }
          />

          <div className="space-y-4">
            {activeDrafts.map((draft) => {
              const status = active.keys.find((k) => k.id === draft.id);
              const test = testResults[`${activeId}:${draft.id}`];
              const cooling = (status?.cooldownRemainingMs || 0) > 0;
              return (
                <div
                  key={draft.id}
                  className={`rounded-2xl border p-5 space-y-4 ${
                    draft.hasKey && draft.enabled && !cooling
                      ? 'border-emerald-500/40 bg-emerald-500/[0.02]'
                      : cooling
                        ? 'border-amber-500/40 bg-amber-500/[0.03]'
                        : 'border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-[color:var(--nd-accent)]/15 text-[color:var(--nd-accent)] flex items-center justify-center font-black text-xs shrink-0">
                        {draft.slot}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <AInput
                            value={draft.label}
                            onChange={(e) => patchDraft(draft.id, { label: e.target.value })}
                            className="w-52! py-1.5! text-[11px]!"
                            placeholder={`کلید ${draft.slot}`}
                          />
                          <ABadge tone={healthTone(status?.health || 'unused')}>
                            {HEALTH_LABEL_FA[status?.health || 'unused']}
                            {cooling ? ` — ${cooldownLabelFa(status?.cooldownRemainingMs || 0)} دیگر` : ''}
                          </ABadge>
                          {draft.hasKey ? (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> ثبت‌شده (<code dir="ltr">{draft.keyMask}</code>)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> کلید ندارد
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] nd-faint mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> موفق: {status?.stats.successCount || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> خطا: {status?.stats.failCount || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> لیمیت: {status?.stats.rateLimitCount || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <ArrowLeftRight className="w-3 h-3" /> جابه‌جایی: {status?.stats.rotationCount || 0}
                          </span>
                          {status?.stats.lastUsedAt ? <span>آخرین استفاده: {new Date(status.stats.lastUsedAt).toLocaleString('fa-IR')}</span> : null}
                          {status?.stats.lastLatencyMs ? <span>{status.stats.lastLatencyMs}ms</span> : null}
                          {status?.stats.lastError ? <span className="text-red-500 line-clamp-1">آخرین خطا: {status.stats.lastError}</span> : null}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <AToggle checked={draft.enabled} onChange={(v) => patchDraft(draft.id, { enabled: v })} label={draft.enabled ? 'فعال' : 'غیرفعال'} />
                      <button
                        onClick={() => handleTest(draft)}
                        disabled={!draft.hasKey || test?.busy}
                        className="nd-btn nd-btn-ghost px-3 py-1.5 text-[11px] cursor-pointer disabled:opacity-40"
                      >
                        {test?.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>تست</span>
                      </button>
                      <button
                        onClick={() => handleResetHealth(draft)}
                        className="p-1.5 rounded-lg text-[color:var(--nd-ink-2)] hover:bg-[color:var(--nd-bg-soft)] cursor-pointer"
                        title="صفر کردن وضعیت این کلید"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      {draft.hasKey && (
                        <button
                          onClick={() => handleClear(draft)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer"
                          title="حذف کلید این اسلات"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <ALabel>سرویس‌دهنده</ALabel>
                      <ASelect
                        value={draft.provider}
                        onChange={(e) => {
                          const val = e.target.value as 'gemini' | 'openai';
                          patchDraft(draft.id, {
                            provider: val,
                            model: val === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash',
                            baseUrl: val === 'openai' ? 'https://api.openai.com/v1' : '',
                          });
                        }}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI / سازگار با OpenAI</option>
                      </ASelect>
                    </div>
                    <div className="space-y-1">
                      <ALabel>مدل</ALabel>
                      <AInput
                        dir="ltr"
                        value={draft.model}
                        onChange={(e) => patchDraft(draft.id, { model: e.target.value })}
                        placeholder={draft.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'}
                      />
                    </div>
                    <div className="space-y-1">
                      <ALabel hint={draft.provider === 'gemini' ? 'برای Gemini لازم نیست' : undefined}>Base URL</ALabel>
                      <AInput
                        dir="ltr"
                        value={draft.baseUrl}
                        disabled={draft.provider === 'gemini'}
                        onChange={(e) => patchDraft(draft.id, { baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="space-y-1">
                      <ALabel hint={draft.hasKey ? 'خالی = بدون تغییر' : undefined}>کلید API</ALabel>
                      <AInput
                        dir="ltr"
                        type="password"
                        autoComplete="off"
                        value={draft.apiKey}
                        onChange={(e) => patchDraft(draft.id, { apiKey: e.target.value })}
                        placeholder={draft.hasKey ? '•••• (ذخیره‌شده)' : 'کلید را وارد کن…'}
                      />
                    </div>
                  </div>

                  {test && !test.busy && (
                    <div className={`text-[11px] rounded-lg px-3 py-2 font-bold ${test.ok ? 'bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)]' : 'bg-red-50 text-red-600'}`}>
                      {test.ok
                        ? `اتصال موفق — مدل ${test.model} • ${test.latencyMs}ms${test.reply ? ` • پاسخ: ${String(test.reply).slice(0, 60)}` : ''}`
                        : `خطا: ${test.error}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-2 text-[11px] font-bold text-[color:var(--nd-ink-2)]">
            <p className="flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4 text-[color:var(--nd-accent)]" />
              ترتیب چرخش: کلیدِ همین گفتگو → کلیدهای سالم ۱ تا ۵ → کلیدهای کول‌داون‌دار (نزدیک‌ترین به آزادشدن).
            </p>
            <p className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              کول‌داون خودکار: لیمیت نرخ ۱۵ دقیقه، اتمام سهمیه ۶ ساعت، کلید نامعتبر ۲۴ ساعت. با «صفر کردن کول‌داون‌ها» فوری آزاد می‌شود.
            </p>
            <p className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[color:var(--nd-accent)]" />
              ادامه‌ی طبیعی گفتگو: پیش از پاسخ، چت‌های قبلیِ همان کاربر از حافظه‌ی سرور مرور و به مدل داده می‌شود؛ کاربر متوجه تغییر کلید نمی‌شود.
            </p>
          </div>
        </ACard>
      )}
    </div>
  );
};

export default ApiKeysManager;
