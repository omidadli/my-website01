export type Theme = 'dark' | 'light';
export type Page = 
  | 'home' 
  | 'services' 
  | 'portfolio' 
  | 'about' 
  | 'blog' 
  | 'contact' 
  | 'projects' 
  | 'products'
  | 'admin'
  | (string & {});

export interface CustomBlock {
  id: string;
  type: 'text' | 'image' | 'cta' | 'features' | 'faq';
  title?: string;
  content?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonLink?: string;
  items?: { title: string; desc: string }[];
}

export interface CustomPage {
  id: string;
  slug: string;
  title: string;
  description?: string;
  showInMenu: boolean;
  blocks: CustomBlock[];
}

export interface ProductApiKey {
  id: string;
  label?: string;
  provider: 'gemini' | 'openai';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  hasKey?: boolean;
  keyMask?: string;
  enabled?: boolean;
}

export interface ProductPlan {
  id: 'basic' | 'pro' | 'vip' | string;
  name: string;
  price: string;
  durationDays: number;
  messageQuota: number;
  maxDevices: number;
  tagline: string;
  perks: string[];
  popular?: boolean;
  badge?: string;
}

export interface ProductBehavior {
  persona?: string;
  welcome?: string;
  suggestions?: string[];
  temperature?: number;
  useDigest?: boolean;
  model?: string;
}

export interface ProductItem {
  id: string;
  title: string;
  tagline?: string;
  description: string;
  targetAudience: string;
  problemSolved?: string;
  whyBuy?: string;
  iconName: string;
  glow?: 'magenta' | 'blue' | 'purple' | 'emerald';
  badge?: string;
  actionText?: string;
  price?: string;
  slug?: string;
  status?: 'published' | 'draft';
  features?: string[];
  howItWorks?: string[];
  sample?: { role: 'user' | 'assistant'; text: string }[];
  placeholder?: string;
  plans?: ProductPlan[];
  behavior?: ProductBehavior;
  keys?: ProductApiKey[];
  seo?: PageSeoConfig;
}

export interface OngoingProjectItem {
  id: string;
  title: string;
  status: 'در حال اجرا' | 'تکمیل‌شده';
  description: string;
  isPlaceholder?: boolean;
}

export interface PricingPackage {
  title: string;
  price: string;
  badge?: string;
  description?: string;
  isPopular?: boolean;
}

export interface ServiceItem {
  id: string;
  title: string;
  titleEn: string;
  iconName: string;
  shortDesc: string;
  fullDesc: string;
  features: string[];
  deliverables: string[];
  tags: string[];
  packages?: PricingPackage[];
  slug?: string;
  status?: 'published' | 'draft';
  seo?: PageSeoConfig;
}

export interface MetricComparison {
  label: string;
  before: string;
  after: string;
  growth: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  client: string;
  industry: 'Fintech' | 'Crypto' | 'Travel' | 'E-commerce' | 'SaaS' | 'Web Design';
  pathCategory?: 'start' | 'sell' | 'grow';
  liveUrl?: string;
  industryFa: string;
  summary: string;
  thumbnailIcon: string;
  heroColor: string;
  featured: boolean;
  metrics: {
    roas: string;
    conversionRate: string;
    cacReduction: string;
  };
  metricsComparison: MetricComparison[];
  challenge: string;
  solution: string;
  results: string;
  tags: string[];
  date: string;
  slug?: string;
  status?: 'published' | 'draft';
  seo?: PageSeoConfig;
}

export interface Testimonial {
  id: string;
  clientName: string;
  clientRole: string;
  company: string;
  avatarUrl: string;
  rating: number;
  quote: string;
  metricHighlight: string;
}

export interface TableOfContentItem {
  id: string;
  title: string;
  level?: number;
}

export interface BlogPostSection {
  id?: string;
  heading?: string;
  content: string;
  callout?: string;
  keyPoints?: string[];
  image?: string;
}

export interface BlogFaqItem {
  question: string;
  answer: string;
}

export interface BlogComment {
  id: string;
  postId: string;
  authorName: string;
  authorEmail: string;
  avatar?: string;
  content: string;
  date: string;
  isApproved: boolean;
  reply?: string;
  likes?: number;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categoryFa: string;
  pathCategory?: 'start' | 'sell' | 'grow';
  date: string;
  updatedAt?: string;
  readTime: string;
  author: string;
  authorRole?: string;
  authorAvatar?: string;
  imageIcon: string;
  coverImage?: string;
  featured: boolean;
  isPopular?: boolean;
  tableOfContents?: TableOfContentItem[];
  sections?: BlogPostSection[];
  faq?: BlogFaqItem[];
  tags?: string[];
  slug?: string;
  status?: 'published' | 'draft';
  seo?: PageSeoConfig;
  viewsCount?: number;
  commentsCount?: number;
  /** ISO dates for schema/sitemap; the display `date` is a localized string. */
  dateIso?: string;
  updatedIso?: string;
}

export interface SkillTool {
  name: string;
  category: 'Ads' | 'Analytics' | 'CRO' | 'Tech';
  icon: string;
  proficiency: number;
}

export interface TimelineMilestone {
  year: string;
  title: string;
  company: string;
  description: string;
  achievement: string;
}

export interface MediaItem {
  id: string;
  url: string;
  title: string;
  alt?: string;
  sizeKb?: number;
  dimensions?: string;
  createdAt: string;
  tags?: string[];
}

export interface PageSeoConfig {
  title?: string;
  metaDescription?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export interface GlobalSeoConfig {
  siteTitle: string;
  titleTemplate: string;
  defaultMetaDesc: string;
  defaultKeywords: string;
  faviconUrl: string;
  ogImage: string;
  canonicalBaseUrl: string;
  robotsTxt: string;
}

export interface NavigationMenuItem {
  id: string;
  label: string;
  pageSlug: string;
  isExternal?: boolean;
  url?: string;
  isHidden?: boolean;
  order: number;
}

export interface PageSectionItem {
  id: string;
  name: string;
  label: string;
  isHidden: boolean;
  /** Optional per-section visual overrides (spacing, alignment, background). */
  style?: any;
}

export interface VersionSnapshot {
  id: string;
  timestamp: string;
  label: string;
  data: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details?: string;
  user: string;
}

export interface ThemeConfig {
  accentColor: string;
  secondaryColor: string;
  fontScale: number;
}

