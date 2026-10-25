# Omid Adli Site — MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets **Claude** (Desktop or
Code) read and edit your website's content directly, through the site's live
admin API. Ask Claude things like _"change the products page headline"_,
_"raise the VIP price of the business-therapist tool"_, or _"grant 30 days of
access to 0912…"_ and it happens on the live site.

> Content edits made through the MCP go straight to the **live database**. To
> keep Git in sync (recommended — see `content/site-content.json`), run the
> **Export live content to Git** workflow from the GitHub Actions tab afterwards
> (or `npm run content:export` locally). A nightly schedule also exports
> automatically, and the Git → live sync is a per-section merge that never
> discards live-only sections.

## What Claude can do (tools)

| Tool | What it does |
|------|--------------|
| `ping` | Check connection + admin login |
| `get_content` | Read a section (or list all section names) |
| `get_field` | Read one value by dot-path (`PERSONAL_INFO.name`) |
| `set_field` | Set one value by dot-path and save |
| `replace_section` | Overwrite a whole section (e.g. `PRODUCTS`) |
| `list_products` | Summarise AI tools, prices, free-trial count |
| `set_tool_enabled` | Show/hide an AI tool |
| `set_plan_price` | Override a plan's price label |
| `set_free_trial` | Set free-trial message count |
| `list_grants` | List paid-tool access grants |
| `grant_access` | Grant/refresh access for a phone (returns the code) |
| `revoke_access` / `reset_devices` | Manage a grant |
| `list_tool_usage` | Recent AI-tool messages (monitoring) |

## Setup

```bash
cd mcp
npm install
```

The server needs three environment variables (same admin credentials as your
Cloudflare secrets):

| Variable | Example |
|----------|---------|
| `SITE_URL` | `https://omidadli.site` (the live custom domain — **not** `my-website.pages.dev`, which belongs to someone else) |
| `ADMIN_USERNAME` | your admin username |
| `ADMIN_PASSWORD` | your admin password |

> **First run on a fresh site:** if the live database has never been saved
> (`GET /api/content` returns `data: null`), `ping` reports `contentEmpty: true`.
> The first write tool you use (e.g. `set_field`) automatically seeds the live
> database from `content/site-content.json` and then applies your change.

Quick local check (with the dev server running on :3000):

```bash
SITE_URL=http://localhost:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=1234 npm start
```

## Connect it to Claude Desktop

Edit Claude Desktop's config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add an entry under `mcpServers` (use the absolute path to `server.mjs`):

```json
{
  "mcpServers": {
    "omidadli-site": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/my-website01/mcp/server.mjs"],
      "env": {
        "SITE_URL": "https://omidadli.site",
        "ADMIN_USERNAME": "your-admin-username",
        "ADMIN_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the **omidadli-site** tools appear.
Start with _"use omidadli-site ping"_ to confirm it's connected.

## Connect it to Claude Code

```bash
claude mcp add omidadli-site \
  --env SITE_URL=https://omidadli.site \
  --env ADMIN_USERNAME=your-admin-username \
  --env ADMIN_PASSWORD=your-admin-password \
  -- node /ABSOLUTE/PATH/TO/my-website01/mcp/server.mjs
```

## Security notes

- Credentials are only sent to **your** site over HTTPS to obtain a short-lived
  bearer token; they are never logged.
- The MCP has the same powers as the admin panel — keep the config file private.
- Per-tool AI API keys are never exposed by these tools (the API returns them
  masked only).
