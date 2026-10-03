import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Send,
  Lock,
  ShieldCheck,
  Sparkles,
  Loader2,
  KeyRound,
  ArrowRight,
  RefreshCw,
  RotateCcw,
  Copy,
  Check,
  Crown,
  Gift,
  Flame,
  Star,
  Coins,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { api } from '../../services/api';
import { getChatSessionId, resetChatSession } from '../../utils/chatStorage';
import { AiToolMeta } from '../../data/tools';
import { PERSONAL_INFO } from '../../data/content';
import {
  getPlans,
  resolvePlanPrice,
  resolveFreeTrial,
  ToolPlan,
  INITIAL_FREE_COINS,
  COINS_PER_MESSAGE,
  calculateRemainingCoins,
  getNeuromarketingTrigger,
} from '../../../lib/toolPlans';
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
const coinsStorageKey = (id: string, devId: string) => `nd_tool_coins_${id}_${devId}`;
const toFa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const getDeviceId = (): string => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
              <span
                className={`mt-0.5 w-4 h-4 rounded-[6px] border flex items-center justify-center text-[10px] shrink-0 ${
                  done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current opacity-60'
                }`}
              >
                {done ? '✓' : ''}
              </span>
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

export const ToolChatModal: React.FC<Props> = ({
  tool,
  theme,
  data,
  channels,
  purchaseNote,
  socialProof,
  urgency,
  onClose,
}) => {
  const isDark = theme === 'dark';
  const deviceId = getDeviceId();
  const plans = getPlans(tool.id);
  const freeTrialLimit = resolveFreeTrial(data);
  const neuro = getNeuromarketingTrigger(tool.id);

  const [view, setView] = useState<View>('checking');
  const [paid, setPaid] = useState(false);

  // Neuromarketing Coin Economy State
  const [coins, setCoins] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(coinsStorageKey(tool.id, deviceId));
      if (saved !== null) {
        const n = parseInt(saved, 10);
        if (!isNaN(n)) return n;
      }
    } catch { /* ignore */ }
    return INITIAL_FREE_COINS;
  });
  const [burnedCoins, setBurnedCoins] = useState<number | null>(null);

  // Quota for paid accounts
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [paywallReason, setPaywallReason] = useState<'trial' | 'quota' | 'locked' | 'browse'>('trial');

  // Gate form
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>(plans.find((p) => p.popular)?.id || plans[0]?.id || '');

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist coins locally
  const updateCoins = (newVal: number) => {
    setCoins(newVal);
    try {
      localStorage.setItem(coinsStorageKey(tool.id, deviceId), String(newVal));
    } catch { /* ignore */ }
  };

  const trialWelcome = `سلام 👋 من «${tool.name}» هستم. ${tool.tagline}

🎁 **${toFa(INITIAL_FREE_COINS)} سکه طلایی هدیه خوش‌آمدگویی** به کیف شما اضافه شد!
هر تحلیل تخصصی و عمیق، فقط **${toFa(COINS_PER_MESSAGE)} سکه** کسر می‌کند.

دغدغه، سوال یا کمپینت رو مطرح کن تا با هم عمیقاً تحلیلش کنیم:`;

  const copyMsg = (text: string, idx: number) => {
    try {
      navigator.clipboard?.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch { /* ignore */ }
  };

  const resetChat = () => {
    if (sending) return;
    // a brand-new chat = a brand-new conversation memory on the server
    resetChatSession(tool.id);
    setMessages([{ role: 'assistant', content: welcomeMsg || trialWelcome }]);
  };

  const selPlan = plans.find((p) => p.id === selectedPlan);
  const purchaseMsg = `سلام امید 👋 می‌خوام پلنِ «${selPlan?.name || ''}» از ابزار «${tool.name}» رو فعال کنم${
    selPlan ? ` (${resolvePlanPrice(tool.id, selPlan, data)} — ${selPlan.dailyCost || ''})` : ''
  } تا سکه‌های باقیمانده‌ام ذخیره بمونه و بدون محدودیت استفاده کنم. لطفاً راهنمایی کن.`;
  const waBase = channels?.whatsappUrl || PERSONAL_INFO.whatsappUrl;
  const waUrl = `${waBase}${waBase.includes('?') ? '&' : '?'}text=${encodeURIComponent(purchaseMsg)}`;
  const tgUrl = channels?.telegramUrl || PERSONAL_INFO.telegramUrl;
  const baleUrl = channels?.baleUrl || 'https://ble.ir/';
  const phoneLabel = channels?.phone || PERSONAL_INFO.phoneFormatted;

  // Decide initial state: valid stored token → paid chat; else trial chat or plans.
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = (() => {
        try {
          return localStorage.getItem(tokenKey(tool.id));
        } catch {
          return null;
        }
      })();
      if (stored) {
        const r = await api.toolSession({ token: stored, productId: tool.id, deviceId });
        if (!alive) return;
        if (r.ok) {
          setPaid(true);
          setWelcomeMsg(r.tool?.welcome || '');
          setMessages([
            {
              role: 'assistant',
              content: r.tool?.welcome || `سلام 👋 دسترسیت فعاله. با «${tool.name}» چطور می‌تونم کمکت کنم؟`,
            },
          ]);
          setView('chat');
          return;
        }
        try {
          localStorage.removeItem(tokenKey(tool.id));
        } catch {}
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
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id, deviceId]);

  // Escape closes; lock body scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
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
      try {
        localStorage.setItem(tokenKey(tool.id), r.token);
      } catch {}
      setPaid(true);
      setQuota(null);
      setWelcomeMsg(r.tool?.welcome || '');
      setMessages([
        {
          role: 'assistant',
          content: r.tool?.welcome || `سلام 👋 دسترسیت فعال شد. با «${tool.name}» چطور می‌تونم کمکت کنم؟`,
        },
      ]);
      setView('chat');
    } else {
      setGateError(r.error || 'باز کردن دسترسی ناموفق بود. لطفاً شماره و کد را بررسی فرمایید.');
    }
  };

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || sending) return;

    // Check coin balance if unauthenticated
    if (!paid && coins < COINS_PER_MESSAGE) {
      setPaywallReason('trial');
      setView('plans');
      return;
    }

    const token = (() => {
      try {
        return localStorage.getItem(tokenKey(tool.id)) || '';
      } catch {
        return '';
      }
    })();

    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);

    const history = next.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      content: m.content,
    }));
    // stable conversation id per product → the server keeps the chat memory,
    // reviews it before answering and continues the same thread across key switches
    const sessionId = getChatSessionId(tool.id);
    const r = await api.toolChat({ token: token || undefined, productId: tool.id, deviceId, sessionId, messages: history });
    setSending(false);

    if (r.ok && r.answer) {
      setMessages((prev) => [...prev, { role: 'assistant', content: r.answer! }]);

      // Update coin state and trigger burn effect
      if (r.coins) {
        updateCoins(r.coins.balance);
        setBurnedCoins(r.coins.cost || COINS_PER_MESSAGE);
        setTimeout(() => setBurnedCoins(null), 3000);
      } else if (r.trial) {
        const nextC = calculateRemainingCoins(r.trial.used);
        updateCoins(nextC);
        setBurnedCoins(COINS_PER_MESSAGE);
        setTimeout(() => setBurnedCoins(null), 3000);
      }

      if (r.quota) setQuota(r.quota);
    } else if (r.code === 'trial_ended') {
      if (r.coins) {
        updateCoins(r.coins.balance);
      } else {
        updateCoins(50); // dangling coins for loss aversion
      }
      setPaywallReason('trial');
      setView('plans');
    } else if (r.code === 'quota') {
      if (r.quota) setQuota(r.quota);
      setPaywallReason('quota');
      setView('plans');
    } else if (r.code === 'locked' || r.code === 'expired') {
      try {
        localStorage.removeItem(tokenKey(tool.id));
      } catch {}
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

  // ---- status pill in the header (gold coin counter / quota bar) ----
  const headerStatus = () => {
    if (view !== 'chat') return null;
    if (paid && quota && quota.limit > 0) {
      const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
      return (
        <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-[120px]">
          <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {toFa(quota.remaining)} پیام باقی‌مانده
          </span>
          <div className={`w-28 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
            <div className="h-full rounded-full bg-[color:var(--nd-accent)]" style={{ width: `${100 - pct}%` }} />
          </div>
        </div>
      );
    }
    if (paid) {
      return (
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
          <Crown className="w-3.5 h-3.5" /> دسترسی ویژه فعال
        </span>
      );
    }
    // Trial: 500 Gift Coins Counter
    const canSend = coins >= COINS_PER_MESSAGE;
    return (
      <div
        onClick={() => {
          setPaywallReason('browse');
          setView('plans');
        }}
        className={`cursor-pointer group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-sm transition-all duration-300 ${
          canSend
            ? 'bg-gradient-to-r from-amber-500/20 via-yellow-400/25 to-amber-500/20 text-amber-400 border border-amber-400/50 hover:border-amber-300'
            : 'bg-red-500/15 text-red-400 border border-red-500/40 animate-pulse'
        }`}
        title="موجودی سکه‌های طلایی شما — کلیک برای مشاهده پلن‌ها و شارژ"
      >
        <span className="text-sm">🪙</span>
        <span className="tracking-tight">{toFa(coins)} سکه هدیه</span>
        {!canSend && (
          <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.2 rounded font-black mr-0.5">شارژ</span>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl h-[92vh] supports-[height:92dvh]:h-[92dvh] sm:h-[86vh] sm:supports-[height:86dvh]:h-[86dvh] max-h-[860px] flex flex-col rounded-t-[28px] sm:rounded-[28px] border shadow-2xl overflow-hidden ${shellBg}`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${
            isDark ? 'border-white/10' : 'border-slate-100'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#8b5cf6] via-[#4c8dff] to-[#5ce1e6] flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base truncate">{tool.name}</h3>
              <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{tool.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerStatus()}
            {view === 'chat' && (
              <button
                onClick={resetChat}
                className={`p-2 rounded-full transition-colors ${
                  isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
                }`}
                aria-label="گفتگوی جدید"
                title="گفتگوی جدید"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-2 rounded-full transition-colors ${
                isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-600'
              }`}
              aria-label="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {view === 'checking' ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin opacity-60 text-[color:var(--nd-accent)]" />
          </div>
        ) : view === 'chat' ? (
          /* ---------------- CHAT (trial or paid) ---------------- */
          <>
            {/* Neuromarketing Coin Economy Banner */}
            {!paid && (
              <div
                className={`px-4 sm:px-5 py-2 text-[11.5px] flex items-center justify-between gap-2 border-b transition-colors ${
                  coins >= COINS_PER_MESSAGE
                    ? isDark
                      ? 'bg-amber-400/10 border-amber-400/20 text-amber-300'
                      : 'bg-amber-50/90 border-amber-200 text-amber-900'
                    : isDark
                    ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-base leading-none">🪙</span>
                  {coins >= COINS_PER_MESSAGE ? (
                    <span className="truncate">
                      اعتبار هدیه شما: <strong>{toFa(coins)} سکه طلایی</strong> (کسر {toFa(COINS_PER_MESSAGE)} سکه به ازای هر تحلیل عمیق)
                    </span>
                  ) : (
                    <span className="font-extrabold truncate">
                      ⚠️ فقط {toFa(coins)} سکه باقی مانده؛ برای ارسال تحلیل بعدی به {toFa(COINS_PER_MESSAGE)} سکه نیاز است.
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setPaywallReason(coins < COINS_PER_MESSAGE ? 'trial' : 'browse');
                    setView('plans');
                  }}
                  className="font-black text-xs underline underline-offset-4 hover:opacity-80 shrink-0"
                >
                  {coins >= COINS_PER_MESSAGE ? 'مشاهده پلن‌ها' : 'تمدید و نجات ۵۰ سکه ←'}
                </button>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] shadow-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[color:var(--nd-accent)] text-white rounded-tr-md'
                        : isDark
                        ? 'bg-white/8 text-slate-100 rounded-tl-md border border-white/5'
                        : 'bg-slate-100 text-slate-800 rounded-tl-md border border-slate-200/60'
                    }`}
                  >
                    <RichText text={m.content} />
                  </div>
                  {m.role === 'assistant' && i > 0 && (
                    <button
                      onClick={() => copyMsg(m.content, i)}
                      className={`mt-1 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                        isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {copiedIdx === i ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> کپی شد
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> کپی
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex justify-end">
                  <div className={`rounded-2xl px-4 py-3 border ${isDark ? 'bg-white/8 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-[color:var(--nd-accent)] opacity-60 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[color:var(--nd-accent)] opacity-60 animate-bounce" style={{ animationDelay: '120ms' }} />
                        <span className="w-2 h-2 rounded-full bg-[color:var(--nd-accent)] opacity-60 animate-bounce" style={{ animationDelay: '240ms' }} />
                      </div>
                      <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>در حال پردازش تحلیلی…</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions (only at the very start) */}
            {messages.length <= 1 && (
              <div className="px-4 sm:px-5 pb-2 flex flex-wrap gap-2">
                {SUGGESTIONS[tool.id]?.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                      isDark
                        ? 'border-white/15 hover:bg-white/10 text-slate-300'
                        : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input area with animated coin deduction chip */}
            <div className="relative">
              {burnedCoins && (
                <div className="absolute -top-7 right-6 z-10 animate-bounce">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md">
                    <span>🪙 -{toFa(burnedCoins)} سکه کسر شد</span>
                  </span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className={`flex items-end gap-2 px-3 sm:px-4 py-3 border-t ${
                  isDark ? 'border-white/10' : 'border-slate-100'
                }`}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={tool.placeholder || 'پیامت را بنویس…'}
                  className={`flex-1 resize-none rounded-2xl border px-4 py-3 text-base outline-none max-h-32 transition-colors ${inputCls}`}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="w-11 h-11 rounded-2xl bg-[color:var(--nd-accent)] text-white flex items-center justify-center disabled:opacity-40 shrink-0 shadow-sm transition-transform active:scale-95"
                  aria-label="ارسال"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 -rotate-45" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* ---------------- PLANS / PAYWALL (Neuromarketing Optimized) ---------------- */
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 space-y-6">
            {/* Neuromarketing Headline with Zeigarnik / Loss Aversion hook */}
            <div className="text-center space-y-2.5">
              {paywallReason === 'trial' && (
                <>
                  <div
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black ${
                      isDark ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    <Coins className="w-4 h-4 text-amber-500 animate-pulse" />
                    <span>شما هنوز {toFa(coins)} سکه طلایی فعال در حساب خود دارید!</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-[color:var(--nd-accent)]">
                    اجازه ندهید سکه‌ها و تحلیل نیمه‌کاره‌تان بسوزد
                  </h3>
                  <p className={`text-[12.5px] leading-relaxed max-w-xl mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    عملکرد و هوشمندی «{tool.name}» را مشاهده کردید. با تمدید اشتراک، این {toFa(coins)} سکه ذخیره شده و قفل تحلیل‌های نامحدود و پیشرفته بلافاصله برایتان باز می‌شود.
                  </p>
                </>
              )}

              {paywallReason === 'quota' && (
                <>
                  <div
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black ${
                      isDark ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <Flame className="w-4 h-4 text-amber-500" /> سهمیه‌ی این دوره به پایان رسید
                  </div>
                  <h4 className="text-base font-black">برای ادامه، پلن پرمصرف یا تمدید را انتخاب کن</h4>
                  <p className={`text-[12.5px] leading-relaxed max-w-xl mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    بهره‌وری شما با این دستیار فوق‌العاده بوده است 👏 برای پشتیبانی مستمر از تصمیمات کاری‌تان، پلن حرفه‌ای بالاترین صرفه را دارد.
                  </p>
                </>
              )}

              {(paywallReason === 'locked' || paywallReason === 'browse') && (
                <>
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black ${
                      isDark ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[color:var(--nd-accent)]" /> پلن‌های اختصاصی «{tool.name}»
                  </div>
                  <h4 className="text-base sm:text-lg font-black">{neuro.headline}</h4>
                  <p className={`text-[12px] leading-relaxed max-w-xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {neuro.subheadline}
                  </p>
                  {gateError && paywallReason === 'locked' && (
                    <p className="text-[12px] text-red-500 font-bold">{gateError}</p>
                  )}
                </>
              )}

              {socialProof && (
                <p className={`text-[11.5px] flex items-center justify-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {socialProof}
                </p>
              )}
            </div>

            {/* Neuromarketing Asymmetric Value Anchor Box */}
            <div
              className={`p-4 rounded-2xl border text-right space-y-3 ${
                isDark
                  ? 'bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-transparent border-amber-400/25'
                  : 'bg-gradient-to-br from-amber-50 via-indigo-50/40 to-white border-amber-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black flex items-center gap-1.5 text-amber-500">
                  <TrendingUp className="w-4 h-4" /> مقایسه ارزش مالی این ابزار در بازار واقعی:
                </span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 self-start sm:self-auto">
                  {neuro.guaranteeBadge}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div
                  className={`p-3 rounded-xl border ${
                    isDark ? 'bg-black/30 border-white/10' : 'bg-white/80 border-slate-200'
                  }`}
                >
                  <p className="text-red-400 font-bold line-through text-[11px]">{neuro.anchorRealValue}</p>
                  <p className="font-extrabold mt-0.5">مشاوره حضوری یا استخدام نیرو</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    هزینه‌های میلیونی سنگین، هماهنگی سخت زمان، بدون دسترسی در نیمه‌شب و تعطیلات.
                  </p>
                </div>
                <div
                  className={`p-3 rounded-xl border border-emerald-500/40 ${
                    isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'
                  }`}
                >
                  <p className="text-emerald-500 font-black text-[11.5px]">{neuro.dailyHook}</p>
                  <p className="font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-300">
                    هوش مصنوعی اختصاصی امید عدلی
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 leading-relaxed">
                    {neuro.roiComparison}
                  </p>
                </div>
              </div>
            </div>

            {/* Plan cards with daily cost breakdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
              {plans.map((p: ToolPlan) => {
                const isSel = selectedPlan === p.id;
                const price = resolvePlanPrice(tool.id, p, data);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    className={`relative text-right rounded-2xl border p-4 flex flex-col gap-2.5 transition-all text-start ${
                      isSel
                        ? 'border-[color:var(--nd-accent)] ring-2 ring-[color:var(--nd-accent)]/40 shadow-xl'
                        : isDark
                        ? 'border-white/10 hover:border-white/25 bg-white/[0.02]'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    } ${p.popular ? 'sm:scale-[1.03] sm:z-10' : ''} ${
                      p.popular && isDark ? 'bg-white/[0.05] border-[color:var(--nd-accent)]/40' : ''
                    }`}
                  >
                    {p.badge && (
                      <span
                        className={`absolute -top-2.5 start-3 text-[9.5px] font-black px-2.5 py-0.5 rounded-full shadow ${
                          p.popular
                            ? 'bg-gradient-to-r from-amber-500 to-[color:var(--nd-accent)] text-white'
                            : isDark
                            ? 'bg-white/15 text-white'
                            : 'bg-slate-800 text-white'
                        }`}
                      >
                        {p.badge}
                      </span>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {p.id === 'vip' ? (
                          <Crown className="w-4 h-4 text-amber-400" />
                        ) : p.popular ? (
                          <Sparkles className="w-4 h-4 text-[color:var(--nd-accent)]" />
                        ) : (
                          <Zap className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-[13px] font-black">{p.name}</span>
                      </div>
                    </div>

                    <p className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.tagline}</p>

                    {/* Price & Tangible Daily Breakdown */}
                    <div className="space-y-0.5">
                      <div className="text-[color:var(--nd-accent)] font-black text-base leading-tight">{price}</div>
                      {p.dailyCost && (
                        <div className="text-[11px] font-extrabold text-amber-500 dark:text-amber-400 flex items-center gap-1">
                          <span>🔥</span>
                          <span>{p.dailyCost}</span>
                        </div>
                      )}
                      {p.dailyComparison && (
                        <div className={`text-[9.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          ({p.dailyComparison})
                        </div>
                      )}
                    </div>

                    <ul className={`mt-1 space-y-1.5 text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {p.perks.map((perk, pi) => (
                        <li key={pi} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>

                    <span
                      className={`mt-auto pt-2 text-center text-[11px] font-black rounded-xl py-2 transition-colors ${
                        isSel
                          ? 'bg-[color:var(--nd-accent)] text-white shadow-sm'
                          : isDark
                          ? 'bg-white/8 text-slate-200 hover:bg-white/12'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {isSel ? 'پلن انتخابی شما ✓' : 'انتخاب این پلن'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Social proof nudge */}
            <div className={`text-center text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline ml-1 -mt-0.5" />
              <span>{neuro.socialBadge}</span>
            </div>

            {/* How to buy — Instant Channel Funnel */}
            <div className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${cardCls}`}>
              <p className="text-sm font-black flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> روش سریع فعال‌سازی و دریافت کد دسترسی:
              </p>
              {purchaseNote && (
                <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {purchaseNote}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <a
                  href={tgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-bold transition-all hover:border-[color:var(--nd-accent)] hover:shadow-sm"
                  style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}
                >
                  <span className="text-xl">✈️</span>
                  <span>تلگرام</span>
                  <span className="text-[9.5px] opacity-70">پاسخگویی سریع</span>
                </a>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-bold transition-all hover:border-[color:var(--nd-accent)] hover:shadow-sm"
                  style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}
                >
                  <span className="text-xl">🟢</span>
                  <span>واتساپ</span>
                  <span className="text-[9.5px] opacity-70">ارتباط مستقیم</span>
                </a>
                <a
                  href={baleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-bold transition-all hover:border-[color:var(--nd-accent)] hover:shadow-sm"
                  style={{ borderColor: isDark ? 'rgba(255,255,255,.15)' : '#e2e8f0' }}
                >
                  <span className="text-xl">💬</span>
                  <span>پیام‌رسان بله</span>
                  <span className="text-[9.5px] opacity-70">بدون فیلتر</span>
                </a>
              </div>
              <p className={`text-[11px] text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                پشتیبانی تلفنی و اداری: <span dir="ltr" className="font-black text-xs text-[color:var(--nd-accent)]">{phoneLabel}</span>
              </p>
            </div>

            {/* Instant Unlock Form */}
            <form onSubmit={handleUnlock} className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardCls}`}>
              <p className="text-sm font-black flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[color:var(--nd-accent)]" /> کد دسترسی دارم، بلافاصله فعالش کن:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  inputMode="tel"
                  placeholder="09xxxxxxxxx"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none text-center ${inputCls}`}
                />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  dir="ltr"
                  placeholder="کد دسترسی (مثلاً M4K-7Q2X)"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none text-center tracking-widest uppercase ${inputCls}`}
                />
              </div>
              {gateError && paywallReason !== 'locked' && (
                <p className="text-[12px] text-red-500 font-bold text-center">{gateError}</p>
              )}
              <button
                type="submit"
                disabled={unlocking || !phone || !code}
                className="nd-btn nd-btn-accent w-full py-3 text-sm disabled:opacity-50 shadow-md font-black"
              >
                {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>{unlocking ? 'در حال تایید دسترسی…' : 'ورود و باز کردن دسترسی نامحدود'}</span>
              </button>
              <p className={`text-[10px] text-center leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <RefreshCw className="w-3 h-3 inline -mt-0.5 ml-1" />
                دسترسی به شماره موبایل شما متصل است و روی دستگاه‌های مجاز فعال خواهد شد.
              </p>
            </form>

            {/* Back to chat if paid or trial has enough coins */}
            {(paid || coins >= COINS_PER_MESSAGE) && (
              <button
                onClick={() => setView('chat')}
                className={`w-full text-xs font-bold py-2.5 rounded-xl transition-colors ${
                  isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                ← بازگشت به محیط چت و گفتگو
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Starter prompts per tool
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
