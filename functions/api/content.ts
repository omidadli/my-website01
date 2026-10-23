import { Env, requireAuth, json, unauthorized, MAX_CONTENT_BYTES, CONTENT_TOO_LARGE_MESSAGE, ensureCoreTables, ensureCoreTablesSafe } from './_shared';
import { publicContentView } from '../../lib/contentVisibility';

/** Cloud comments (D1 `comments` table) are the source of truth for visitor submissions. */
const fetchCloudComments = async (env: Env, forAdmin: boolean) => {
  try {
    const q = forAdmin
      ? `SELECT * FROM comments ORDER BY date DESC LIMIT 1000`
      : `SELECT * FROM comments WHERE is_approved = 1 ORDER BY date DESC LIMIT 1000`;
    const rows = await env.DB.prepare(q).all();
    return (rows.results || []).map((r: any) => ({
      id: r.id,
      postId: r.post_id,
      authorName: r.author_name,
      authorEmail: forAdmin ? r.author_email : '',
      content: r.content,
      date: r.date,
      isApproved: !!r.is_approved,
      reply: r.reply || '',
    }));
  } catch {
    return [];
  }
};

/**
 * GET /api/content  → public read of the whole content state (cached 30s at edge).
 * PUT /api/content  → admin-only full save ({ data: ContentState, baseUpdatedAt? }).
 *
 * Optimistic concurrency: a client that read the content at `updatedAt = X` may
 * send `baseUpdatedAt: X`. If the stored content changed since then the save is
 * rejected with 409 { code: 'conflict', updatedAt } so the client re-reads and
 * re-applies its change instead of silently overwriting someone else's edit
 * (admin panel vs. Claude MCP vs. the Git sync). Clients that omit the field
 * keep the previous last-writer-wins behaviour.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAuth(request, env);
    const row = await env.DB.prepare(`SELECT data, updated_at FROM content WHERE id = 1`).first<{ data: string; updated_at: string }>();
    if (!row) {
      return json({ ok: true, data: null, updatedAt: null }, { headers: { 'Cache-Control': 'public, max-age=5' } });
    }
    const data = JSON.parse(row.data);
    // Merge cloud comments (canonical source) into the content payload.
    const cloudComments = await fetchCloudComments(env, !!admin);
    const localComments = (Array.isArray(data.BLOG_COMMENTS) ? data.BLOG_COMMENTS : [])
      .filter((c: any) => c && !String(c.id || '').startsWith('c-'));
    const combined = { ...data, BLOG_COMMENTS: [...cloudComments, ...localComments] };
    const visibleData = admin ? combined : publicContentView(combined);
    return new Response(JSON.stringify({ ok: true, data: visibleData, updatedAt: row.updated_at }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Admin responses contain pending comments + emails → never cache them.
        // Public responses: short 5s edge cache so admin changes appear quickly.
        'Cache-Control': admin ? 'no-store' : 'public, max-age=5',
      },
    });
  } catch (e) {
    // Most likely a brand-new database without the `content` table yet: create the
    // schema and answer "no content" so the site falls back to its built-in defaults.
    try {
      await ensureCoreTables(env);
      return json({ ok: true, data: null, updatedAt: null });
    } catch {
      return json({ ok: false, error: 'خطا در خواندن محتوا از دیتابیس.' }, { status: 500 });
    }
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAuth(request, env);
  if (!user) return unauthorized();

  const raw = await request.text();
  // Persian text is 2 bytes per character in UTF-8 — measure bytes, not string length.
  if (raw.length > MAX_CONTENT_BYTES || new TextEncoder().encode(raw).byteLength > MAX_CONTENT_BYTES) {
    return json({ ok: false, error: CONTENT_TOO_LARGE_MESSAGE }, { status: 413 });
  }
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'JSON نامعتبر است.' }, { status: 400 });
  }
  const data = payload?.data;
  if (!data || typeof data !== 'object') {
    return json({ ok: false, error: 'ساختار داده نامعتبر است.' }, { status: 400 });
  }

  // Cloud comments live in their own table — never persist them inside the content blob.
  if (Array.isArray(data.BLOG_COMMENTS)) {
    data.BLOG_COMMENTS = data.BLOG_COMMENTS.filter((c: any) => !String(c?.id || '').startsWith('c-'));
  }

  await ensureCoreTablesSafe(env);

  const now = new Date().toISOString();
  const serialized = JSON.stringify(data);
  if (new TextEncoder().encode(serialized).byteLength > MAX_CONTENT_BYTES) {
    return json({ ok: false, error: CONTENT_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  // Optimistic concurrency with atomic write (no SELECT → UPDATE race window).
  if (typeof payload?.baseUpdatedAt === 'string') {
    const baseUpdatedAt = payload.baseUpdatedAt;
    if (baseUpdatedAt === '') {
      // Brand-new insert (no row exists yet): only succeed if nothing is there.
      const res = await env.DB.prepare(
        `INSERT INTO content (id, data, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO NOTHING`
      ).bind(serialized, now).run();
      const changes = res.meta?.changes ?? 0;
      if (changes === 0) {
        const cur = await env.DB.prepare(`SELECT updated_at FROM content WHERE id = 1`).first<{ updated_at: string }>();
        return json(
          { ok: false, code: 'conflict', error: 'محتوا از زمانی که آن را خوانده‌اید تغییر کرده است؛ دوباره بخوانید و تغییر را اعمال کنید.', updatedAt: cur?.updated_at || null },
          { status: 409 }
        );
      }
      return json({ ok: true, updatedAt: now });
    }

    // Existing row: update only if updated_at still matches the base the client read.
    let nextUpdatedAt = now;
    if (nextUpdatedAt === baseUpdatedAt) {
      nextUpdatedAt = new Date(Date.now() + 1).toISOString();
    }
    const res = await env.DB.prepare(
      `UPDATE content SET data = ?1, updated_at = ?2 WHERE id = 1 AND updated_at = ?3`
    ).bind(serialized, nextUpdatedAt, baseUpdatedAt).run();
    const changes = res.meta?.changes ?? 0;
    if (changes === 0) {
      const cur = await env.DB.prepare(`SELECT updated_at FROM content WHERE id = 1`).first<{ updated_at: string }>();
      return json(
        { ok: false, code: 'conflict', error: 'محتوا از زمانی که آن را خوانده‌اید تغییر کرده است؛ دوباره بخوانید و تغییر را اعمال کنید.', updatedAt: cur?.updated_at || null },
        { status: 409 }
      );
    }
    return json({ ok: true, updatedAt: nextUpdatedAt });
  }

  // No baseUpdatedAt: last-writer-wins (backwards compat for MCP / CI).
  await env.DB.prepare(
    `INSERT INTO content (id, data, updated_at) VALUES (1, ?1, ?2)
     ON CONFLICT(id) DO UPDATE SET data = ?1, updated_at = ?2`
  ).bind(serialized, now).run();

  return json({ ok: true, updatedAt: now });
};
