import { Env, requireAuth, json, getClientIp, ensureCoreTablesSafe, runSectionAi, derivedSessionId } from './_shared';
import { SITE_ASSISTANT_SECTION, type ChatTurn } from '../../lib/aiKeys';
import {
  buildDigest,
  buildSoulPrompt,
  buildSourcesBlock,
  localAnswer,
  retrieveSources,
  type SourceHit,
} from '../../lib/assistant';

/**
 * AI consultant for the site.
 *
 * POST /api/chat { messages: [{ role, content }], mascot?: { name, page, daypart, bodyState } }
 *   → { ok, answer, act, mode: 'ai' | 'local', sources: [{ title, url }] }
 *
 * The brain lives in lib/assistant.ts (shared with vite-dev-api.ts so dev and
 * production never drift):
 *   - With the 5 API keys of the «دستیار هوشمند» section (admin panel → کلیدهای
 *     API; env GEMINI_API_KEY as the last resort): answers via Gemini/OpenAI
 *     grounded in a digest of ALL site content + full-text retrieval (RAG) over
 *     every published blog post. When the question is answered from an article,
 *     the AI cites the article link as the source. If a key hits its rate limit,
 *     the next key takes over seamlessly — the previous chats of the same
 *     conversation are reviewed first so the assistant keeps the same thread.
 *   - Without any key: a deterministic Persian keyword matcher answers from the
 *     same digest and cites the best-matching article (zero cost).
 *   - The AI stages the mascot's body via the `[[act:{...}]]` contract — the
 *     frontend (soul.ts) turns it into video scenes.
 *   - Rate limited: 15 messages/hour/IP. Every exchange is logged to D1.
 * GET /api/chat → admin-only conversation history.
 */

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return json({ ok: false, error: 'فقط ادمین.' }, { status: 401 });
  try {
    const rows = await env.DB.prepare(`SELECT id, question, answer, mode, created_at, ip FROM chat_messages ORDER BY created_at DESC LIMIT 200`).all();
    return json({ ok: true, items: rows.results || [] });
  } catch {
    return json({ ok: true, items: [] });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = getClientIp(request);
  await ensureCoreTablesSafe(env);

  // Rate limit: 15 messages per hour per IP.
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE ip = ?1 AND created_at > ?2`).bind(ip, since).first<{ c: number }>();
    if ((row?.c || 0) >= 15) {
      return json({ ok: false, error: 'تعداد پیام‌های شما در یک ساعت اخیر بیش از حد مجاز است. لطفاً کمی بعد دوباره بپرسید.' }, { status: 429 });
    }
  } catch {
    /* table missing — continue */
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const messages: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages.slice(-8) : [];
  const question = String(messages[messages.length - 1]?.content || '').trim().slice(0, 1200);
  if (!question) return json({ ok: false, error: 'سوال خالی است.' }, { status: 400 });

  // Mascot context sent by the client: the AI (soul) knows who it is talking to.
  const mc = body?.mascot || {};
  const mcName = String(mc.name || '').trim().slice(0, 40);
  const mcPage = String(mc.page || 'home').slice(0, 30);
  const mcDaypart = String(mc.daypart || '').slice(0, 12);
  const mcBody = String(mc.bodyState || '').slice(0, 300);

  // Load behavior config + site content from D1 (falls back to safe defaults).
  let data: any = null;
  try {
    const row = await env.DB.prepare(`SELECT data FROM content WHERE id = 1`).first<{ data: string }>();
    if (row) data = JSON.parse(row.data);
  } catch {
    /* ignore */
  }
  const cfg = {
    persona: data?.CHAT_CONFIG?.persona || '',
    ctaText: data?.CHAT_CONFIG?.ctaText || '',
    fallbackMessage: data?.CHAT_CONFIG?.fallbackMessage || 'متاسفانه الان اطلاعاتی برای این سوال پیدا نکردم. از صفحه تماس با من در ارتباط باشید.',
  };

  // 1) The AI's ground truth: digest of ALL site content…
  const digest = buildDigest(data);
  // 2) …plus RAG: the full text of the articles this question actually touches,
  //    each with its URL so the AI can cite it as the source.
  const sources: SourceHit[] = retrieveSources(data, question, 3);
  const sourcesBlock = buildSourcesBlock(sources);

  // The soul protocol: who the mascot is + the act-directive contract.
  const soulPrompt = buildSoulPrompt({
    persona: cfg.persona,
    name: mcName,
    page: mcPage,
    daypart: mcDaypart,
    bodyState: mcBody,
    digest,
    sources: sourcesBlock || undefined,
  });

  let answer = '';
  let mode: 'ai' | 'local' = 'local';
  let usedKeySlot = 0;
  let usedKeyLabel = '';
  let usedKeySwitched = false;

  // 1) Preferred path: the 5 keys of the site-assistant section, with automatic
  //    rotation (limit/error → next key) and full conversation continuity.
  const sessionId = String(body?.sessionId || '').trim().slice(0, 120) || derivedSessionId(SITE_ASSISTANT_SECTION, `ip:${ip}`);
  const history: ChatTurn[] = messages
    .slice(0, -1)
    .filter((m) => m.role === 'user' || m.role === 'model')
    .map((m) => ({ role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model', content: String(m.content || '') }));

  const ai = await runSectionAi(env, {
    sectionId: SITE_ASSISTANT_SECTION,
    systemPrompt: soulPrompt,
    history,
    question,
    temperature: 0.6,
    maxOutputTokens: 600,
    sessionId,
    scope: `ip:${ip}`,
    // deterministic matcher answer (also remembered, so the thread survives)
    fallback: () => localAnswer(question, digest, cfg.ctaText, sources),
  });
  if (ai.text) {
    answer = ai.text;
    mode = ai.usedFallback ? 'local' : 'ai';
    usedKeySlot = ai.usedSlot || 0;
    usedKeyLabel = ai.usedKeyLabel || '';
    usedKeySwitched = ai.switched;
  }

  // 2) Fallback: deterministic matcher over the digest (works with zero keys/costs).
  if (!answer) {
    answer = localAnswer(question, digest, cfg.ctaText, sources);
  }
  if (!answer) {
    answer = `${cfg.fallbackMessage}${cfg.ctaText ? '\n\n' + cfg.ctaText : ''}`;
  }
  // The body needs a directive even when the local matcher answered.
  if (!answer.includes('[[act:')) {
    answer += ' [[act:{"pose":"talking"}]]';
  }

  // Extract the act directive (if any) so the client can show the aside bubble.
  let act: { pose?: string; hold?: number; bubble?: string; then?: string } | undefined;
  try {
    const m = answer.match(/\[\[act:\s*(\{[\s\S]*?\})\s*\]\]/i);
    if (m) {
      const parsed = JSON.parse(m[1]);
      act = {
        pose: typeof parsed.pose === 'string' ? parsed.pose : undefined,
        hold: typeof parsed.hold === 'number' ? parsed.hold : undefined,
        bubble: typeof parsed.bubble === 'string' ? parsed.bubble : undefined,
        then: typeof parsed.then === 'string' ? parsed.then : undefined,
      };
      if (!act.pose && !act.bubble) act = undefined;
    }
  } catch {
    act = undefined;
  }

  // 3) Log for behavior monitoring (admin panel → «دستیار هوشمند»).
  try {
    const id = `chat-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    try {
      await env.DB.prepare(
        `INSERT INTO chat_messages (id, ip, question, answer, mode, created_at, key_slot, session_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(id, ip, question, answer.slice(0, 4000), mode, new Date().toISOString(), usedKeySlot, sessionId).run();
    } catch {
      // pre-migration table without key_slot / session_id
      await env.DB.prepare(
        `INSERT INTO chat_messages (id, ip, question, answer, mode, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(id, ip, question, answer.slice(0, 4000), mode, new Date().toISOString()).run();
    }
  } catch {
    /* non-fatal */
  }

  return json({
    ok: true,
    answer,
    act,
    mode,
    sources: sources.map(({ title, url }) => ({ title, url })),
    // monitoring only: which of the 5 keys answered (no secrets)
    key: usedKeySlot ? { slot: usedKeySlot, label: usedKeyLabel, switched: usedKeySwitched } : undefined,
  });
};
