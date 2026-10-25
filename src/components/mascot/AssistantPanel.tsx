import { CHAT_MAX_QUESTION } from '../../../lib/chatRequest';
import { nextChatMessages } from '../../utils/chatSubmission';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, RefreshCw, AlertTriangle, Mic, MicOff, Volume2, VolumeX, RotateCcw, Sparkles, Copy, Check, ArrowDown, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { Theme } from '../../types';
import { useContent } from '../../context/ContentContext';
import { api } from '../../services/api';
import { mascotAct } from './useMascotEvents';
import { SoulActSpec, applyAIRawAnswer, soulGetContext, soulSnapshotLine } from './soul';
import { MascotFigure } from './MascotAvatar';
import { usePreservedState } from '../../utils/statePreserver';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { chatStorage, StoredChatMsg, getChatSessionId, resetChatSession } from '../../utils/chatStorage';
import { keyboardAudio } from '../../utils/keyboardAudio';
import { ChatAnswer } from './ChatAnswer';

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

  const sendingRef = useRef(false);
  const failedQuestion = useRef<string | null>(null);
  const voiceDraft = useRef('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [readingMode, setReadingMode] = usePreservedState<boolean>('assistant_reading_mode', false);
  const [textSize, setTextSize] = usePreservedState<number>('assistant_text_size', 15);
  const [confirmClear, setConfirmClear] = useState(false);
  const answerArrived = useRef(false);
  const lastAnswerRef = useRef<HTMLElement>(null);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight,
      behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  }, []);

  // Sync to localStorage wrapper — ensure last 5 messages persist across browser refresh
  useEffect(() => {
    if (messages.length > 0) {
      chatStorage.saveMessages(messages);
    }
  }, [messages]);

  const clearChatHistory = useCallback(() => {
    if (busy) return;
    failedQuestion.current = null;
    setSaid(null);
    if (saidTimer.current) clearTimeout(saidTimer.current);
    setConfirmClear(false);
    setCopied(null);
    setNearBottom(true);
    setError('');
    setInput('');
    chatStorage.clearMessages();
    resetChatSession('site-assistant'); // a fresh conversation gets a fresh memory
    setMessages(cfg?.greeting ? [{ role: 'model', content: cfg.greeting }] : []);
    mascotAct('wave');
  }, [cfg?.greeting, setMessages, busy, setInput]);

  // Web Speech API Integration
  const handleSpeechResult = useCallback((spokenText: string, isFinal: boolean) => {
    if (sendingRef.current) return;
    setInput([voiceDraft.current, spokenText].filter(Boolean).join(' '));
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
      voiceDraft.current = input;
      startListening();
      mascotAct('listen', 3000);
    }
  };

  // CMS availability does not prove that a chat model/key is healthy.


  useEffect(() => { if (open) setNearBottom(true); }, [open]);

  useEffect(() => {
    if (!open && isListening) stopListening();
  }, [open, isListening, stopListening]);

  // A fresh answer starts at its beginning, never at the bottom of a wall of text.
  // If the user is reading older messages, leave their scroll position alone.
  useEffect(() => {
    const freshAnswer = answerArrived.current;
    answerArrived.current = false;
    if (!open || !nearBottom) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const answer = lastAnswerRef.current;
      if (freshAnswer && list && answer) {
        const top = answer.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 18;
        list.scrollTo({ top, behavior: 'auto' });
      } else scrollToBottom(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy, error, open, scrollToBottom]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(150, Math.max(54, textarea.scrollHeight))}px`;
  }, [input, open]);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (open) {
      const previousFocus = document.activeElement as HTMLElement | null;
      greet();
      const t = setTimeout(() => inputRef.current?.focus(), 380);
      return () => { clearTimeout(t); previousFocus?.focus(); };
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
    if (!q || sendingRef.current) return;
    if (q.length > CHAT_MAX_QUESTION) { setError('پیام بیش از حد طولانی است؛ آن را به چند سؤال کوتاه‌تر تقسیم کنید.'); return; }
    sendingRef.current = true;
    if (listenTimer.current) clearTimeout(listenTimer.current);
    setNearBottom(true);
    setError('');
    const next = nextChatMessages(messages, q, failedQuestion.current);
    setMessages(next);
    setInput('');
    setBusy(true);
    mascotAct('typing'); // he is "writing" the answer on his laptop
    const ctx = soulGetContext();
    try {
    const res = await api.sendChat(
      next.map((m) => ({ role: m.role, content: m.content })),
      {
        name: ctx.name,
        page: ctx.page,
        daypart: ctx.daypart,
        bodyState: soulSnapshotLine(), // behavioral continuity for the soul
      },
      // stable conversation id → the server keeps the memory of this chat and
      // reviews it before every answer (even after switching API keys)
      getChatSessionId('site-assistant')
    );
    if (res.ok && res.answer) {
      // the AI's act directive drives the body (pose/hold/bubble);
      // fallback: talking loop sized to the answer
      failedQuestion.current = null;
      setAvailable(true);
      answerArrived.current = true;
      const { text, spec } = applyAIRawAnswer(res.answer);
      setMessages((prev) => [...prev, { role: 'model', content: text }]);
      // the AI's short spoken aside floats beside the avatar in the video bar
      if (spec?.bubble) {
        setSaid(String(spec.bubble).slice(0, 90));
        if (saidTimer.current) clearTimeout(saidTimer.current);
        saidTimer.current = setTimeout(() => setSaid(null), 3600);
      }
    } else {
      failedQuestion.current = q;
      if (res.code === 'AI_UNAVAILABLE') setAvailable(false);
      setError(res.error || 'پاسخ دریافت نشد؛ دوباره تلاش کنید.');
      mascotAct('oops'); // surprised → apologetic → idle
    }
    } catch {
      failedQuestion.current = q;
      setError('ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
      mascotAct('oops');
    } finally { sendingRef.current = false; setBusy(false); }
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
          aria-labelledby="assistant-title"
          dir="rtl" lang="fa"
          data-chat-theme={theme}
          data-reading-mode={readingMode}
          style={{ '--chat-text-size': `${Math.min(19, Math.max(14, textSize))}px` } as React.CSSProperties}
          className={`mascot-chat fixed bottom-24 start-2 z-[70] flex flex-col overflow-hidden rounded-[26px] shadow-2xl sm:bottom-28 sm:start-5 ${
            isDark ? 'border border-b-0 border-white/12 bg-[#12121d]' : 'border border-b-0 border-[color:var(--nd-line)] bg-[color:var(--nd-surface)]'
          }`}
        >
          {/* ---- avatar video bar ---- */}
          <div className="mascot-chat-stage relative shrink-0 overflow-hidden">
            <div className="mascot-chat-glow" />
            <div className="chat-heading">
              <span className="chat-eyebrow"><Sparkles size={12} /> همراه هوشمند شما</span>
              <h2 id="assistant-title">گفت‌وگو با دستیار امید</h2>
              <p>از یک سؤال، تا یک مسیر روشن‌تر</p>
            </div>
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
              {busy ? 'در حال نوشتن پاسخ' : available === null ? 'آمادهٔ ارسال پیام' : available ? 'آمادهٔ گفت‌وگو' : 'اتصال محدود'}
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
                  onClick={() => setConfirmClear(true)}
                  disabled={busy}
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

          <div className="chat-reading-toolbar" role="group" aria-label="تنظیمات خوانایی">
            <button type="button" aria-pressed={readingMode} onClick={() => setReadingMode(!readingMode)}>
              {readingMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {readingMode ? 'نمای جمع‌وجور' : 'حالت مطالعه'}
            </button>
            <div className="chat-font-controls">
              <span>اندازهٔ متن</span>
              <button type="button" aria-label="کوچک‌تر کردن متن" disabled={textSize <= 14} onClick={() => setTextSize(Math.max(14, textSize - 1))}><Minus size={14} /></button>
              <output aria-live="polite" aria-label="اندازهٔ فعلی متن">{textSize.toLocaleString('fa-IR')}</output>
              <button type="button" aria-label="بزرگ‌تر کردن متن" disabled={textSize >= 19} onClick={() => setTextSize(Math.min(19, textSize + 1))}><Plus size={14} /></button>
            </div>
          </div>
          {confirmClear && <div className="chat-clear-confirm" role="group" aria-label="تأیید پاک کردن گفتگو">
            <p>گفت‌وگوی فعلی پاک شود؟ این کار برگشت‌پذیر نیست.</p>
            <button type="button" onClick={clearChatHistory} disabled={busy}>پاک کردن و شروع دوباره</button>
            <button type="button" onClick={() => setConfirmClear(false)}>انصراف</button>
          </div>}
          {/* ---- messages ---- */}
          <div
            ref={listRef}
            onScroll={(e) => { const el = e.currentTarget; setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90); }}
            role="log" aria-label="پیام‌های گفتگو" aria-live="polite" aria-relevant="additions"
            className={`mascot-chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4 ${
              isDark ? 'bg-[#0e0e18]' : 'bg-[color:var(--nd-bg-soft)]'
            }`}
          >
            <div className="chat-conversation-start"><span>فضایی برای سؤال‌های شما</span></div>
            {messages.map((m, i) => (
              <article key={i} ref={m.role === 'model' && i === messages.length - 1 ? lastAnswerRef : undefined} className={`chat-message chat-message--${m.role}`}>
                <div className="chat-message-author">{m.role === 'model' ? <><Sparkles size={13} /> دستیار امید</> : 'شما'}</div>
                <div className="chat-message-body" dir="rtl">
                  {m.role === 'model' ? <ChatAnswer text={m.content} /> : m.content}
                </div>
                {m.role === 'model' && <button type="button" className="chat-copy" aria-label="کپی پاسخ" onClick={async () => {
                  try { await navigator.clipboard.writeText(m.content); setCopied(i); }
                  catch { setError('کپی خودکار ممکن نیست؛ متن پاسخ را انتخاب و کپی کنید.'); }
                }}>{copied === i ? <Check size={13} /> : <Copy size={13} />}{copied === i ? 'کپی شد' : 'کپی پاسخ'}</button>}
              </article>
            ))}
            {busy && (
              <div className="chat-typing" role="status"><span>دستیار در حال نوشتن است</span>
                <div className={`flex items-center gap-1.5 rounded-2xl rounded-br-sm px-4 py-3 ${isDark ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--nd-accent)]" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            {available === false && (
              <p className={`flex items-center justify-center gap-1.5 text-center text-[10px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                دستیار موقتاً در دسترس نیست
              </p>
            )}
            {error && <div className="chat-error" role="alert"><AlertTriangle size={16} /><span>{error}</span>
              <button type="button" disabled={busy} onClick={() => {
                const last = [...messages].reverse().find(m => m.role === 'user');
                if (last && failedQuestion.current) { send(failedQuestion.current); }
                else { setError(''); inputRef.current?.focus(); }
              }}>تلاش دوباره</button></div>}
            {/* Scroll-to-bottom anchor */}
            <div ref={messagesEndRef} className="h-px w-full" aria-hidden="true" />
          </div>

          {!nearBottom && <button className="chat-jump" type="button" onClick={() => { setNearBottom(true); scrollToBottom(); }}><ArrowDown size={14} />آخرین پیام</button>}
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
              <textarea
                rows={2}
                aria-label="پیام شما به دستیار"
                dir="rtl"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (isListening) stopListening(); send(input); }
                }}
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
            <p className="chat-input-hint">Enter برای ارسال · Shift + Enter برای خط جدید <span>پاسخ‌ها ممکن است دقیق نباشند.</span></p>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
