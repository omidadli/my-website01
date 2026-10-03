# Integrations — API, MCP & GitHub → Site

This document explains the three ways the site can be driven programmatically:

1. **HTTP API** — the CMS/content and AI-tools API the site already serves.
2. **MCP server** — connect the site to **Claude** so it can read/edit content.
3. **GitHub → Site** — anything pushed to GitHub is deployed to the live site,
   and content committed to Git is synced into the live database.

---

## 1. HTTP API

Base URL = your site origin (e.g. `https://omidadli01.site`).

### Auth

```
POST /api/auth      { "username": "...", "password": "..." }  →  { "ok": true, "token": "..." }
GET  /api/auth      Authorization: Bearer <token>            →  { "ok": true, "username": "..." }
```

Send `Authorization: Bearer <token>` on every admin call below. The token is
short-lived; just log in again when it expires.

### Content (the whole CMS state)

```
GET  /api/content                                        →  { ok, data: <ContentState>, updatedAt }   (public read)
PUT  /api/content   { "data": <ContentState>, "baseUpdatedAt"?: string }  →  { ok, updatedAt }        (admin only)
                                                          →  409 { ok:false, code:"conflict", updatedAt } if changed since baseUpdatedAt
```

`data` is one JSON object with sections like `PERSONAL_INFO`, `PRODUCTS`,
`PRODUCTS_PAGE_DATA`, `AI_TOOLS_CONFIG`, etc. A PUT replaces the whole blob, so
read → modify → write. Max 5 MB. Blog comments are stored separately and are
stripped from the blob automatically.

**Optimistic concurrency:** send the `updatedAt` you read as `baseUpdatedAt`.
If anyone else (admin panel, Claude MCP, CI sync) saved in between, the API
answers **409** and you re-read + re-apply instead of overwriting their edit.
`scripts/site-client.mjs` → `updateContent(mutate)` does this loop for you; the
MCP server, the sync script and the admin panel all use it.

### Paid AI tools

```
GET  /api/tools                         →  { ok, items: [ grants… ] }               (admin)
GET  /api/tools?view=messages           →  { ok, items: [ usage log… ] }            (admin)
GET  /api/tools?view=settings           →  { ok, sections: [6 × 5 key slots + health], items: […], keysPerSection: 5 } (admin)
GET  /api/tools?view=keyEvents          →  { ok, items: [ limit hits / key hand-offs ] } (admin)
POST /api/tools   { action, … }         →  grant | revoke | resetDevices | setSectionKeys | setKey | clearKey | testKey | testAllKeys | resetKeyState (admin)
POST /api/tools   { action: "unlock" | "chat" | "session", … }                      (public)
```

API keys live only server-side and are **never** returned in full (only masked).

**AI keys: 5 slots per section, automatic rotation.** Every part of the site that
needs a key — the site assistant (mascot chat), the SEO slug generator and each of
the 4 paid products — has **5 key slots** managed in the admin panel
(*کلیدهای API*). When a key hits its rate limit / quota (or errors), the next
healthy key answers instead; the previous chats of the conversation are reviewed
first (server-side memory + a continuity instruction), so the conversation
continues naturally and the user never notices the switch. See
[docs/API-KEYS.md](./docs/API-KEYS.md) for the full reference (cooldowns, admin
endpoints, storage tables, setup checklist).

Abuse limits (public actions): `unlock` — 10 failed codes / 15 min per IP+phone and 60 per IP
(429); `chat` — paid: 60 msgs / hour per phone, free trial: N msgs per device (CMS setting,
default 3) **and** 30 msgs / hour per IP (429, `code: "trial_ended"`). Access codes are
accepted with Persian digits, lowercase, spaces or a missing dash (`m4k 7q2x` → `M4K-7Q2X`).

### URLs & crawlers

The site uses real paths (`/services`, `/blog/<slug>`, `/<custom-page-slug>`, `/admin`);
the route model lives in `lib/routes.ts` and is shared by the SPA router
(`src/utils/router.ts`), the sitemap and the edge middleware. Old hash links
(`/#/blog/<slug>`) are upgraded client-side, so nothing shared before breaks.

```
GET /<route>        →  index.html with per-route <title>/description/OG/canonical/robots
                       injected at the edge (functions/_middleware.ts) from the CMS content —
                       link previews (WhatsApp/Telegram/LinkedIn) and crawlers see the right
                       page without running JS; unknown routes (and unknown post slugs)
                       answer 404 + noindex with the title "صفحه پیدا نشد", and the SPA
                       renders a matching 404 page (src/pages/NotFoundPage.tsx).
GET /robots.txt     →  GLOBAL_SEO.robotsTxt from the CMS (or a default) + Sitemap line
GET /sitemap.xml    →  home, built-in pages, custom pages, published (non-noindex) posts
```

Title/description precedence (global → page → post) is implemented once in
`lib/seoDefaults.ts` and used by both the browser (`SEOHead`) and the edge.

Size limit: the whole CMS state is one D1 row and D1 caps a row at 2 MB, so
`PUT /api/content` rejects payloads above ~1.9 MB (UTF-8 bytes) with `413` and a
clear message — keep images in the media library (`/api/media`) instead of
inlining them as base64.

---

## 2. MCP server (connect the site to Claude)

The MCP server lives in [`mcp/`](./mcp). It wraps the API above as MCP tools so
Claude can manage the site conversationally.

```bash
cd mcp && npm install
```

Then add it to Claude Desktop / Claude Code — see **[mcp/README.md](./mcp/README.md)**
for the exact config snippet and the full tool list. Configure it with
`SITE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (your Cloudflare admin secrets).

Content Claude edits via MCP is written to the **live database**. To keep Git as
the source of truth, run `npm run content:export` afterwards (see below).

---

## 3. GitHub → Site

Hosting is **Cloudflare Pages** (Pages Functions + D1). Two GitHub Actions
workflows keep the live site in step with the repo:

| Workflow | Trigger | Effect |
|----------|---------|--------|
| `.github/workflows/deploy.yml` | any push to `main` | type-check + build + `wrangler pages deploy dist` + smoke-test `/api/content` |
| `.github/workflows/sync-content.yml` | push to `main` changing `content/site-content.json` (or manual) | **merge** that content into the live DB (see below) |
| `.github/workflows/export-content.yml` | manual, or nightly 02:30 UTC | pull the live content back into Git and commit it |

Every workflow prints a visible **warning** (instead of silently passing) when
its secrets are missing.

### Required GitHub repo secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Used by | Value |
|--------|---------|-------|
| `CLOUDFLARE_API_TOKEN` | deploy | Cloudflare token with *Pages: Edit* + *D1: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | deploy | your Cloudflare account id |
| `SITE_URL` | content sync | live site URL, e.g. `https://omidadli01.site` |
| `ADMIN_USERNAME` | content sync | same as the Pages secret |
| `ADMIN_PASSWORD` | content sync | same as the Pages secret |

> The Pages **project name** in `deploy.yml` (`--project-name=my-website`) and in
> `wrangler.toml` (`name = "my-website"`) must match your real Cloudflare Pages
> project. Rename both if yours differs.

> D1 tables/columns are created automatically at runtime by the API
> (`ensureCoreTables` in `functions/api/_shared.ts` + `ensureTables` in
> `tools.ts`), so no migration step runs in CI. To apply the schema manually:
> `npx wrangler d1 execute <DB> --remote --file=./schema.sql`.

### Content as code (round-trip)

`content/site-content.json` is the versioned copy of the site content.

```bash
npm run content:gen      # (re)generate the file from the app's built-in defaults
npm run content:export   # live site  → content/site-content.json  (pull live edits into Git)
npm run content:import   # content/site-content.json → live site   (what CI runs)
#   import options: --base <old-version.json>  --force  --dry-run
```

All three read `SITE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` from the
environment.

**Import is a per-section merge, not a blind overwrite:**

- sections that exist only on the live site (`THEME_CONFIG`, `NAVIGATION_MENU`,
  `MEDIA_LIBRARY`, `VERSION_HISTORY`, …) are always preserved;
- on a push, CI passes the pre-push version of the file as a 3-way merge base:
  a section is taken from Git only if Git changed it, live-only edits are kept,
  and if **both** sides changed the same section the run fails with
  instructions (re-run it manually with `force = true` to let Git win);
- `export` strips runtime state (`BLOG_COMMENTS`, `VERSION_HISTORY`,
  `AUDIT_LOGS`) so Git only holds authored content.

Typical loop:

1. Edit content — either commit a change to `content/site-content.json`, **or**
   edit via the admin panel / Claude MCP.
2. After live edits, run the **Export live content to Git** workflow (Actions →
   Run workflow) or `npm run content:export` locally; the nightly schedule also
   picks them up. Push to `main` redeploys code, and a changed content file is
   merged live by `sync-content.yml`.
