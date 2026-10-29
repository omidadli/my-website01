/**
 * lib/telegram/grant.ts — automatic access granting & subscription renewal.
 *
 * Runs in the SAME D1 as the website, so a verified Telegram purchase instantly:
 *   1. creates/extends the `tool_access` row (the access code the paid AI tools
 *      unlock with) — renewal EXTENDS the current expiry instead of resetting it
 *   2. links the purchase to the website account (users.phone / users.login_id)
 *      via `user_subscriptions` so it shows up on the profile page
 *   3. writes a `user_activities` timeline entry
 */
import { getPlan, type ToolPlan } from '../toolPlans';
import { genCode } from '../tools';
import type { D1Like } from './store';

/** Renewal math: extend from the CURRENT expiry when still active, else from now. */
export const nextExpiry = (currentExpiryIso: string, nowMs: number, days: number): string => {
  const cur = Date.parse(String(currentExpiryIso || ''));
  const base = Number.isFinite(cur) && cur > nowMs ? cur : nowMs;
  return new Date(base + Math.max(1, days) * 86400_000).toISOString();
};

export interface GrantArgs {
  phone: string;
  userId?: string;
  productId: string;
  planId?: string;
  /** override duration (days) — defaults to the plan's */
  days?: number;
  messageQuota?: number;
  maxDevices?: number;
  note?: string;
  productName: string;
  priceLabel: string;
  features?: string[];
  channelLabel?: string;
}

export interface GrantResult {
  code: string;
  expiresAt: string;
  refreshed: boolean;
  subscriptionUserId: string;
}

export const grantToolAccess = async (env: { DB: D1Like }, args: GrantArgs): Promise<GrantResult> => {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const plan: ToolPlan | undefined = args.planId ? getPlan(args.productId, args.planId) : undefined;
  const days = Math.max(1, Math.min(3650, args.days ?? plan?.durationDays ?? 30));
  const messageQuota = Math.max(0, args.messageQuota ?? plan?.messageQuota ?? 0);
  const maxDevices = Math.max(1, Math.min(20, args.maxDevices ?? plan?.maxDevices ?? 1));
  const note = String(args.note || '').slice(0, 200);

  // ---- 1) tool_access (one active grant per phone/user+product; renew = extend) ----
  const grantOwnerKey = args.phone || (args.userId ? `uid:${args.userId}` : '');
  const existing = grantOwnerKey
    ? await env.DB.prepare(
        `SELECT * FROM tool_access WHERE phone = ?1 AND product_id = ?2 LIMIT 1`
      ).bind(grantOwnerKey, args.productId).first<any>()
    : null;

  const expiresAt = nextExpiry(existing?.expires_at || '', now, days);
  let code: string;
  if (existing) {
    code = existing.code || genCode();
    // created_at = start of the NEW quota window (matches tools.ts semantics).
    await env.DB.prepare(
      `UPDATE tool_access SET code = ?1, status = 'active', max_devices = ?2, message_quota = ?3, note = ?4, expires_at = ?5, created_at = ?6 WHERE id = ?7`
    ).bind(code, maxDevices, messageQuota, note, expiresAt, nowIso, existing.id).run();
  } else {
    code = genCode();
    if (grantOwnerKey) {
      await env.DB.prepare(
        `INSERT INTO tool_access (id, phone, product_id, code, status, max_devices, message_quota, devices, note, created_at, expires_at)
         VALUES (?1,?2,?3,?4,'active',?5,?6,'[]',?7,?8,?9)`
      ).bind(`ta-${Date.now()}-${Math.floor(Math.random() * 9999)}`, grantOwnerKey, args.productId, code, maxDevices, messageQuota, note, nowIso, expiresAt).run();
    }
  }

  // ---- 2) link to the website account (by explicit userId OR registered phone) ----
  // Website sync is best-effort: a schema hiccup there must never block the
  // customer's product delivery, which is already guaranteed by tool_access.
  let subscriptionUserId = '';
  try {
    let user: { id: string } | null = null;
    if (args.userId) {
      user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?1 LIMIT 1`)
        .bind(args.userId)
        .first<{ id: string }>();
    }
    if (!user && args.phone) {
      // Prefer verified phone owners first; fall back cleanly if legacy test schemas omit phone_verified_at.
      try {
        user = await env.DB.prepare(
          `SELECT id FROM users
           WHERE phone = ?1 OR login_id = ?2
           ORDER BY CASE WHEN COALESCE(phone_verified_at, '') <> '' THEN 0 ELSE 1 END
           LIMIT 1`
        ).bind(args.phone, args.phone).first<{ id: string }>();
      } catch {
        user = await env.DB.prepare(
          `SELECT id FROM users WHERE phone = ?1 OR login_id = ?2 LIMIT 1`
        ).bind(args.phone, args.phone).first<{ id: string }>();
      }
    }
    if (user?.id) {
      subscriptionUserId = user.id;
      // Remove legacy empty placeholder subscription if present
      await env.DB.prepare(`DELETE FROM user_subscriptions WHERE user_id = ?1 AND product_id = ''`)
        .bind(user.id)
        .run()
        .catch(() => {});

      const features = JSON.stringify(args.features || plan?.perks || []);
      const planName = plan?.name || args.planId || 'اشتراک فعال';
      const existingSub = await env.DB.prepare(
        `SELECT id, end_date FROM user_subscriptions WHERE user_id = ?1 AND product_id = ?2 ORDER BY start_date DESC LIMIT 1`
      ).bind(user.id, args.productId).first<{ id: string; end_date: string }>();

      const subEnd = nextExpiry(existingSub?.end_date || '', now, days);
      if (existingSub && Date.parse(existingSub.end_date || '') > now - 90 * 86400_000) {
        // renewal/upgrade of the latest subscription row
        await env.DB.prepare(
          `UPDATE user_subscriptions SET product_name = ?1, plan_id = ?2, plan_name = ?3, status = 'active', price = ?4, features = ?5, end_date = ?6 WHERE id = ?7`
        ).bind(args.productName, args.planId || plan?.id || '', planName, args.priceLabel, features, subEnd, existingSub.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO user_subscriptions (id, user_id, product_id, product_name, plan_id, plan_name, status, price, features, auto_renew, start_date, end_date, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,'active',?7,?8,0,?9,?10,?11)`
        ).bind(new Date(now).getTime().toString(36) + Math.random().toString(36).slice(2, 8), user.id, args.productId, args.productName, args.planId || plan?.id || '', planName, args.priceLabel, features, nowIso, subEnd, nowIso).run();
      }

      const viaLabel = args.channelLabel || (String(args.note || '').includes('gateway') ? 'درگاه پرداخت' : 'تلگرام');
      await env.DB.prepare(
        `INSERT INTO user_activities (id, user_id, type, description, related_id, created_at)
         VALUES (?1,?2,?3,?4,?5,?6)`
      ).bind(
        `ua-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        user.id,
        existing ? 'subscription_renewed' : 'subscription_started',
        `${existing ? 'تمدید اشتراک' : 'فعال‌سازی اشتراک'} (${viaLabel}): ${args.productName}${planName ? ` — ${planName}` : ''}`,
        args.productId,
        nowIso
      ).run();
    }
  } catch {
    subscriptionUserId = '';
  }

  return { code, expiresAt, refreshed: !!existing, subscriptionUserId };
};
