import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../services/api';
// NOTE: the eager import goes to contentCore (WITHOUT the 748 kB of generated
// article batches) so the first-paint bundle stays small. The batches load in
// the background via the dynamic import below and are merged in as defaults.
import * as initialData from '../data/contentCore';

import { 
  CustomPage, 
  MediaItem, 
  PageSeoConfig, 
  GlobalSeoConfig, 
  NavigationMenuItem, 
  PageSectionItem, 
  VersionSnapshot, 
  AuditLogEntry, 
  ThemeConfig,
  BlogComment,
  BlogPost
} from '../types';
import { CANONICAL_SITE_URL, defaultGlobalSeo as sharedGlobalSeoDefaults } from '../../lib/seoDefaults';
import { migratePersonalInfo, reconcileGlobalSeo, reconcileSections } from '../utils/contentMigrations';
import { withServicePaths } from '../utils/servicePath';
import { mergeContentDefaults, reconcileProductCatalog } from '../utils/contentDefaults';
import { publicContentView } from '../../lib/contentVisibility';
import {
  type AdoptOutcome,
  type Backend,
  type SaveResult,
  type SaveState,
  classifyRemote,
  leanSnapshotData,
  normalizeSnapshotHistory,
  retryDelayMs,
  toCloudPayload,
  trimSnapshotHistory,
} from '../utils/cloudSync';

const LOCAL_STORAGE_KEY = 'OMID_ADLI_SITE_CONTENT_V3';
/** Restore points live in this browser only: cap them by count and by serialized size. */
const MAX_SNAPSHOTS = 20;
const SNAPSHOT_BUDGET_CHARS = 3_500_000;
const LOCAL_STORAGE_PIN_KEY = 'OMID_ADLI_ADMIN_PIN_CODE';
const DEFAULT_PIN = '1234';

/**
 * Background load of the generated article batches (batch01+batch02). The
 * network request starts as soon as this module evaluates — parallel to first
 * paint, never blocking it. Resolved posts are treated as DEFAULTS: any
 * localStorage/CMS BLOG_POSTS array that already owns the state wins.
 */
const blogPostsChunk: Promise<BlogPost[]> = import('../data/blogPosts')
  .then((m) => m.GENERATED_BATCH_POSTS)
  .catch(() => []);

export const defaultGlobalSeo: GlobalSeoConfig = { ...sharedGlobalSeoDefaults };

export const defaultNavigationMenu: NavigationMenuItem[] = [
  { id: 'nav-1', label: 'صفحه اصلی', pageSlug: 'home', order: 1, isHidden: false },
  { id: 'nav-2', label: 'خدمات تخصصی', pageSlug: 'services', order: 2, isHidden: false },
  { id: 'nav-3', label: 'نمونه‌کارها', pageSlug: 'portfolio', order: 3, isHidden: false },
  { id: 'nav-4', label: 'درباره من', pageSlug: 'about', order: 4, isHidden: false },
  { id: 'nav-6', label: 'پروژه‌ها', pageSlug: 'projects', order: 5, isHidden: false },
  { id: 'nav-7', label: 'آموزش', pageSlug: 'blog', order: 6, isHidden: false },
  { id: 'nav-8', label: 'محصولات', pageSlug: 'products', order: 7, isHidden: false },
  { id: 'nav-9', label: 'تماس', pageSlug: 'contact', order: 8, isHidden: false },
];

export const defaultPageSections: Record<string, PageSectionItem[]> = {
  home: [
    { id: 'sec-hero', name: 'HERO', label: 'صحنه سینمایی اصلی (Hero)', isHidden: false },
    { id: 'sec-path-nav', name: 'PATH_NAV', label: 'مسیریابی سه‌گانه (الان کجای مسیره؟)', isHidden: false },
    { id: 'sec-proof', name: 'PROOF', label: 'صحنه اثبات با داده (آمار + کیس‌های منتخب)', isHidden: false },
    { id: 'sec-services', name: 'SERVICES_TABS', label: 'خدمات سه‌مرحله‌ای (تب‌بندی شده)', isHidden: false },
    { id: 'sec-how-i-work', name: 'HOW_I_WORK', label: 'فرآیند همکاری (How I Work)', isHidden: false },
    { id: 'sec-why-omid', name: 'WHY_OMID', label: 'چرا با من کار کنید؟ + معرفی کوتاه', isHidden: false },
    { id: 'sec-insights', name: 'INSIGHTS', label: 'نوشت‌های تازه (به‌تفکیک موضوع)', isHidden: false },
    { id: 'sec-ai-tools', name: 'AI_TOOLS', label: 'دستیارهای هوشمند (معرفی محصولات)', isHidden: false },
    { id: 'sec-faq', name: 'FAQ', label: 'پرسش‌های پرتکرار', isHidden: false },
    { id: 'sec-final-cta', name: 'FINAL_CTA', label: 'فراخوان نهایی اقدام', isHidden: false },
  ],
  services: [
    { id: 'sec-srv-header', name: 'HEADER', label: 'سربرگ خدمات', isHidden: false },
    { id: 'sec-srv-grid', name: 'SERVICES_GRID', label: 'لیست کامل خدمات', isHidden: false },
    { id: 'sec-srv-roas', name: 'ROAS_CALCULATOR', label: 'ماشین‌حساب ROAS', isHidden: false },
    { id: 'sec-srv-[#how-it-works]', name: 'HOW_IT_WORKS', label: 'مراحل کاری ۴ گانه', isHidden: false },
  ],
  portfolio: [
    { id: 'sec-port-header', name: 'HEADER', label: 'سربرگ نمونه‌کارها', isHidden: false },
    { id: 'sec-port-grid', name: 'PORTFOLIO_GRID', label: 'شبکه نمونه‌کارها', isHidden: false },
  ],
  about: [
    { id: 'sec-abt-bio', name: 'BIO', label: 'بیوگرافی و معرفی', isHidden: false },
    { id: 'sec-abt-skills', name: 'SKILLS', label: 'مهارت‌ها و ابزارها', isHidden: false },
    { id: 'sec-abt-timeline', name: 'TIMELINE', label: 'سوابق کاری', isHidden: false },
  ],
  blog: [
    { id: 'sec-blg-grid', name: 'BLOG_GRID', label: 'لیست مقالات', isHidden: false },
  ],
  contact: [
    { id: 'sec-cnt-form', name: 'CONTACT_FORM', label: 'فرم تماس و راه‌های ارتباطی', isHidden: false },
    { id: 'sec-cnt-cal', name: 'CALENDAR', label: 'تقویم رزرو زمان جلسه', isHidden: false },
  ],
  projects: [
    { id: 'sec-prj-list', name: 'PROJECTS_LIST', label: 'لیست پروژه‌ها', isHidden: false },
  ],
  products: [
    { id: 'sec-prd-grid', name: 'PRODUCTS_GRID', label: 'لیست دوره‌ها و محصولات', isHidden: false },
  ]
};

export const defaultMediaLibrary: MediaItem[] = [
  {
    id: 'media-1',
    url: (initialData.PERSONAL_INFO as any).avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
    title: 'تصویر پروفایل امید عدلی',
    sizeKb: 145,
    dimensions: '600x600',
    createdAt: '1404/01/01',
    tags: ['پروفایل', 'امید عدلی', 'آواتار']
  },
  {
    id: 'media-2',
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
    title: 'نمودار پرفورمنس مارکتینگ',
    sizeKb: 210,
    dimensions: '800x533',
    createdAt: '1404/01/05',
    tags: ['مارکتینگ', 'آنالیز', 'داشبورد']
  },
  {
    id: 'media-3',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80',
    title: 'داشبورد گوگل آنالیتیکس و داده‌ها',
    sizeKb: 280,
    dimensions: '800x533',
    createdAt: '1404/01/10',
    tags: ['داده', 'آنالیتیکس', 'رشد']
  }
];

export interface ContentState {
  PERSONAL_INFO: typeof initialData.PERSONAL_INFO;
  SERVICES: typeof initialData.SERVICES;
  CASE_STUDIES: typeof initialData.CASE_STUDIES;
  STATS: typeof initialData.STATS;
  TESTIMONIALS: typeof initialData.TESTIMONIALS;
  BLOG_POSTS: BlogPost[];
  BLOG_COMMENTS: BlogComment[];
  PRODUCTS: typeof initialData.PRODUCTS;
  PROJECTS_PAGE_DATA: typeof initialData.PROJECTS_PAGE_DATA;
  PRODUCTS_PAGE_DATA: typeof initialData.PRODUCTS_PAGE_DATA;
  CHAT_CONFIG: typeof initialData.CHAT_CONFIG;
  AI_TOOLS_CONFIG: typeof initialData.AI_TOOLS_CONFIG;
  BLOG_PAGE_DATA: typeof initialData.BLOG_PAGE_DATA;
  ONGOING_PROJECTS: typeof initialData.ONGOING_PROJECTS;
  BUSINESS_ANALYSIS_DATA: typeof initialData.BUSINESS_ANALYSIS_DATA;
  SKILLS_TOOLS: typeof initialData.SKILLS_TOOLS;
  ALL_SKILLS_LIST: typeof initialData.ALL_SKILLS_LIST;
  TIMELINE: typeof initialData.TIMELINE;
  OTHER_COLLABORATIONS: typeof initialData.OTHER_COLLABORATIONS;
  SELECT_PROJECTS: typeof initialData.SELECT_PROJECTS;
  EDUCATION_AND_COURSES: typeof initialData.EDUCATION_AND_COURSES;
  HOW_I_WORK_STEPS: typeof initialData.HOW_I_WORK_STEPS;
  HOMEPAGE_HOW_I_WORK_STEPS: typeof initialData.HOMEPAGE_HOW_I_WORK_STEPS;
  WHY_OMID_POINTS: typeof initialData.WHY_OMID_POINTS;
  CUSTOM_PAGES: CustomPage[];
  GLOBAL_SEO: GlobalSeoConfig;
  PAGE_SEO: Record<string, PageSeoConfig>;
  NAVIGATION_MENU: NavigationMenuItem[];
  PAGE_SECTIONS: Record<string, PageSectionItem[]>;
  MEDIA_LIBRARY: MediaItem[];
  VERSION_HISTORY: VersionSnapshot[];
  AUDIT_LOGS: AuditLogEntry[];
  THEME_CONFIG: ThemeConfig;
}

const defaultContentState: ContentState = {
  PERSONAL_INFO: initialData.PERSONAL_INFO,
  SERVICES: initialData.SERVICES,
  CASE_STUDIES: initialData.CASE_STUDIES,
  STATS: initialData.STATS,
  TESTIMONIALS: initialData.TESTIMONIALS,
  BLOG_POSTS: initialData.CORE_BLOG_POSTS,
  BLOG_COMMENTS: initialData.INITIAL_BLOG_COMMENTS || [],
  PRODUCTS: initialData.PRODUCTS,
  PROJECTS_PAGE_DATA: initialData.PROJECTS_PAGE_DATA,
  PRODUCTS_PAGE_DATA: initialData.PRODUCTS_PAGE_DATA,
  CHAT_CONFIG: initialData.CHAT_CONFIG,
  AI_TOOLS_CONFIG: initialData.AI_TOOLS_CONFIG,
  BLOG_PAGE_DATA: initialData.BLOG_PAGE_DATA,
  ONGOING_PROJECTS: initialData.ONGOING_PROJECTS,
  BUSINESS_ANALYSIS_DATA: initialData.BUSINESS_ANALYSIS_DATA,
  SKILLS_TOOLS: initialData.SKILLS_TOOLS,
  ALL_SKILLS_LIST: initialData.ALL_SKILLS_LIST,
  TIMELINE: initialData.TIMELINE,
  OTHER_COLLABORATIONS: initialData.OTHER_COLLABORATIONS,
  SELECT_PROJECTS: initialData.SELECT_PROJECTS,
  EDUCATION_AND_COURSES: initialData.EDUCATION_AND_COURSES,
  HOW_I_WORK_STEPS: initialData.HOW_I_WORK_STEPS,
  HOMEPAGE_HOW_I_WORK_STEPS: initialData.HOMEPAGE_HOW_I_WORK_STEPS,
  WHY_OMID_POINTS: initialData.WHY_OMID_POINTS,
  CUSTOM_PAGES: [],
  GLOBAL_SEO: defaultGlobalSeo,
  PAGE_SEO: {},
  NAVIGATION_MENU: defaultNavigationMenu,
  PAGE_SECTIONS: defaultPageSections,
  MEDIA_LIBRARY: defaultMediaLibrary,
  VERSION_HISTORY: [
    {
      id: 'snap-initial',
      timestamp: new Date().toLocaleString('fa-IR'),
      label: 'نسخه اولیه (پیش‌فرض سیستم)',
      data: initialData
    }
  ],
  AUDIT_LOGS: [
    {
      id: 'log-1',
      timestamp: new Date().toLocaleString('fa-IR'),
      action: 'راه‌اندازی سیستم CMS',
      details: 'سیستم با تمام داده‌های اولیه با موفقیت لود گردید.',
      user: 'ادمین'
    }
  ],
  THEME_CONFIG: {
    accentColor: '#8b5cf6',
    secondaryColor: '#5ce1e6',
    fontScale: 1
  }
};

// Helper for deep property getter/setter by dot path (e.g. 'PERSONAL_INFO.name' or 'SERVICES.0.title')
export function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[part];
  }, obj);
}

export function setByPath(obj: any, path: string, value: any): any {
  const parts = path.split('.');
  const newObj = JSON.parse(JSON.stringify(obj));
  let current = newObj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = isNaN(Number(parts[i + 1])) ? {} : [];
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
  return newObj;
}

interface ContentContextType {
  data: ContentState;
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
  pinCode: string;
  changePin: (newPin: string) => void;
  loginAdmin: (username: string, password?: string) => Promise<boolean>;
  /** 'cloud' when the Cloudflare D1 API is live, otherwise local-only mode. */
  persistence: 'local' | 'cloud';
  /** True once the mount probe finished (cloud content adopted, or confirmed local-only). */
  contentReady: boolean;
  /** Which backend the boot probe reached: the live Cloudflare API, the local dev emulator, or none. */
  backend: Backend;
  /** Honest status of the admin → server sync (saving / saved / failed / not connected). */
  saveState: SaveState;
  /** Push the current content to the server right now and report what really happened. */
  saveNow: () => Promise<SaveResult>;
  /** Ask the server again after a failed boot; reloads the page as soon as it answers. */
  reconnect: () => Promise<boolean>;
  logoutAdmin: () => void;
  updateField: (path: string, newValue: any) => void;
  addItem: (arrayPath: string, templateItem?: any) => void;
  removeItem: (arrayPath: string, index: number) => void;
  moveItem: (arrayPath: string, fromIndex: number, toIndex: number) => void;
  resetToDefaults: () => void;
  exportJSON: () => void;
  importJSON: (jsonStr: string) => boolean;
  activeEditModal: EditModalConfig | null;
  openEditModal: (config: EditModalConfig) => void;
  closeEditModal: () => void;
  hasUnsavedChanges: boolean;
  saveChanges: () => void;
  duplicateItem: (arrayPath: string, index: number) => void;
  duplicateSection: (pageKey: string, sectionId: string) => void;
  duplicatePage: (pageSlug: string) => void;
  updateSectionStyle: (pageKey: string, sectionId: string, styleProps: any) => void;
  // New CMS Functions
  createSnapshot: (label?: string) => void;
  rollbackSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;
  addMediaItem: (url: string, title?: string, sizeKb?: number, dimensions?: string, tags?: string[]) => void;
  removeMediaItem: (id: string) => void;
  logActivity: (action: string, details?: string) => void;
  toggleSectionVisibility: (pageKey: string, sectionId: string) => void;
  reorderPageSection: (pageKey: string, fromIndex: number, toIndex: number) => void;
  addPageSection: (pageKey: string, name: string, label: string) => void;
  removePageSection: (pageKey: string, sectionId: string) => void;
  updatePageSeo: (pageKey: string, seo: Partial<PageSeoConfig>) => void;
  updateGlobalSeo: (seo: Partial<GlobalSeoConfig>) => void;
  updateNavMenu: (menu: NavigationMenuItem[]) => void;
  generateSitemapXml: () => string;
  generateRobotsTxt: () => string;
  addBlogComment: (comment: { postId: string; authorName: string; authorEmail: string; content: string }) => Promise<{ ok: boolean; error?: string }>;
  toggleCommentApproval: (commentId: string) => void;
  deleteBlogComment: (commentId: string) => void;
  replyBlogComment: (commentId: string, reply: string) => void;
}

export interface EditModalConfig {
  type: 'text' | 'image' | 'icon' | 'button' | 'repeater';
  path: string;
  label: string;
  value?: any;
  extraProps?: any;
}


/**
 * Write the content snapshot to localStorage without ever throwing: Safari private
 * mode and a full quota (large media libraries) raise on setItem, and several
 * callers run inside React state updaters where an exception would take the
 * admin panel down. Cloud persistence is independent of this cache.
 */
const persistLocal = (state: unknown): void => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Local content cache not saved (storage full or unavailable):', e);
  }
};

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<ContentState>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.PERSONAL_INFO) {
          if (!parsed.PERSONAL_INFO.title || parsed.PERSONAL_INFO.title.includes('متخصص دیزاین')) {
            parsed.PERSONAL_INFO.title = initialData.PERSONAL_INFO.title;
          }
        }
        // Restore SERVICES, STATS, TIMELINE, HOW_I_WORK_STEPS to default initialData
        return { 
          ...mergeContentDefaults(defaultContentState, parsed),
          // Restore points from older builds embed one another (several MB): flatten + cap them once.
          VERSION_HISTORY: normalizeSnapshotHistory(
            parsed.VERSION_HISTORY ?? defaultContentState.VERSION_HISTORY,
            MAX_SNAPSHOTS,
            SNAPSHOT_BUDGET_CHARS,
          ),
          // Older browser caches can hold a product collection from a previous
          // catalog. Reconcile it before first render, not only after cloud sync.
          PRODUCTS: reconcileProductCatalog(initialData.PRODUCTS, parsed.PRODUCTS),
          SERVICES: withServicePaths(initialData.SERVICES),
          STATS: initialData.STATS,
          TIMELINE: initialData.TIMELINE,
          HOW_I_WORK_STEPS: initialData.HOW_I_WORK_STEPS,
          HOMEPAGE_HOW_I_WORK_STEPS: initialData.HOMEPAGE_HOW_I_WORK_STEPS,
          WHY_OMID_POINTS: initialData.WHY_OMID_POINTS,
          PROJECTS_PAGE_DATA: { ...initialData.PROJECTS_PAGE_DATA, ...(parsed.PROJECTS_PAGE_DATA || {}) },
          PRODUCTS_PAGE_DATA: { ...initialData.PRODUCTS_PAGE_DATA, ...(parsed.PRODUCTS_PAGE_DATA || {}) },
          CHAT_CONFIG: { ...initialData.CHAT_CONFIG, ...(parsed.CHAT_CONFIG || {}) },
          AI_TOOLS_CONFIG: {
            ...initialData.AI_TOOLS_CONFIG,
            ...(parsed.AI_TOOLS_CONFIG || {}),
            channels: { ...initialData.AI_TOOLS_CONFIG.channels, ...(parsed.AI_TOOLS_CONFIG?.channels || {}) },
            tools: { ...initialData.AI_TOOLS_CONFIG.tools, ...(parsed.AI_TOOLS_CONFIG?.tools || {}) },
          },
          BLOG_PAGE_DATA: { ...initialData.BLOG_PAGE_DATA, ...(parsed.BLOG_PAGE_DATA || {}) },
          BLOG_POSTS: parsed.BLOG_POSTS || initialData.CORE_BLOG_POSTS,
          ONGOING_PROJECTS: parsed.ONGOING_PROJECTS || initialData.ONGOING_PROJECTS,
          PERSONAL_INFO: migratePersonalInfo({ ...defaultContentState.PERSONAL_INFO, ...(parsed.PERSONAL_INFO || {}) }, defaultContentState.PERSONAL_INFO),
          GLOBAL_SEO: reconcileGlobalSeo(defaultGlobalSeo, parsed.GLOBAL_SEO),
          NAVIGATION_MENU: (parsed.NAVIGATION_MENU || defaultNavigationMenu).filter((item: NavigationMenuItem) => item.pageSlug !== 'business-analysis'),
          PAGE_SECTIONS: { ...defaultPageSections, ...parsed.PAGE_SECTIONS, home: defaultPageSections.home },
          MEDIA_LIBRARY: parsed.MEDIA_LIBRARY || defaultMediaLibrary,
        };
      }
    } catch (e) {
      console.error('Failed to load content from localStorage', e);
    }
    return defaultContentState;
  });

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('OMID_ADLI_ADMIN_ACTIVE') === 'true';
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [activeEditModal, setActiveEditModal] = useState<EditModalConfig | null>(null);

  // Sync admin state to localStorage
  useEffect(() => {
    localStorage.setItem('OMID_ADLI_ADMIN_ACTIVE', isAdmin ? 'true' : 'false');
  }, [isAdmin]);

  // Merge the generated article batches when their chunk arrives. The batches
  // are DEFAULTS: if localStorage/CMS already provided a BLOG_POSTS array of
  // its own, leave it untouched. identity (`=== CORE_BLOG_POSTS`) tells us
  // whether the state still holds the bare fallback list.
  useEffect(() => {
    let cancelled = false;
    blogPostsChunk.then((batchPosts) => {
      if (cancelled || batchPosts.length === 0) return;
      const nextDefault = [...batchPosts, ...initialData.CORE_BLOG_POSTS];
      // Future merges (remote fetch, resetToDefaults) must see the full default list too.
      defaultContentState.BLOG_POSTS = nextDefault;
      setData((d) =>
        d.BLOG_POSTS === initialData.CORE_BLOG_POSTS ? { ...d, BLOG_POSTS: nextDefault } : d,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Cloud (Cloudflare D1) persistence ----------
  const [persistence, setPersistence] = useState<'local' | 'cloud'>('local');
  const [backend, setBackend] = useState<Backend>('none');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [contentReady, setContentReady] = useState(false);
  const cloudReady = useRef(false);
  /** Always the latest state — async save/retry callbacks must not read a stale closure. */
  const dataRef = useRef<ContentState>(data);
  dataRef.current = data;
  /** The PUT currently in flight (saves are serialized, see flushSave). */
  const inFlightSave = useRef<Promise<SaveResult> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  /** Version stamp of the content this tab last read from / saved to the cloud (optimistic concurrency). */
  const remoteUpdatedAt = useRef<string | null>(null);
  /** Serialized snapshot of what the cloud currently holds — lets us skip no-op saves. */
  const lastSyncedJson = useRef<string | null>(null);

  /** Merge a cloud payload over the defaults so partial/older payloads can't blank out fields. */
  const mergeRemote = (r: any): ContentState => {
    const merged = mergeContentDefaults(defaultContentState, r);
    return {
      ...merged,
      // Restore points are browser-local (toCloudPayload never uploads them): keep this tab's own.
      VERSION_HISTORY: dataRef.current.VERSION_HISTORY ?? defaultContentState.VERSION_HISTORY,
      // The cloud snapshot is authoritative for editable content, but an old
      // product catalog must not resurrect products unsupported by this build.
      PRODUCTS: reconcileProductCatalog(defaultContentState.PRODUCTS, merged.PRODUCTS),
      SERVICES: Array.isArray(merged.SERVICES) ? withServicePaths(merged.SERVICES) : merged.SERVICES,
      PERSONAL_INFO: migratePersonalInfo({ ...defaultContentState.PERSONAL_INFO, ...merged.PERSONAL_INFO }, defaultContentState.PERSONAL_INFO),
      GLOBAL_SEO: reconcileGlobalSeo(defaultGlobalSeo, merged.GLOBAL_SEO),
      // A section list saved before a section shipped would hide it forever (e.g. the home «AI_TOOLS» showcase).
      PAGE_SECTIONS: {
        ...merged.PAGE_SECTIONS,
        ...Object.fromEntries(
          Object.keys(defaultPageSections).map((page) => [page, reconcileSections(merged.PAGE_SECTIONS?.[page], defaultPageSections[page])]),
        ),
      },
      AI_TOOLS_CONFIG: {
        ...initialData.AI_TOOLS_CONFIG,
        ...merged.AI_TOOLS_CONFIG,
        channels: { ...initialData.AI_TOOLS_CONFIG.channels, ...merged.AI_TOOLS_CONFIG.channels },
        tools: { ...initialData.AI_TOOLS_CONFIG.tools, ...merged.AI_TOOLS_CONFIG.tools },
      },
    };
  };

  /** What the server would store for `state` — the key the no-op-save check compares. */
  const syncKey = (state: ContentState): string => JSON.stringify(toCloudPayload(state));

  /**
   * Pull the latest cloud content into this tab.
   * 'adopted' = content loaded, 'empty' = the server has none yet, 'error' = the read failed
   * (an unreadable server is NOT an empty one — see classifyRemote).
   */
  const adoptRemote = async (): Promise<AdoptOutcome> => {
    const remote = await api.getContent();
    const outcome = classifyRemote(remote);
    if (outcome !== 'adopted') return outcome;
    const merged = mergeRemote(remote!.data);
    remoteUpdatedAt.current = remote!.updatedAt || null;
    lastSyncedJson.current = syncKey(merged);
    setData(merged);
    return 'adopted';
  };

  // On mount: detect API, pull remote content, restore admin session from token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasApi = await api.probe();
      if (cancelled) return;
      if (!hasApi) {
        setContentReady(true);
        return;
      }
      setPersistence('cloud');
      setBackend(api.getBackend());
      const remote = await api.getContent();
      if (!cancelled && remote?.data) {
        const merged = mergeRemote(remote.data);
        remoteUpdatedAt.current = remote.updatedAt || null;
        lastSyncedJson.current = syncKey(merged);
        setData(merged);
      } else if (!cancelled) {
        remoteUpdatedAt.current = remote?.updatedAt || '';
      }
      if (!cancelled) {
        const ok = api.getToken() ? await api.verify() : false;
        if (!cancelled) setIsAdmin(ok);
      }
      cloudReady.current = true;
      if (!cancelled) setContentReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Retry a transient save failure (network / 5xx) with a growing delay. */
  const scheduleRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const delay = retryDelayMs(retryAttempt.current++);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void flushSave();
    }, delay);
  };

  /**
   * Push the latest content to D1. The save is conditional on the version this tab last saw:
   * if the site was edited elsewhere in the meantime (Claude MCP, another tab, the Git sync)
   * the API answers 409 → we reload the latest version instead of overwriting it.
   *
   * Saves are SERIALIZED: the next PUT starts only after the previous one returned its new
   * version stamp. Two overlapping PUTs (slow connection + 1.2 s debounce) made the second one
   * fail with a bogus 409 that discarded the admin's newest keystrokes.
   * Every outcome is reported through `saveState` — a failed save must never look like a saved one.
   */
  const flushSave = async (): Promise<SaveResult> => {
    while (inFlightSave.current) {
      try {
        await inFlightSave.current;
      } catch {
        /* the save that owns that promise reports its own result */
      }
    }
    const run = (async (): Promise<SaveResult> => {
      const payload = toCloudPayload(dataRef.current);
      const json = JSON.stringify(payload);
      if (json === lastSyncedJson.current) {
        setSaveState((s) => (s.status === 'saving' || s.status === 'error' ? { status: 'saved', at: s.at ?? Date.now() } : s));
        return { ok: true };
      }
      setSaveState((s) => ({ status: 'saving', at: s.at }));
      const res = await api.saveContent(payload, remoteUpdatedAt.current);
      if (res.ok) {
        remoteUpdatedAt.current = res.updatedAt || remoteUpdatedAt.current;
        lastSyncedJson.current = json;
        retryAttempt.current = 0;
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
          retryTimer.current = null;
        }
        setSaveState({ status: 'saved', at: Date.now() });
        return { ok: true };
      }
      if (res.conflict) {
        console.warn('Cloud save skipped: content changed elsewhere — reloading the latest version.');
        remoteUpdatedAt.current = res.updatedAt || ''; // resync the stamp even if the reload below finds no content
        await adoptRemote();
        const message = 'محتوا هم‌زمان از جای دیگری (مثلاً کلاد یا تب دیگر) تغییر کرده بود؛ آخرین نسخه بارگذاری شد. لطفاً آخرین تغییرت را دوباره اعمال کن.';
        setSaveState((s) => ({ status: 'error', message, at: s.at }));
        window.dispatchEvent(new CustomEvent('nd:content-conflict', { detail: { message } }));
        return { ok: false, conflict: true, error: message };
      }
      if (res.unauthorized) {
        // The 7-day admin token expired (or AUTH_SECRET changed): edits can no longer be saved.
        api.logout();
        setIsAdmin(false);
        setSaveState((s) => ({ status: 'error', message: res.error, at: s.at }));
        return { ok: false, unauthorized: true, error: res.error };
      }
      console.warn('Cloud save failed:', res.error);
      setSaveState((s) => ({ status: 'error', message: res.error, at: s.at }));
      if (res.transient) scheduleRetry();
      return { ok: false, error: res.error };
    })();
    inFlightSave.current = run;
    try {
      return await run;
    } finally {
      inFlightSave.current = null;
    }
  };

  // Debounced push of every content change to D1 (only while logged in).
  useEffect(() => {
    if (persistence !== 'cloud' || !cloudReady.current || !isAdmin) return;
    const t = setTimeout(() => {
      void flushSave();
    }, 1200);
    return () => clearTimeout(t);
  }, [data, persistence, isAdmin]);

  // Never leave a retry timer behind when the provider goes away.
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  /** "Save" buttons: persist locally, push to the server now, and say what happened. */
  const saveNow = async (): Promise<SaveResult> => {
    persistLocal(dataRef.current);
    setHasUnsavedChanges(false);
    if (persistence !== 'cloud') {
      return {
        ok: false,
        error: contentReady
          ? 'اتصال به سرور برقرار نیست؛ تغییرات فقط در همین مرورگر ذخیره شد و روی سایت اعمال نمی‌شود.'
          : 'هنوز در حال اتصال به سرور هستیم؛ چند ثانیه دیگر دوباره امتحان کن.',
      };
    }
    if (!isAdmin) return { ok: false, unauthorized: true, error: 'برای ذخیره روی سایت، ابتدا وارد شوید.' };
    // Same guard as the debounced save: until the boot sequence has adopted the live content this
    // tab still holds the built-in defaults, and pushing them would overwrite the real site.
    if (!cloudReady.current) return { ok: false, error: 'هنوز در حال اتصال به سرور هستیم؛ چند ثانیه دیگر دوباره امتحان کن.' };
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    return flushSave();
  };

  /** Re-check the server after a failed boot; a reload then adopts the live content cleanly. */
  const reconnect = async (): Promise<boolean> => {
    const ok = await api.probe(true);
    if (ok) window.location.reload();
    return ok;
  };

  // Activity logger helper
  const logActivity = (action: string, details?: string) => {
    const newEntry: AuditLogEntry = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toLocaleString('fa-IR'),
      action,
      details: details || '',
      user: 'ادمین'
    };
    setData((prev) => {
      const updatedLogs = [newEntry, ...(prev.AUDIT_LOGS || [])].slice(0, 50);
      const updated = { ...prev, AUDIT_LOGS: updatedLogs };
      persistLocal(updated);
      return updated;
    });
  };

  // Kept for API compatibility: it used to write localStorage only (and log "saved in the
  // browser") — i.e. it never published anything. It now pushes to the server like saveNow().
  const saveChanges = () => {
    void saveNow();
  };

  // Update specific field by dot path
  const updateField = (path: string, newValue: any) => {
    setData((prev) => {
      const updated = setByPath(prev, path, newValue);
      persistLocal(updated);
      return updated;
    });
    setHasUnsavedChanges(false);
    logActivity('ویرایش فیلد', `فیلد ${path} به‌روزرسانی شد.`);
  };

  // Add item to array
  const addItem = (arrayPath: string, templateItem?: any) => {
    setData((prev) => {
      const currentArray = getByPath(prev, arrayPath) || [];
      const defaultItem = templateItem || createDefaultItemForPath(arrayPath);
      const updatedArray = [defaultItem, ...currentArray];
      const updated = setByPath(prev, arrayPath, updatedArray);
      persistLocal(updated);
      return updated;
    });
    logActivity('افزودن آیتم جدید', `آیتم به بخش ${arrayPath} اضافه شد.`);
  };

  // Remove item from array
  const removeItem = (arrayPath: string, index: number) => {
    setData((prev) => {
      const currentArray = getByPath(prev, arrayPath) || [];
      const updatedArray = currentArray.filter((_: any, i: number) => i !== index);
      const updated = setByPath(prev, arrayPath, updatedArray);
      persistLocal(updated);
      return updated;
    });
    logActivity('حذف آیتم', `آیتم شماره ${index + 1} از بخش ${arrayPath} حذف گردید.`);
  };

  // Move item in array (reorder)
  const moveItem = (arrayPath: string, fromIndex: number, toIndex: number) => {
    setData((prev) => {
      const currentArray = [...(getByPath(prev, arrayPath) || [])];
      if (fromIndex < 0 || fromIndex >= currentArray.length || toIndex < 0 || toIndex >= currentArray.length) {
        return prev;
      }
      const [moved] = currentArray.splice(fromIndex, 1);
      currentArray.splice(toIndex, 0, moved);
      const updated = setByPath(prev, arrayPath, currentArray);
      persistLocal(updated);
      return updated;
    });
    logActivity('تغییر ترتیب', `ترتیب آیتم‌ها در ${arrayPath} جابجا شد.`);
  };

  const resetToDefaults = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setData(defaultContentState);
    setHasUnsavedChanges(false);
    logActivity('بازنشانی کل سایت', 'تمام داده‌های سایت به حالت پیش‌فرض اولیه بازگشت.');
  };

  const [pinCode, setPinCode] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_PIN_KEY) || DEFAULT_PIN;
  });

  const changePin = (newPin: string) => {
    setPinCode(newPin);
    localStorage.setItem(LOCAL_STORAGE_PIN_KEY, newPin);
    logActivity('تغییر پین‌کد ادمین', 'رمز عبور ورود به پیشخوان مدیریت بروزرسانی شد.');
  };

  const loginAdmin = async (username: string, password?: string): Promise<boolean> => {
    if (persistence === 'cloud') {
      const res = await api.login(username, password || '');
      if (res.ok) {
        // Never push this tab's (possibly stale) state over the live content on
        // login: adopt the latest cloud version first; only seed when the cloud is empty.
        const outcome = await adoptRemote().catch((): AdoptOutcome => 'error');
        if (outcome === 'empty') {
          // Seed only when the server explicitly has no content yet. A failed read is NOT
          // "empty": seeding then would overwrite live content with this tab's stale copy.
          const seeded = await api.saveContent(toCloudPayload(dataRef.current), remoteUpdatedAt.current ?? '');
          if (seeded.ok) {
            remoteUpdatedAt.current = seeded.updatedAt || null;
            lastSyncedJson.current = syncKey(dataRef.current);
          }
        }
        setSaveState({ status: 'idle' });
        setIsAdmin(true);
        logActivity('ورود موفق', `کاربر «${username}» از طریق سرویس ابری وارد پیشخوان شد.`);
        return true;
      }
      logActivity('ورود ناموفق', 'نام کاربری یا رمز عبور اشتباه بود (سرویس ابری).');
      return false;
    }
    // Local dev fallback (no Cloudflare backend running): legacy PIN mode.
    if (!password && username === pinCode) {
      setIsAdmin(true);
      logActivity('ورود موفق', 'کاربر ادمین وارد پیشخوان شد (حالت محلی).');
      return true;
    }
    logActivity('ورود ناموفق', 'تلاش برای ورود با رمز اشتباه.');
    return false;
  };

  const logoutAdmin = () => {
    api.logout();
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setSaveState({ status: 'idle' });
    setIsAdmin(false);
    logActivity('خروج از سیستم', 'کاربر ادمین از سیستم خارج گردید.');
  };

  const exportJSON = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omid-adli-cms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity('خروجی گرفتن بکاپ', 'فایل JSON کامل محتوا و تنظیمات دانلود شد.');
  };

  const importJSON = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        const merged = {
          ...mergeContentDefaults(defaultContentState, parsed),
          PRODUCTS: reconcileProductCatalog(defaultContentState.PRODUCTS, parsed.PRODUCTS),
        };
        setData(merged);
        persistLocal(merged);
        setHasUnsavedChanges(false);
        logActivity('بازیابی بکاپ JSON', 'محتوا و تنظیمات از فایل بکاپ خارجی وارد گردید.');
        return true;
      }
    } catch (e) {
      console.error('Invalid JSON file', e);
    }
    return false;
  };

  const duplicateItem = (arrayPath: string, index: number) => {
    setData((prev) => {
      const currentArray = [...(getByPath(prev, arrayPath) || [])];
      if (index < 0 || index >= currentArray.length) return prev;
      const original = currentArray[index];
      const cloned = JSON.parse(JSON.stringify(original));
      cloned.id = 'dup-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      if (cloned.title) cloned.title = `${cloned.title} (کپی)`;
      else if (cloned.name) cloned.name = `${cloned.name} (کپی)`;
      else if (cloned.label) cloned.label = `${cloned.label} (کپی)`;
      
      currentArray.splice(index + 1, 0, cloned);
      const updated = setByPath(prev, arrayPath, currentArray);
      persistLocal(updated);
      return updated;
    });
    logActivity('شبیه‌سازی آیتم', `آیتم شماره ${index + 1} از ${arrayPath} تکثیر شد.`);
  };

  const duplicateSection = (pageKey: string, sectionId: string) => {
    setData((prev) => {
      const currentSections = prev.PAGE_SECTIONS[pageKey] || defaultPageSections[pageKey] || [];
      const section = currentSections.find((s) => s.id === sectionId);
      if (!section) return prev;
      
      const newSec: PageSectionItem = {
        ...JSON.parse(JSON.stringify(section)),
        id: 'sec-' + Date.now(),
        name: section.name + '_COPY',
        label: `${section.label} (کپی)`
      };
      const updatedSections = [...currentSections, newSec];
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: updatedSections }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('شبیه‌سازی سکشن', `سکشن ${sectionId} در برگه ${pageKey} کپی شد.`);
  };

  const duplicatePage = (pageSlug: string) => {
    setData((prev) => {
      const navItem = prev.NAVIGATION_MENU.find(n => n.pageSlug === pageSlug);
      const customPage = prev.CUSTOM_PAGES.find(c => c.slug === pageSlug);
      const newSlug = `${pageSlug}-copy-${Date.now().toString().slice(-4)}`;
      const newTitle = `${navItem?.label || customPage?.title || pageSlug} (کپی)`;

      const newNavItem: NavigationMenuItem = {
        id: 'nav-' + Date.now(),
        label: newTitle,
        pageSlug: newSlug,
        order: prev.NAVIGATION_MENU.length + 1,
        isHidden: false
      };

      const pageSections = prev.PAGE_SECTIONS[pageSlug] ? JSON.parse(JSON.stringify(prev.PAGE_SECTIONS[pageSlug])) : [];

      const updated = {
        ...prev,
        NAVIGATION_MENU: [...prev.NAVIGATION_MENU, newNavItem],
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [newSlug]: pageSections }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('شبیه‌سازی برگه', `برگه ${pageSlug} با موفقیت شبیه‌سازی شد.`);
  };

  const updateSectionStyle = (pageKey: string, sectionId: string, styleProps: any) => {
    setData((prev) => {
      const currentSections = prev.PAGE_SECTIONS[pageKey] || defaultPageSections[pageKey] || [];
      const updatedSections = currentSections.map((sec) => {
        if (sec.id === sectionId) {
          return {
            ...sec,
            style: {
              ...(sec.style || {}),
              ...styleProps
            }
          };
        }
        return sec;
      });
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: updatedSections }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('تغییر استایل سکشن', `استایل و چیدمان سکشن ${sectionId} به‌روزرسانی گردید.`);
  };

  const createSnapshot = (label?: string) => {
    const snapshotLabel = label || `بکاپ اتوماتیک - ${new Date().toLocaleTimeString('fa-IR')}`;
    const newSnap: VersionSnapshot = {
      id: 'snap-' + Date.now(),
      timestamp: new Date().toLocaleString('fa-IR'),
      label: snapshotLabel,
      // Editable content only: copying the whole state (history included) nested every
      // earlier snapshot inside the new one and doubled the state size per click.
      data: JSON.parse(JSON.stringify(leanSnapshotData(dataRef.current)))
    };
    setData((prev) => {
      const history = trimSnapshotHistory([newSnap, ...(prev.VERSION_HISTORY || [])], MAX_SNAPSHOTS, SNAPSHOT_BUDGET_CHARS);
      const updated = { ...prev, VERSION_HISTORY: history };
      persistLocal(updated);
      return updated;
    });
    logActivity('ایجاد نقطه بازگشت', `نسخه پشتیبان "${snapshotLabel}" ایجاد شد.`);
  };

  const rollbackSnapshot = (snapshotId: string) => {
    const snap = data.VERSION_HISTORY?.find((s) => s.id === snapshotId);
    if (snap && snap.data) {
      setData((prev) => {
        const restored = {
          ...mergeContentDefaults(defaultContentState, snap.data),
          // Restore points hold content only; keep the live history, audit trail and moderation queue.
          VERSION_HISTORY: prev.VERSION_HISTORY,
          AUDIT_LOGS: prev.AUDIT_LOGS,
          BLOG_COMMENTS: prev.BLOG_COMMENTS,
        };
        persistLocal(restored);
        return restored;
      });
      logActivity('بازگردانی به نسخه قبل', `اطلاعات سایت به نسخه "${snap.label}" بازگردانده شد.`);
    }
  };

  const deleteSnapshot = (snapshotId: string) => {
    setData((prev) => {
      const filtered = (prev.VERSION_HISTORY || []).filter((s) => s.id !== snapshotId);
      const updated = { ...prev, VERSION_HISTORY: filtered };
      persistLocal(updated);
      return updated;
    });
  };

  const addMediaItem = (url: string, title?: string, sizeKb?: number, dimensions?: string, tags?: string[]) => {
    const newItem: MediaItem = {
      id: 'media-' + Date.now(),
      url,
      title: title || 'تصویر آپلود شده',
      sizeKb: sizeKb || Math.round(url.length / 1024),
      dimensions: dimensions || 'نامشخص',
      createdAt: new Date().toLocaleDateString('fa-IR'),
      tags: tags || ['آپلود شده']
    };
    setData((prev) => {
      const updatedMedia = [newItem, ...(prev.MEDIA_LIBRARY || [])];
      const updated = { ...prev, MEDIA_LIBRARY: updatedMedia };
      persistLocal(updated);
      return updated;
    });
    logActivity('افزودن تصویر به رسانه', `تصویر "${newItem.title}" به کتابخانه اضافه شد.`);
  };

  const removeMediaItem = (id: string) => {
    setData((prev) => {
      const updatedMedia = (prev.MEDIA_LIBRARY || []).filter((m) => m.id !== id);
      const updated = { ...prev, MEDIA_LIBRARY: updatedMedia };
      persistLocal(updated);
      return updated;
    });
    logActivity('حذف تصویر از رسانه', 'تصویر از کتابخانه رسانه حذف شد.');
  };

  const toggleSectionVisibility = (pageKey: string, sectionId: string) => {
    setData((prev) => {
      const currentSections = prev.PAGE_SECTIONS[pageKey] || defaultPageSections[pageKey] || [];
      const updatedSections = currentSections.map((sec) => 
        sec.id === sectionId ? { ...sec, isHidden: !sec.isHidden } : sec
      );
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: updatedSections }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('تغییر نمایش سکشن', `وضعیت نمایش سکشن ${sectionId} در برگه ${pageKey} تغییر کرد.`);
  };

  const reorderPageSection = (pageKey: string, fromIndex: number, toIndex: number) => {
    setData((prev) => {
      const currentSections = [...(prev.PAGE_SECTIONS[pageKey] || defaultPageSections[pageKey] || [])];
      if (fromIndex < 0 || fromIndex >= currentSections.length || toIndex < 0 || toIndex >= currentSections.length) {
        return prev;
      }
      const [moved] = currentSections.splice(fromIndex, 1);
      currentSections.splice(toIndex, 0, moved);
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: currentSections }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('تغییر ترتیب سکشن‌ها', `ترتیب سکشن‌های برگه ${pageKey} بروزرسانی شد.`);
  };

  const addPageSection = (pageKey: string, name: string, label: string) => {
    const newSection: PageSectionItem = {
      id: 'sec-' + Date.now(),
      name: name.toUpperCase().replace(/\s+/g, '_'),
      label: label || name,
      isHidden: false
    };
    setData((prev) => {
      const currentSections = prev.PAGE_SECTIONS[pageKey] || [];
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: [...currentSections, newSection] }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('افزودن سکشن به برگه', `سکشن "${label}" به برگه ${pageKey} اضافه شد.`);
  };

  const removePageSection = (pageKey: string, sectionId: string) => {
    setData((prev) => {
      const currentSections = prev.PAGE_SECTIONS[pageKey] || [];
      const updated = {
        ...prev,
        PAGE_SECTIONS: { ...prev.PAGE_SECTIONS, [pageKey]: currentSections.filter((s) => s.id !== sectionId) }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('حذف سکشن از برگه', `سکشن ${sectionId} از برگه ${pageKey} حذف گردید.`);
  };

  const updatePageSeo = (pageKey: string, seo: Partial<PageSeoConfig>) => {
    setData((prev) => {
      const currentSeo = prev.PAGE_SEO[pageKey] || {};
      const updated = {
        ...prev,
        PAGE_SEO: { ...prev.PAGE_SEO, [pageKey]: { ...currentSeo, ...seo } }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('ویرایش سئوی برگه', `تنظیمات سئوی برگه ${pageKey} تغییر کرد.`);
  };

  const updateGlobalSeo = (seo: Partial<GlobalSeoConfig>) => {
    setData((prev) => {
      const updated = {
        ...prev,
        GLOBAL_SEO: { ...prev.GLOBAL_SEO, ...seo }
      };
      persistLocal(updated);
      return updated;
    });
    logActivity('ویرایش سئوی عمومی', 'تنظیمات کلی سئوی سایت به‌روزرسانی شد.');
  };

  const updateNavMenu = (menu: NavigationMenuItem[]) => {
    setData((prev) => {
      const updated = { ...prev, NAVIGATION_MENU: menu };
      persistLocal(updated);
      return updated;
    });
    logActivity('ویرایش منوی ناوبری', 'آیتم‌ها و لینک‌های منوی بالای سایت به روز شد.');
  };

  const generateSitemapXml = () => {
    const baseUrl = (data.GLOBAL_SEO.canonicalBaseUrl || CANONICAL_SITE_URL).replace(/\/$/, '');
    // Real paths (path-based router + Cloudflare Pages SPA fallback).
    const pageUrl = (path: string) => `${baseUrl}/${path}`;
    const pages = [
      { url: `${baseUrl}/`, priority: '1.0' },
      { url: pageUrl('services'), priority: '0.8' },
      { url: pageUrl('portfolio'), priority: '0.8' },
      { url: pageUrl('about'), priority: '0.8' },
      { url: pageUrl('projects'), priority: '0.8' },
      { url: pageUrl('blog'), priority: '0.8' },
      { url: pageUrl('products'), priority: '0.8' },
      { url: pageUrl('contact'), priority: '0.8' },
    ];

    (data.CUSTOM_PAGES || []).forEach((cp) => {
      pages.push({ url: pageUrl(cp.slug), priority: '0.8' });
    });

    // Keep in sync with buildSitemapXml() in functions/_seo.ts: the admin preview
    // must list exactly the URLs the live /sitemap.xml serves.
    (data.BLOG_POSTS || []).forEach((post: any) => {
      if (post?.status === 'draft' || post?.seo?.noIndex) return;
      pages.push({ url: pageUrl(`blog/${post.slug || post.id}`), priority: '0.7' });
    });

    const urlsXml = pages
      .map(
        (p) => `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;
  };

  const generateRobotsTxt = () => {
    return data.GLOBAL_SEO.robotsTxt || defaultGlobalSeo.robotsTxt;
  };

  const addBlogComment = async (comment: { postId: string; authorName: string; authorEmail: string; content: string }): Promise<{ ok: boolean; error?: string }> => {
    if (persistence === 'cloud') {
      // Cloudflare mode: comments live in their own D1 table and wait for moderation.
      const res = await api.postComment(comment);
      if (res.ok) logActivity('دیدگاه جدید (ابری)', `دیدگاه از طرف ${comment.authorName} برای مقاله ${comment.postId} ثبت و در صف تایید قرار گرفت.`);
      return res;
    }
    const newComment: BlogComment = {
      id: 'comment-' + Date.now(),
      postId: comment.postId,
      authorName: comment.authorName,
      authorEmail: comment.authorEmail,
      content: comment.content,
      date: new Date().toLocaleString('fa-IR'),
      isApproved: false,
      reply: ''
    };
    setData((prev) => {
      const updatedComments = [newComment, ...(prev.BLOG_COMMENTS || [])];
      const updated = { ...prev, BLOG_COMMENTS: updatedComments };
      persistLocal(updated);
      return updated;
    });
    logActivity('دیدگاه جدید', `دیدگاه از طرف ${comment.authorName} ثبت و در صف تایید قرار گرفت.`);
    return { ok: true };
  };

  const toggleCommentApproval = (commentId: string) => {
    const target = (data.BLOG_COMMENTS || []).find((c) => c.id === commentId);
    if (persistence === 'cloud' && commentId.startsWith('c-') && target) {
      api.patchComment(commentId, { isApproved: !target.isApproved });
    }
    setData((prev) => {
      const updatedComments = (prev.BLOG_COMMENTS || []).map((c) => {
        if (c.id === commentId) {
          return { ...c, isApproved: !c.isApproved };
        }
        return c;
      });
      const updated = { ...prev, BLOG_COMMENTS: updatedComments };
      persistLocal(updated);
      return updated;
    });
    logActivity('تغییر وضعیت دیدگاه', `وضعیت تایید دیدگاه ${commentId} تغییر کرد.`);
  };

  const deleteBlogComment = (commentId: string) => {
    if (persistence === 'cloud' && commentId.startsWith('c-')) {
      api.deleteComment(commentId);
    }
    setData((prev) => {
      const updatedComments = (prev.BLOG_COMMENTS || []).filter((c) => c.id !== commentId);
      const updated = { ...prev, BLOG_COMMENTS: updatedComments };
      persistLocal(updated);
      return updated;
    });
    logActivity('حذف دیدگاه', `دیدگاه ${commentId} به‌طور کامل حذف شد.`);
  };

  const replyBlogComment = (commentId: string, reply: string) => {
    if (persistence === 'cloud' && commentId.startsWith('c-')) {
      api.patchComment(commentId, { reply });
    }
    setData((prev) => {
      const updatedComments = (prev.BLOG_COMMENTS || []).map((c) => {
        if (c.id === commentId) {
          return { ...c, reply };
        }
        return c;
      });
      const updated = { ...prev, BLOG_COMMENTS: updatedComments };
      persistLocal(updated);
      return updated;
    });
    logActivity('پاسخ به دیدگاه', `پاسخ به دیدگاه ${commentId} ثبت شد.`);
  };

  const openEditModal = (config: EditModalConfig) => {
    setActiveEditModal(config);
  };

  const closeEditModal = () => {
    setActiveEditModal(null);
  };

  // Apply the same privacy boundary on the client too (e.g. immediately after
  // an admin signs out without a page reload).
  const publicData = useMemo(
    () => isAdmin ? data : publicContentView(data) as ContentState,
    [data, isAdmin],
  );

  // An admin session with no reachable content API is the dangerous state: the UI looks fully
  // functional, but every edit stays in this browser. Surface it instead of pretending.
  const effectiveSaveState = useMemo<SaveState>(
    () =>
      contentReady && persistence === 'local' && isAdmin
        ? {
            status: 'offline',
            message: 'به سرور وصل نیست؛ تغییرات فقط در همین مرورگر می‌مانند و روی سایت دیده نمی‌شوند.',
          }
        : saveState,
    [contentReady, persistence, isAdmin, saveState],
  );

  return (
    <ContentContext.Provider
      value={{
        data: publicData,
        isAdmin,
        setIsAdmin,
        pinCode,
        changePin,
        loginAdmin,
        logoutAdmin,
        persistence,
        contentReady,
        backend,
        saveState: effectiveSaveState,
        saveNow,
        reconnect,
        updateField,
        addItem,
        removeItem,
        moveItem,
        resetToDefaults,
        exportJSON,
        importJSON,
        activeEditModal,
        openEditModal,
        closeEditModal,
        hasUnsavedChanges,
        saveChanges,
        duplicateItem,
        duplicateSection,
        duplicatePage,
        updateSectionStyle,
        createSnapshot,
        rollbackSnapshot,
        deleteSnapshot,
        addMediaItem,
        removeMediaItem,
        logActivity,
        toggleSectionVisibility,
        reorderPageSection,
        addPageSection,
        removePageSection,
        updatePageSeo,
        updateGlobalSeo,
        updateNavMenu,
        generateSitemapXml,
        generateRobotsTxt,
        addBlogComment,
        toggleCommentApproval,
        deleteBlogComment,
        replyBlogComment
      }}
    >
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

// Default item generator for various list paths
function createDefaultItemForPath(arrayPath: string): any {
  const id = 'item-' + Date.now();
  if (arrayPath.includes('SERVICES')) {
    return {
      id,
      title: 'عنوان خدمت جدید',
      titleEn: 'New Service Title',
      iconName: 'rocket',
      shortDesc: 'توضیحات کوتاه خدمت جدید...',
      fullDesc: 'توضیحات کامل خدمت جدید و ارزش افزوده آن برای مشتری.',
      features: ['ویژگی ۱', 'ویژگی ۲', 'ویژگی ۳'],
      deliverables: ['خروجی ۱', 'خروجی ۲'],
      tags: ['New Tag', 'Performance'],
      packages: [{ title: 'پکیج پایه', price: '۳۰ میلیون تومان', description: 'توضیحات پکیج' }]
    };
  }
  if (arrayPath.includes('CASE_STUDIES')) {
    return {
      id,
      title: 'عنوان کیس‌استادی جدید',
      client: 'مشتری جدید',
      industry: 'Fintech',
      industryFa: 'فین‌تک',
      summary: 'خلاصه نتایج و پروژه‌های انجام‌شده برای برند جدید.',
      thumbnailIcon: 'chart',
      heroColor: '#8b5cf6',
      featured: true,
      metrics: { roas: '+200% ROAS', conversionRate: '+40% Conv', cacReduction: '-25% CPA' },
      metricsComparison: [{ label: 'رشد خروجی', before: 'قبل', after: 'بعد', growth: '+۱۰۰٪' }],
      challenge: 'توصیف چالش اولیه برند...',
      solution: 'راهکار ارائه شده...',
      results: 'نتایج به دست آمده...',
      tags: ['Performance', 'Growth'],
      date: '۱۴۰۴'
    };
  }
  if (arrayPath.includes('STATS')) {
    return {
      value: '+100',
      label: 'عنوان آمار جدید',
      subtext: 'توضیحات کوتاه آمار',
      icon: 'rocket'
    };
  }
  if (arrayPath.includes('TESTIMONIALS')) {
    return {
      id,
      clientName: 'نام مدیر / مشتری',
      clientRole: 'سمت شغلی',
      company: 'نام شرکت',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      rating: 5,
      quote: 'متن نظر مشتری درباره کیفیت همکاری و نتایج حاصل‌شده...',
      metricHighlight: 'هایلایت نتیجه'
    };
  }
  if (arrayPath.includes('BLOG_POSTS')) {
    return {
      id,
      title: 'عنوان مقاله جدید',
      excerpt: 'خلاصه کوتاه مقاله برای نمایش در کارت و صفحه اصلی وبلاگ...',
      content: 'متن کامل مقاله جدید که شامل توضیحات تخصصی، راهکارهای عملی و توصیه‌های تجربی است...',
      category: 'Performance',
      categoryFa: 'پرفورمنس مارکتینگ',
      pathCategory: 'sell',
      date: '۱۴۰۴',
      updatedAt: '۱۴۰۴',
      readTime: '۵ دقیقه مطالعه',
      author: 'امید عدلی',
      authorRole: 'استراتژیست رشد و دیجیتال مارکتینگ',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      imageIcon: 'rocket',
      coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
      featured: false,
      isPopular: false,
      tableOfContents: [
        { id: 'sec-1', title: '۱. بخش اول و مقدمه' },
        { id: 'sec-2', title: '۲. راهکارها و اصول اجرایی' }
      ],
      sections: [
        {
          id: 'sec-1',
          heading: '۱. بخش اول و مقدمه',
          content: 'در این بخش به بررسی مفاهیم اساسی و دلایل اهمیت این موضوع پرداخته می‌شود.',
          callout: 'نکته کلیدی: همواره قبل از اجرا، پیش‌نیازها و شاخص‌های کلیدی عملکرد را تعریف کنید.'
        },
        {
          id: 'sec-2',
          heading: '۲. راهکارها و اصول اجرایی',
          content: 'گام‌های عملی برای پیاده‌سازی و دستیابی به بالاترین راندمان ممکن در فروشگاه یا کسب‌وکار.',
          keyPoints: ['اقدام عملی شماره ۱', 'اقدام عملی شماره ۲']
        }
      ],
      tags: ['دیجیتال مارکتینگ', 'فروش', 'رشد'],
      viewsCount: 100,
      commentsCount: 0
    };
  }
  if (arrayPath.includes('PRODUCTS')) {
    return {
      id,
      title: 'عنوان محصول جدید',
      description: 'توضیحات کامل محصول دیجیتال یا دوره...',
      targetAudience: 'مخاطبان هدف',
      iconName: 'target',
      badge: 'جدید',
      actionText: 'دریافت محصول'
    };
  }
  if (arrayPath.includes('TIMELINE')) {
    return {
      year: '۱۴۰۴',
      title: 'عنوان سابقه / دستاورد',
      company: 'نام شرکت / مجموعه',
      description: 'توضیحات فعالیت‌ها و مسئولیت‌ها...',
      achievement: 'دستاورد کلیدی'
    };
  }
  if (arrayPath.includes('SKILLS_TOOLS')) {
    return {
      name: 'ابزار جدید',
      category: 'Analytics',
      icon: 'code',
      proficiency: 90
    };
  }
  return { id, title: 'آیتم جدید', description: 'توضیحات آیتم جدید' };
}

