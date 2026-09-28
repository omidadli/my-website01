import React from 'react';
import { Theme, Page } from '../types';
import { useContent } from '../context/ContentContext';
import { EditableText } from '../components/cms/EditableText';
import { SectionEditHeader } from '../components/cms/SectionEditHeader';
import { IconBadge3D } from '../components/3D/3DIconBadge';
import { PageHero, Head, CtaPanel } from '../components/nd/Kit';
import { GraduationCap, Award, Sparkles, Target, Rocket } from 'lucide-react';
import { motion } from 'motion/react';
import { safeRecordArray } from '../utils/contentDefaults';
import { imageFallback } from '../utils/imageFallback';
import { responsiveImageProps } from '../utils/responsiveImage';
import { ProductPromoStrip } from '../components/ProductPromo';
import { productsForPage } from '../data/productPromo';

interface AboutPageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ theme, onNavigate }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const personal = data.PERSONAL_INFO;
  const timeline = safeRecordArray<any>(data.TIMELINE);
  const selectProjects = safeRecordArray<any>(data.SELECT_PROJECTS);
  const otherCollaborations = safeRecordArray<any>(data.OTHER_COLLABORATIONS);
  const educationAndCourses = data.EDUCATION_AND_COURSES && typeof data.EDUCATION_AND_COURSES === 'object'
    ? data.EDUCATION_AND_COURSES
    : { education: [], courses: [] };
  const education = safeRecordArray<any>(educationAndCourses.education);
  const courses = safeRecordArray<any>(educationAndCourses.courses);
  const skillsTools = safeRecordArray<any>(data.SKILLS_TOOLS);
  const allSkills = data.ALL_SKILLS_LIST && typeof data.ALL_SKILLS_LIST === 'object' ? data.ALL_SKILLS_LIST : null;
  const hardSkillGroups = safeRecordArray<any>(allSkills?.hard);
  const softSkillGroups = safeRecordArray<any>(allSkills?.soft);

  const philosophy = [
    {
      tag: 'باور من',
      tagCls: { background: 'var(--nd-sky-soft)', color: '#1d6fd8' },
      icon: 'target',
      glow: 'cyan' as const,
      title: 'مارکتینگ فقط اجرای کمپین نیست؛ ساختن یه سیستم رشده',
      body: 'خیلی از کسب‌وکارها یه‌بار تبلیغ می‌کنن، یه‌بار محتوا می‌سازن، یه‌بار سایتشون رو عوض می‌کنن — ولی این کارها جدا از هم اثر زیادی ندارن. من باور دارم رشد واقعی وقتی اتفاق می‌افته که همه‌ی این تکه‌ها (سایت، محتوا، تبلیغات، تحلیل داده) با هم و در یه مسیر مشخص کار کنن.',
    },
    {
      tag: 'روش کار من',
      tagCls: { background: 'var(--nd-accent-soft)', color: '#4f46e5' },
      icon: 'rocket',
      glow: 'magenta' as const,
      title: 'همیشه اول می‌پرسم «مشکل واقعی کجاست؟»',
      body: 'قبل از اینکه پیشنهاد بدم چیکار کنیم، وقت می‌ذارم بفهمم دقیقاً کجای کسب‌وکارتون مشتری یا بودجه از دست می‌ره. تصمیم‌هام رو با داده‌ی واقعی می‌گیرم، نه با یه فرمول یکسان که برای همه استفاده می‌کنم. و همیشه نتیجه رو با عدد نشونتون می‌دم — نه فقط با حرف.',
    },
    {
      tag: 'دغدغه من',
      tagCls: { background: 'var(--nd-peach-soft)', color: '#d97706' },
      icon: 'award',
      glow: 'gold' as const,
      title: 'چیزی که برام مهمه',
      body: 'خیلی از صاحبان کسب‌وکار کوچیک، وقت و بودجه‌ی کافی برای فهمیدن دنیای پیچیده‌ی مارکتینگ دیجیتال ندارن. دغدغه‌ی من اینه که این دنیا رو براشون ساده کنم — بدون اصطلاح‌های پیچیده، بدون ادعای اضافه — و کمکشون کنم تصمیم‌های درست‌تری برای رشد کسب‌وکارشون بگیرن.',
    },
  ];

  return (
    <div className="space-y-14 py-4">
      <PageHero
        theme={theme}
        page="about"
        title="امید عدلی هستم"
        subtitle="کسی که کمک می‌کنه فروشگاه‌ها آنلاین شروع کنن، بهتر بفروشن و رشد کنن."
        badge="درباره من"
        onNavigate={onNavigate}
      />

      {/* Identity + story */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-5">
          <div className="nd-card rounded-[var(--nd-radius-panel)] p-5 sm:p-7 space-y-5 relative overflow-hidden">
            <div className="relative w-full aspect-square rounded-[var(--nd-radius-card)] overflow-hidden shadow-md">
              <img
                alt={personal.name}
                src="/profile-photo-hero.png"
                srcSet="/profile-photo-400.webp 400w, /profile-photo-800.webp 800w, /profile-photo-hero.png 1254w"
                sizes="(max-width: 640px) 90vw, 480px"
                loading="eager"
                decoding="async"
                onError={imageFallback('/profile-photo-web.jpg')}
                className="w-full h-full object-cover"
              />
              <div className="absolute -bottom-4 -right-4 z-10">
                <IconBadge3D iconName="award" theme={theme} size="lg" glowColor="magenta" />
              </div>
            </div>
            <div className="space-y-2 text-center">
              <h2 className={`nd-h2 text-2xl ${isDark ? 'text-white' : ''}`}>
                <EditableText path="PERSONAL_INFO.name">{personal.name}</EditableText>
              </h2>
              <p className="text-xs font-extrabold text-[color:var(--nd-accent)]">
                <EditableText path="PERSONAL_INFO.title">{personal.title}</EditableText>
              </p>
              <span className="nd-chip dir-ltr">
                <EditableText path="PERSONAL_INFO.location">{personal.location}</EditableText>
              </span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7 space-y-6">
          <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>معرفی من</span>
          </span>
          <h2 className={`nd-h2 text-2xl sm:text-4xl leading-tight ${isDark ? 'text-white' : ''}`}>
            کمک می‌کنم مسیر رشد کسب‌وکارتون رو پیدا کنید
          </h2>
          <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm sm:text-base leading-relaxed`}>
            <EditableText path="PERSONAL_INFO.shortBio" multiline>
              {personal.shortBio || 'بیش از ۵ ساله که کنار فروشگاه‌ها و کسب‌وکارهای آنلاین هستم؛ از طراحی سایت و راه‌اندازی پیج گرفته تا تبلیغات، تحلیل رفتار مشتری و افزایش فروش. کاری که می‌کنم اینه که دقیق می‌بینم مشکل کجاست، و به‌جای حدس، با داده‌ی واقعی تصمیم می‌گیرم.'}
            </EditableText>
          </p>
        </div>
      </section>

      {/* Philosophy cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {philosophy.map((p, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="nd-card nd-card-hover p-7 space-y-4 h-full"
          >
            <div className="flex items-center justify-between">
              <span className="nd-chip border-transparent" style={p.tagCls}>{p.tag}</span>
              <IconBadge3D iconName={p.icon} theme={theme} size="sm" glowColor={p.glow} floating={false} />
            </div>
            <h3 className={`nd-h2 text-base sm:text-lg leading-snug ${isDark ? 'text-white' : ''}`}>{p.title}</h3>
            <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs sm:text-sm leading-relaxed`}>{p.body}</p>
          </motion.div>
        ))}
      </section>

      {/* Skills & tools */}
      <section className="space-y-8">
        <Head theme={theme} eyebrow="جعبه ابزار" title="ابزارهایی که هر روز باهاشون کار می‌کنم" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {skillsTools.map((t, idx) => (
            <div key={idx} className="nd-card p-4 space-y-2 text-center">
              <span className={`block text-xs font-extrabold dir-ltr ${isDark ? 'text-white' : ''}`}>{t.name}</span>
              <span className={`block h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-[color:var(--nd-bg)]'}`}>
                <span className="block h-full rounded-full" style={{ width: `${t.proficiency}%`, background: 'var(--nd-accent)' }} />
              </span>
              <span className={`block text-[10px] font-bold dir-ltr ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{t.proficiency}٪</span>
            </div>
          ))}
        </div>
        {(hardSkillGroups.length > 0 || softSkillGroups.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: 'مهارت‌های تخصصی', groups: hardSkillGroups },
              { title: 'مهارت‌های نرم', groups: softSkillGroups },
            ].map((col, ci) => (
              <div key={ci} className="nd-card p-6 space-y-5">
                <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>{col.title}</h3>
                {col.groups.map((g: any, gi: number) => (
                  <div key={gi} className="space-y-2">
                    <span className={`text-xs font-extrabold ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>{g.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(g.tags) ? g.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : []).map((tag: string) => (
                        <span key={tag} className="nd-chip">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="space-y-10">
        <SectionEditHeader title="مسیر حرفه‌ای و تجربیات کاری" arrayPath="TIMELINE" />
        <Head theme={theme} eyebrow="مسیر حرفه‌ای" title="پروژه‌هایی که تا اینجا روشون کار کردم" />
        <div className="max-w-3xl mx-auto relative">
          <span className={`absolute top-2 bottom-2 right-[19px] w-px ${isDark ? 'bg-white/12' : 'bg-[color:var(--nd-line-strong)]'}`} aria-hidden />
          <div className="space-y-5">
            {timeline.map((item: any, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 22 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: (idx % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="relative pr-12"
              >
                <span className="absolute right-2.5 top-7 w-3.5 h-3.5 rounded-full bg-[color:var(--nd-surface)] border-[3px] border-[color:var(--nd-accent)]" aria-hidden />
                <div className="nd-card p-6 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="nd-chip bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)] border-transparent">{item.year}</span>
                    <span className="nd-chip">{item.company}</span>
                  </div>
                  <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>{item.title}</h3>
                  <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs leading-relaxed`}>{item.description}</p>
                  <p className="text-[11px] font-extrabold text-[color:var(--nd-success)]">{item.achievement}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ابزار مرتبط: مسیر حرفه‌ای من را خواندی، مسیر خودت را بساز */}
      <ProductPromoStrip
        productIds={productsForPage('about')}
        theme={theme}
        onNavigate={onNavigate}
        topic="career-growth"
        eyebrow="مسیر خودت را بساز"
        title="همین مسیر را برای خودت هم می‌توانی کوتاه‌تر کنی"
        desc="بخش بزرگی از این مسیر، آزمون و خطای بی‌هدف بود. این دو ابزار همان چیزی را که سال‌ها طول کشید در چند دقیقه برای تو خلاصه می‌کنند — با ۵۰۰ سکه هدیه."
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-5"
      />

      {/* Other collaborations */}
      <section className="space-y-8">
        <Head theme={theme} eyebrow="همکاری‌های دیگر" title="چند پروژه و همکاری دیگه" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {selectProjects.map((proj: any, idx: number) => (
            <div key={idx} className="nd-card p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className={`nd-h2 text-sm ${isDark ? 'text-white' : ''}`}>{proj.title}</h3>
                <span className="text-xs text-[color:var(--nd-accent)] dir-ltr font-bold">{proj.date}</span>
              </div>
              <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs`}>{proj.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
          {otherCollaborations.map((c: any, i: number) => (
            <span key={i} className="nd-chip px-4 py-2 text-xs">
              <strong className={isDark ? 'text-white' : 'text-[color:var(--nd-ink)]'}>{c.company}</strong>
              <span className={`opacity-80`}>({c.role})</span>
            </span>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="space-y-8">
        <Head theme={theme} eyebrow="تحصیلات و دوره‌ها" title="پیشینه‌ی تحصیلی و آموزشی" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          <div className="nd-card p-7 space-y-4">
            <div className="flex items-center gap-3 text-[color:var(--nd-accent)]">
              <GraduationCap className="w-5 h-5" />
              <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>تحصیلات</h3>
            </div>
            {education.map((edu: any, idx: number) => (
              <div key={idx} className={`space-y-1 border-t pt-4 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                <div className={`nd-h2 text-sm ${isDark ? 'text-white' : ''}`}>{edu.title}</div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'nd-muted'}`}>{edu.institute} · {edu.year}</p>
                <p className="text-xs font-extrabold text-[color:var(--nd-success)]">{edu.grade}</p>
              </div>
            ))}
          </div>
          <div className="nd-card p-7 space-y-4">
            <div className="flex items-center gap-3 text-[color:var(--nd-accent)]">
              <Award className="w-5 h-5" />
              <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>دوره‌های تخصصی</h3>
            </div>
            <div className={`space-y-3 border-t pt-4 ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
              {courses.map((crs: any, idx: number) => (
                <div key={idx} className={`flex items-center justify-between text-xs pb-2 border-b ${isDark ? 'border-white/5' : 'border-[color:var(--nd-line)]'}`}>
                  <div>
                    <span className={`font-extrabold block ${isDark ? 'text-white' : ''}`}>{crs.title}</span>
                    <span className={isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}>{crs.provider}</span>
                  </div>
                  <span className="text-[color:var(--nd-accent)] font-bold dir-ltr">{crs.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaPanel
        theme={theme}
        title="آماده‌ای با هم شروع کنیم؟"
        desc="یه گفتگوی کوتاه کافیه تا دقیقاً بفهمیم از کجا باید شروع کنیم."
        primaryLabel="ببینیم کسب‌وکارتان به چی نیاز دارد"
        onPrimary={() => onNavigate('contact')}
      />
    </div>
  );
};
