import React, { useState, useEffect } from 'react';
import { Theme, Page } from '../types';
import { useContent } from '../context/ContentContext';
import { useUser } from '../context/UserContext';
import { inputCls } from '../components/nd/Kit';
import { ChevronLeft, ArrowRight, Sparkles, MessageSquare, CheckCircle2, ShieldCheck, Link2, Clock, Eye, CalendarDays, RefreshCw, Bookmark, BookmarkCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { linkProps, postPath } from '../utils/router';
import { safeRecordArray } from '../utils/contentDefaults';
import { imageFallback } from '../utils/imageFallback';
import { responsiveImageProps, BLOG_COVER_SIZES, BLOG_DETAIL_COVER_SIZES } from '../utils/responsiveImage';
import { resolveAuthorPhoto } from '../utils/profilePhoto';
import { RichText } from '../components/RichText';
import { mdToPlainText } from '../utils/plainText';
import { ProductPromo, isProductPromotable } from '../components/ProductPromo';
import { pickProductsForPost, topicOfCategory } from '../data/productPromo';

interface BlogPostDetailPageProps {
  theme: Theme;
  postId: string;
  onNavigate: (page: Page) => void;
  onSelectPost: (postId: string) => void;
}

export const BlogPostDetailPage: React.FC<BlogPostDetailPageProps> = ({ theme, postId, onNavigate, onSelectPost }) => {
  const isDark = theme === 'dark';
  const { data, addBlogComment } = useContent();
  const { isLoggedIn, isArticleSaved, saveArticle, removeSavedArticle, markArticleAsRead } = useUser();
  const blogPosts = safeRecordArray<NonNullable<typeof data.BLOG_POSTS[number]>>(data.BLOG_POSTS)
    .filter((item) => typeof item.id === 'string' && item.id.length > 0);
  const post = blogPosts.find((p) => p.id === postId || (!!p.slug && p.slug === postId));
  const postToc = Array.isArray(post?.tableOfContents)
    ? post.tableOfContents.filter((item) => item && typeof item === 'object' && typeof item.title === 'string' && typeof item.id === 'string')
    : [];
  const postSections = Array.isArray(post?.sections)
    ? post.sections.filter((section) => section && typeof section === 'object').map((section) => ({
        ...section,
        content: typeof section.content === 'string' ? section.content : '',
        keyPoints: Array.isArray(section.keyPoints) ? section.keyPoints.filter((point): point is string => typeof point === 'string') : [],
      }))
    : [];
  const postFaq = Array.isArray(post?.faq)
    ? post.faq.filter((item) => item && typeof item.question === 'string' && typeof item.answer === 'string')
    : [];

  const [commentName, setCommentName] = useState('');
  const [commentEmail, setCommentEmail] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [copied, setCopied] = useState(false);

  // Related articles: same cluster first (so the "related" list is actually
  // related), then fill up with the newest of the rest.
  const relatedPosts = (() => {
    if (!post) return [];
    const others = blogPosts.filter((p) => p.id !== post.id);
    const sameCluster = others.filter((p) => p.categoryFa === post.categoryFa || p.category === post.category);
    const rest = others.filter((p) => !sameCluster.includes(p));
    return [...sameCluster, ...rest].slice(0, 3);
  })();

  /* ---------------------------------------------------------------- *
   * Native product placement: pick the tools that actually help with   *
   * THIS article (see src/data/productPromo.ts) instead of showing a   *
   * generic banner. `promoTopic` also selects the copy angle.          *
   * ---------------------------------------------------------------- */
  const promoIds = post ? pickProductsForPost(post, 2) : [];
  const promoTopic = post ? topicOfCategory(post.category, post.categoryFa) : undefined;
  const inlineProductId = promoIds[0];
  const secondaryProductId = promoIds[1];
  const promotableInline = inlineProductId ? isProductPromotable(data, inlineProductId) : false;
  const hasAside = postToc.length > 0 || promoIds.length > 0;
  const postComments = safeRecordArray<NonNullable<typeof data.BLOG_COMMENTS[number]>>(data.BLOG_COMMENTS)
    .filter((comment) => comment.postId === post?.id && comment.isApproved);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentName.trim() || !commentEmail.trim() || !commentText.trim()) {
      setCommentError('لطفاً تمام فیلدهای نام، ایمیل و متن دیدگاه را تکمیل کنید.');
      return;
    }
    if (!isCaptchaChecked) {
      setCommentError('لطفاً تایید کنید که ربات نیستید.');
      return;
    }
    if (!post) return;
    const res = await addBlogComment({
      postId: post.id,
      authorName: commentName.trim(),
      authorEmail: commentEmail.trim(),
      content: commentText.trim(),
    });
    if (!res.ok) {
      setCommentError(res.error || 'ثبت دیدگاه ناموفق بود.');
      return;
    }
    setCommentSuccess(true);
    setCommentError('');
    setCommentName('');
    setCommentEmail('');
    setCommentText('');
    setIsCaptchaChecked(false);
    setTimeout(() => setCommentSuccess(false), 5000);
  };

  if (!post) {
    return (
      <div className="text-center py-24 space-y-4">
        <span className="inline-block px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest bg-[color:var(--nd-accent-soft)] text-[color:var(--nd-accent)]">۴۰۴</span>
        <h1 className={`nd-h2 text-xl ${isDark ? 'text-white' : ''}`}>مقاله‌ای با این آدرس پیدا نشد</h1>
        <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm max-w-md mx-auto`}>شاید حذف شده یا آدرسش عوض شده باشد؛ فهرست مقالات را ببین.</p>
        <a {...linkProps('/blog', () => onNavigate('blog'))} className="nd-btn nd-btn-ghost px-6 py-3 text-xs inline-flex">
          <span>بازگشت به مقالات</span>
        </a>
      </div>
    );
  }

  return (
    <div className="relative space-y-12 pb-10">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex items-center gap-2 text-xs font-bold text-[color:var(--nd-faint)]" aria-label="مسیر راهنما">
          <button onClick={() => onNavigate('home')} className="hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">صفحه اصلی</button>
          <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
          <button onClick={() => onNavigate('blog')} className="hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer">وبلاگ و مقالات</button>
          <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
          <span className="text-[color:var(--nd-accent)] font-extrabold">{post.categoryFa}</span>
        </nav>
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <button
              onClick={() => {
                const postKey = post.slug || post.id;
                if (isArticleSaved(postKey)) {
                  removeSavedArticle(postKey);
                } else {
                  saveArticle(postKey);
                }
              }}
              className={`nd-btn px-4 py-2 text-[11px] ${
                isArticleSaved(post.slug || post.id)
                  ? 'bg-[color:var(--nd-accent)] text-white'
                  : 'nd-btn-ghost'
              }`}
              title={isArticleSaved(post.slug || post.id) ? 'حذف از لیست خواندن بعدا' : 'ذخیره برای خواندن بعدا'}
            >
              {isArticleSaved(post.slug || post.id) ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>ذخیره شده</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>ذخیره برای بعد</span>
                </>
              )}
            </button>
          )}
          <button onClick={handleCopyLink} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px]">
            <Link2 className="w-3.5 h-3.5" />
            <span>{copied ? 'کپی شد!' : 'کپی لینک'}</span>
          </button>
          <button onClick={() => onNavigate('blog')} className="nd-btn nd-btn-ghost px-4 py-2 text-[11px]">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>بازگشت به مقالات</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <header className="max-w-4xl mx-auto text-center space-y-5">
        <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-amber-200' : 'nd-eyebrow inline-flex bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent'}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>{post.categoryFa}</span>
        </span>
        <h1 className={`nd-h1 text-2xl sm:text-4xl leading-snug ${isDark ? 'text-white' : ''}`}>{post.title}</h1>
        <div className={`flex flex-wrap items-center justify-center gap-4 text-[11px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>
          <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{post.date}</span>
          {post.updatedAt && post.updatedAt.trim() && post.updatedAt.trim() !== String(post.date || '').trim() && (
            <span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />به‌روزرسانی: {post.updatedAt}</span>
          )}
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{post.readTime}</span>
          <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{post.viewsCount || 0} بازدید</span>
          <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{postComments.length} دیدگاه</span>
        </div>
        {post.coverImage && (
          <div className={`rounded-[var(--nd-radius-card)] overflow-hidden border shadow-md aspect-[21/9] ${isDark ? 'border-white/12' : 'border-white/70'}`}>
            <img
              alt={post.title}
              {...responsiveImageProps(post.coverImage, {
                sizes: BLOG_DETAIL_COVER_SIZES,
                displayWidth: 1376,
                displayHeight: 768,
                priority: true,
              })}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={imageFallback()}
            />
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-6xl mx-auto">
        {/* TOC + ابزار مرتبط */}
        {hasAside && (
          <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-28 space-y-3">
            {postToc.length > 0 && (
              <div className="nd-card p-5 space-y-3">
                <h4 className={`nd-h2 text-xs ${isDark ? 'text-white' : ''}`}>در این مقاله</h4>
                <ul className="space-y-2">
                  {postToc.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className={`text-right text-[11px] font-bold leading-relaxed transition-colors cursor-pointer ${
                          isDark ? 'text-slate-400 hover:text-white' : 'nd-muted hover:text-[color:var(--nd-accent)]'
                        }`}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {promoIds.map((pid) => (
              <ProductPromo
                key={pid}
                productId={pid}
                theme={theme}
                onNavigate={onNavigate}
                topic={promoTopic}
                variant="compact"
                eyebrow="ابزار مرتبط"
              />
            ))}
          </aside>
        )}

        {/* Article body */}
        <article className={`${hasAside ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'} space-y-10`}>
          <RichText
            text={post.excerpt}
            isDark={isDark}
            paragraphClass={`text-sm sm:text-base leading-loose ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}
          />
          {postSections.length > 0 && (
            <div className="space-y-10">
              {postSections.map((sec, sIdx) => (
                <section key={sec.id || sIdx} id={sec.id} className="space-y-4 scroll-mt-28">
                  {sec.heading && (
                    <h2 className={`nd-h2 text-lg sm:text-2xl leading-snug flex items-center gap-3 ${isDark ? 'text-white' : ''}`}>
                      <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: 'var(--nd-accent)' }} aria-hidden />
                      {sec.heading}
                    </h2>
                  )}
                  {sec.content && <RichText text={sec.content} isDark={isDark} />}
                  {sec.callout && (
                    <div className={`${isDark ? 'nd-glass-dark' : ''} rounded-2xl p-5 text-xs sm:text-sm font-bold leading-relaxed`} style={isDark ? undefined : { background: 'var(--nd-accent-soft)', color: 'var(--nd-accent-strong)' }}>
                      {sec.callout}
                    </div>
                  )}
                  {sec.keyPoints && sec.keyPoints.length > 0 && (
                    <ul className="space-y-2">
                      {sec.keyPoints.map((kp, ki) => (
                        <li key={ki} className="flex items-start gap-2.5 text-xs sm:text-sm">
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--nd-success)]" />
                          <span className={isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}>{kp}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {/* ادامه‌ی طبیعی مقاله: ابزاری که همین مسئله را حل می‌کند، داخل متن */}
              {promotableInline && inlineProductId && (
                <ProductPromo
                  productId={inlineProductId}
                  theme={theme}
                  onNavigate={onNavigate}
                  topic={promoTopic}
                  variant="inline"
                  eyebrow="قدم بعدیِ این مقاله"
                />
              )}
            </div>
          )}

          {/* FAQ */}
          {postFaq.length > 0 && (
            <section id="faq" className="space-y-4 scroll-mt-28">
              <h2 className={`nd-h2 text-lg sm:text-2xl leading-snug flex items-center gap-3 ${isDark ? 'text-white' : ''}`}>
                <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: 'var(--nd-accent)' }} aria-hidden />
                <span>پرسش‌های پرتکرار</span>
              </h2>
              <div className="space-y-3">
                {postFaq.map((item, fi) => (
                  <details
                    key={fi}
                    className={`nd-card px-5 py-4 group ${isDark ? '' : ''}`}
                  >
                    <summary className={`flex items-start justify-between gap-3 cursor-pointer list-none text-xs sm:text-sm font-extrabold leading-relaxed ${isDark ? 'text-slate-100' : 'text-[color:var(--nd-ink)]'}`}>
                      <span>{item.question}</span>
                      <ChevronLeft className={`w-4 h-4 mt-0.5 shrink-0 opacity-60 transition-transform group-open:-rotate-90`} />
                    </summary>
                    <div className={`pt-3 text-xs sm:text-sm leading-loose ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                      <RichText text={item.answer} isDark={isDark} />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Tags — the «برچسب‌ها» field of the article in the admin panel */}
          {Array.isArray(post.tags) && post.tags.some((t) => typeof t === 'string' && t.trim()) && (
            <div className="flex flex-wrap items-center gap-2" aria-label="برچسب‌ها">
              <span className={`text-[11px] font-black ${isDark ? 'text-slate-400' : 'text-[color:var(--nd-faint)]'}`}>برچسب‌ها:</span>
              {post.tags.filter((t) => typeof t === 'string' && t.trim()).map((tag) => (
                <span key={tag} className="nd-chip text-[11px]">#{tag.trim()}</span>
              ))}
            </div>
          )}

          {/* Author */}
          <div className={`nd-card p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 sm:gap-6 text-center sm:text-right`}>
            <img
              alt={post.author}
              {...responsiveImageProps(
                resolveAuthorPhoto(post.authorAvatar, data.PERSONAL_INFO?.avatar),
                { sizes: '80px', displayWidth: 80, displayHeight: 80 },
              )}
              className="w-20 h-20 rounded-2xl object-cover shadow-sm shrink-0"
              referrerPolicy="no-referrer"
              onError={imageFallback('/avatar-fallback.svg')}
            />
            <div className="space-y-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className={`nd-h2 text-base ${isDark ? 'text-white' : ''}`}>{post.author}</h3>
                  <p className="text-xs font-extrabold text-[color:var(--nd-accent)]">{post.authorRole || 'مشاور ارشد رشد و دیجیتال مارکتینگ'}</p>
                </div>
                <button onClick={() => onNavigate('contact')} className="nd-btn nd-btn-accent px-4 py-2 text-[11px] self-center sm:self-auto">
                  <span>درخواست مشاوره</span>
                </button>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
                متخصص پرفورمنس مارکتینگ، ترکینگ و بهینه‌سازی نرخ تبدیل (CRO) با سابقه بهینه‌سازی ده‌ها فروشگاه آنلاین و برندهای معتبر.
              </p>
            </div>
          </div>

          {/* Comments */}
          <section className={`space-y-6 pt-8 border-t ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
            <h3 className={`nd-h2 text-lg flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
              <MessageSquare className="w-5 h-5 text-[color:var(--nd-accent)]" />
              <span>دیدگاه‌ها و پرسش‌ها</span>
              <span className="nd-chip text-[10px]">{postComments.length}</span>
            </h3>

            <div className="nd-card p-6 sm:p-8 space-y-4">
              <h4 className={`text-sm font-extrabold ${isDark ? 'text-slate-200' : 'text-[color:var(--nd-ink-2)]'}`}>
                {postComments.length === 0 ? 'شما اولین نفری باشید که نظر می‌دهید!' : 'دیدگاه یا سوال خود را مطرح کنید:'}
              </h4>
              {commentSuccess && (
                <div className="p-4 rounded-2xl bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] text-xs font-extrabold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>دیدگاه شما با موفقیت ثبت شد و پس از بررسی منتشر خواهد شد.</span>
                </div>
              )}
              {commentError && (
                <div className="p-4 rounded-2xl bg-[#fee2e2] text-[#b91c1c] text-xs font-extrabold">{commentError}</div>
              )}
              <form onSubmit={handleCommentSubmit} className="space-y-4">
                <textarea
                  rows={4}
                  required
                  placeholder="متن دیدگاه یا سوال شما درباره این مقاله..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className={inputCls(isDark)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" required placeholder="نام و نام خانوادگی *" value={commentName} onChange={(e) => setCommentName(e.target.value)} className={inputCls(isDark)} />
                  <input type="email" required placeholder="آدرس ایمیل (نمایش داده نمی‌شود) *" value={commentEmail} onChange={(e) => setCommentEmail(e.target.value)} className={`${inputCls(isDark)} dir-ltr text-right`} />
                </div>
                <div className={`p-3.5 rounded-2xl border flex items-center justify-between max-w-xs ${isDark ? 'bg-white/5 border-white/10' : 'bg-[color:var(--nd-bg-soft)] border-[color:var(--nd-line)]'}`}>
                  <label className={`flex items-center gap-2.5 text-xs cursor-pointer select-none ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>
                    <input type="checkbox" checked={isCaptchaChecked} onChange={(e) => setIsCaptchaChecked(e.target.checked)} className="w-4 h-4 rounded cursor-pointer accent-[#4f46e5]" />
                    <span>من ربات نیستم</span>
                  </label>
                  <ShieldCheck className="w-5 h-5 text-[color:var(--nd-success)] opacity-80" />
                </div>
                <button type="submit" className={`nd-btn px-7 py-3.5 text-xs ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'}`}>
                  <span>ثبت دیدگاه</span>
                </button>
              </form>
            </div>

            {postComments.length > 0 && (
              <div className="space-y-4">
                {postComments.map((c) => (
                  <div key={c.id} className="nd-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-extrabold ${isDark ? 'text-white' : ''}`}>{c.authorName}</span>
                      <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{c.date}</span>
                    </div>
                    <p className={`text-xs leading-relaxed break-words ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>{c.content}</p>
                    {c.reply && (
                      <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-[color:var(--nd-accent-soft)] border-transparent text-[color:var(--nd-ink-2)]'}`}>
                        <span className="font-extrabold text-[color:var(--nd-accent)] block mb-1">پاسخ امید عدلی:</span>
                        {c.reply}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>
      </div>

      {/* Related */}
      {relatedPosts.length > 0 && (
        <section className="max-w-5xl mx-auto space-y-6">
          <div className={`flex items-center justify-between pb-4 border-b ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
            <h3 className={`nd-h2 text-lg sm:text-2xl flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
              <Sparkles className="w-5 h-5 text-[color:var(--nd-accent)]" />
              <span>مقالات مرتبط</span>
            </h3>
            <button onClick={() => onNavigate('blog')} className="text-xs font-extrabold text-[color:var(--nd-accent)] hover:underline flex items-center gap-1 cursor-pointer">
              <span>مشاهده همه مقالات</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {relatedPosts.map((rel) => (
              <motion.a
                key={rel.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                {...linkProps(postPath(rel), () => onSelectPost(rel.id))}
                className="nd-card nd-card-hover overflow-hidden text-right flex flex-col group cursor-pointer"
              >
                <div className={`aspect-[16/10] overflow-hidden border-b ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                  <img
                    alt={rel.title}
                    {...responsiveImageProps(rel.coverImage, {
                      sizes: BLOG_COVER_SIZES,
                      displayWidth: 1376,
                      displayHeight: 768,
                    })}
                    className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-700"
                    referrerPolicy="no-referrer"
                    onError={imageFallback()}
                  />
                </div>
                <div className="p-5 space-y-2.5 grow flex flex-col">
                  <span className="nd-chip w-fit">{rel.categoryFa}</span>
                  <h4 className={`nd-h2 text-sm leading-snug line-clamp-2 group-hover:text-[color:var(--nd-accent)] transition-colors ${isDark ? 'text-white' : ''}`}>{rel.title}</h4>
                  <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs line-clamp-2 leading-relaxed`}>{mdToPlainText(rel.excerpt)}</p>
                  <span className={`mt-auto pt-3 border-t flex items-center justify-between text-[11px] ${isDark ? 'border-white/10 text-slate-500' : 'border-[color:var(--nd-line)] text-[color:var(--nd-faint)]'}`}>
                    <span>{rel.author || 'امید عدلی'}</span>
                    <span>{rel.readTime}</span>
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        </section>
      )}

      {/* یک ابزارِ دیگرِ مرتبط — زاویه‌ی متفاوت نسبت به ابزارِ اول */}
      {secondaryProductId && isProductPromotable(data, secondaryProductId) && (
        <ProductPromo
          productId={secondaryProductId}
          theme={theme}
          onNavigate={onNavigate}
          topic={promoTopic}
          variant="banner"
          eyebrow="ابزار مرتبط با این مقاله"
          className="max-w-5xl mx-auto"
        />
      )}
    </div>
  );
};
