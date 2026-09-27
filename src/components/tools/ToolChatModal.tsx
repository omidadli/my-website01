import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Lock, ShieldCheck, Sparkles, Loader2, KeyRound, ArrowRight, RefreshCw, RotateCcw, Copy, Check, Crown, Gift, Flame, Star } from 'lucide-react';
import { api } from '../../services/api';
import { AiToolMeta } from '../../data/tools';
import { PERSONAL_INFO } from '../../data/content';
import { getPlans, resolvePlanPrice, resolveFreeTrial, ToolPlan } from '../../../lib/toolPlans';
import { Theme } from '../../types';

interface Props {
  tool: AiToolMeta;
  theme: Theme;
  data?: any;
  channels?: { telegramUrl?: string; whatsappUrl?: string; baleUrl?: string; phone?: string };
  purchaseNote?: string;
  socialProof?: string;
  urgency?: string;
  onClose: () => void;
}

type Msg = { role: 'user' | 'assistant'; content: string };
type View = 'checking' | 'chat' | 'plans';

const DEVICE_KEY = 'nd_tool_device_id';
const tokenKey = (id: string) => `nd_tool_token_${id}`;
const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const getDeviceId = (): string => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = (crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch {
    return `dev-${Date.now()}`;
  }
};

/** Tiny, safe markdown-ish renderer: **bold**, - [ ] checkboxes, bullets, line breaks. */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = (text || '').split('\n');
  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
    );
  };
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1" />;
        const check = t.match(/^-\s*\[( |x|X)\]\s*(.*)$/);
        if (check) {
          const done = check[1].toLowerCase() === 'x';
          return (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 w-4 h-4 rounded-[6px] border flex items-center justify-center text-[10px] shrink-0 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current opacity-60'}`}>{done ? '✓' : ''}</span>
              <span>{renderInline(check[2])}</span>
            </div>
          );
        }
        const bullet = t.match(/^[-•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
              <span>{renderInline(bullet[1])}</span>
            </div>
          );
        }
        return <div key={i}>{renderInline(t)}</div>;
      })}
    </div>
  );
};

export const ToolChatModal: React.FC<Props> = ({ tool, theme, data, channels, purchaseNote, socialProof, urgency, onClose }) => {
  const isDark = theme === 'dark';
  const deviceId = getDeviceId();
  const plans = getPlans(tool.id);
  const freeTrialLimit = resolveFreeTrial(data);

  const [view, setView] = useState<View>('checking');
  const [paid, setPaid] = useState(false);

  // gamification counters
  const [trialRemaining, setTrialRemaining] = useState<number>(freeTrialLimit);
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [paywallReason, setPaywallReason] = useState<'trial' | 'quota' | 'locked' | 'browse'>('trial');

  // gate form
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>(plans.find((p) => p.popular)?.id || plans[0]?.id || '');

  // chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trialWelcome = `سلام 👋 من «${tool.name}» هستم. ${tool.tagline}\n\nاین اولین گفتگوی توئه و **${toFa(freeTrialLimit)} پیام رایگان** مهمون منی — راحت امتحانم کن، بعد اگر به‌کارت اومد یکی از پلن‌ها رو فعال کن.`;

  const copyMsg = (text: string, idx: number) => {
    try { navigator.clipboard?.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500); } catch { /* ignore */ }
  };
  const resetChat = () => { if (!sending) setMessages([{ role: 'assistant', content: welcomeMsg || trialWelcome }]); };

  const selPlan = plans.find((p) => p.id === selectedPlan);
  const purchaseMsg = `سلام امید 👋 می‌خوام پلنِ «${selPlan?.name || ''}» از ابزار «${tool.name}» رو بگیرم${selPlan ? ` (${resolvePlanPrice(tool.id, selPlan, data)})` : ''}. لطفاً راهنمایی کن.`;
  const waBase = channels?.whatsappUrl || PERSONAL_INFO.whatsappUrl;
  const waUrl = `${waBase}${waBase.includes('?') ? '&' : '?'}text=${encodeURIComponent(purchaseMsg)}`;
  const tgUrl = channels?.telegramUrl || PERSONAL_INFO.telegramUrl;
  const baleUrl = channels?.baleUrl || 'https://ble.ir/';
  const phoneLabel = channels?.phone || PERSONAL_INFO.phoneFormatted;

  // Decide initial state: valid stored token → paid chat; else trial chat or plans.
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = (() => { try { return localStorage.getItem(tokenKey(tool.id)); } catch { return null; } })();
      if (stored) {
        const r = await api.toolSession({ token: stored, productId: tool.id, deviceId });
        if (!alive) return;
        if (r.ok) {
          setPaid(true);
          setWelcomeMsg(r.tool?.welcome || '');
          setMessages([{ role: 'assistant', content: r.tool?.welcome || `سلام 👋 دسترسیت فعاله. با «${tool.name}» چطور می‌تونم کمکت کنم؟` }]);
          setView('chat');
          return;
        }
        try { localStorage.removeItem(tokenKey(tool.id)); } catch {}
      }
      if (!alive) return;
      if (freeTrialLimit > 0) {
        setWelcomeMsg(trialWelcome);
        setMessages([{ role: 'assistant', content: trialWelcome }]);
        setPaywallReason('trial');
        setView('chat');
      } else {
        setPaywallReason('locked');
        setView('plans');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id, deviceId]);

  // Escape closes; lock body scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    setUnlocking(true);
    const r = await api.unlockTool({ phone, code, productId: tool.id, deviceId });
    setUnlocking(false);
    if (r.ok && r.token) {
      try { localStorage.setItem(tokenKey(tool.id), r.token); } catch {}
      setPaid(true);
      setQuota(null);
      setWelcomeMsg(r.tool?.welcome || '');
      setMessages([{ role: 'assistant', content: r.tool?.welcome || `سلام 👋 دسترسیت فعال شد. با «${tool.name}» چطور می‌تونم کمکت کنم؟` }]);
      setView('chat');
    } else {
      setGateError(r.error || 'باز کردن دسترسی ناموفق بود.');
    }
  };

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || sending) return;
    const token = (() => { try { return localStorage.getItem(tokenKey(tool.id)) || ''; } catch { return ''; } })();

    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);

    const history = next.map((m) => ({ role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model', content: m.content }));
    const r = await api.toolChat({ token: token || undefined, productId: tool.id, deviceId, messages: history });
    setSending(false);

    if (r.ok && r.answer) {
      setMessages((prev) => [...prev, { role: 'assistant', content: r.answer! }]);
      if (r.trial) setTrialRemaining(r.trial.remaining);
      if (r.quota) setQuota(r.quota);
    } else if (r.code === 'trial_ended') {
      if (r.trial) setTrialRemaining(0);
      setPaywallReason('trial');
      setView('plans');
    } else if (r.code === 'quota') {
      if (r.quota) setQuota(r.quota);
      setPaywallReason('quota');
      setView('plans');
    } else if (r.code === 'locked' || r.code === 'expired') {
      try { localStorage.removeItem(tokenKey(tool.id)); } catch {}
      setPaid(false);
      setGateError(r.error || 'دسترسی شما فعال نیست.');
      setPaywallReason('locked');
      setView('plans');
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: r.error || 'خطایی رخ داد. دوباره تلاش کن.' }]);
    }
  };

  const shellBg = isDark ? 'bg-[#15102e] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900';
  const inputCls = isDark
    ? 'bg-white/5 border-white/15 text-white placeholder:text-slate-500 focus:border-[color:var(--nd-accent)]'
    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[color:var(--nd-accent)]';
  const cardCls = isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100';

  // ---- status pill in the header (trial counter / quota bar) ----
  const headerStatus = () => {
    if (view !== 'chat') return null;
    if (paid && quota && quota.limit > 0) {
      const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
      return (
        <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-[120px]">
          <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{toFa(quota.remaining)} پیام باقی‌مانده</span>
          <div className={`w-28 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
            <div className="h-full rounded-full bg-[color:var(--nd-accent)]" style={{ width: `${100 - pct}%` }} />
          </div>
        </div>
      );
    }
    if (paid) {
      return <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500"><Crown className="w-3.5 h-3.5" /> دسترسی فعال</span>;
    }
    // trial
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full ${trialRemaining > 0 ? 'bg-amber-400/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
        <Gift className="w-3.5 h-3.5" /> {trialRemaining > 0 ? `${toFa(trialRemaining)} پیام رایگان` : 'پایان تست'}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl h-[92vh] supports-[height:92dvh]:h-[92dvh] sm:h-[86vh] sm:supports-[height:86dvh]:h-[86dvh] max-h-[860px] flex flex-col rounded-t-[28px] sm:rounded-[28px] border shadow-2xl overflow-hidden ${shellBg}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#8b5cf6] via-[#4c8dff] to-[#5ce1e6] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base truncate">{tool.name}</h3>
              <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{tool.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerStatus()}
            {view === 'chat' && (
              <button onClick={resetChat} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="گفتگوی جدید" title="گفتگوی جدید">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="بستن">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {view === 'checking' ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin opacity-60" />
          </div>
        ) : view === 'chat' ? (
          /* ---------------- CHAT (trial or paid) ---------------- */
          <>
            {/* trial hint banner */}
            {!paid && trialRemaining > 0 && (
              <div className={`px-4 sm:px-5 py-2 text-[11px] flex items-center justify-between gap-2 ${isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                <span className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> نسخه‌ی آزمایشی — {toFa(trialRemaining)} پیام رایگان باقی مانده</span>
                <button onClick={() => { setPaywallReason('browse'); setView('plans'); }} className="font-black underline underline-offset-2">مشاهده‌ی پلن‌ها</button>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] ${
                      m.role === 'user'
                        ? 'bg-[color:var(--nd-accent)] text-white rounded-tr-md'
                        : (isDark ? 'bg-white/8 text-slate-100 rounded-tl-md' : 'bg-slate-100 text-slate-800 rounded-tl-md')
                    }`}
                  >
                    <RichText text={m.content} />
                  </div>
                  {m.role === 'assistant' && i > 0 && (
                    <button
                      onClick={() => copyMsg(m.content, i)}
                      className={`mt-1 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {copiedIdx === i ? <><Check className="w-3 h-3" /> کپی شد</> : <><Copy className="w-3 h-3" /> کپی</>}
                    </button>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex justify-end">
                  <div className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-white/8' : 'bg-slate-100'}`}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions (only at the very start) */}
            {messages.length <= 1 && (
              <div className={`px-4 sm:px-5 pb-2 flex flex-wrap gap-2`}>
                {SUGGESTIONS[tool.id]?.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${isDark ? 'border-white/15 hover:bg-white/10 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className={`flex items-end gap-2 px-3 sm:px-4 py-3 border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder={tool.placeholder || 'پیامت را بنویس…'}
                className={`flex-1 resize-none rounded-2xl border px-4 py-3 text-base outline-none max-h-32 ${inputCls}`}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-11 h-11 rounded-2xl bg-[color:var(--nd-accent)] text-white flex items-center justify-center disabled:opacity-40 shrink-0"
                aria-label="ارسال"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 -rotate-45" />}
              </button>
            </form>
          </>
        ) : (
          /* ---------------- PLANS / PAYWALL ---------------- */
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 space-y-6">
            {/* headline changes with the reason */}
            <div className="text-center space-y-2.5">
              {paywallReason === 'trial' && (
                <>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black ${isDark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                    <Flame className="w-3.5 h-3.5" /> پیام‌های رایگانت تموم شد
                  </div>
                  <h4 className="text-base font-black">همین‌جا نگهش دار 👇</h4>
                  <p className={`text-[12.5px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>ابزار رو تست کردی و دیدی چطور کار می‌کنه. برای ادامه‌ی گفتگو، یکی از پلن‌های زیر رو فعال کن.</p>
                </>
              )}
              {paywallReason === 'quota' && (
                <>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black ${isDark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                    <Flame className="w-3.5 h-3.5" /> سهمیه‌ی پیام این پلن تموم شد
                  </div>
                  <h4 className="text-base font-black">برای ادامه، پلن بالاتر یا تمدید</h4>
                  <p className={`text-[12.5px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>از این ابزار زیاد استفاده می‌کنی 👏 پلنِ با پیام بیشتر برات صرفه‌ی بیشتری داره.</p>
                </>
              )}
              {(paywallReason === 'locked' || paywallReason === 'browse') && (
                <>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black ${isDark ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                    <Sparkles className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" /> پلن‌های «{tool.name}»
                  </div>
                  <h4 className="text-base font-black">پلنی که به کارِت می‌خوره رو انتخاب کن</h4>
                  {gateError && paywallReason === 'locked' && <p className="text-[12px] text-red-500 font-bold">{gateError}</p>}
                </>
              )}
              {socialProof && (
                <p className={`text-[11.5px] flex items-center justify-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {socialProof}
                </p>
              )}
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
              {plans.map((p: ToolPlan) => {
                const isSel = selectedPlan === p.id;
                const price = resolvePlanPrice(tool.id, p, data);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    className={`relative text-right rounded-2xl border p-4 flex flex-col gap-2 transition-all ${
                      isSel
                        ? 'border-[color:var(--nd-accent)] ring-2 ring-[color:var(--nd-accent)]/40 shadow-lg'
                        : (isDark ? 'border-white/10 hover:border-white/25' : 'border-slate-200 hover:border-slate-300')
                    } ${p.popular ? 'sm:scale-[1.04] sm:z-10' : ''} ${p.popular && isDark ? 'bg-white/[0.06]' : ''} ${p.popular && !isDark ? 'bg-white' : ''}`}
                  >
                    {p.badge && (
                      <span className={`absolute -top-2.5 start-3 text-[9.5px] font-black px-2 py-0.5 rounded-full shadow ${p.popular ? 'bg-[color:var(--nd-accent)] text-white' : (isDark ? 'bg-white/15 text-white' : 'bg-slate-800 text-white')}`}>
                        {p.badge}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {p.id === 'vip' && <Crown className="w-4 h-4 text-amber-400" />}
                      <span className="text-[13px] font-black">{p.name}</span>
                    </div>
                    <p className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.tagline}</p>
                    <div className="text-[color:var(--nd-accent)] font-black text-[15px] leading-tight">{price}</div>
                    <ul className={`mt-1 space-y-1 text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {p.perks.map((perk, pi) => (
                        <li key={pi} className="flex items-start gap-1.5">
                          <Check className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                    <span className={`mt-auto pt-2 text-center text-[11px] font-black rounded-xl py-1.5 ${isSel ? 'bg-[color:var(--nd-accent)] text-white' : (isDark ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-700')}`}>
                      {isSel ? 'انتخاب شد ✓' : 'انتخاب'}
                    </span>
                  </button>
                );
              })}
            </div>

            {urgency && (
              <p className={`text-[11px] text-center flex items-center justify-center gap-1.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                <Flame className="w-3.5 h-3.5" /> {urgency}
              </p>
            )}

            {/* How to buy — funnel */}
            <div className={`rounded-2xl border p-4 space-y-3 ${cardCls}`}>
              <p className="text-sm font-black flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" /> چطور فعال کنم؟</p>
              {purchaseNote && <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{purchaseNote}</p>}
              <div className="grid grid-cols-3 gap-2">
                <a href={tgUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 py-3 rounded-2xl border text-[11px] font-bold transition-colors hover:border-[color:var(--nd-accent)]" style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}>
                  <span className="text-lg">✈️</span> تلگرام
                </a>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 py-3 rounded-2xl border text-[11px] font-bold transition-colors hover:border-[color:var(--nd-accent)]" style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}>
                  <span className="text-lg">🟢</span> واتساپ
                </a>
                <a href={baleUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 py-3 rounded-2xl border text-[11px] font-bold transition-colors hover:border-[color:var(--nd-accent)]" style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}>
                  <span className="text-lg">💬</span> بله
                </a>
              </div>
              <p className={`text-[11px] text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>شماره تماس: <span dir="ltr" className="font-bold">{phoneLabel}</span></p>
            </div>

            {/* Unlock form */}
            <form onSubmit={handleUnlock} className={`rounded-2xl border p-4 space-y-3 ${cardCls}`}>
              <p className="text-sm font-black flex items-center gap-2"><KeyRound className="w-4 h-4 text-[color:var(--nd-accent)]" /> کد دسترسی دارم، فعالش کن</p>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                inputMode="tel"
                placeholder="09xxxxxxxxx"
                className={`w-full rounded-xl border px-4 py-3 text-base outline-none text-center ${inputCls}`}
              />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                dir="ltr"
                placeholder="کد دسترسی (مثلاً M4K-7Q2X)"
                className={`w-full rounded-xl border px-4 py-3 text-base outline-none text-center tracking-widest ${inputCls}`}
              />
              {gateError && paywallReason !== 'locked' && <p className="text-[12px] text-red-500 font-bold text-center">{gateError}</p>}
              <button
                type="submit"
                disabled={unlocking}
                className="nd-btn nd-btn-accent w-full py-3 text-sm disabled:opacity-50"
              >
                {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>{unlocking ? 'در حال بررسی…' : 'باز کردن دسترسی'}</span>
              </button>
              <p className={`text-[10.5px] text-center leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <RefreshCw className="w-3 h-3 inline -mt-0.5" /> دسترسی به شماره‌ی تو گره خورده و روی تعداد محدودی دستگاه فعال می‌شود؛ لطفاً کدت را با کسی به اشتراک نگذار.
              </p>
            </form>

            {/* back to chat if trial still usable or paid */}
            {(paid || (!paid && trialRemaining > 0)) && (
              <button onClick={() => setView('chat')} className={`w-full text-[12px] font-bold py-2 rounded-xl ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'}`}>
                ← بازگشت به گفتگو
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Starter prompts per tool (client-side; the server has its own copy for context).
const SUGGESTIONS: Record<string, string[]> = {
  'business-therapist': [
    'حس می‌کنم هرچی تبلیغ می‌کنم فروش بالا نمی‌ره',
    'بودجه‌ی محدودم رو کجا خرج کنم؟',
    'برند شخصیم رو چطوری بسازم؟',
  ],
  'growth-path': [
    'می‌خوام یه بیزینس آنلاین راه بندازم',
    'می‌خوام دیجیتال مارکتینگ یاد بگیرم',
    'می‌خوام عادت روزانه بسازم',
  ],
  'problem-solver': [
    'روی کدوم شبکه‌ی اجتماعی تمرکز کنم؟',
    'قیمت‌گذاری محصولم رو نمی‌دونم',
    'بین دو پیشنهاد شغلی موندم',
  ],
  'mock-customer': [
    'دوره‌ی آموزش مارکتینگ می‌فروشم',
    'خدمات طراحی سایت ارائه می‌دم',
    'محصول پوستی ارگانیک دارم',
  ],
};
