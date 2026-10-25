# تکمیل زیرساخت ربات تلگرام — پرامپت دقیق + چک‌لیست

زیرساخت اصلی ربات در پوشه [`telegram-bot/`](../telegram-bot/README.md) پیاده‌سازی شده است
(صحت‌سنجی شماره، تحویل محصولات، سفارش‌ها، پنل ادمین، پل HTTP با سایت — بدون وابستگی خارجی).

سه بخش باقی می‌ماند که **به حساب‌های کاربری، توکن‌ها و سرور شما نیاز دارد** و از داخل این
محیط قابل انجام نیست. هر بخش یک پرامپت آماده دارد که می‌توانی عیناً به یک توسعه‌دهنده یا
دستیار هوش مصنوعی بدهی تا روی همان کد موجود ادامه دهد.

---

## ✅ آنچه همین الان آماده است

| جزء | وضعیت |
|---|---|
| ربات تلگرام (long polling / webhook) | ✅ کامل — `telegram-bot/bot.mjs` |
| صحت‌سنجی شماره با «اشتراک تماس تلگرام» | ✅ کامل — قوی‌ترین روش |
| صحت‌سنجی شماره با کد تایید (OTP) داخل چت | ✅ کامل |
| تحویل محصول (کد/لینک/متن/فایل) + صف تحویل | ✅ کامل |
| سفارش با رسید + تایید/رد ادمین | ✅ کامل |
| پنل ادمین (آمار، برادکست، محصول) | ✅ کامل |
| پل HTTP برای سایت (`/api/deliver`, `/api/notify`) | ✅ کامل |
| قواعد مشترک شماره موبایل با سایت (`lib/userAuth.ts`) | ✅ یکسان‌سازی شده |
| ارسال پیامک (SMS) | ⏳ نیاز به API پیامکی شما |
| درگاه پرداخت | ⏳ نیاز به حساب درگاه شما |
| اتصال سایت (Cloudflare) به پل ربات | ⏳ کد نمونه آماده، جای اجرا با شما |

---

## ۱) پرامپت تکمیل ارسال پیامک (OTP پیامکی) — اختیاری

> توضیح: روش «اشتراک تماس تلگرام» همین حالا هم شماره را تاییدشده می‌آورد و برای اکثر
> کاربردها کافی است. پیامک فقط وقتی لازم است که بخواهی شماره را *قبل از* ورود به تلگرام
> هم تایید کنی یا کاربرانی بدون تلگرام داشته باشی.

```
پروژه: ربات تلگرام پوشه telegram-bot/ در ریپوی my-website01 (Node.js ESM، بدون وابستگی).

کار: روش سوم صحت‌سنجی شماره «ارسال پیامک» را اضافه کن:

1. فایل telegram-bot/lib/sms.mjs را بساز با یک تابع sendSms(phone, text) که با fetch
   به سرویس پیامکی [کاوه‌نگار/فراز اس‌ام‌اس/ایده‌پرداز — هرکدام حساب دارم] فراخوانی کند.
   متغیرهای محیطی SMS_PROVIDER و SMS_API_KEY را از lib/env.mjs اضافه کن (به .env.example هم اضافه شود).
   نکته: متن پیامک فارسی و حداکثر ۱۶۰ کاراکتر؛ شماره به فرمت 09xxxxxxxxx از normalizePhone.

2. در lib/flow.mjs به تابع startVerification یک دکمه/گزینه سوم «📩 دریافت کد با پیامک» اضافه کن.
   جریان: کاربر شماره را می‌دهد → sendSms(code) → کاربر کد را در ربات وارد می‌کند →
   completeVerification(store, tgUserId, phone, 'sms'). دقیقاً همان state machine موجود
   (pending: awaiting_otp) را استفاده کن؛ فقط متد ارسال کد عوض می‌شود.

3. در bot.mjs دکمه جدید و هندلر آن را وصل کن. اگر ارسال پیامک خطا داد، پیام فارسی
   «ارسال پیامک موقتاً ممکن نیست؛ از اشتراک تماس تلگرام استفاده کنید» نشان بده.

4. تست: تست‌های test.mjs را با یک SMS mock (توابع ساختگی بدون شبکه) تمدید کن.
   تغییری در توابع موجود نده؛ فقط اضافه کن.

پیش‌نیاز از من: کلید API پیامکی را در telegram-bot/.env می‌گذارم (SMS_API_KEY).
```

---

## ۲) پرامپت تکمیل درگاه پرداخت (پرداخت آنلاین → تحویل خودکار)

```
پروژه: ربات تلگرام پوشه telegram-bot/ در ریپوی my-website01.

کار: درگاه پرداخت [زرین‌پال/زیبال/آیدی‌پی — هرکدام حساب دارم] را وصل کن تا بعد از پرداخت
موفق، سفارش خودکار تایید و محصول تحویل شود:

1. فایل telegram-bot/lib/payment.mjs:
   - createPayment(amountToman, description, orderId) → لینک پرداخت (fetch به API درگاه)
   - verifyPayment(orderId, refId) → تایید پرداخت از سمت درگاه
   متغیرها: PAYMENT_PROVIDER، PAYMENT_API_KEY در lib/env.mjs و .env.example.

2. در bot.mjs مسیر جدید /buy در flow (یا منوی «🛒 خرید»):
   - کاربر محصول را از لیست products.json انتخاب می‌کند (inline keyboard)
   - createPayment → دکمه «پرداخت» با URL درگاه
   - callback برای «پرداخت انجام شد» → verifyPayment → اگر ok:
     flow.createOrder(...) + flow.approveOrder(...) → dispatchDelivery (کد موجود).

3. webhook درگاه (اختیاری ولی بهتر): مسیر POST /api/payment/callback روی HTTP داخلی
   ربات (همان سرور http در bot.mjs) که با verify نهایی درگاه، سفارش را approve کند.
   بدنه callback را حتماً با مستندات درگاه چک کن؛ مبلغ را سمت سرور اعتبارسنجی کن (هرگز به مبلغ ارسالی کلاینت اعتماد نکن).

4. مبلغ‌ها و قیمت محصولات را در products.json فیلد price (تومان) نگه دار؛
   /addproduct ادمین را هم برای price تمدید کن.

5. تست با sandbox درگاه + تست واحد (بدون شبکه) برای state machine سفارش.

پیش‌نیاز از من: کلید درگاه (SANDBOX یا LIVE) را در telegram-bot/.env می‌گذارم (PAYMENT_API_KEY).
```

---

## ۳) پرامپت اتصال سایت (Cloudflare Pages) به ربات

بعد از هر خرید/ثبت دسترسی در سایت، محصول باید در تلگرام مشتری تحویل شود. سایت باید به
پل HTTP ربات فراخوانی بزند:

```
پروژه: my-website01 (سایت Cloudflare Pages با functions/).

کار: بعد از ثبت خرید/دسترسی محصول برای یک کاربر، تحویل تلگرامی را فراخوانی کن:

1. در functions/api/_shared.ts یک helper بساز:

   export const deliverViaTelegram = async (env, payload: {
     phone: string; productId: string; productName: string;
     payload?: string; type?: 'code' | 'link' | 'text' | 'file'; note?: string;
   }): Promise<{ ok: boolean; error?: string }> => {
     const base = (env.TELEGRAM_BOT_URL || '').replace(/\/+$/, '');
     const secret = env.TELEGRAM_BOT_SECRET || '';
     if (!base || !secret) return { ok: false, error: 'telegram bridge not configured' };
     try {
       const r = await fetch(`${base}/api/deliver`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'X-Bot-Webhook-Secret': secret },
         body: JSON.stringify(payload),
       });
       const j: any = await r.json().catch(() => ({}));
       return { ok: !!j.ok, error: j.error };
     } catch (e: any) {
       return { ok: false, error: e?.message || 'network' };
     }
   };

2. در functions/api/tools.ts (جایی که tool_access برای خریدار صادر/فعال می‌شود) بعد از
   موفقیت عملیات، fire-and-forget صدا بزن:
   await deliverViaTelegram(env, {
     phone, productId, productName, payload: accessCode, type: 'code',
     note: `کد دسترسی ${productName}`,
   });
   (شکست تحویل تلگرام نباید جلوی پاسخ اصلی API را بگیرد — فقط لاگ کن.)

3. متغیرهای env به wrangler.toml / secrets اضافه شود:
   TELEGRAM_BOT_URL (مثلاً https://bot.example.com یا http://IP-SERVER:8787)
   TELEGRAM_BOT_SECRET (همان WEBHOOK_SECRET ربات)

4. در پنل ادمین سایت، هنگام «افزودن اشتراک/دسترسی دستی» هم همین فراخوانی انجام شود
   تا مشتری محصول را هم در سایت و هم در تلگرام ببیند.

نکته امنیتی: TELEGRAM_BOT_SECRET را فقط در Cloudflare Secrets بگذار، نه در کد.
```

---

## ۴) چک‌لیست استقرار (Deployment)

- [ ] ساخت ربات با [@BotFather](https://t.me/BotFather) و گرفتن توکن
- [ ] گرفتن آیدی عددی تلگرام با [@userinfobot](https://t.me/userinfobot)
- [ ] `cp .env.example .env` و پر کردن `BOT_TOKEN`، `ADMIN_TG_IDS`، `WEBHOOK_SECRET`
- [ ] `npm test` سبز باشد
- [ ] `npm start` روی سرور همیشه‌روشن (PM2/systemd — راهنما در README ربات)
- [ ] تست کامل: `/start` → احراز شماره → `/myproducts` → تحویل محصول تستی با `/api/deliver`
- [ ] (اختیاری) تنظیم `BOT_MODE=webhook` + `PUBLIC_URL` با HTTPS
- [ ] (اختیاری) اتصال سایت با پرامپت شماره ۳
- [ ] پشتیبان‌گیری دوره‌ای از `telegram-bot/data/`
- [ ] باطل‌کردن توکن قدیمی اگر جایی لو رفت (`/revoke` در BotFather)

---

## ⚠️ نکته مهم درباره توکن ربات

**توکن ربات تلگرام را در چت/ایمیل/اسکرین‌شات نفرست.** آن را مستقیم داخل فایل
`telegram-bot/.env` بگذار. اگر به هر دلیلی لو رفت، بلافاصله در BotFather دستور `/revoke`
را بزن تا توکن جدید صادر شود.
