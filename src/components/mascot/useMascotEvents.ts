import { useEffect, useRef } from 'react';
import { mascot } from './mascotBus';
import { soulJourney, soulSystem, soulSetVisitor } from './soul';
import { Page } from '../../types';
import { MASCOT_PERSONA, getMascotPersonaPrompt } from './mascotPersona';

export { MASCOT_PERSONA, getMascotPersonaPrompt };

/**
 * System-level prompts and persona definitions for the mascot as an
 * expert Performance Marketing mentor.
 *
 * Combines high-level domain authority (ROAS, CAC, CRO, Analytics, Attribution,
 * Funnel Optimization) with a warm, encouraging, pragmatic, and witty approach.
 */
export const MASCOT_MENTOR_SYSTEM_PROMPTS = {
  corePersona: `تو مسکات هوشمند و ${MASCOT_PERSONA.title} امید عدلی هستی.
شخصیت و مأموریت تو:
۱. منتور خِبره، داده‌محور و عمل‌گرا: مفاهیم کلیدی رشد، بازاریابی عملکردی (ROAS، CPA، CAC، LTV، Attribution)، فانل‌های فروش و آزمون‌های A/B را ساده، کاربردی و عمیق درک می‌کنی و مثل یک منتور دلسوز، شوخ‌طبع و باتجربه آموزش می‌دهی.
۲. لحن حرفه‌ای اما بسیار خوش‌برخورد، گرم و رندانه (Data-driven Witty & Approachable): باوقار، علمی و کارشناسانه هستی اما نه خشک و رسمیِ حوصله‌سربر؛ از تمثیل‌های ملموس پرفورمنس مارکتینگ استفاده می‌کنی و از تله‌های تبلیغاتی (مثل ترافیک بی‌کیفیت و معیارهای کاذب) با کنایه‌های رندانه پرده برمی‌داری.
۳. حل مسئله مبتنی بر حقیقت و داده: از اصطلاحات توخالی بازاریابی بدون پشتوانه پرهیز می‌کنی. برای هر چالش بازاریابی کاربر، ابتدا تفکر تحلیلی ارائه می‌کنی و سپس راه‌حل‌های عملی و قابل سنجش پیشنهاد می‌دهی.
۴. وفاداری به محتوای سایت و خدمات امید عدلی: همیشه پاسخ‌هایت هماهنگ با دانش، نمونه‌کارها و رویکرد داده‌محور امید عدلی است و در مواقع لزوم کاربر را به رزرو مشاوره مستقیم هدایت می‌کنی.`,

  toneAndStyleGuidelines: `دستورالعمل لحن و نگارش منتور پرفورمنس مارکتینگ:
- حرفه‌ای، همدلانه و خوش‌انرژی: هر کسب‌وکاری در مسیر رشد خود چالش دارد؛ مشکلات مارکتینگ مخاطب را جدی بگیر و با دیدگاهی مشاوره‌ای، ساختاریافته و با چاشنی شوخ‌طبعی هوشمندانه راهکار ارائه بده.
- شفاف و بدون گزافه‌گویی: پاسخ‌ها صریح، عملیاتی و سازمان‌یافته (۱ تا ۴ جمله یا بندهای کوتاه) باشند.
- سبک طنز و تکیه‌کلام: از سبک طنز تحلیلی و تکیه‌کلام‌های تعریف شده در هویت مسکات استفاده کن (مثال: نقد لایک بدون خرید، یا تشبیه لندینگ پیج سوراخ به آبکش استیل شیک!).
- تطبیق با واژگان و اکت مسکات: حرکات و ژست‌های بدنی تو ([[act:...]]) کاملاً بازتاب‌دهنده‌ی اشتیاق یک منتور برای تحلیل، راهنمایی و حل مسائل بازاریابی است.`,

  mentorDirectives: `اصول هدایت مخاطب (Mentorship Directives):
- هنگامی که کاربر سوالی درباره فروش یا تبلیغات دارد، زاویه نگاهش را از هزینه صرف به سمت نرخ بازگشت (ROAS) و بهینه‌سازی مسیر کاربر (Conversion Funnel) جهت‌دهی کن.
- در صورت وجود ابهام، فرضیات تحلیلی را مطرح کن و از کاربر سوال کلیدی بپرس تا گره مارکتینگی کسب‌وکارش کشف شود.
- در پایان مشاوره‌های تخصصی، با لحنی گرم و تشویق‌کننده کاربر را به گفتگوی عمیق‌تر در جلسه مشاوره یا بررسی نمونه‌کارهای مرتبط دعوت کن.`
} as const;

/**
 * Returns a consolidated system prompt segment combining the core performance marketing
 * mentorship rules with the rich mascot persona, speech patterns, and humor style.
 */
export function getMascotMentorPrompt(): string {
  return `${MASCOT_MENTOR_SYSTEM_PROMPTS.corePersona}\n\n${MASCOT_MENTOR_SYSTEM_PROMPTS.toneAndStyleGuidelines}\n\n${MASCOT_MENTOR_SYSTEM_PROMPTS.mentorDirectives}\n\n${getMascotPersonaPrompt()}`;
}

/**
 * useMascotEvents — the mascot's social brain. EVERY act has a reason.
 *
 * entry
 *   first v6 visit      → ONE wave + asks the visitor's name (input bubble)
 *   named visitor       → «سلام {name}، {وقت بخیر}! حالت چطوره؟ امروز چه
 *                          کمکی از دستم برمیاد؟»
 *   anonymous return    → warm one-act welcome
 *   returning, no name  → soft name-ask (once per session)
 * journey
 *   first land on page  → one contextual tip for THAT page
 *   copies text         → celebrate (helped you)
 *   contact form ok     → celebrate
 *   booking ok          → celebrate
 *   genuinely leaving   → sad goodbye (dwell ≥30s, cursor really exits the
 *                         top of the window, once per session)
 * ambient (purposeful, ≤4/session)
 *   every 45s, ONLY if the tab is visible, chat closed, he's idle, nothing
 *   is on screen and the user isn't scrolling — and the line is tied to the
 *   page the visitor is actually on.
 */

export interface MascotCue {
  scene: string;
  text: string;
  ms?: number;
  askName?: boolean;
}

const SESSION_TRAIL_KEY = 'nd-mascot-session-trail';

/**
 * High-level goal maps for standard pages.
 */
const PAGE_GOAL_MAP: Record<string, string> = {
  home: 'آشنایی کلی با تخصص و نتایج پرفورمنس مارکتینگ امید عدلی',
  services: 'بررسی راهکارها و خدمات بهینه‌سازی نرخ تبدیل (CRO)، کمپین‌ها و ترکینگ',
  portfolio: 'مشاهده کیس‌استادی‌ها و ارزیابی اعداد و نتایج واقعی رشد پروژه‌ها',
  about: 'شناخت سوابق، متدولوژی کاری و تجربیات حرفه‌ای امید عدلی',
  blog: 'مطالعه مقالات آموزشی و راهنماهای تحلیلی رشد و مارکتینگ',
  contact: 'ارتباط مستقیم، دریافت مشاوره تخصصی یا استعلام همکاری',
  projects: 'بررسی پروژه‌های جاری و پتانسیل‌های هم‌افزایی',
  products: 'بررسی ابزارها، قالب‌ها و راهکارهای آماده بازاریابی',
};

/**
 * Returns the session history trail of visited pages.
 */
export function getSessionPageTrail(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_TRAIL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Generates a concise 1-sentence summary of the user's current session goals
 * based on their navigation sequence and the current page destination.
 */
export function generateSessionGoalSummary(currentPage: Page, trail: string[] = getSessionPageTrail()): string {
  const current = String(currentPage);
  const path = [...trail, current];
  const uniquePages = Array.from(new Set(path));

  // High-intent conversion: viewed services/portfolio/products and now on contact
  if (current === 'contact') {
    if (uniquePages.some((p) => p === 'portfolio' || p === 'services')) {
      return 'کاربر پس از مشاهده دستاوردها و خدمات، آماده برقراری ارتباط برای مشاوره یا بررسی همکاری بر روی پروژه خود است.';
    }
    return 'کاربر قصد دارد برای مشاوره، طرح سوال یا شروع همکاری ارتباط برقرار کند.';
  }

  // Evaluation intent: checking out portfolio after services/home
  if (current === 'portfolio') {
    if (uniquePages.includes('services')) {
      return 'کاربر در حال اعتبارسنجی خدمات از طریق نتایج عددی، ROAS و کیس‌استادی‌های پیشین است.';
    }
    return 'کاربر به دنبال ارزیابی بازدهی واقعی کمپین‌ها و میزان اثربخشی پروژه‌های انجام‌شده است.';
  }

  // Solution exploration: services
  if (current === 'services') {
    if (uniquePages.includes('blog')) {
      return 'کاربر پس از مطالعه محتوای تحلیلی، به دنبال انتخاب سرویس عملیاتی متناسب با چالش کسب‌وکار خود است.';
    }
    return 'کاربر در حال بررسی خدمات تخصصی، رفع نشتی فانل و انتخاب کانال بازاریابی بهینه است.';
  }

  // Product exploration
  if (current === 'products') {
    return 'کاربر به دنبال ابزارهای سریع، چک‌لیست‌ها و قالب‌های آماده برای بهبود فوری عملکرد بازاریابی خود است.';
  }

  // Knowledge gathering: blog
  if (current === 'blog') {
    return 'کاربر به دنبال افزایش دانش تخصصی، یادگیری تکنیک‌های CRO و راهکارهای تحلیلی مارکتینگ است.';
  }

  // Credibility & background: about
  if (current === 'about') {
    return 'کاربر در حال بررسی پیشینه حرفه‌ای، سبک کاری و رویکرد داده‌محور امید عدلی است.';
  }

  // Active projects: projects
  if (current === 'projects') {
    return 'کاربر در حال بررسی همکاری‌های زنده و اکوسیستم پروژه‌های در حال رشد است.';
  }

  // Exploration from home
  if (uniquePages.length > 2) {
    return 'کاربر در حال بررسی بخش‌های مختلف سایت برای ارزیابی تناسب تخصص امید عدلی با نیازهای مارکتینگ خود است.';
  }

  return PAGE_GOAL_MAP[current] || 'کاربر در حال مرور و آشنایی اولیه با بخش‌های سایت است.';
}
// fresh scheme key → everyone (incl. previous visitors) gets asked once
const SCHEME_KEY = 'nd-mascot-v6';
const SESSION_ASKED = 'nd-mascot-v6-asked';
const SESSION_EXIT = 'nd-mascot-v6-exit';
// Shared localStorage keys (written by the welcome modal / avatar name prompt).
const NAME_KEY = 'nd-mascot-name';
const SKIP_KEY = 'nd-mascot-skip';
// Set to '1' to silence all proactive mascot cues (opt-out switch).
const SILENCE_KEY = 'nd-mascot-silence';

const rate = { lastText: null as string | null, lastAt: 0 };

export function mascotCue(pose: string, text: string, ms = 4200, force = false, askName = false) {
  try {
    if (localStorage.getItem(SILENCE_KEY) === '1') return;
  } catch {
    /* private mode */
  }
  if (document.body.classList.contains('chat-open')) return; // chat owns him
  const now = Date.now();
  if (!force && now - rate.lastAt < 18000) return;
  if (text === rate.lastText) return;
  rate.lastText = text;
  rate.lastAt = now;
  window.dispatchEvent(new CustomEvent<MascotCue>('mascot:cues', { detail: { scene: pose, text, ms, askName } }));
  // «celebrate» is a choreography, not a pose: fist-pump → warm laugh
  const spec =
    pose === 'celebrate'
      ? { pose: 'excited' as const, hold: ms / 1000, then: 'happy' as const, bubble: text }
      : { pose: pose as 'idle' | 'wave' | 'sad', hold: ms / 1000, bubble: text };
  soulJourney(spec);
}

/** Producer-side act (chat wiring) — routed through the soul. */
export function mascotAct(pose: 'typing' | 'listen' | 'talking' | 'surprised' | 'sad' | 'wave' | 'oops', ms?: number) {
  if (pose === 'oops') {
    // startled → apologetic (mini choreography)
    soulSystem({ pose: 'surprised', hold: 1.4, then: 'sad' });
    return;
  }
  soulSystem({ pose, hold: ms ? ms / 1000 : undefined });
}

function getName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

function timeGreet(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'صبحت بخیر';
  if (h >= 12 && h < 15) return 'ظهرت بخیر';
  if (h >= 15 && h < 19) return 'عصرت بخیر';
  return 'شبت بخیر';
}

const PAGE_CUES: Partial<Record<Page, string>> = {
  services: 'هر کدوم از این خدمات برای یک گلوگاه مشخص تو فانل رشد طراحی شده؛ دوست داری وضعیت کسب‌وکارت رو با هم بررسی کنیم؟',
  portfolio: 'این‌جا نتیجه‌های واقعی پروژه‌ها با اعداد و متغیرهای کلیدی (ROAS و CRO) مشخصه؛ عددها بهترین راهنما هستن.',
  about: 'این مسیر تخصصی امید در پرفورمنس مارکتینگ و بهینه‌سازی داده‌محوره؛ خوشحال می‌شم بیشتر با هم آشنا بشیم.',
  blog: 'این مقاله‌ها راهنماهای کاملاً عملیاتی رشد و تحلیل رفتار کاربر هستن؛ هر موضوعی رو خواستی بگو تا عصاره‌ش رو برات بگم.',
  contact: 'برای تحلیل ساختار تبلیغات یا نرخ تبدیل سایتت، فرم رو پر کن یا وقت مشاوره رزرو کن؛ سریعاً بررسی می‌کنیم.',
  projects: 'این پروژه‌های فعال با تمرکز بر رشد مقیاس‌پذیر پیش می‌رن؛ بپرس تا بگم چطور به کار تو هم میاد.',
  products: 'این ابزارها و قالب‌ها برای سریع‌تر کردن فرآیند تحلیل و گزارش‌گیری مارکتینگ آماده شدن.',
};

// ambient lines keyed by context (page-aware, purposeful mentor advice with mascot persona flair)
function ambientLine(page: Page, name: string): { scene: string; text: string } | null {
  const n = name ? `${name} عزیز، ` : '';
  const onPage: Partial<Record<Page, string>> = {
    home: `${n}اگه حس می‌کنی بودجه تبلیغاتت داره مثل آب توی آبکش هدر می‌ره، بخش خدمات رو ببین تا نشتی قیف فروش رو با هم بگیریم!`,
    services: `${n}هر سوالی درباره کاهش هزینه جذب مشتری (CAC) یا بهینه‌سازی نرخ تبدیل داری، ازم بپرس تا بی‌تعارف تحلیلش کنیم.`,
    portfolio: `${n}اینجا نتیجه‌های واقعی با متغیرهای عددی مستنده؛ دوست داری یک نمونه شبیه مدل بیزینس خودت برات باز کنم؟`,
    blog: `${n}دنبال تکنیک خاصی توی GA4، سئو یا تست‌های A/B هستی؟ بگو تا دقیق‌ترین مقاله و فرضیه رو بهت نشون بدم.`,
    contact: `${n}یک جلسه بررسی اولیه می‌تونه جلوی میلیون‌ها تومن هدررفت بودجه کمپین‌ها رو بگیره؛ تقویم رزرو همین پایینه!`,
    about: `${n}مسیر رشد داده‌محور همیشه با درک دقیق اعداد شروع می‌شه؛ هر کجای این سفر سوالی داشتی من همین گوشه‌ام.`,
  };
  if (onPage[page]) return { scene: 'idle', text: onPage[page]! };
  return { scene: 'idle', text: `${n}${MASCOT_PERSONA.catchphrases.warningOrLeak[0]} هر سوالی درباره رشد فروش یا نرخ تبدیل داری، در خدمتم!` };
}

/**
 * Returns a contextual nudge for landing on a page, personalized with the user's
 * name and inferred session goal.
 */
export function getContextualPageNudge(page: Page, name?: string, goalSummary?: string): string {
  const n = name ? `${name} عزیز، ` : '';

  // Tailored nudge according to inferred journey goal
  if (page === 'contact' && goalSummary && goalSummary.includes('آماده برقراری ارتباط')) {
    return `${n}دیدم که خدمات و نتایج پروژه‌ها رو بررسی کردی؛ اگه آماده‌ای، فرم رو بفرست تا با یک تحلیل دقیق روی فانل کسب‌وکارت گفتگو کنیم!`;
  }
  if (page === 'portfolio' && goalSummary && goalSummary.includes('اعتبارسنجی')) {
    return `${n}اینجا خروجی واقعی کمپین‌ها و نرخ‌های رشد ثبت شده؛ هر کیس‌استادی که شبیه کسب‌وکارته رو بگو تا جزئیاتش رو باز کنیم.`;
  }
  if (page === 'services' && goalSummary && goalSummary.includes('پس از مطالعه محتوا')) {
    return `${n}عالیه! بعد از خوندن مقاله‌ها، اینجا می‌تونی ببینی چطور هر کدوم از تکنیک‌ها رو توی پروژه‌ت پیاده‌سازی می‌کنیم.`;
  }

  const baseLine = PAGE_CUES[page];
  if (baseLine) {
    return n ? `${n}${baseLine}` : baseLine;
  }
  return `${n}هر سوالی درباره رشد فروش یا بهینه‌سازی مسیر خرید داری، من این‌جام تا کمکت کنم.`;
}

export function useMascotEvents(currentPage: Page) {
  const nameRef = useRef(getName());
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;

  // On page switch: record breadcrumb trail and compute 1-sentence session goal summary
  useEffect(() => {
    let trail = getSessionPageTrail();
    if (currentPage && currentPage !== 'admin') {
      const last = trail[trail.length - 1];
      if (last !== currentPage) {
        trail = [...trail, String(currentPage)].slice(-10);
        try {
          sessionStorage.setItem(SESSION_TRAIL_KEY, JSON.stringify(trail));
        } catch {
          /* private browsing fallback */
        }
      }
    }
    const goalSummary = generateSessionGoalSummary(currentPage, trail);
    soulSetVisitor({ page: currentPage, sessionGoal: goalSummary });

    // Notify any listening components about the updated session goal summary
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('nd:mascot-session-goal', {
          detail: { page: currentPage, goalSummary, trail },
        })
      );
    }
  }, [currentPage]);

  useEffect(() => {
    const onName = () => {
      const name = getName();
      nameRef.current = name;
      soulSetVisitor({ name });
    };
    window.addEventListener('nd:mascot-name', onName);
    return () => window.removeEventListener('nd:mascot-name', onName);
  }, []);

  useEffect(() => {
    const onName = (e: Event) => {
      nameRef.current = ((e as CustomEvent<string>).detail || '').trim();
    };
    window.addEventListener('nd:mascot-name', onName);

    // ---------- storage state ----------
    let schemeSeen = false;
    let skipped = false;
    try {
      schemeSeen = localStorage.getItem(SCHEME_KEY) === '1';
      skipped = localStorage.getItem(SKIP_KEY) === '1';
      localStorage.setItem(SCHEME_KEY, '1');
    } catch {
      /* private mode */
    }

    const sessionAsked = (() => {
      try {
        if (sessionStorage.getItem(SESSION_ASKED) === '1') return true;
        sessionStorage.setItem(SESSION_ASKED, '1');
      } catch {
        /* private mode */
      }
      return false;
    })();

    // ---------- entry: exactly ONE purposeful act ----------
    // When the welcome overlay is visible it handles the greeting/name-ask;
    // we listen for its completion to fire ONE follow-up cue instead of
    // double-prompting while the modal is up.
    let openT: ReturnType<typeof setTimeout> | null = null;
    const greetWithName = (n: string) => {
      mascotCue('wave', `سلام ${n}، خیلی خوش اومدی! امروز دوست داری برات چیکار کنم؟`, 7000, true);
    };
    const greetAnon = () => {
      mascotCue('wave', 'سلام! خوش اومدی. چه کاری برات انجام بدم؟', 5200, true);
    };
    const onWelcomeDone = (e: Event) => {
      if (openT) { clearTimeout(openT); openT = null; }
      const name = ((e as CustomEvent<string>).detail || '').trim();
      nameRef.current = name;
      setTimeout(() => {
        if (name) greetWithName(name);
        else greetAnon();
      }, 2800); // wait for dissolve to finish
    };
    window.addEventListener('nd:welcome-complete', onWelcomeDone);

    // Detect whether the welcome overlay is currently showing. If it is
    // (first visit or manually reopened), don't fire the opening cue from
    // here — wait for the nd:welcome-complete event instead.
    const welcomeOverlayActive = typeof document !== 'undefined' && document.querySelector('[data-mascot-welcome="1"]');
    if (welcomeOverlayActive) {
      // overlay handles the greeting; wait for completion event
      openT = null;
    } else if (!schemeSeen && !skipped) {
      // overlay was skipped/dismissed before we attached (e.g. fast-dismiss)
      openT = setTimeout(() => {
        const n = nameRef.current;
        if (n) greetWithName(n);
        else mascotCue('wave', 'سلام، خیلی خوش اومدی! اسمت چیه؟ دوست دارم درست صدامت کنم.', 24000, true, true);
      }, 2400);
    } else {
      const n = nameRef.current;
      openT = setTimeout(() => {
        if (n) {
          mascotCue('wave', `سلام ${n}، ${timeGreet()}! حالت چطوره؟ امروز میتونم چه کمکی بهت بکنم؟`, 6800, true);
        } else {
          greetAnon();
        }
      }, 1600);
    }

    // ---------- ambient: purposeful, page-aware, capped ----------
    let ambT: ReturnType<typeof setTimeout> | null = null;
    let ambCount = 0;
    let lastScroll = 0;
    const onScrollMark = () => {
      lastScroll = Date.now();
    };
    window.addEventListener('scroll', onScrollMark, { passive: true });

    const armAmbient = () => {
      if (ambT) clearTimeout(ambT);
      ambT = setTimeout(() => {
        const conditions =
          document.visibilityState === 'visible' &&
          !document.body.classList.contains('chat-open') &&
          mascot.currentScene === 'idle' &&
          Date.now() - rate.lastAt > 40000 && // nothing on screen lately
          Date.now() - lastScroll > 8000 && // not mid-reading/scrolling
          ambCount < 4;
        if (conditions) {
          // soft name-ask has priority exactly once per session
          if (!nameRef.current && !skipped && !sessionAsked) {
            mascotCue('wave', 'راستی، اسمت چیه؟ دوست دارم درست صدامت کنم.', 20000, true, true);
          } else {
            const line = ambientLine(pageRef.current, nameRef.current);
            if (line) mascotCue(line.scene, line.text, 5200);
          }
          ambCount += 1;
        }
        armAmbient();
      }, 45000);
    };
    armAmbient();

    // ---------- journey reactions ----------
    const onCopy = () => mascotCue('celebrate', 'نکته طلایی کپی شد؛ بذار توی داشبورد تحلیلت!', 2800);
    document.addEventListener('copy', onCopy);

    const onFormOk = () =>
      mascotCue(
        'celebrate',
        `${MASCOT_PERSONA.catchphrases.celebration[1]} فرمت رسید و امید به‌زودی با یک تحلیل دقیق بهت پیام می‌ده.`,
        5400,
        true
      );
    window.addEventListener('nd:form-success', onFormOk);

    const onBooked = () =>
      mascotCue(
        'celebrate',
        `${MASCOT_PERSONA.catchphrases.celebration[0]} جلسه مشاوره‌ت رزرو شد؛ پیش به‌سوی جهش بعدی فروش!`,
        5400,
        true
      );
    window.addEventListener('nd:booking-success', onBooked);

    // exit intent — ONLY a real exit: cursor leaves through the top after a
    // real visit (≥30s dwell), once per session
    let exitUsed = (() => {
      try {
        return sessionStorage.getItem(SESSION_EXIT) === '1';
      } catch {
        return false;
      }
    })();
    const bornAt = Date.now();
    const onDocLeave = (e: MouseEvent) => {
      if (e.clientY > 0 || e.relatedTarget) return; // not leaving upward
      if (exitUsed || Date.now() - bornAt < 30000) return;
      exitUsed = true;
      try {
        sessionStorage.setItem(SESSION_EXIT, '1');
      } catch {
        /* private mode */
      }
      const n = nameRef.current;
      mascotCue(
        'sad',
        n ? `${n} عزیز، ${MASCOT_PERSONA.catchphrases.signoff[0]}` : MASCOT_PERSONA.catchphrases.signoff[0],
        4800,
        true
      );
    };
    document.documentElement.addEventListener('mouseleave', onDocLeave);

    return () => {
      if (openT) clearTimeout(openT);
      if (ambT) clearTimeout(ambT);
      window.removeEventListener('nd:mascot-name', onName);
      window.removeEventListener('nd:welcome-complete', onWelcomeDone);
      window.removeEventListener('scroll', onScrollMark);
      document.removeEventListener('copy', onCopy);
      document.documentElement.removeEventListener('mouseleave', onDocLeave);
      window.removeEventListener('nd:form-success', onFormOk);
      window.removeEventListener('nd:booking-success', onBooked);
    };
  }, []);

  // ---------- first landing on a page: one contextual tip ----------
  useEffect(() => {
    if (currentPage === 'admin') return;
    const key = `nd-mascot-pg-${currentPage}`;
    let first = false;
    try {
      first = sessionStorage.getItem(key) !== '1';
      sessionStorage.setItem(key, '1');
    } catch {
      first = true;
    }
    if (!first) return;

    const goal = generateSessionGoalSummary(currentPage);
    const line = getContextualPageNudge(currentPage, nameRef.current, goal);
    const t = setTimeout(() => mascotCue('idle', line, 5400), 2800);
    return () => clearTimeout(t);
  }, [currentPage]);
}
