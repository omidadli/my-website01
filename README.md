# omidadli01.site — personal site + CMS

Persian (RTL) personal-brand site for **Omid Adli** (performance marketing & CRO),
built with React + Vite and hosted on **Cloudflare Pages** (Pages Functions + D1).
Live: https://omidadli01.site

| Doc | What it covers |
|-----|----------------|
| [AISTUDIO-GITHUB.md](./AISTUDIO-GITHUB.md) | رفع خطای Import/Push بین AI Studio و گیت‌هاب — Persian |
| [DEPLOY-CHECKLIST.md](./DEPLOY-CHECKLIST.md) | One-time Cloudflare setup (D1, bindings, secrets) — Persian |
| [CMS-DEPLOY.md](./CMS-DEPLOY.md) | The CMS API, media storage, local development — Persian |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | HTTP API, GitHub → site workflows, content-as-code round-trip |
| [mcp/README.md](./mcp/README.md) | Connect the site to Claude (MCP server) |
| [docs/CONTENT-SYSTEM-MAP.md](./docs/CONTENT-SYSTEM-MAP.md) | نقشهٔ سیستم محتوایی: URLهای واقعی، خوشه‌های موضوعی، لینک داخلی |
| [docs/PRODUCT-PROMOTION.md](./docs/PRODUCT-PROMOTION.md) | تبلیغ بومی محصولات: هر ابزار در کدام صفحه/مقاله و با چه متنی معرفی می‌شود |
| [content/articles/README.md](./content/articles/README.md) | خروجیِ تولید محتوای ۱۲ هفته‌ای (Batchها و وضعیت انتشار) |

```bash
npm ci && npm run dev        # local dev on :3000 (API emulated by vite-dev-api.ts)
npm run lint && npm run lint:functions && npm test && npm run build
```
