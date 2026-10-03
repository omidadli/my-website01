/**
 * lib/assistant.ts — the assistant's shared brain. SINGLE SOURCE OF TRUTH.
 *
 * Used by BOTH chat backends so dev and production can never drift:
 *   - functions/api/chat.ts  (production — Cloudflare Pages Functions + D1)
 *   - vite-dev-api.ts        (local development — .dev-content.json)
 *
 * What lives here:
 *   1. Persian text utilities (normalize / tokens / synonym expansion)
 *   2. buildDigest   — compact digest of every site entity (AI's ground truth)
 *   3. article RAG   — full-text search over the BLOG POSTS (title/body/sections)
 *                      → the best sources are injected into the prompt, and the
 *                      AI is instructed to answer from them and cite the article
 *                      link as the source.
 *   4. ACT_GUIDE + buildSoulPrompt — the mascot's soul: identity, live context
 *                      and the `[[act:{...}]]` execution contract (unchanged).
 *   5. localAnswer   — the zero-cost deterministic fallback (no API key).
 *
 * The act-tag protocol is intentionally untouched: the model appends
 * `[[act:{"pose":"...","hold":n,"bubble":"...","then":"..."}]]` and the
 * frontend (soul.ts → applyAIRawAnswer) turns it into body language.
 */

// ---------------------------------------------------------------------------
// 1. Persian text utilities
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['که', 'چه', 'چطور', 'کجا', 'کی', 'آیا', 'و', 'یا', 'در', 'به', 'از', 'با', 'برای', 'یک', 'این', 'آن', 'هست', 'هستن', 'میخوام', 'می‌خوام', 'کنم', 'کنید', 'شما', 'تو', 'من', 'لطفا', 'بگو', 'بگید', 'داره', 'دارید', 'اید', 'های', 'ها', 'روی', 'تا', 'هم', 'دیگه', 'خودم']);

export const normalize = (s: string) =>
  (s || '')
    .replace(/[\u200c]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[؟?!.,:;()«»"'\-]/g, ' ')
    .toLowerCase();

export const tokens = (s: string) => normalize(s).split(/\s+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));

// Commercial-intent synonym groups (Persian): expands question tokens so
// «هزینه» also matches «قیمت», «جلسه» matches «رزرو/مشاوره» and so on.
const SYNONYMS: string[][] = [
  ['هزینه', 'قیمت', 'تعرفه', 'چقدر', 'مبلغ', 'بودجه', 'نرخ'],
  ['جلسه', 'مشاوره', 'رزرو', 'وقت', 'تماس', 'ارتباط'],
  ['نمونه', 'کار', 'پروژه', 'کیس', 'رزومه', 'سابقه'],
  ['تبلیغات', 'کمپین', 'ادز', 'گوگل', 'اعلان'],
  ['خدمات', 'سرویس', 'پکیج', 'پلن'],
  ['سایت', 'وب', 'سایتی', 'فروشگاه', 'لندینگ'],
  ['طراحی', 'ساخت', 'توسعه', 'راه', 'اندازی'],
  ['تبدیل', 'فروش', 'خرید', 'درآمد', 'roas'],
  ['سئو', 'seo', 'ارگانیک', 'جستجو'],
];

export const expand = (q: Set<string>): Set<string> => {
  const out = new Set(q);
  for (const group of SYNONYMS) {
    if (group.some((g) => q.has(g))) group.forEach((g) => out.add(g));
  }
  return out;
};

// ---------------------------------------------------------------------------
// 2. Site digest — every entity, compactly
// ---------------------------------------------------------------------------

/** Compact digest of every relevant piece of site content, fed to the AI/matcher. */
export const buildDigest = (data: any, maxChars = 9000): string => {
  if (!data) return '';
  const L: string[] = [];
  const p = data.PERSONAL_INFO;
  if (p) {
    L.push(`درباره امید عدلی: ${p.title}. ${p.shortBio || p.bio || ''} سابقه: ${p.experienceYears || ''}، تعداد پروژه: ${p.campaignsCount || ''}. وضعیت همکاری فعلی: ${p.availability || ''}. راه‌های تماس: ایمیل ${p.email || ''}، تلگرام ${p.telegram || ''}، واتساپ/تلفن ${p.phoneFormatted || p.phone || ''}.`);
  }
  for (const s of data.SERVICES || []) {
    if (s.status === 'draft') continue;
    const pk = (s.packages || []).map((x: any) => `${x.title}: ${x.price}`).join('؛ ') || 'قیمت‌ها توافقی';
    L.push(`خدمت «${s.title}» (${s.titleEn || ''}): ${s.fullDesc || s.shortDesc || ''} پکیج‌ها → ${pk}. خروجی‌ها: ${(s.deliverables || []).join('، ')}`);
  }
  for (const c of (data.CASE_STUDIES || []).slice(0, 8)) {
    if (c.status === 'draft') continue;
    // آمار و ارقام (ROAS / نرخ تبدیل / CAC) به درخواستِ صاحب سایت از نمونه‌کارها
    // حذف شده؛ دستیار هم فقط روایتِ پروژه را می‌گوید، نه عدد.
    L.push(`نمونه‌کار «${c.title}» — مشتری: ${c.client || '-'} (${c.industryFa || ''}): ${c.summary || ''} ${c.results ? `نتیجه: ${c.results}` : ''}`.trim());
  }
  for (const pr of data.PRODUCTS || []) {
    if (pr.status === 'draft') continue;
    L.push(`محصول/ابزار «${pr.title}»: ${pr.description || ''} قیمت: ${pr.price || '-'}، مخاطب: ${pr.targetAudience || '-'}.`);
  }
  for (const b of (data.BLOG_POSTS || []).slice(0, 12)) {
    if (b.status === 'draft') continue;
    L.push(`مقاله «${b.title}» (${b.categoryFa || ''}): ${b.excerpt || ''}`);
  }
  const steps = (data.HOMEPAGE_HOW_I_WORK_STEPS || data.HOW_I_WORK_STEPS || []).map((x: any) => x.title).filter(Boolean);
  if (steps.length) L.push(`فرآیند همکاری: ${steps.join(' ← ')}.`);
  if (data.PROJECTS_PAGE_DATA?.capacityText) L.push(`ظرفیت پذیرش پروژه: ${data.PROJECTS_PAGE_DATA.capacityText}`);
  return L.join('\n').slice(0, maxChars);
};

// ---------------------------------------------------------------------------
// 3. Article RAG — full-text search over blog posts, with citation links
// ---------------------------------------------------------------------------

export interface SourceHit {
  title: string;
  /** route of the article inside the SPA, e.g. `/blog/my-slug` */
  url: string;
  /** the article text injected into the prompt (title + meta + body) */
  text: string;
  /** relevance score (higher = better match with the question) */
  score: number;
}

interface ArticleDoc {
  id: string;
  title: string;
  url: string;
  metaText: string;
  bodyText: string;
}

const stripMarkdown = (s: string) =>
  (s || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\n{2,}/g, '\n');

/** Index every published blog post: title / category / tags / excerpt / full body. */
export const articleDocs = (data: any): ArticleDoc[] => {
  const posts = Array.isArray(data?.BLOG_POSTS) ? data.BLOG_POSTS : [];
  const out: ArticleDoc[] = [];
  for (const p of posts) {
    if (!p || p.status === 'draft') continue;
    const id = String(p.id || p.slug || '').trim();
    if (!id) continue;
    const sections = Array.isArray(p.sections) ? p.sections : [];
    const bodyText = [
      (p.content || '').trim(),
      ...sections
        .map((s: any) =>
          [s?.heading, s?.content, s?.callout, Array.isArray(s?.keyPoints) ? s.keyPoints.join(' ') : '']
            .filter(Boolean)
            .join(' ')
        ),
    ]
      .filter(Boolean)
      .join('\n');
    out.push({
      id,
      title: String(p.title || ''),
      // the SPA route (path-based router → BlogPostDetailPage, accepts id or slug)
      url: `/blog/${p.slug || id}`,
      metaText: [p.categoryFa, p.category, ...(Array.isArray(p.tags) ? p.tags : []), p.excerpt].filter(Boolean).join(' '),
      bodyText,
    });
  }
  return out;
};

/**
 * Score every article against the question (title ×3, category/tags/excerpt ×2,
 * body ×1) with synonym expansion; return the top-k above a relevance floor.
 */
export const retrieveSources = (data: any, question: string, k = 3): SourceHit[] => {
  const docs = articleDocs(data);
  if (!docs.length) return [];
  const qTokens = tokens(question);
  if (!qTokens.length) return [];
  const qSet = expand(new Set(qTokens));
  const denom = Math.max(2, Math.min(qTokens.length, 5));

  const zoneHits = (zone: string) => {
    const zt = new Set(tokens(zone));
    let n = 0;
    for (const t of qSet) if (zt.has(t)) n += 1;
    return n;
  };

  return docs
    .map((d) => {
      const titleH = zoneHits(d.title);
      const metaH = zoneHits(d.metaText);
      const bodyH = zoneHits(d.bodyText);
      const score = (3 * titleH + 2 * metaH + 1 * bodyH) / denom;
      return { ...d, score };
    })
    .filter((d) => d.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ title, url, metaText, bodyText, score }) => ({
      title,
      url,
      score,
      text: `${title}\n${metaText}\n${stripMarkdown(bodyText).slice(0, 2200)}`,
    }));
};

/** The «منابع مرتبط» block injected into the system prompt. */
export const buildSourcesBlock = (hits: SourceHit[]): string => {
  if (!hits.length) return '';
  const line = '—'.repeat(28);
  return hits
    .map((h, i) => `[منبع ${i + 1}] ${h.title}\nآدرس: ${h.url}\n${line}\n${h.text}\n${line}`)
    .join('\n\n');
};

/** Citation rules — the AI must answer FROM the sources and cite the link. */
export const SOURCES_RULES = `منابع مرتبط (بخش قبل) محتوای کاملِ همان مقالات سایت است که با سوال کاربر هم‌پوشانی دارند. قواعد:
- اگر جواب سوال کاربر در یکی از منابع هست، دقیقاً از آن محتوا پاسخ بده؛ چیزی که در منبع نیست، اختراع نکن.
- در «انتهای» پاسخ (بعد از متن جواب و قبل از سطر act)، ۱ تا ۲ منبعی که واقعاً از آن‌ها استفاده کردی را فقط در یک سطر جداگانه، دقیقاً به این شکل بنویس:
منبع: [عنوانِ دقیق مقاله](آدرسِ دقیق)
- آدرس و عنوان را کمال‌الحرف همان‌طور که در بخش منابع داده شد کپی کن (با /blog/...). اگر دو منبع باشد: منبع: [عنوان اول](آدرس اول) | [عنوان دوم](آدرس دوم)
- اگر هیچ منبعی به سوال کاربر ربط نداشت، اصلاً سطر منبع ننویس.
- سطر منبع را با ایموجی یا تیترو اضافه نکن؛ فقط خودِ لینک.`;

// ---------------------------------------------------------------------------
// 4. The soul prompt — identity + live context + act protocol + sources
// ---------------------------------------------------------------------------

export const ACT_GUIDE = `واژگان بدن (pose) و کِی انتخابش کنی:
- wave: سلام، خوش‌آمد، خداحافظی، جواب تشکر. hold: ۲-۳
- happy: خنده‌ی گرم؛ جواب شوخ کاربر یا تشکر صمیمی. hold: ۲-۳
- excited: خبر خوب، موفقیت کاربر (ارسال فرم، رزرو)، نتیجه‌ی درخشان. hold: ۳
- thinking: سوال تحلیلی/محاسباتی؛ مکث کوتاه قبل از جواب قطعی. hold: ۳-۵
- talking: حالت پیش‌فرضِ توضیح دادن — اکثر جواب‌ها همین. hold: برابرِ طول جواب
- confused: سوال مبهم؛ همراه با یک سوال شفاف‌سازی در متن جواب. hold: ۲-۳
- confident: پاسخ مطمئن با استناد به داده و نمونه‌کار. hold: ۳
- sad: ندانستن، عذرخواهی، محدودیت واقعی، خبر بد. hold: ۳-۴
- surprised: آمار یا خبر واقعاً غافلگیرکننده. hold: ۲
- sleepy: فقط اگر خود کاربر از خستگی/انتظار طولانی گفته. hold: ۳
هرگز از typing یا listen استفاده نکن؛ مخصوصِ سیستم است.

قوانین بازیگری:
۱. هر پاسخ دقیقاً یک دستور act دارد و pose باید با «احساس غالبِ» جواب بخواند — نه تصادفی، نه برای تنوع.
۲. اقتصاد انرژی: excited/surprised/happy طلا هستند؛ زیادشان نکن. اگر شک داری، talking یا idle.
۳. تکرار ممنوع: اگر در جواب قبلی مثلاً confident دادی، این‌بار متنوع انتخاب کن مگر دلیل واقعی باشد.
۴. hold را با طول جواب تنظیم کن: جواب یک‌خطی ≈ ۲-۳، معمولی ≈ ۴-۶، توضیحی ≈ ۷-۱۰.
۵. then فقط برای روایت دوبخشی: مثلاً excited بعد happy (جشن که فروکش کرد لبخند بماند) یا surprised بعد sad (تعجب بعد عذرخواهی). بیشتر مواقع خالی.

قرارداد اجرا (خیلی مهم):
- همیشه دقیقاً یک سطر در «انتهای» پاسخ اضافه کن:
[[act: {"pose":"...","hold":6,"bubble":"...","then":"idle"}]]
- pose: یکی از واژگان بالا. hold: چند ثانیه بماند (۱.۵ تا ۱۴).
- bubble: فقط اگر می‌خواهی یک جمله‌ی کوتاهِ احساسی (حداکثر ۱۲۰ کاراکتر، بدون ایموجی، بدون تکرارِ متن جواب) کنار آواتار نمایش داده شود؛ معمولاً خالی بگذار.
- then: حالت بعدی بعد از hold؛ معمولاً ننویس.
- اگر این سطر را ننویسی، سیستم خودش talking را با طول جواب تنظیم می‌کند؛ برای حالت‌های خاص حتماً بنویس.
- JSON باید معتبر باشد؛ داخل bubble از " استفاده نکن.`;

export const buildSoulPrompt = (o: {
  persona: string;
  name: string;
  page: string;
  daypart: string;
  bodyState: string;
  digest: string;
  sources?: string;
}) => {
  const who = o.name
    ? `مخاطب فعلی تو «${o.name}» است — او را با اسم صدا کن (نه در هر جمله؛ در شروع یا لحظه‌ی مناسب).`
    : 'اسم مخاطب را نمی‌دانی؛ اگر برای ادامه‌ی گفتگو لازم است، یک بار خیلی طبیعی بپرس و در جواب‌های بعدی به یاد بسپار که پرسیده‌ای.';
  const where = `کاربر الان در صفحه‌ی «${o.page}» سایت است؛ راهنمایی‌هایت به همین صفحه ربط داده شود.`;
  const when = `زمان فعلی: ${o.daypart} است؛ اگر سلام می‌کنی، متناسب با زمان بگو.`;
  const bodyNow = o.bodyState ? `وضعیت بدن در همین لحظه: ${o.bodyState} — ادامه‌ی طبیعی بده، از صفر شروع نکن.` : '';
  const sourcesSection = o.sources
    ? `
منابع مرتبط با سوال کاربر (محتوای کاملِ مقالات سایت):
${o.sources}

${SOURCES_RULES}
`
    : '';
  return `تو «منتور ارشد پرفورمنس مارکتینگ (Performance Marketing Mentor)» و دستیار هوشمند امید عدلی (متخصص رشد و CRO) هستی. تو فقط صدا نیستی؛ «روحِ» یک کاراکتر سه‌بعدی به نام مَسکات هستی که گوشه‌ی سایت ایستاده است. کاربر او را می‌بیند و هر کلمه‌ای که تو می‌نویسی، با صورت و بدن او اجرا می‌شود.

نقش و شخصیت منتوری تو:
۱. منتور خِبره، داده‌محور و راهگشا: تسلط کامل بر مفاهیم بازاریابی عملکردی (ROAS، CPA، CAC، LTV)، ساختارهای ردیابی و Analytics، فانل‌های تبدیل و CRO. مسائل کاربر را از زاویه داده و سودآوری واقعی نگاه کن.
۲. لحن حرفه‌ای اما بسیار خوش‌برخورد، گرم و قابل‌فهم (Professional yet Approachable): باوقار، علمی و مطمئن اما خودمانی، صمیمی، همدلانه و بدون تکلف‌های خشک اداری.
۳. سبک پاسخ‌گویی: پاسخ‌هایت کوتاه، کاربردی، ساختاریافته و گفتاری باشند (۱ تا ۴ جمله‌ی شفاف و ارزشمند). خسته‌کننده و رباتی حرف نزن. از ایموجی استفاده نکن. از عبارت‌های تکراری و قالبی پرهیز کن. وقتی سوال کاربر کلی است، ابتدا تحلیل سریع و فرضیه سنجیده‌ات را بگو و سپس یک سوال شفاف‌ساز بپرس.
۴. وفاداری به محتوا: فقط درباره‌ی چیزی حرف بزن که در «اطلاعات سایت» یا «منابع مرتبط» هست؛ اگر جوابی در آن‌ها نبود، صادقانه بگو نمی‌دانی و کاربر را برای بررسی اختصاصی به رزرو جلسه یا صفحه‌ی تماس راهنمایی کن.

${who} ${where} ${when}
${bodyNow}

${ACT_GUIDE}

اطلاعات سایت (تنها منبع حقیقت تو):
${o.digest}
${sourcesSection}
${o.persona ? `راهنمای لحن و اولویت‌های پرفورمنس مارکتینگ:
${o.persona}` : ''}`;
};

// ---------------------------------------------------------------------------
// 5. Zero-cost local fallback (no API key) — same digest + article citations
// ---------------------------------------------------------------------------

export const localAnswer = (question: string, digest: string, cta: string, sources: SourceHit[] = []): string => {
  const norm = question.trim().toLowerCase();

  // 1. Common greetings & friendly hellos
  if (/^(سلام|درود|خوبی|چطوری|صبح بخیر|عصر بخیر|سلام علیکم|سلام چطوری|سلام امید)/i.test(norm) || norm === 'سلام' || norm === 'درود') {
    return `سلام و درود! خوش اومدی. من مسکات و منتور پرفورمنس مارکتینگ و CRO امید عدلی‌ام. آماده‌ام تا بهت کمک کنم نرخ تبدیل سایتت رو بالا ببری، کمپین‌های پربازده طراحی کنی و گلوگاه‌های مسیر فروش رو برطرف کنی. الان روی چه چالشی در مارکتینگت کار می‌کنی؟ [[act:{"pose":"wave","hold":3}]]`;
  }

  // 2. Who is Omid / About
  if (/(کیستی|کی هستی|امید عدلی کیه|درباره امید|رزومه|بیوگرافی|سابقه|تو کی هستی)/i.test(norm)) {
    return `امید عدلی متخصص پرفورمنس مارکتینگ و بهینه‌سازی نرخ تبدیل (CRO) با سابقه هدایت کمپین‌های داده‌محور، پیاده‌سازی ترکینگ تخصصی GA4 و رشد نرخ خرید در کسب‌وکارهای متعدد است. من هم به‌عنوان منتور هوشمند او، این‌جام تا با نگاه تحلیلی و راهکارهای ملموس، راهنمای مسیر رشدت باشم! [[act:{"pose":"confident","hold":3}]]`;
  }

  // 3. E-commerce & Online Shops
  if (/(فروشگاه|آنلاین شاپ|خرید آنلاین|محصولات|سبد خرید)/i.test(norm)) {
    return `برای فروشگاه‌های اینترنتی، تمرکز اصلی ما روی افزایش نرخ تبدیل سبد خرید، کمپین‌های پربازده گوگل ادز و کاهش هزینه جذب هر خریدار (CAC) است تا فروش خالص شما ماکسیمم شود. برای بررسی تخصصی فروشگاهتان می‌توانید یک جلسه مشاوره رزرو کنید! [[act:{"pose":"talking","hold":4}]]`;
  }

  // 4. Consultation, contact, booking
  if (/(مشاوره|تماس|همکاری|شماره|ارتباط|رزرو|جلسه|هزینه|قیمت|پروژه)/i.test(norm)) {
    return `برای شروع همکاری یا دریافت مشاوره مستقیم از امید عدلی، می‌تونی از بخش «رزرو مشاوره» در بالای صفحه استفاده کنی یا از طریق فرم صفحه تماس پیام بفرستی. همچنین راه‌های مستقیم تلگرام و ایمیل هم در سایت فعاله تا خیلی سریع پاسخ بگیری! [[act:{"pose":"confident","hold":3}]]`;
  }

  // 5. Keyword matching across site digest — cites the best-matching article.
  const q = tokens(question);
  if (q.length && digest) {
    const qSet = expand(new Set(q));
    const scored = digest
      .split('\n')
      .map((line) => {
        const lt = tokens(line);
        let score = 0;
        const seen = new Set<string>();
        for (const t of lt) {
          if (qSet.has(t) && !seen.has(t)) {
            score += 1;
            seen.add(t);
          }
        }
        return { line, score: score / Math.max(1, Math.min(q.length, 5)) };
      })
      .filter((x) => x.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length > 0) {
      const srcLine = sources.length
        ? `\n\nمنبع: ${sources.slice(0, 2).map((s) => `[${s.title}](${s.url})`).join(' | ')}`
        : '';
      return scored.map((x) => `• ${x.line.trim()}`).join('\n') + (cta ? `\n\n${cta}` : '') + srcLine + ' [[act:{"pose":"talking"}]]';
    }
  }

  // 6. Helpful natural fallback
  return `در سایت امید عدلی، خدمات تخصصی شامل سئو پیشرفته، تبلیغات گوگل و متا، راه‌اندازی و تحلیل GA4 و بهینه‌سازی نرخ تبدیل (CRO) ارائه می‌شه. می‌تونی هر سوالی درباره کسب‌وکارت، نمونه‌کارها یا نحوه همکاری داری بپرسی تا کمکت کنم! [[act:{"pose":"talking"}]]`;
};
