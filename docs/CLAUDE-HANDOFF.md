# تحویل کار به Claude — خلاصه کارهای انجام‌شده + پرامپت آماده

این سند دو بخش دارد:

1. **بخش ۱** — فهرست دقیق همه‌ی کارهایی که تا الان انجام شده (تا بدانی چه چیزی داری و چه چیزی نه).
2. **بخش ۲** — یک پرامپت آماده و کامل برای Claude (Claude Code / Claude.ai) که با آن
   **بقیه‌ی کارها را خودش انجام می‌دهد**. تنها چیزی که باید بدهی: **توکن ربات تلگرام**
   و **شماره کارت** (این دو را هیچ‌کس جز تو ندارد).

---

# بخش ۱ — چه چیزی ساخته شد

## ۱.۱ رفع باگ‌های سایت (پروفایل / ثبت‌نام / ورود)

| # | باگ | وضعیت |
|---|---|---|
| ۱ | کرش صفحه پروفایل بعد از ورود موفق (نقض Rules of Hooks: `useMemo` بعد از early-return) | ✅ رفع |
| ۲ | حذف شدن شماره تلفن وقتی کاربر با «ایمیل + شماره» ثبت‌نام می‌کرد | ✅ هر دو ذخیره می‌شود |
| ۳ | ورود با ایمیل یا با فرمت دیگر شماره کار نمی‌کرد | ✅ `0912…`, `+989…`, `00989…`, `989…`, `912…`, ارقام فارسی |
| ۴ | مقالات ذخیره‌شده و درخواست مشاوره بعد از رفرش ناپدید می‌شدند (اکشن ذخیره در API وجود نداشت) | ✅ `save_article` / `unsave_article` / `mark_read` / `consult` |
| ۵ | فرم ویرایش پروفایل نام را پاک می‌کرد | ✅ مقداردهی از پروفایل + اعتبارسنجی + پیام خطا |
| ۶ | ثبت‌نام تکراری با ایمیل/شماره حساب دیگر خطا نمی‌داد | ✅ خطای ۴۰۹ |
| ۷ | خروج کاذب کاربر هنگام خطای موقت سرور (۵xx با ۴۰۱ یکی گرفته می‌شد) | ✅ تفکیک شد |
| ۸ | کوکی نشست بدون `Secure` روی HTTPS | ✅ رفع |

**فایل‌های کلیدی:** `lib/userAuth.ts` (جدید)، `functions/api/user.ts`، `functions/api/_shared.ts`،
`vite-dev-api.ts`، `src/services/api.ts`، `src/context/UserContext.tsx`، `src/pages/ProfilePage.tsx`،
`scripts/user-auth.test.ts` (جدید).

## ۱.۲ ربات تلگرام — روی Cloudflare، هم‌دیتابیس با سایت

| فایل | کار |
|---|---|
| `functions/api/telegram.ts` | ورودی ربات: `POST` = webhook تلگرام، `GET` = سلامت، `GET ?setup=` = ثبت webhook، `POST /deliver` = تحویل از سایت |
| `lib/telegram/bot.ts` | تمام گفتگو: منوها، تأیید شماره، جریان خرید، تحویل، پنل ادمین |
| `lib/telegram/receipt.ts` | پارس رسید + **موتور تصمیم تأیید خودکار** + فراخوانی بینایی ماشین |
| `lib/telegram/grant.ts` | صدور/تمدید `tool_access` + همگام‌سازی `user_subscriptions` و `user_activities` |
| `lib/telegram/pricing.ts` | پلن‌ها و تبدیل قیمت فارسی («۵۹۰٬۰۰۰ تومان») به عدد |
| `lib/telegram/store.ts` | لایه D1 (جدول‌های `bot_*`) |
| `lib/telegram/tgApi.ts` | کلاینت Telegram Bot API |
| `migrations/0006_telegram_bot.sql` | ساخت جدول‌ها |
| `telegram-bot/` | نسخه‌ی جایگزین Node.js (بدون وابستگی) برای اجرا روی سرور شخصی |

**قابلیت‌های آماده:**

- 📱 تأیید شماره: دکمه‌ی «اشتراک شماره» (تأییدشده توسط تلگرام) + کد ۶ رقمی داخل چت
- 🛒 فروش: انتخاب محصول (۴ ابزار هوش مصنوعی) → پلن (پایه/حرفه‌ای/VIP) → شماره کارت + مبلغ
- 🧾 پذیرش رسید: عکس + کپشن یا پیام بعدی («مبلغ ۵۹۰۰۰۰ — پیگیری ۱۲۳۴۵۶»)
- 🤖 **تأیید خودکار** با ۴ بررسی: شماره پیگیری یکتا، تطبیق مبلغ (تومان یا ریال ×۱۰)،
  خواندن عکس با Gemini، پنجره‌ی تاریخ
- 🎁 **تحویل خودکار**: کد دسترسی صادر یا **تمدید** می‌شود (به انقضای فعلی اضافه می‌شود،
  صفر نمی‌شود)، اشتراک در پروفایل سایت ثبت می‌شود، پیام تحویل با لینک محصول ارسال می‌شود
- 🛡 شبکه‌ی ایمنی: رسید تکراری = رد خودکار؛ مبلغ ناهمخوان = هرگز خودکار تأیید نمی‌شود
- 🛠 پنل ادمین: `/admin` `/stats` `/orders_pending` (دکمه تأیید/رد) `/broadcast`
- ⚙️ **Bootstrap ادمین**: اگر `TELEGRAM_ADMIN_IDS` خالی باشد، ربات در `/start` آیدی عددی
  خودت را نشان می‌دهد — دیگر لازم نیست از @userinfobot بگیری
- 🔒 امنیت: webhook با secret، پل سایت با secret، ضدتکرار `update_id`، escape کردن HTML

**تست‌ها (همه سبز):**

- `scripts/telegram-bot.test.ts` — ۱۷ تست: پارس رسید، موتور تصمیم، ریاضی تمدید
- `scripts/telegram-flow.test.ts` — جریان کامل خرید روی SQLite واقعی (سفارش → رسید →
  تأیید خودکار → کد در `tool_access` → تحویل → تمدید → اشتراک سایت)
- `npm run lint` + `npm run lint:functions` + کل `npm test`

## ۱.۳ چه چیزی باقی مانده

| مورد | نیاز به تو؟ |
|---|---|
| استقرار روی کلودفلر (secrets، migration، webhook) | ❌ Claude انجام می‌دهد (توکن لازم است) |
| ثبت `TELEGRAM_ADMIN_IDS` | ❌ ربات خودش آیدی را نشان می‌دهد |
| **شماره کارت** | ✅ فقط این را باید بدهی |
| **توکن ربات** | ✅ فقط این را باید بدهی (به‌صورت Secret، نه چت) |
| اتصال «خرید در سایت» به تحویل تلگرامی | ❌ اختیاری؛ Claude انجام می‌دهد |
| درگاه پرداخت آنلاین / پیامک OTP | ❌ فعلاً نمی‌خواهی |
| یادآوری تمدید خودکار | ❌ اختیاری، می‌تواند اضافه کند |

---

# بخش ۲ — پرامپت آماده برای Claude

> این را همان‌طور که هست کپی کن و به Claude Code (یا Claude.ai در حالت agent) بده.
> اگر Claude Code داری، در ریشه‌ی ریپو اجرا کن.

```text
# مأموریت
ریپوی my-website01 (سایت شخصی با React + Cloudflare Pages + D1) را کامل کن و ربات تلگرام
فروش و تحویل محصولات را روی کلودفلر مستقر کن. تمام کد ربات از قبل نوشته و تست شده است؛
کار تو استقرار، پیکربندی، اتصال و راستی‌آزمایی است — نه بازنویسی.

# وضعیت فعلی کد (از قبل انجام شده — بازنویسی نکن)
- شاخه: arena/78436472-my-website01 (PR #29 باز است)
- باگ‌های احراز هویت سایت رفع شده: lib/userAuth.ts، functions/api/user.ts،
  src/context/UserContext.tsx، src/pages/ProfilePage.tsx، src/services/api.ts، vite-dev-api.ts
- ربات تلگرام کامل است:
  * functions/api/telegram.ts  → webhook + health + /api/telegram/deliver (پل سایت)
  * lib/telegram/bot.ts        → گفتگو، جریان خرید کارت‌به‌کارت، پنل ادمین
  * lib/telegram/receipt.ts    → تأیید خودکار رسید (شماره پیگیری یکتا + مبلغ + بینایی ماشین)
  * lib/telegram/grant.ts      → صدور/تمدید کد دسترسی در tool_access + اشتراک سایت
  * lib/telegram/pricing.ts    → قیمت‌ها از lib/toolPlans.ts (همیشه هم‌خوان با سایت)
  * lib/telegram/store.ts      → جدول‌های bot_* در D1
  * lib/telegram/tgApi.ts      → کلاینت Bot API
  * migrations/0006_telegram_bot.sql
  * telegram-bot/              → نسخه‌ی جایگزین Node.js (نیازی به آن نداریم، دست نزن)
- تست‌ها: scripts/telegram-bot.test.ts (۱۷ تست) و scripts/telegram-flow.test.ts (جریان کامل خرید)
- راهنما: telegram-bot/README.md و docs/TELEGRAM-BOT-PROMPT.md

# اطلاعاتی که باید از من (کاربر) بگیری — قبل از شروع بپرس
1. توکن ربات تلگرام از @BotFather.
   ⚠️ هرگز آن را در چت، لاگ، کامیت یا خروجی دستور چاپ نکن. فقط در Secret کلودفلر ذخیره کن.
   اگر من توکن را در چت فرستادم، هشدار بده که باید در BotFather با /revoke عوض شود.
2. شماره کارت (و نام صاحب کارت) برای کارت‌به‌کارت.
هیچ چیز دیگری لازم نیست: آیدی عددی ادمین را خود ربات نشان می‌دهد،
TELEGRAM_WEBHOOK_SECRET را خودت با openssl rand -hex 32 بساز،
و GEMINI_API_KEY را از محیط فعلی سایت بخوان (اگر نبود، بپرس).

# گام‌های اجرا (به همین ترتیب)

## گام ۰ — پیش‌بررسی
- git status تمیز باشد، روی شاخه arena/78436472-my-website01 باش.
- npm install
- npm run lint && npm run lint:functions && npm test   → همه باید سبز باشند.
  اگر سبز نبودند، قبل از هر کار دیگری علت را پیدا و رفع کن.

## گام ۱ — پیکربندی کلودفلر
- بررسی کن wrangler نصب و لاگین است: npx wrangler whoami
  (اگر لاگین نبود، به من بگو npx wrangler login را اجرا کنم — نباید رمز از من بگیری.)
- نام پروژه Pages و database_id را از wrangler.toml بخوان.
- با npx wrangler pages secret put <NAME> --project-name <PROJECT> این‌ها را تنظیم کن:
  TELEGRAM_BOT_TOKEN        = توکنی که دادم (Secret)
  TELEGRAM_WEBHOOK_SECRET   = خروجی openssl rand -hex 32 (Secret)
  BOT_CARD_NUMBER           = شماره کارتی که دادم
  BOT_CARD_HOLDER           = نام صاحب کارت
  TELEGRAM_AUTO_APPROVE     = vision        (اگر GEMINI_API_KEY موجود نیست → always)
  SITE_URL                  = دامنه‌ی واقعی سایت
  TELEGRAM_VISION_MODEL     = gemini-2.5-flash
- اگر GEMINI_API_KEY در پروژه تنظیم نشده و من کلید دادم، آن را هم Secret کن.
- TELEGRAM_ADMIN_IDS را فعلاً خالی بگذار (بعد از گام ۵ پر می‌کنیم).

## گام ۲ — ساخت جدول‌ها
npx wrangler d1 execute <DATABASE_NAME> --remote --file=migrations/0006_telegram_bot.sql
سپس صحت را چک کن:
npx wrangler d1 execute <DATABASE_NAME> --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'bot_%'"

## گام ۳ — استقرار
- npm run build
- استقرار با همان روشی که ریپو/تنظیمات فعلی دارد (Git push روی main یا
  npx wrangler pages deploy dist --project-name <PROJECT>).
  اگر CI گیت‌هاب مستقر می‌کند، PR را merge کن و منتظر دیپلوی بمان.
- بعد از دیپلوی:
  curl https://<دامنه>/api/telegram
  باید configured.token و configured.secret و configured.card همه true باشند.

## گام ۴ — ثبت webhook
curl "https://<دامنه>/api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET>"
باید {"ok":true,...} بدهد. سپس بررسی کن:
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
(در این دستور توکن در URL است؛ خروجی را چاپ نکن، فقط فیلدهای ok/last_error_message را ببین
 و مطمئن شو url درست است و pending_update_count صفر می‌شود.)

## گام ۵ — گرفتن آیدی ادمین و فعال‌کردن پنل
- به من بگو در تلگرام به ربات /start بدهد و عددی که ربات نشان می‌دهد («آیدی عددی شما») را بفرستد.
- سپس: npx wrangler pages secret put TELEGRAM_ADMIN_IDS --project-name <PROJECT>
  و همان عدد را وارد کن (مثلاً "123456789"). اگر چند ادمین بود، با کاما.
- به من بگو دوباره /admin بزند تا پنل باز شود.

## گام ۶ — راستی‌آزمایی کامل (خودت انجام بده و نتیجه را گزارش کن)
1. curl سلامت بالا.
2. در تلگرام: /start → تأیید شماره با دکمه‌ی اشتراک شماره.
3. /buy → ارسال شماره کارت و مبلغ را به من نشان بده تا یک واریز واقعی تست کنم.
4. عکس رسید + کپشن «مبلغ <عدد> — پیگیری <عدد>» بفرستم.
5. بررسی کن سفارش خودکار تأیید و تحویل شود:
   - در پیام‌های من کد دسترسی آمده باشد
   - در D1:
     npx wrangler d1 execute <DB> --remote --command \
       "SELECT phone, product_id, code, status, expires_at FROM tool_access ORDER BY created_at DESC LIMIT 5"
     npx wrangler d1 execute <DB> --remote --command \
       "SELECT id, status, decided_by, ref_code FROM bot_orders ORDER BY created_at DESC LIMIT 5"
     (decided_by باید auto باشد و status = fulfilled)
6. تست تحویل از سمت سایت:
   curl -X POST https://<دامنه>/api/telegram/deliver \
     -H 'Content-Type: application/json' \
     -H "X-Bot-Webhook-Secret: <SECRET>" \
     -d '{"phone":"<شماره من>","productId":"business-therapist","planId":"basic"}'
   باید ok:true و code برگرداند و پیام تحویل در تلگرام برسد.
7. تست تمدید: همان درخواست را دوباره بزن و مطمئن شو expires_at به اندازه‌ی یک دوره
   جلوتر رفت و کد تغییر نکرد.
8. تست امنیت: همان درخواست را بدون هدر secret بزن → باید 401 بدهد.

## گام ۷ (اختیاری ولی توصیه‌شده) — اتصال خرید سایت به تحویل تلگرامی
اگر پرداخت در سایت انجام می‌شود، طبق پرامپت شماره ۱ در docs/TELEGRAM-BOT-PROMPT.md
helper «deliverViaTelegram» را در functions/api/_shared.ts بساز و در
functions/api/tools.ts داخل action === 'grant' صدا بزن (با try/catch و waitUntil،
به‌طوری که شکست تلگرام هرگز پاسخ اصلی API را خراب نکند).

## گام ۸ (اختیاری) — یادآوری تمدید
اگر وقت داشتی: یک Scheduled Function روزانه (Functions → Cron) که کاربرانی را که
tool_access شان تا ۳ روز دیگر منقضی می‌شود پیدا کند و با دکمه‌ی «تمدید» پیام بدهد.
(در bot.ts تابع grantToolAccess و renderDelivery برای بازاستفاده آماده‌اند.)

# قواعد سخت (نقض نکن)
- توکن ربات و WEBHOOK_SECRET هرگز در کد، کامیت، .env داخل ریپو، یا خروجی چت چاپ نشوند.
- هیچ Secret را در wrangler.toml ننویس (فقط در Cloudflare Secrets).
- قیمت‌ها و پلن‌ها را تغییر نده (منبع: lib/toolPlans.ts).
- منطق تأیید خودکار رسید را ساده/شل نکن؛ مبلغ ناهمخوان هرگز نباید خودکار تأیید شود.
- بعد از هر تغییر: npm run lint && npm run lint:functions && npm test باید سبز بمانند.
- تغییرات کد را در شاخه‌ی arena/78436472-my-website01 کامیت کن و PR را آپدیت کن.
- اگر جایی به داده‌ای نیاز داری که ندارم (شماره کارت، دامنه، کلید AI)، بپرس — حدس نزن.

# تعریف «تمام‌شده»
- [ ] /api/telegram سلامت کامل بدهد
- [ ] webhook ثبت شده و getWebhookInfo خطا ندارد
- [ ] /start → آیدی ادمین نمایش داده و سپس در TELEGRAM_ADMIN_IDS ثبت شده
- [ ] یک خرید تستی واقعی: رسید → تأیید خودکار → کد دسترسی → تحویل در تلگرام
- [ ] ردیف tool_access با status=active و expires_at درست
- [ ] bot_orders با decided_by=auto و status=fulfilled
- [ ] تمدید، انقضا را جلو می‌برد و کد را عوض نمی‌کند
- [ ] درخواست بدون secret → 401
- [ ] lint + lint:functions + npm test سبز
- [ ] گزارش نهایی: چه تنظیم شد، کدام Secretها ست شدند (فقط نام‌ها، نه مقادیر)،
      نتیجه‌ی تست‌ها، و کارهای باقی‌مانده

# گزارش نهایی که به من بده
۱) جدول Secretهای تنظیم‌شده (فقط نام + آیا ست شد)
۲) خروجی سلامت و getWebhookInfo (بدون توکن)
۳) نتیجه‌ی خرید تستی و شناسه‌ی سفارش/کد دسترسی
۴) هر چیزی که به تصمیم من نیاز دارد
```

---

# بخش ۳ — فقط این دو چیز را آماده داشته باش

1. **توکن ربات**: از [@BotFather](https://t.me/BotFather) → `/newbot` (یا `/token` برای ربات موجود).
   آن را **در چت نفرست**؛ به Claude بگو آن را در Secret بگذارد.
2. **شماره کارت** + نام صاحب کارت (برای نمایش به مشتری).

بقیه‌ی کارها — از ساخت جدول و ثبت webhook تا اتصال خرید سایت — در پرامپت بالا پوشش داده شده است.

> اگر Claude Code داری: ریپو را باز کن، پرامپت بالا را بده، و فقط جواب سؤال‌هایش را بده.
> اگر Claude.ai (بدون دسترسی به ترمینال) داری: این پرامپت را بده تا کد/دستورهای لازم را
> مرحله‌به‌مرحله تولید کند، اما اجرای `wrangler` را خودت یا Claude Code انجام دهد.
