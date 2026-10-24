/** Shared request strategy for production and local chat. No extra model calls. */
export interface AssistantTurn { role: string; content: string }
export function planAssistantReply(question: string, history: AssistantTurn[]) {
  const q = question.trim();
  const canonical = (text: string) => text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s؟?!.,،؛:]+/gu, '').toLowerCase();
  const repeated = history.some(m => m.role === 'user' && canonical(m.content) === canonical(q));
  // Only borrow context for an explicit follow-up, not a new independent topic.
  const followUp = /^(و\s|پس\s|حالا\s|همون|همین|اون|این رو|این را|بیشتر|ادامه|چرا|چطور|چجوری|مثال|خلاصه|دقیق.?تر|بله|آره|نه\b)/u.test(q) && q.length < 220;
  const previous = history.filter(m => m.role === 'user').slice(-2).map(m => String(m.content).slice(0, 700));
  const detailed = /کامل|مفصل|جامع|گام.?به.?گام|مرحله.?به.?مرحله|استراتژی|برنامه|تحلیل|مقایسه|محاسبه/u.test(q);
  const brief = /خلاصه|کوتاه|مختصر/u.test(q);
  return {
    retrievalQuery: followUp && previous.length ? `${previous.join('\n')}\n${q}` : q,
    repeated,
    conversationInstruction: repeated
      ? 'کاربر همین سؤال را در این گفتگو دوباره پرسیده است. پاسخ قبلی را بازپخش یا صرفاً با کلمات دیگر بازنویسی نکن. اگر نکته‌ای جا افتاده آن را روشن کن، با مثال مرتبط یا روشی متفاوت کمک کن، و در صورت ابهام یک سؤال کوتاه بپرس. حقایق و اعداد درست را برای ایجاد تنوع تغییر نده؛ لحن سرزنش‌گر مثل «قبلاً گفتم» نداشته باش.'
      : 'آخرین پیام را در بستر گفتگو پاسخ بده؛ سلام و معرفی و دعوت به مشاوره را در هر نوبت تکرار نکن. پاسخ مستقیم، طبیعی و متناسب با لحن کاربر باشد؛ برای احوال‌پرسی ساده ساختار مقاله‌ای نساز.',
    temperature: 0.6,
    maxOutputTokens: brief ? 700 : detailed ? 2400 : 1400,
  };
}

/** Retrieve relevant windows rather than always cutting off an article's ending. */
export function selectRelevantExcerpt(text: string, queryTokens: string[], tokenize: (text: string) => string[], limit = 2200): string {
  if (text.length <= limit) return text;
  const query = new Set(queryTokens);
  const windows: { start: number; text: string; score: number }[] = [];
  for (let start = 0; start < text.length; start += 650) {
    const chunk = text.slice(start, start + 1000);
    const matched = new Set(tokenize(chunk).filter(t => query.has(t)));
    windows.push({ start, text: chunk, score: matched.size });
  }
  const ranked = windows.sort((a, b) => b.score - a.score || a.start - b.start);
  const chosen: typeof windows = [];
  for (const window of ranked) {
    if (chosen.every(w => Math.abs(w.start - window.start) >= 1000)) chosen.push(window);
    if (chosen.length === 2) break;
  }
  return chosen.sort((a, b) => a.start - b.start).map(w => w.text).join('\n[…]\n').slice(0, limit);
}
