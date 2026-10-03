# ✅ چک‌لیست انتشار روی Cloudflare Pages

این سایت روی **Cloudflare Pages** (به‌همراه Functions + دیتابیس D1) اجرا می‌شود.
مراحل زیر را یک‌بار انجام بده تا سایت زنده شود. تخمین زمان: ۱۵ تا ۲۰ دقیقه.

> کارهای سمتِ کد قبلاً انجام شده: بیلد تست شده، تنظیماتِ `wrangler.toml`، اسکیمای
> دیتابیس (`schema.sql`)، توابع API، و ورک‌فلوهای گیت‌هاب همه آماده‌اند.

---

## قدم ۱ — دیتابیس D1 را بساز
در داشبورد Cloudflare → **Workers & Pages → D1** → **Create database**.
- اسم پیشنهادی: `omidadli01-site-db`
- بعد از ساخت، مقدار **Database ID** را کپی کن.

سپس در فایل `wrangler.toml` مطمئن شو این دو خط با دیتابیسِ تو یکی است:
```toml
database_name = "omidadli01-site-db"
database_id   = "<Database ID که کپی کردی>"
```

## قدم ۲ — جدول‌های دیتابیس را بساز
از روی کامپیوترِ خودت (جایی که این ریپو را داری) یک‌بار اجرا کن:
```bash
npx wrangler login                 # ورود به حساب Cloudflare
npx wrangler d1 execute omidadli01-site-db --remote --file=./schema.sql
```
> نکته: توابع سایت جدول‌های لازم را در زمان اجرا هم خودکار می‌سازند، ولی اجرای
> بالا تضمین می‌کند همه‌چیز از ابتدا آماده باشد.

## قدم ۳ — پروژه‌ی Pages را بساز و به گیت‌هاب وصل کن
در داشبورد → **Workers & Pages → Create → Pages → Connect to Git**.
- ریپوی `omidadli/my-website01` را انتخاب کن.
- شاخه‌ی production: **main**
- Build command: `npm run build`
- Build output directory: `dist`
- اسم پروژه را **`my-website`** بگذار (اگر اسم دیگری گذاشتی، در `wrangler.toml`
  خطِ `name` و در `.github/workflows/deploy.yml` مقدارِ `--project-name` را هم عوض کن).

## قدم ۴ — دیتابیس را به پروژه‌ی Pages وصل کن (Binding)
Pages → پروژه‌ات → **Settings → Functions → D1 database bindings** → Add binding:
- Variable name: **`DB`**  (دقیقاً همین)
- Database: همان `omidadli01-site-db`

## قدم ۵ — متغیرهای محرمانه (Secrets) را تعریف کن
Pages → پروژه‌ات → **Settings → Environment variables** (روی محیط **Production**).
این چهار مورد را اضافه کن (نوع: **Secret / Encrypted**):

| نام متغیر | مقدار |
|-----------|-------|
| `AUTH_SECRET` | یک رشته‌ی تصادفیِ بلند (پایین یکی برایت ساختم) |
| `ADMIN_USERNAME` | نام کاربریِ دلخواهِ ادمین |
| `ADMIN_PASSWORD` | رمزِ قویِ دلخواهِ ادمین |
| `GEMINI_API_KEY` | کلید پشتیبانِ همه‌ی بخش‌های هوش مصنوعی *(اختیاری — توصیه می‌شود به‌جایش در پنل ادمین → «کلیدهای API» برای هر بخش ۵ کلید ثبت کنید؛ `docs/API-KEYS.md`)* |

یک `AUTH_SECRET` آماده (می‌توانی همین را استفاده کنی یا خودت بسازی):
```
T0BHe7_AjrsbNcYRmgjcoRnXH7mGtD6N6Yf9g96TNB0
```
> بدون `AUTH_SECRET` و `ADMIN_*` پنل ادمین کار نمی‌کند. `GEMINI_API_KEY` را از
> https://aistudio.google.com/apikey بگیر (رایگان).

## قدم ۶ — انتشار
بعد از قدم‌های بالا، در داشبورد Pages دکمه‌ی **Retry deployment** را بزن (یا یک
کامیت جدید روی `main` بزن). سایت روی دامنه‌ی خودت `https://omidadli01.site` بالا می‌آید.

> ⚠️ آدرس `my-website.pages.dev` مال این سایت **نیست** (این ساب‌دامین قبلاً توسط شخص
> دیگری گرفته شده و Cloudflare به پروژه‌ی تو یک پسوند تصادفی داده). آدرس دقیق
> `*.pages.dev` پروژه‌ات را از داشبورد Pages ببین؛ برای `SITE_URL` همیشه از
> `https://omidadli01.site` استفاده کن.

## قدم ۷ — تست نهایی
- به `https<آدرس سایت>/admin` برو و با `ADMIN_USERNAME` / `ADMIN_PASSWORD` وارد شو.
- صفحه‌ی محصولات → یک ابزار → چند پیامِ رایگانِ آزمایشی را تست کن.
- در پنل ادمین یک «دسترسی» برای یک شماره صادر کن و با کد، ابزار را باز کن.

---

## (اختیاری) قدم ۸ — فعال‌سازیِ استوریج تصاویر R2
بدون R2 هم آپلود کار می‌کند (تصاویر در D1 با سقف ۱٫۴ مگابایت ذخیره می‌شوند). برای
فایل‌های بزرگ‌تر:
1. داشبورد → **R2** → Create bucket با نام `omidadli01-media`.
2. در `wrangler.toml` سه خطِ `[[r2_buckets]]` را از کامنت خارج کن.
3. Pages → Settings → Functions → **R2 bindings** → Variable `MEDIA` → همان باکت.

---

## (اختیاری) قدم ۹ — استقرار خودکار از گیت‌هاب
دو حالت داری؛ **فقط یکی** را انتخاب کن:

**حالت آ (ساده‌تر — توصیه‌شده):** همان اتصالِ «Connect to Git» در قدم ۳ کافی است؛
Cloudflare خودش با هر پوش روی `main` سایت را می‌سازد و منتشر می‌کند. در این حالت
ورک‌فلوی `deploy.yml` بی‌اثر می‌ماند (چون سکرتش را نمی‌گذاری) و مشکلی ایجاد نمی‌کند.

**حالت ب (با GitHub Actions):** اگر می‌خواهی انتشار از طریق اکشن‌های گیت‌هاب باشد،
در GitHub → repo → **Settings → Secrets and variables → Actions** این‌ها را اضافه کن:
`CLOUDFLARE_API_TOKEN` (توکن با دسترسی Pages: Edit) و `CLOUDFLARE_ACCOUNT_ID`.

**همگام‌سازیِ محتوا (هر دو حالت):** اگر می‌خواهی تغییرِ فایلِ
`content/site-content.json` روی گیت‌هاب خودکار روی دیتابیسِ زنده بنشیند (و
برعکس، ویرایش‌های پنل ادمین/کلاد شبانه به گیت برگردد)، این سه سکرت را هم در
Actions اضافه کن: `SITE_URL` (= `https://omidadli01.site`)، `ADMIN_USERNAME`،
`ADMIN_PASSWORD`. بعد یک‌بار ورک‌فلوی **Sync content to live site** را دستی اجرا
کن تا دیتابیسِ خالی از روی فایل گیت پر شود. همگام‌سازی به‌صورت **ادغامِ بخش‌به‌بخش**
است و بخش‌هایی که فقط روی سایت زنده وجود دارند (تم، منو، کتابخانه رسانه…) را
پاک نمی‌کند. (جزئیات کامل در `INTEGRATIONS.md`.)

---

## خلاصه‌ی چیزی که «فقط خودت» باید انجام دهی
1. دیتابیس D1 بساز و `database_id` را در `wrangler.toml` بگذار.
2. `schema.sql` را روی دیتابیس اجرا کن.
3. پروژه‌ی Pages را بساز و به ریپو وصل کن (build: `npm run build`, output: `dist`).
4. Binding دیتابیس با نام `DB` را اضافه کن.
5. سکرت‌ها را بگذار: `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (+ `GEMINI_API_KEY` فقط اگر می‌خواهی همه‌ی بخش‌ها یک کلید پشتیبانِ مشترک داشته باشند). بعد از ورود به پنل، در تب «کلیدهای API» برای هر بخش ۵ کلید ثبت کن.
6. Deploy را بزن و تست کن.
