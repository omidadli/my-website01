/**
 * lib/aiSection.ts — «اجرای یک بخشِ نیازمند کلید API» با استورِ قابل‌تعویض.
 *
 * همین یک تابع، هم در Cloudflare Pages Functions (استورِ D1 — functions/api/_shared.ts)
 * و هم در dev-server (استورِ فایل — vite-dev-api.ts) استفاده می‌شود؛ بنابراین
 * رفتار ۵-کلیدی و «ادامه‌ی طبیعیِ گفتگو» در dev و production یکی است.
 *
 * جریان کار:
 *   ۱. کلیدهای بخش (۵ اسلات) و سلامتشان خوانده می‌شود.
 *   ۲. چت‌های قبلیِ همین گفتگو از حافظه‌ی سرور بازیابی می‌شود (مرور گفتگو).
 *   ۳. تاریخچه‌ی کلاینت + حافظه ادغام و به مدل داده می‌شود.
 *   ۴. کلیدها به ترتیب (کلیدِ همان گفتگو → کلیدهای سالم بعدی → کلیدهای
 *      کول‌داون‌دار) امتحان می‌شوند؛ در جابه‌جایی، دستور پیوستگی تزریق می‌شود.
 *   ۵. سلامت کلیدها + پیام‌ها ذخیره می‌شود تا پاسخ بعدی از همان‌جا ادامه یابد.
 */

import {
  envFallbackKey,
  mergeConversationHistory,
  sanitizeTurns,
  type AiAttempt,
  type AiKeyEntry,
  type AiKeyState,
  type ChatTurn,
} from './aiKeys';
import { callAiProviderWithFailover } from './tools';

/** دسترسیِ ذخیره‌سازی که هر بک‌اند پیاده می‌کند (D1 در production، فایل در dev). */
export interface AiKeyStore {
  loadKeys(sectionId: string): Promise<AiKeyEntry[]>;
  loadStates(sectionId: string): Promise<Record<string, AiKeyState>>;
  saveStates(sectionId: string, states: AiKeyState[]): Promise<void>;
  saveKeys(sectionId: string, keys: AiKeyEntry[]): Promise<void>;
  /** چت‌های قبلیِ همین گفتگو (جدیدترین‌ها آخر) */
  recall(sessionId: string): Promise<ChatTurn[]>;
  /** کلیدی که آخرین بار همین گفتگو را پاسخ داد */
  stickyKey(sessionId: string): Promise<string>;
  remember(args: { sessionId: string; sectionId: string; turns: ChatTurn[]; stickyKeyId?: string }): Promise<void>;
  logEvents(sectionId: string, attempts: AiAttempt[]): Promise<void>;
  /** کلید محیطیِ پشتیبان (GEMINI_API_KEY) — آخرین گزینه */
  envFallbackKey?: string;
}

export interface RunSectionAiArgs {
  sectionId: string;
  systemPrompt: string;
  /** conversation history sent by the client (without the current question) */
  history: ChatTurn[];
  question: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** CMS-level model preference (e.g. AI_TOOLS_CONFIG[tool].behavior.model) */
  preferredModel?: string;
  /** client-generated conversation id (localStorage) — enables server-side memory */
  sessionId?: string;
  /** fallback scope when no sessionId is sent (phone / device / ip) */
  scope?: string;
  /** store this exchange in the memory + remember the key that answered */
  remember?: boolean;
  /** do not pass the env fallback key (admin-only features gated on their own keys) */
  allowEnvFallback?: boolean;
  /**
   * Zero-cost answer used when no key could reply (e.g. localToolAnswer).
   * It is stored in the conversation memory too, so a later AI answer continues
   * the same thread without losing what was already said.
   */
  fallback?: () => string;
}

export interface RunSectionAiResult {
  text: string | null;
  attempts: AiAttempt[];
  usedKeyId?: string;
  usedKeyLabel?: string;
  usedProvider?: string;
  usedSlot?: number;
  switched: boolean;
  allCooling: boolean;
  sessionId: string;
  stickyKeyId?: string;
  /** the history that was actually sent (client + recalled memory) */
  history: ChatTurn[];
  /** how many earlier turns were recalled from the server memory */
  recalledCount: number;
  envFallbackUsed: boolean;
  /** true when no key answered and the local/deterministic `fallback` was used */
  usedFallback: boolean;
  lastError?: string;
  elapsedMs: number;
}

/** A stable session id when the client does not send one (keeps continuity anyway). */
export const derivedSessionId = (sectionId: string, scope: string): string =>
  `auto:${sectionId}:${String(scope || 'anon').toLowerCase().slice(0, 60)}`;

/**
 * Runs one AI section end-to-end. See the file header for the flow.
 */
export const runSectionAiWithStore = async (store: AiKeyStore, args: RunSectionAiArgs): Promise<RunSectionAiResult> => {
  const sectionId = args.sectionId;
  const sessionId = String(args.sessionId || derivedSessionId(sectionId, args.scope || 'anon')).slice(0, 120);

  const [keys, states, recalled, sticky] = await Promise.all([
    store.loadKeys(sectionId),
    store.loadStates(sectionId),
    store.recall(sessionId),
    store.stickyKey(sessionId),
  ]);

  const merged = mergeConversationHistory(sanitizeTurns(args.history), recalled);
  const envKey = args.allowEnvFallback === false ? null : envFallbackKey(store.envFallbackKey);

  const outcome = await callAiProviderWithFailover({
    sectionId,
    systemPrompt: args.systemPrompt,
    history: merged.history,
    historyMerged: true,
    recap: merged.usedMemory ? recalled : [],
    question: args.question,
    temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
    keys,
    envFallbackKey: envKey?.apiKey,
    states,
    stickyKeyId: sticky || undefined,
    preferredModel: args.preferredModel,
    maxOutputTokens: args.maxOutputTokens,
    persist: (next) => store.saveStates(sectionId, next),
  });

  const fallbackText = !outcome.text && args.fallback ? String(args.fallback() || '').trim() : '';
  const finalText = outcome.text || fallbackText || null;

  // Bookkeeping never blocks or breaks the answer.
  const tasks: Promise<unknown>[] = [store.logEvents(sectionId, outcome.attempts).catch(() => {})];
  if (args.remember !== false && finalText) {
    tasks.push(
      store
        .remember({
          sessionId,
          sectionId,
          stickyKeyId: outcome.usedKeyId || sticky,
          turns: [
            { role: 'user', content: args.question },
            { role: 'model', content: finalText! },
          ],
        })
        .catch(() => {})
    );
  } else if (outcome.usedKeyId && outcome.usedKeyId !== sticky) {
    tasks.push(store.remember({ sessionId, sectionId, stickyKeyId: outcome.usedKeyId, turns: [] }).catch(() => {}));
  }
  await Promise.all(tasks);

  return {
    text: finalText,
    attempts: outcome.attempts,
    usedKeyId: outcome.usedKeyId,
    usedKeyLabel: outcome.usedKeyLabel,
    usedProvider: outcome.usedProvider,
    usedSlot: outcome.usedSlot,
    switched: outcome.switched,
    allCooling: outcome.allCooling,
    sessionId,
    stickyKeyId: outcome.usedKeyId || sticky,
    history: merged.history,
    recalledCount: recalled.length,
    envFallbackUsed: outcome.usedKeyId === 'env-fallback',
    usedFallback: !outcome.text && !!fallbackText,
    lastError: outcome.lastError,
    elapsedMs: outcome.elapsedMs,
  };
};
