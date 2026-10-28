import { Env, requireAuth, json, unauthorized, runSectionAi } from './_shared';
import { SEO_SLUG_SECTION } from '../../lib/aiKeys';

/* Fallback: Persian → Finglish transliteration (no external API needed). */
const FA_MAP: Record<string, string> = {
  'آ': 'a', 'ا': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'و': 'o', 'ه': 'h', 'ة': 'h', 'ی': 'i', 'ي': 'i', 'ئ': 'i', 'ؤ': 'o',
  '‌': '-', ' ': '-',
};

const transliterate = (input: string): string =>
  Array.from(input || '')
    .map((ch) => FA_MAP[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '-'))
    .join('');

const cleanSlug = (input: string): string =>
  (input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 7)
    .join('-');

/**
 * POST /api/slug { title } → { ok, slug, source: 'ai' | 'translit' }
 * Uses the 5 API keys of the «تولید اسلاگ سئو» section (admin panel → کلیدهای
 * API; GEMINI_API_KEY as the last resort) to translate the Persian title into an
 * English URL slug. If a key is rate-limited the next one takes over
 * automatically; falls back to transliteration when no key works at all.
 * Admin-only (kept private so nobody can burn your API quota).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return unauthorized();

  let title = '';
  try {
    title = String(((await request.json()) as { title?: string })?.title || '').trim();
  } catch {
    /* ignore */
  }
  if (!title) return json({ ok: false, error: 'عنوان خالی است.' }, { status: 400 });

  const systemPrompt =
    'You are an SEO slug generator. Convert the Persian page/post title you receive into a short, SEO-friendly English URL slug.\n' +
    'Rules: lowercase English words only, joined by single dashes, max 6 words, no dates, no stop words at the start, translate the meaning (do not transliterate).\n' +
    'Respond with ONLY the slug, nothing else.';

  // 5 configured keys, automatic rotation on limit/error (see lib/aiKeys.ts).
  const ai = await runSectionAi(env, {
    sectionId: SEO_SLUG_SECTION,
    systemPrompt,
    history: [],
    question: title,
    temperature: 0.1,
    maxOutputTokens: 150,
    remember: false,
  });
  const aiSlug = cleanSlug(String(ai.text || '').replace(/^["'`\s]+|["'`\s]+$/g, ''));
  if (aiSlug) return json({ ok: true, slug: aiSlug, source: 'ai', key: { slot: ai.usedSlot, label: ai.usedKeyLabel } });

  return json({ ok: true, slug: cleanSlug(transliterate(title)) || 'page', source: 'translit' });
};
