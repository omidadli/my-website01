import React, { useState, useMemo } from 'react';
import { Theme, Page, BlogPost } from '../types';
import { useContent } from '../context/ContentContext';
import { EditableText } from '../components/cms/EditableText';
import { PageHero } from '../components/nd/Kit';
import { Search, Sparkles, Flame, ChevronLeft, Mail, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { usePreservedState } from '../utils/statePreserver';
import { linkProps, postPath } from '../utils/router';
import { categoryOrder, normalizeCategory } from '../data/blogTaxonomy';
import { safeRecordArray } from '../utils/contentDefaults';
import { imageFallback } from '../utils/imageFallback';
import { mdToPlainText } from '../utils/plainText';

interface BlogPageProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  onSelectPost: (postId: string) => void;
}

export const BlogPage: React.FC<BlogPageProps> = ({ theme, onNavigate, onSelectPost }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const pageData = data.BLOG_PAGE_DATA;
  const posts: BlogPost[] = safeRecordArray<BlogPost>(data.BLOG_POSTS)
    .filter((post) => typeof post.id === 'string' && post.id.length > 0)
    .map((post) => ({
      ...post,
      title: typeof post.title === 'string' ? post.title : 'بدون عنوان',
      excerpt: typeof post.excerpt === 'string' ? mdToPlainText(post.excerpt) : '',
      categoryFa: typeof post.categoryFa === 'string' ? post.categoryFa : 'عمومی',
    }));
  const [query, setQuery] = usePreservedState<string>('blog_search_query', '');
  const [category, setCategory] = usePreservedState<string>('blog_category_filter', 'all');
  const [newsletterEmail, setNewsletterEmail] = usePreservedState<string>('blog_newsletter_email', '');
  const [subscribed, setSubscribed] = useState(false);

  // Categories come from the shared taxonomy so chips keep a stable order and
  // legacy free-text values still group with their modern equivalent.
  const categoryOf = (p: BlogPost): string => normalizeCategory(p).categoryFa;
  const categories = useMemo(() => {
    const seen = new Set<string>();
    posts.forEach((p) => {
      const c = categoryOf(p);
      if (c) seen.add(c);
    });
    return ['all', ...[...seen].sort((a, b) => categoryOrder(a) - categoryOrder(b))];
  }, [posts]);
  const filtered = useMemo(
    () =>
      posts.filter(
        (p) =>
          (category === 'all' || categoryOf(p) === category) &&
          (!query.trim() || p.title.includes(query.trim()) || p.excerpt.includes(query.trim())),
      ),
    [posts, category, query],
  );
  const featured = posts.find((p) => p.isPopular) || posts[0];
  const rest = filtered.filter((p) => p.id !== featured?.id);

  return (
    <div className="space-y-14 py-4">
      <PageHero theme={theme} page="blog" title={pageData.headline} subtitle={pageData.subheadline} badge={pageData.badge} onNavigate={onNavigate}>
        <div className="max-w-md mx-auto pt-2">
          <div className={`${isDark ? 'nd-glass-dark' : 'nd-card'} rounded-full flex items-center gap-3 px-4 py-2.5`}>
            <Search className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pageData.searchPlaceholder}
              className={`w-full bg-transparent text-xs font-bold focus:outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)]'}`}
            />
          </div>
        </div>
      </PageHero>

      {/* Categories */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`nd-chip cursor-pointer transition-colors ${
              category === c ? 'bg-[color:var(--nd-ink)] text-[color:var(--nd-bg)] border-transparent' : 'hover:text-[color:var(--nd-accent)]'
            }`}
          >
            {c === 'all' ? 'همه موضوع‌ها' : c}
          </button>
        ))}
      </div>

      {/* Featured */}
      {featured && category === 'all' && !query && (
        <motion.a
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          {...linkProps(postPath(featured), () => onSelectPost(featured.id))}
          className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} w-full rounded-[var(--nd-radius-panel)] p-6 sm:p-10 text-right grid grid-cols-1 md:grid-cols-2 gap-8 items-center cursor-pointer group`}
        >
          <div className="space-y-4">
            <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-amber-200' : 'nd-eyebrow inline-flex bg-[color:var(--nd-peach-soft)] text-[#d97706] border-transparent'}>
              <Flame className="w-3.5 h-3.5" />
              <span>محبوب‌ترین مقاله</span>
            </span>
            <h2 className={`nd-h2 text-xl sm:text-3xl leading-snug group-hover:text-[color:var(--nd-accent)] transition-colors ${isDark ? 'text-white' : ''}`}>{featured.title}</h2>
            <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm leading-relaxed line-clamp-2`}>{featured.excerpt}</p>
            <div className={`flex items-center gap-4 text-[11px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>
              <span>{featured.date}</span>
              <span>·</span>
              <span>{featured.readTime}</span>
            </div>
          </div>
          <div className={`rounded-[var(--nd-radius-card)] overflow-hidden aspect-[16/10] border ${isDark ? 'border-white/12' : 'border-white/60'} shadow-md`}>
            <img src={featured.coverImage} alt={featured.title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700" referrerPolicy="no-referrer" onError={imageFallback()} />
          </div>
        </motion.a>
      )}

      {/* Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className={`nd-h2 text-base sm:text-lg ${isDark ? 'text-white' : ''}`}>
            {category === 'all' && !query ? 'جدیدترین‌ها' : `نتایج (${filtered.length})`}
          </h2>
        </div>
        {rest.length === 0 ? (
          <div className="nd-card p-12 text-center">
            <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm`}>مقاله‌ای با این مشخصات پیدا نشد.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rest.map((post, idx) => (
              <motion.a
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: (idx % 3) * 0.07, ease: [0.22, 1, 0.36, 1] }}
                {...linkProps(postPath(post), () => onSelectPost(post.id))}
                className="nd-card nd-card-hover overflow-hidden text-right flex flex-col group cursor-pointer"
              >
                <div className={`aspect-[16/9] overflow-hidden border-b ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                  <img src={post.coverImage} alt={post.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-700" referrerPolicy="no-referrer" onError={imageFallback()} />
                </div>
                <div className="p-6 space-y-3 flex flex-col grow">
                  <div className="flex items-center gap-2">
                    <span className="nd-chip">{post.categoryFa}</span>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{post.readTime}</span>
                  </div>
                  <h3 className={`nd-h2 text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-[color:var(--nd-accent)] transition-colors ${isDark ? 'text-white' : ''}`}>{post.title}</h3>
                  <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-xs leading-relaxed line-clamp-2`}>{post.excerpt}</p>
                  <span className={`mt-auto pt-3 border-t flex items-center justify-between text-[11px] font-extrabold text-[color:var(--nd-accent)] ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
                    <span>خواندن مقاله</span>
                    <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </section>

      {/* Newsletter */}
      <section className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[var(--nd-radius-panel)] p-8 sm:p-12 text-center space-y-5 max-w-3xl mx-auto`}>
        <span className={isDark ? 'nd-glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold text-indigo-200' : 'nd-eyebrow inline-flex'}>
          <Mail className="w-4 h-4" />
          <span>
            <EditableText path="BLOG_PAGE_DATA.newsletterHeadline">{pageData.newsletterHeadline}</EditableText>
          </span>
        </span>
        <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm max-w-xl mx-auto`}>
          <EditableText path="BLOG_PAGE_DATA.newsletterSubheadline" multiline>{pageData.newsletterSubheadline}</EditableText>
        </p>
        {subscribed ? (
          <div className="nd-chip mx-auto px-5 py-3 text-xs font-extrabold bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{pageData.newsletterSuccess}</span>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubscribed(true);
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder={pageData.newsletterPlaceholder}
              className={`${isDark ? 'nd-glass-dark text-white placeholder:text-slate-500' : 'nd-card text-[color:var(--nd-ink)] placeholder:text-[color:var(--nd-faint)]'} rounded-full px-5 py-3.5 text-xs font-bold focus:outline-none focus:border-[color:var(--nd-accent)] grow dir-ltr text-left`}
            />
            <button type="submit" className={`nd-btn ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'} px-6 py-3.5 text-xs shrink-0`}>
              <span>
                <EditableText path="BLOG_PAGE_DATA.newsletterCta">{pageData.newsletterCta}</EditableText>
              </span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
