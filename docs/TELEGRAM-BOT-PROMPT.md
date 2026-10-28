# ربات تلگرام — وضعیت، راه‌اندازی و پرامپت‌های تکمیل

ربات **ساخته شده و کار می‌کند**؛ روی همان سایت کلودفلر اجرا می‌شود و به همان D1 وصل است.

| فایل | نقش |
|---|---|
| `functions/api/telegram.ts` | ورودی ربات: webhook، سلامت، پل تحویل سایت |
| `lib/telegram/bot.ts` | گفتگو، منوها، جریان خرید، تحویل، پنل ادمین |
| `lib/telegram/receipt.ts` | پارس رسید + موتور تصمیم تأیید خودکار + فراخوانی بینایی ماشین |
| `lib/telegram/grant.ts` | صدور/تمدید `tool_access` + همگام‌سازی `user_subscriptions` |
| `lib/telegram/pricing.ts` | پلن‌ها و تبدیل قیمت فارسی به تومان |
| `lib/telegram/store.ts` | لایه D1 (جدول‌های `bot_*`) |
| `lib/telegram/tgApi.ts` | کلاینت Bot API |
| `migrations/0006_telegram_bot.sql` | جدول‌ها |

---

## ✅ آماده است

- تأیید شماره (اشتراک تماس تلگرام + کد داخل چت)
- فروش ۴ محصول با ۳ پلن (قیمت‌ها از `lib/toolPlans.ts` خوانده می‌شود، همیشه با سایت هم‌خوان)
- کارت‌به‌کارت: شماره کارت، مبلغ، ارسال رسید
- **تأیید خودکار رسید**: یکتایی شماره پیگیری + تطبیق مبلغ (تومان/ریال) + خواندن عکس با AI + پنجره تاریخ
- تحویل خودکار: صدور یا **تمدید** کد دسترسی + پیام تحویل + ثبت اشتراک در پروفایل سایت
- صف تحویل برای کاربرانی که هنوز شماره را تأیید نکرده‌اند
- اطلاع‌رسانی همه تصمیم‌ها به ادمین + صف بررسی دستی با دکمه تأیید/رد
- برادکست، آمار، پشتیبانی، ضدتکرار آپدیت

## ⏳ باقی‌مانده (اختیاری — به حساب‌های شما نیاز دارد)

| مورد | لازم است؟ |
|---|---|
| درگاه پرداخت آنلاین (زرین‌پال/زیبال) | اختیاری؛ شما کارت‌به‌کارت خواستید ✅ |
| پیامک OTP (کاوه‌نگار/فراز) | اختیاری؛ شما فعلاً نمی‌خواهید ✅ |
| اتصال خرید سایت به پل تحویل | فقط اگر پرداخت در سایت انجام می‌شود |

---

## پرامپت ۱ — اتصال خرید سایت به تحویل تلگرامی

```
پروژه: my-website01 (Cloudflare Pages + D1). ربات تلگرام در functions/api/telegram.ts هست
و مسیر POST /api/telegram/deliver با هدر X-Bot-Webhook-Secret محصول را در تلگرام مشتری
تحویل می‌دهد و کد tool_access را صادر/تمدید می‌کند.

کار: بعد از هر خرید/صدور دسترسی در سایت، همین پل را صدا بزن.

1) در functions/api/_shared.ts این helper را اضافه کن:

   export const deliverViaTelegram = async (env: any, request: Request, payload: {
     phone: string; productId: string; planId?: string; orderId?: string;
     code?: string; expiresAt?: string; note?: string;
   }): Promise<{ ok: boolean; queued?: boolean; error?: string }> => {
     const secret = String(env.TELEGRAM_WEBHOOK_SECRET || '');
     if (!secret) return { ok: false, error: 'telegram not configured' };
     const origin = new URL(request.url).origin;
     try {
       const r = await fetch(`${origin}/api/telegram/deliver`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'X-Bot-Webhook-Secret': secret },
         body: JSON.stringify(payload),
       });
       const j: any = await r.json().catch(() => ({}));
       return { ok: !!j.ok, queued: j.queued, error: j.error };
     } catch (e: any) {
       return { ok: false, error: String(e?.message || e) };
     }
   };

   (فراخوانی داخلی با origin خودِ درخواست، پس نیازی به دامنه‌ی جدا و secret در کد نیست —
    فقط TELEGRAM_WEBHOOK_SECRET باید در env باشد. شکست تحویل تلگرام هرگز نباید پاسخ اصلی
    API را خراب کند: fire-and-forget یا try/catch.)

2) در functions/api/tools.ts، داخل action === 'grant' بعد از موفقیت، این را صدا بزن
   (بدون await کردنِ خطا — await کن ولی خطا را فقط لاگ کن):
   await deliverViaTelegram(env, request, { phone, productId, planId: body.planId, code, expiresAt });
   از fire-and-forget استفاده کن: context.waitUntil(deliverViaTelegram(...)) اگر context در دسترس است.

3) تست: با یک شماره‌ی تأییدشده در ربات، grant بزن و ببین پیام تحویل می‌رسد.
   با شماره‌ی تأییدنشده ببین queued:true برمی‌گردد.
```

---

## پرامپت ۲ — درگاه پرداخت آنلاین (اختیاری)

```
پروژه: my-website01. درگاه پرداخت [زرین‌پال/زیبال] را وصل کن تا خرید داخل ربات هم
بتواند آنلاین پرداخت شود (علاوه بر کارت‌به‌کارت موجود).

1) lib/telegram/payment.mjs (یا .ts): createPayment(orderId, amountToman, description) →
   لینک پرداخت؛ verifyPayment(authority/refId, amountToman) → boolean.
   کلیدها: PAYMENT_PROVIDER، PAYMENT_API_KEY در env.

2) در lib/telegram/bot.ts جریان خرید را توسعه بده: در createPurchaseOrder یک دکمه‌ی
   «💳 پرداخت آنلاین» با URL درگاه اضافه کن (سلکت پیام فعلی را نگه دار، فقط دکمه اضافه شود).

3) در functions/api/telegram.ts مسیر GET /api/telegram/payment/callback را اضافه کن:
   پارامترهای درگاه را بگیر → verifyPayment → در صورت موفقیت:
   getOrder → fulfillOrder(env, order, 'gateway') (همان تابع موجود).
   مبلغ را همیشه سمت سرور از bot_orders بخوان، نه از query.

4) تست در sandbox درگاه + تست واحد برای مبلغ/وضعیت سفارش.
```

---

## پرامپت ۳ — پیامک OTP (اختیاری)

```
پروژه: my-website01. یک روش سوم تأیید شماره با پیامک اضافه کن (علاوه بر اشتراک تماس و OTP داخل چت).

1) lib/telegram/sms.ts: sendSms(phone, text) با fetch به [کاوه‌نگار/فراز].
   env: SMS_PROVIDER, SMS_API_KEY, SMS_SENDER.
2) در lib/telegram/bot.ts تابع startVerification گزینه‌ی «📩 دریافت کد پیامکی» را اضافه کند؛
   همان state awaiting_otp را استفاده کن، فقط مسیر ارسال کد فرق دارد.
3) اگر پیامک خطا داد: «ارسال پیامک ممکن نیست؛ از اشتراک تماس تلگرام استفاده کنید.»
4) تست با mock (بدون شبکه).
```

---

## چک‌لیست استقرار

- [ ] توکن ربات از BotFather (در Cloudflare Secrets به‌نام `TELEGRAM_BOT_TOKEN`)
- [ ] `TELEGRAM_WEBHOOK_SECRET` (رشته تصادفی)
- [ ] `TELEGRAM_ADMIN_IDS` (آیدی عددی خودتان)
- [ ] `BOT_CARD_NUMBER` + `BOT_CARD_HOLDER`
- [ ] `GEMINI_API_KEY` (برای تأیید خودکار با AI) — یا `TELEGRAM_AUTO_APPROVE=always`
- [ ] `npx wrangler d1 execute omidadli01-site-db --remote --file=migrations/0006_telegram_bot.sql`
- [ ] `curl "https://<دامنه>/api/telegram?setup=<secret>"`
- [ ] `/start` → تأیید شماره → `/buy` → ارسال رسید تستی → تحویل خودکار ✅
- [ ] `npm test` سبز

## ⚠️ توکن ربات
توکن را در چت نفرستید؛ فقط در Cloudflare Secrets. اگر لو رفت → BotFather → `/revoke`.
