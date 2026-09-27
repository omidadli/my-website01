import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, RefreshCw, AlertTriangle, Mic, MicOff, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { Theme } from '../../types';
import { useContent } from '../../context/ContentContext';
import { api } from '../../services/api';
import { mascotAct } from './useMascotEvents';
import { SoulActSpec, applyAIRawAnswer, soulGetContext, soulSnapshotLine } from './soul';
import { MascotFigure } from './MascotAvatar';
import { usePreservedState } from '../../utils/statePreserver';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { chatStorage, StoredChatMsg } from '../../utils/chatStorage';
import { keyboardAudio } from '../../utils/keyboardAudio';
import { isPlainLeftClick, legacyHashToPath, navigate } from '../../utils/router';

interface AssistantPanelProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'model';
  content: string;
}

/**
 * Render model text with clickable markdown links — the AI cites article
 * sources as `[عنوان](/blog/…)`. Site paths navigate the SPA in place
 * (older transcripts may still contain `#/blog/…` links; those are upgraded).
 */
const renderAnswer = (text: string) => {
  const parts = String(text).split(/(\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
    const raw = m[2];
    const external = /^https?:\/\//i.test(raw);
    const href = external ? raw : raw.startsWith('#') ? legacyHashToPath(raw) || raw : raw.startsWith('/') ? raw : `/${raw}`;
    const internal = !external && href.startsWith('/');
    return (
      <a
        key={i}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={internal ? (e) => { if (isPlainLeftClick(e)) { e.preventDefault(); navigate(href); } } : undefined}
        className="break-words font-extrabold underline decoration-2 underline-offset-2"
      >
        {m[1]}
      </a>
    );
  });
};

/**
 * AssistantPanel — the mascot's own chat window.
 *
 * Layout: avatar "video bar" on top (live scene — the SAME scene the corner
 * mascot plays, via the shared bus), messages, FAQ quick chips + input.
 *
 * AI-state ↔ acting contract (100% mapping):
 *   user is typing          → `listen` (nods along)
 *   user sent a question    → `typing` loop (he writes the answer on his laptop)
 *   answer arrived          → `talk` loop for ~answer-length, then idle
 *   API error               → `oops` (surprised → apologetic)
 *   panel closed            → `greet` from the corner again
 */
export const AssistantPanel: React.FC<AssistantPanelProps> = ({ theme, open, onClose }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const cfg = data.CHAT_CONFIG;

  const [available, setAvailable] = usePreservedState<boolean>('assistant_api_available', false);
  const [messages, setMessages] = usePreservedState<ChatMsg[]>('assistant_chat_messages', () => {
    const saved = chatStorage.loadMessages();
    return saved.length > 0 ? saved : [];
  });
  const [input, setInput] = usePreservedState<string>('assistant_chat_input', '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [soundMuted, setSoundMuted] = useState<boolean>(() => keyboardAudio.getMuted());
  const [said, setSaid] = useState<string | null>(null);
  const saidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play realistic mechanical keyboard sounds while the mascot is in the 'typing' state
  useEffect(() => {
    if (busy && !soundMuted && open) {
      keyboardAudio.startTypingLoop();
    } else {
      keyboardAudio.stopTypingLoop();
    }

    return () => {
      keyboardAudio.stopTypingLoop();
    };
  }, [busy, soundMuted, open]);

  const toggleSoundMute = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    keyboardAudio.setMuted(next);
  };

  const scrollToBottom = useCallback((smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    } else if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Sync to localStorage wrapper — ensure last 5 messages persist across browser refresh
  useEffect(() => {
    if (messages.length > 0) {
      chatStorage.saveMessages(messages);
    }
  }, [messages]);

  const clearChatHistory = useCallback(() => {
    chatStorage.clearMessages();
    setMessages(cfg?.greeting ? [{ role: 'model', content: cfg.greeting }] : []);
    mascotAct('wave');
  }, [cfg?.greeting, setMessages]);

  // Web Speech API Integration
  const handleSpeechResult = useCallback((spokenText: string, isFinal: boolean) => {
    setInput((prev) => {
      // If user had existing text, smoothly append; otherwise replace with live speech
      return spokenText;
    });
    // Mascot actively listens while the user speaks
    mascotAct('listen', 2800);
  }, [setInput]);

  const handleSpeechError = useCallback((errText: string) => {
    setError(errText);
    mascotAct('oops');
  }, []);

  const {
    isListening,
    interimTranscript,
    isSupported: isSpeechSupported,
    errorMessage: speechError,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    lang: 'fa-IR',
    onResult: handleSpeechResult,
    onError: handleSpeechError,
  });

  const toggleVoiceInput = () => {
    if (isListening) {
      stopListening();
    } else {
      setError('');
      startListening();
      mascotAct('listen', 3000);
    }
  };

  useEffect(() => {
    api.probe().then(setAvailable);
  }, []);

  // Auto-scroll whenever messages change, the assistant starts typing, or panel opens
  useEffect(() => {
    // Immediate scroll
    scrollToBottom(true);

    // Follow-up tick to ensure layout and markdown rendering have finished calculating heights
    const timer = setTimeout(() => {
      scrollToBottom(true);
    }, 60);

    return () => clearTimeout(timer);
  }, [messages, busy, error, open, scrollToBottom]);

  useEffect(() => {
    if (open) {
      greet();
      const t = setTimeout(() => inputRef.current?.focus(), 380);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // clear pending listen-act on unmount
  useEffect(() => {
    return () => {
      if (listenTimer.current) clearTimeout(listenTimer.current);
      if (saidTimer.current) clearTimeout(saidTimer.current);
    };
  }, []);

  const greet = () => {
    if (messages.length === 0 && cfg?.greeting) {
      setMessages([{ role: 'model', content: cfg.greeting }]);
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (listenTimer.current) clearTimeout(listenTimer.current);
    setError('');
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    mascotAct('typing'); // he is "writing" the answer on his laptop
    const ctx = soulGetContext();
    const res = await api.sendChat(
      next.map((m) => ({ role: m.role, content: m.content })),
      {
        name: ctx.name,
        page: ctx.page,
        daypart: ctx.daypart,
        bodyState: soulSnapshotLine(), // behavioral continuity for the soul
      }
    );
    setBusy(false);
    if (res.ok && res.answer) {
      // the AI's act directive drives the body (pose/hold/bubble);
      // fallback: talking loop sized to the answer
      const { text, spec } = applyAIRawAnswer(res.answer);
      setMessages((prev) => [...prev, { role: 'model', content: text }]);
      // the AI's short spoken aside floats beside the avatar in the video bar
      if (spec?.bubble) {
        setSaid(String(spec.bubble).slice(0, 90));
        if (saidTimer.current) clearTimeout(saidTimer.current);
        saidTimer.current = setTimeout(() => setSaid(null), 3600);
      }
    } else {
      setError(res.error || 'پاسخ دریافت نشد؛ دوباره تلاش کنید.');
      mascotAct('oops'); // surprised → apologetic → idle
    }
  };

  const quickQuestions = (cfg?.quickQuestions || []).slice(0, 3);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          role="dialog"
          aria-label="دستیار هوشمند"
          className={`mascot-chat fixed bottom-24 start-2 z-[70] flex flex-col overflow-hidden rounded-[26px] shadow-2xl sm:bottom-28 sm:start-5 ${
            isDark ? 'border border-b-0 border-white/12 bg-[#12121d]' : 'border border-b-0 border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'
          }`}
        >
          {/* ---- avatar video bar ---- */}
          <div className="mascot-chat-stage relative h-36 shrink-0 overflow-hidden sm:h-44">
            <div className="mascot-chat-glow" />
            <AnimatePresence>
              {said && (
                <motion.div
                  key={said}
                  initial={{ opacity: 0, y: 6, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 24 }}
                  className="mascot-chat-said"
                >
                  {said}
                </motion.div>
              )}
            </AnimatePresence>
            {/* live avatar — mirrors the corner mascot's current scene */}
            <div className="mascot-chat-avatar">
              <MascotFigure />
            </div>
            <span
              className={`mascot-chat-status absolute start-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                isDark ? 'bg-black/35 text-emerald-300' : 'bg-white/75 text-emerald-600'
              }`}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {busy ? 'دارم جواب رو می‌نویسم...' : 'آنلاین'}
            </span>
            <div className="absolute end-2.5 top-2.5 flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSoundMute}
                aria-label={soundMuted ? 'فعال کردن صدای تایپ مسکات' : 'بی‌صدا کردن تایپ مسکات'}
                title={soundMuted ? 'فعال کردن صدای کیبورد مکانیکی' : 'قطع صدای کیبورد مکانیکی'}
                className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                  soundMuted
                    ? isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-white/10' : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'
                    : isDark ? 'text-indigo-400 hover:text-indigo-300 hover:bg-white/10' : 'text-[color:var(--nd-accent)] hover:bg-black/5'
                }`}
              >
                {soundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChatHistory}
                  aria-label="شروع مجدد گفتگو"
                  title="شروع مجدد گفتگو و پاک کردن پیام‌های اخیر"
                  className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-[color:var(--nd-ink-2)] hover:bg-black/5'
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="بستن گفتگو"
                className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                  isDark ? 'text-slate-300 hover:bg-white/10' : 'text-[color:var(--nd-ink-2)] hover:bg-black/5'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ---- messages ---- */}
          <div
            ref={listRef}
            className={`mascot-chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4 ${
              isDark ? 'bg-[#0e0e18]' : 'bg-[color:var(--nd-bg-soft)]'
            }`}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] break-words whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? isDark
                        ? 'rounded-es-sm bg-white/10 text-slate-100'
                        : 'rounded-es-sm bg-white text-[color:var(--nd-ink)] shadow-sm'
                      : isDark
                        ? 'rounded-ee-sm bg-indigo-500/90 text-white'
                        : 'rounded-ee-sm bg-[color:var(--nd-accent)] text-white shadow-sm'
                  }`}
                >
                  {m.role === 'model' ? renderAnswer(m.content) : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-end">
                <div className={`flex items-center gap-1.5 rounded-2xl rounded-ee-sm px-4 py-3 ${isDark ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            {!available && (
              <p className={`flex items-center justify-center gap-1.5 text-center text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                دستیار موقتاً در دسترس نیست
              </p>
            )}
            {error && <p className="text-center text-[10px] font-extrabold text-red-500">{error}</p>}
            {/* Scroll-to-bottom anchor */}
            <div ref={messagesEndRef} className="h-px w-full" aria-hidden="true" />
          </div>

          {/* ---- quick questions ---- */}
          {quickQuestions.length > 0 && messages.length <= 1 && (
            <div className={`flex shrink-0 flex-wrap gap-1.5 border-t px-3.5 py-2.5 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
              {quickQuestions.map((q: string) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={busy}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-[10.5px] font-extrabold transition-all disabled:opacity-50 ${
                    isDark
                      ? 'bg-white/8 text-slate-200 hover:bg-indigo-500/25'
                      : 'bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] hover:brightness-95'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* ---- input ---- */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isListening) stopListening();
              send(input);
            }}
            className={`flex shrink-0 flex-col gap-1.5 border-t px-3.5 py-3 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}
          >
            {/* Live speech feedback pill when active */}
            {isListening && (
              <div
                className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-[11px] animate-pulse ${
                  isDark
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                  <span className="font-extrabold">در حال شنیدن صدای شما...</span>
                </div>
                <button
                  type="button"
                  onClick={stopListening}
                  className="text-[10px] font-bold underline cursor-pointer hover:opacity-80"
                >
                  پایان ضبط
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // user is writing → the mascot nods along (rate-limited)
                  if (listenTimer.current) clearTimeout(listenTimer.current);
                  listenTimer.current = setTimeout(() => mascotAct('listen', 2600), 500);
                }}
                placeholder={isListening ? 'در حال تبدیل گفتار به متن...' : 'سوالت رو بنویس یا با میکروفون بگو...'}
                className={`h-10 flex-1 rounded-xl px-3.5 text-base font-bold outline-none transition-colors ${
                  isDark
                    ? 'bg-white/8 text-slate-100 placeholder:text-slate-500 focus:bg-white/12'
                    : 'bg-[color:var(--nd-bg)] text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)] focus:bg-white'
                }`}
              />

              {/* Web Speech API Microphone Button */}
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={busy}
                  aria-label={isListening ? 'توقف ضبط صدا' : 'شروع ضبط صدا'}
                  title={isListening ? 'توقف ضبط صدا' : 'صحبت با دستیار صوتی'}
                  className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 animate-pulse scale-105'
                      : isDark
                        ? 'bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white'
                        : 'bg-[color:var(--nd-bg)] text-slate-600 hover:bg-[color:var(--nd-accent-soft)] hover:text-[color:var(--nd-accent)]'
                  } disabled:opacity-40`}
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="ارسال"
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
