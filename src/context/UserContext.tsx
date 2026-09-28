import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  UserProfile,
  SavedArticle,
  UserSubscription,
  ConsultationRequest,
  UserActivity,
  SubscriptionStatus,
  ConsultationStatus,
} from '../types';
import { api } from '../services/api';

interface UserContextValue {
  profile: UserProfile | null;
  savedArticles: SavedArticle[];
  subscriptions: UserSubscription[];
  consultations: ConsultationRequest[];
  activities: UserActivity[];
  isLoggedIn: boolean;
  loading: boolean;
  register: (payload: { fullName: string; email?: string; phone?: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  login: (payload: { email?: string; phone?: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Omit<UserProfile, 'id' | 'joinedAt'>>) => Promise<{ ok: boolean; error?: string }>;
  saveArticle: (postId: string, notes?: string) => void;
  removeSavedArticle: (postId: string) => void;
  markArticleAsRead: (postId: string) => void;
  isArticleSaved: (postId: string) => boolean;
  addSubscription: (sub: Omit<UserSubscription, 'id'>) => void;
  updateSubscriptionStatus: (subId: string, status: SubscriptionStatus) => void;
  addConsultation: (req: Omit<ConsultationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
  updateConsultationStatus: (reqId: string, status: ConsultationStatus, adminNotes?: string) => void;
  logActivity: (activity: Omit<UserActivity, 'id' | 'timestamp'>) => void;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);
const LOCAL_FALLBACK_KEY = 'nd-user-local-fallback';

interface LocalFallback {
  profile: UserProfile | null;
  savedArticles: SavedArticle[];
  subscriptions: UserSubscription[];
  consultations: ConsultationRequest[];
  activities: UserActivity[];
}

function loadFallback(): LocalFallback {
  if (typeof window === 'undefined') return { profile: null, savedArticles: [], subscriptions: [], consultations: [], activities: [] };
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return { profile: null, savedArticles: [], subscriptions: [], consultations: [], activities: [] };
    const d = JSON.parse(raw);
    return {
      profile: d.profile || null,
      savedArticles: d.savedArticles || [],
      subscriptions: d.subscriptions || [],
      consultations: d.consultations || [],
      activities: d.activities || [],
    };
  } catch {
    return { profile: null, savedArticles: [], subscriptions: [], consultations: [], activities: [] };
  }
}

function saveFallback(d: LocalFallback) {
  try { localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(d)); } catch {}
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const MASCOT_NAME_KEY = 'nd-mascot-name';

/** Mirror the logged-in user's name into the mascot's "visitor name" storage
 *  so the assistant always greets them by name instead of re-asking. */
function syncMascotName(name: string) {
  if (typeof window === 'undefined') return;
  try {
    const clean = (name || '').trim().slice(0, 24);
    if (!clean) return;
    localStorage.setItem(MASCOT_NAME_KEY, clean);
    window.dispatchEvent(new CustomEvent('nd:mascot-name', { detail: clean }));
  } catch { /* ignore */ }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  // Hydrate immediately from the cached API response so the UI never flashes "logged out".
  const cached = api.getCachedMe();
  const [profile, setProfile] = useState<UserProfile | null>(cached?.profile || null);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>(cached?.savedArticles || []);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>(cached?.subscriptions || []);
  const [consultations, setConsultations] = useState<ConsultationRequest[]>(cached?.consultations || []);
  const [activities, setActivities] = useState<UserActivity[]>(cached?.activities || []);
  const [loading, setLoading] = useState<boolean>(!cached);
  const cloudOk = useRef<boolean | null>(null);
  const [fallback, setFallback] = useState<LocalFallback>(() => loadFallback());

  // When cloud API is not reachable (offline/dev static), mirror state into localStorage fallback.
  const persistFallback = useCallback((patch: Partial<LocalFallback>) => {
    setFallback((prev) => {
      const next = { ...prev, ...patch };
      saveFallback(next);
      return next;
    });
  }, []);

  // On mount: verify the cookie against the server. If the server is unreachable (no
  // functions deployed in dev), fall back to locally stored state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMe();
        if (cancelled) return;
        if (r.ok) {
          cloudOk.current = true;
          setProfile(r.profile || null);
          setSavedArticles(r.savedArticles || []);
          setSubscriptions(r.subscriptions || []);
          setConsultations(r.consultations || []);
          setActivities(r.activities || []);
          if (r.profile?.fullName) syncMascotName(r.profile.fullName);
        } else if (r.error === 'not_authenticated') {
          cloudOk.current = true;
          // No active session → try localStorage fallback (legacy dev sessions)
          const f = loadFallback();
          if (f.profile) {
            setProfile(f.profile);
            setSavedArticles(f.savedArticles);
            setSubscriptions(f.subscriptions);
            setConsultations(f.consultations);
            setActivities(f.activities);
          } else {
            setProfile(null);
          }
        } else {
          // Network/server error → use fallback if it has a user
          cloudOk.current = false;
          const f = loadFallback();
          if (f.profile) {
            setProfile(f.profile);
            setSavedArticles(f.savedArticles);
            setSubscriptions(f.subscriptions);
            setConsultations(f.consultations);
            setActivities(f.activities);
          }
        }
      } catch {
        cloudOk.current = false;
        const f = loadFallback();
        if (f.profile) {
          setProfile(f.profile);
          setSavedArticles(f.savedArticles);
          setSubscriptions(f.subscriptions);
          setConsultations(f.consultations);
          setActivities(f.activities);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (cloudOk.current === false) return;
    const r = await api.getMe();
    if (r.ok) {
      setProfile(r.profile || null);
      setSavedArticles(r.savedArticles || []);
      setSubscriptions(r.subscriptions || []);
      setConsultations(r.consultations || []);
      setActivities(r.activities || []);
    } else if (r.error === 'not_authenticated') {
      setProfile(null);
      setSavedArticles([]);
      setSubscriptions([]);
      setConsultations([]);
      setActivities([]);
    }
  }, []);

  const register = useCallback(async ({ fullName, email, phone, password }: { fullName: string; email?: string; phone?: string; password: string }) => {
    const emailOrPhone = (email || phone || '').trim();
    if (cloudOk.current !== false) {
      const r = await api.userRegister({ fullName, email, phone, password });
      if (r.ok) {
        setProfile(r.profile || null);
        setSavedArticles(r.savedArticles || []);
        setSubscriptions(r.subscriptions || []);
        setConsultations(r.consultations || []);
        setActivities(r.activities || []);
        if (r.profile?.fullName) syncMascotName(r.profile.fullName);
        return { ok: true };
      }
      return { ok: false, error: r.error };
    }
    // Local fallback when cloud is unavailable
    const { id: loginId, type } = normalizeLoginId(emailOrPhone);
    if (fallback.profile && (fallback.profile.email?.toLowerCase() === loginId || fallback.profile.phone === loginId)) {
      return { ok: false, error: 'این ایمیل/شماره قبلاً ثبت شده است.' };
    }
    const newProfile: UserProfile = {
      id: genId(),
      fullName,
      email: type === 'email' ? loginId : (email || ''),
      phone: type === 'phone' ? loginId : (phone || ''),
      joinedAt: new Date().toISOString(),
    };
    syncMascotName(newProfile.fullName);
    const next: LocalFallback = {
      profile: newProfile,
      savedArticles: [],
      subscriptions: [{
        id: genId(),
        productId: '',
        productName: 'حساب کاربری امید عدلی',
        planId: '',
        planName: 'کاربر جدید',
        status: 'active',
        startDate: newProfile.joinedAt,
        endDate: new Date(Date.now() + 30*86400000).toISOString(),
        price: 'رایگان',
        autoRenew: true,
        features: ['دسترسی به لیست مقالات ذخیره شده', 'ثبت درخواست مشاوره', 'پیگیری وضعیت درخواست‌ها'],
      }],
      consultations: [],
      activities: [{ id: genId(), type: 'subscription_started', description: 'حساب کاربری شما ایجاد شد', timestamp: newProfile.joinedAt }],
    };
    setProfile(newProfile);
    setSavedArticles(next.savedArticles);
    setSubscriptions(next.subscriptions);
    setConsultations(next.consultations);
    setActivities(next.activities);
    persistFallback(next);
    return { ok: true };
  }, [fallback.profile, persistFallback]);

  const login = useCallback(async ({ email, phone, password }: { email?: string; phone?: string; password: string }) => {
    const emailOrPhone = (email || phone || '').trim();
    if (cloudOk.current !== false) {
      const r = await api.userLogin({ email, phone, password });
      if (r.ok) {
        setProfile(r.profile || null);
        setSavedArticles(r.savedArticles || []);
        setSubscriptions(r.subscriptions || []);
        setConsultations(r.consultations || []);
        setActivities(r.activities || []);
        if (r.profile?.fullName) syncMascotName(r.profile.fullName);
        return { ok: true };
      }
      return { ok: false, error: r.error };
    }
    // Local fallback: any non-empty password matches (dev-only offline mode)
    const f = loadFallback();
    if (!f.profile) return { ok: false, error: 'حسابی یافت نشد. ابتدا ثبت نام کنید.' };
    if (!password || password.length < 6) return { ok: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
    setProfile(f.profile);
    setSavedArticles(f.savedArticles);
    setSubscriptions(f.subscriptions);
    setConsultations(f.consultations);
    setActivities(f.activities);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await api.userLogout();
    setProfile(null);
    setSavedArticles([]);
    setSubscriptions([]);
    setConsultations([]);
    setActivities([]);
    persistFallback({ profile: null, savedArticles: [], subscriptions: [], consultations: [], activities: [] });
  }, [persistFallback]);

  const updateProfile = useCallback(async (updates: Partial<Omit<UserProfile, 'id' | 'joinedAt'>>) => {
    if (!profile) return { ok: false, error: 'not_authenticated' };
    if (cloudOk.current !== false) {
      const r = await api.userUpdateProfile({ fullName: updates.fullName, phone: updates.phone, bio: updates.bio });
      if (r.ok) {
        setProfile((p) => p ? { ...p, ...updates } : p);
        return { ok: true };
      }
      return { ok: false, error: r.error };
    }
    const next = { ...profile, ...updates };
    setProfile(next);
    persistFallback({
      ...fallback,
      profile: next,
    });
    return { ok: true };
  }, [profile, fallback, persistFallback]);

  const logActivity = useCallback((activity: Omit<UserActivity, 'id' | 'timestamp'>) => {
    const entry: UserActivity = { ...activity, id: genId(), timestamp: new Date().toISOString() };
    setActivities((prev) => [entry, ...prev].slice(0, 100));
    if (cloudOk.current === false) {
      persistFallback({ ...fallback, activities: [entry, ...fallback.activities].slice(0, 100) });
    }
  }, [fallback, persistFallback]);

  const saveArticle = useCallback((postId: string, notes?: string) => {
    setSavedArticles((prev) => {
      if (prev.some((a) => a.postId === postId)) return prev;
      return [{ postId, savedAt: new Date().toISOString(), notes: notes || '', read: false }, ...prev];
    });
    logActivity({ type: 'article_saved', description: 'مقاله جدیدی ذخیره کردید', relatedId: postId });
    if (cloudOk.current === false) {
      const entry: SavedArticle = { postId, savedAt: new Date().toISOString(), notes: notes || '', read: false };
      persistFallback({ ...fallback, savedArticles: [entry, ...fallback.savedArticles] });
    }
  }, [logActivity, fallback, persistFallback]);

  const removeSavedArticle = useCallback((postId: string) => {
    setSavedArticles((prev) => prev.filter((a) => a.postId !== postId));
    if (cloudOk.current === false) {
      persistFallback({ ...fallback, savedArticles: fallback.savedArticles.filter((a) => a.postId !== postId) });
    }
  }, [fallback, persistFallback]);

  const markArticleAsRead = useCallback((postId: string) => {
    setSavedArticles((prev) => prev.map((a) => a.postId === postId ? { ...a, read: true, readAt: new Date().toISOString() } : a));
    logActivity({ type: 'article_read', description: 'یک مقاله را مطالعه کردید', relatedId: postId });
    if (cloudOk.current === false) {
      persistFallback({
        ...fallback,
        savedArticles: fallback.savedArticles.map((a) => a.postId === postId ? { ...a, read: true, readAt: new Date().toISOString() } : a),
      });
    }
  }, [logActivity, fallback, persistFallback]);

  const isArticleSaved = useCallback((postId: string) => savedArticles.some((a) => a.postId === postId), [savedArticles]);

  const addSubscription = useCallback((sub: Omit<UserSubscription, 'id'>) => {
    const entry: UserSubscription = { ...sub, id: genId() };
    setSubscriptions((prev) => [entry, ...prev]);
    logActivity({ type: 'subscription_started', description: `اشتراک جدید: ${sub.planName}`, relatedId: entry.id });
    if (cloudOk.current === false) {
      persistFallback({ ...fallback, subscriptions: [entry, ...fallback.subscriptions] });
    }
  }, [logActivity, fallback, persistFallback]);

  const updateSubscriptionStatus = useCallback((subId: string, status: SubscriptionStatus) => {
    setSubscriptions((prev) => prev.map((s) => s.id === subId ? { ...s, status } : s));
    if (cloudOk.current === false) {
      persistFallback({ ...fallback, subscriptions: fallback.subscriptions.map((s) => s.id === subId ? { ...s, status } : s) });
    }
  }, [fallback, persistFallback]);

  const addConsultation = useCallback((req: Omit<ConsultationRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    const now = new Date().toISOString();
    const entry: ConsultationRequest = { ...req, id: genId(), status: 'pending', createdAt: now, updatedAt: now };
    setConsultations((prev) => [entry, ...prev]);
    logActivity({ type: 'consultation_sent', description: `درخواست مشاوره جدید: ${req.subject}`, relatedId: entry.id });
    if (cloudOk.current === false) {
      persistFallback({ ...fallback, consultations: [entry, ...fallback.consultations] });
    }
  }, [logActivity, fallback, persistFallback]);

  const updateConsultationStatus = useCallback((reqId: string, status: ConsultationStatus, adminNotes?: string) => {
    setConsultations((prev) => prev.map((c) => c.id === reqId ? { ...c, status, updatedAt: new Date().toISOString(), ...(adminNotes ? { adminNotes } : {}) } : c));
    logActivity({ type: 'consultation_updated', description: `وضعیت درخواست مشاوره به ${status} تغییر کرد`, relatedId: reqId });
    if (cloudOk.current === false) {
      persistFallback({
        ...fallback,
        consultations: fallback.consultations.map((c) => c.id === reqId ? { ...c, status, updatedAt: new Date().toISOString(), ...(adminNotes ? { adminNotes } : {}) } : c),
      });
    }
  }, [logActivity, fallback, persistFallback]);

  return (
    <UserContext.Provider
      value={{
        profile,
        savedArticles,
        subscriptions,
        consultations,
        activities,
        isLoggedIn: !!profile,
        loading,
        register,
        login,
        logout,
        updateProfile,
        saveArticle,
        removeSavedArticle,
        markArticleAsRead,
        isArticleSaved,
        addSubscription,
        updateSubscriptionStatus,
        addConsultation,
        updateConsultationStatus,
        logActivity,
        refresh,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside UserProvider');
  return ctx;
}

function normalizeLoginId(raw: string): { id: string; type: 'email' | 'phone' } {
  const v = String(raw || '').trim();
  const digits = v.replace(/[^\d+]/g, '');
  if (/^(\+98|0)?9\d{9}$/.test(digits)) {
    return { id: digits.replace(/^\+98/, '0'), type: 'phone' };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { id: v.toLowerCase(), type: 'email' };
  return { id: v.toLowerCase(), type: /@/.test(v) ? 'email' : 'phone' };
}
