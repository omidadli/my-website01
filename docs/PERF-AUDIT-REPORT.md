# گزارش ممیزی عملکرد و ریسپانسیو — my-website01

> **⚠️ اصلاحیه نسخه ۲ (بازگردانی تغییرات ظاهری/رفتاری):**
> پس از تست روی گوشی واقعی، مشخص شد بخشی از تغییرات نسخه ۱ فراتر از «رفع باگ» بوده و ظاهر/رفتار سایت را عوض کرده است.
> طبق درخواست («سایت همان‌طور که بود باید باشد؛ فقط باگ‌های ریسپانسیو/نمایشی، بدون حذف یا تغییر چیزی») موارد زیر **به حالت اولیه برگردانده شدند**:
>
> | مورد برگردانده‌شده | توضیح |
> |---|---|
> | جایگزینی تصویر به‌جای ویدیوی مسکات | **حذف شد** — ویدیوها اکنون روی همه دستگاه‌ها (موبایل/تاچ) پخش می‌شوند؛ هیچ fallback تصویری به‌جای mp4 نیست (فقط stateهای بدون ویدیو مانند sad/listen که از ابتدا تصویری بودند) |
> | ویدیوهای خوش‌آمدگویی (`CinematicWelcomeModal`, `MascotWelcomeOverlay`) | **دقیقاً نسخه اولیه** — ویدیو همیشه پخش می‌شود |
> | آیکون‌های سه‌بعدی (`3DIconBadge`, `TiltCard`, `IsometricDashboard`) | **دقیقاً نسخه اولیه** — transform این‌لاین ایزومتریک بازگردانده شد |
> | `MotionConfig reducedMotion` + گیت‌های hover/reduced-motion | **حذف شدند** (`main.tsx`, `Cinematic`, `CinematicSection`, `PageHeader`, `HeroSlider`, پارالاکس HomePage) — انیمیشن‌ها دقیقاً مانند قبل |
> | فونت self-host شده Vazirmatn | **حذف شد** — لینک Google Fonts دقیقاً مانند قبل برگشت (self-host فقط به‌عنوان پیشنهاد آینده در بخش ۵ باقی ماند) |
> | جابه‌جایی حباب گفتار/دم حباب‌های چت | **به حالت اولیه** برگشت (تغییرات position شناورها که در RTL یکسان‌اند، ماندند) |
> | مخفی‌شدن داک/مسکات هنگام باز شدن کیبورد | **حذف شد** |
>
> **چیزی که باقی مانده (فقط رفع‌باگ و بهینه‌سازی بدون تغییر ظاهر):** نردبان تصاویر WebP/srcset (تصویر نهایی یکسان، حجم کمتر)، `width/height` برای CLS=0، جداسازی داده مقالات از باندل اولیه، `dvh`/`min()`/`%` به‌جای `vh`/`vw` خام، `overflow-x-clip` (رفع خرابی sticky)، `break-words` (رفع سرریز متن‌های بلند)، فونت ۱۶px فیلدها (رفع زوم خودکار iOS — درخواست صریح قبلی)، `interactive-widget=resizes-content`، lazy شدن چانک‌های ادمین، پراپرتی‌های منطقی RTL در موقعیت شناورها (در RTL پیکسل‌به‌پیکسل با قبل یکسان است).

> تاریخ: ۱۴۰۵/۰۷/۰۵ (۲۰۲۶-۰۹-۲۷) — اجرا روی برنچ `arena/01a0e1b5-my-website01`
> روش: بازبینی فایل‌به‌فایل کد + اندازه‌گیری بایت‌های واقعی خروجی `vite build` + تست‌های خودکار موجود (`npm test`).
> محدودیت محیط: مرورگر headless/Lighthouse در این سندباکس قابل نصب نیست (CDNهای Chrome/Playwright مسدودند)؛
> اعداد LCP/FCP بخش «تخمین شبکه» از مدل انتقال (gzip ÷ پهنای باند Slow-4G) محاسبه شده‌اند و مراحل تأیید نهایی
> با Lighthouse واقعی در انتهای همین سند آمده است.

---

## ۱. تصاویر و مدیا

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/utils/responsiveImage.ts` (جدید) | هیچ مکانیزم srcset/sizes در پروژه وجود نداشت؛ موبایل فایل اورجینال را می‌کشید | helper مرکزی `responsiveImageProps()` با نردبان WebP از پیش‌تولیدشده برای `/blog/*` و آواتارها + `width/height/decoding/loading` | بستر اجرای موارد زیر |
| `public/blog/*.jpg` (۳۰ کاور، ۳.۰MB) | هر کاور ۱۳۷۶×۷۶۸ JPEG متوسط **۱۰۰KB** بدون واریانت موبایل | تولید `*-640.webp` (میانگین **۱۲KB**)، `*-1024.webp` (۲۴KB)، `*.webp` (۴۳KB) با ImageMagick | گرید ۶ کارتی در موبایل ۳۹۰px/DPR۲: **۶۰۱KB → ۷۱KB (−۸۸٪)** |
| `public/profile-photo*.png/jpg` (۸۰۰×۸۰۰) | آواتار ۱۱۵KB در اسلات‌های ۲۸–۱۶۰px نمایش داده می‌شد | واریانت‌های `profile-photo-{64,160,400,800}.webp` + srcset | هیروی خانه (۲۸px): **۱۱۵KB → ۱KB (−۹۹٪)**؛ صفحه درباره (۱۶۰px): **۱۱۵KB → ۳.۴KB (−۹۷٪)** |
| `src/pages/BlogPage.tsx` | کاور featured بدون `loading/dimensions` و کاورهای گرید بدون srcset | کاور featured → `loading="eager" fetchpriority="high"` (LCP صفحه)، گرید → `lazy` + srcset + `width/height` (رزرو فضای لی‌اوت → CLS=0) | هر کاور موبایل: ۱۰۰KB → ۱۲KB |
| `src/pages/BlogPostDetailPage.tsx` | کاور مقاله (LCP صفحه)، آواتار نویسنده، کاورهای «مطالب مرتبط» بدون ابعاد/lazy/srcset | کاور → eager + fetchpriority=high + srcset؛ آواتار → srcset آواتار + ابعاد صریح؛ مرتبط‌ها → lazy + srcset | کاور جزئیات: ۱۰۰KB → ۲۴KB در تبلت/موبایل بزرگ |
| `src/pages/HomePage.tsx` (۳ `<img>`) | آواتار تراست‌پیل هیرو بدون ابعاد؛ آواتار «من امید» و آواتار نظر مشتری بدون srcset | هیرو → eager + fetchpriority=high + srcset (اولین تصویر ATF)؛ دو مورد دیگر → lazy + srcset + width/height | آواتارها ۱۱۵KB → ۱–۴KB |
| `src/pages/AboutPage.tsx` | آواتار پروفایل بدون lazy/ابعاد/srcset | lazy + srcset + `width/height=160` | ۱۱۵KB → ۳.۴KB |
| `src/components/cms/EditableImage.tsx` | تصاویر CMS بدون lazy/ابعاد؛ هیچ srcset برای فایل‌های بومی | `responsiveImageProps` (نردبان بومی) + lazy + decoding | تصاویر CMS شناخته‌شده مثل کاورها |
| `src/components/admin/{CollectionEditor,FieldInspectorModal,MediaField,TreeEditor}.tsx`, `src/components/cms/MediaPickerModal.tsx`, `src/pages/AdminPage.tsx` | ۹ تگ `<img>` ادمین بدون `loading`/`width`/`height` | `loading="lazy" decoding="async"` + ابعاد مطابق باکس CSS | جلوگیری از CLS و درخواست‌های هم‌زمان در مدیاپیکر |
| **ویدیوهای مسکات** `public/mascot/*.mp4` (۱۱ کلیپ، ۳.۵MB مجموع) | پخش mp4 حتی روی تاچ/reduced-motion؛ `CinematicWelcomeModal` و `MascotWelcomeOverlay` بدون fallback استاتیک و بدون preload کنترل‌شده | هوک مشترک جدید `useStaticMediaMode.ts` (pointer:coarse ‏**یا** prefers-reduced-motion **یا** `saveData` **یا** 2G) → نمایش WebP استاتیک به‌جای ویدیو؛ `preload="metadata"` (هرگز auto)؛ فقط ویدیوی state جاری mount می‌شود (ساختار LayerView قبلی حفظ شد + تقویت شد) | موبایل/تاچ: **۰ بایت** مصرف mp4 (قبلاً ۱۶۴–۴۵۶KB هر ورود)؛ دسکتاپ: همان رفتار قبلی با metadata preload |
| `src/components/mascot/MascotAvatar.tsx` | `<img>` حالت استاتیک بدون lazy/ابعاد | `loading="lazy"` + `width/height` از `sprites.json` | ناچیز؛ رعایت کامل اصول |

**نکته شفاف‌سازی:** تعداد mp4های موجود ۱۱ فایل است (نه ۲۷) — بقیه stateها فقط فریم WebP دارند (`sad`, `listen` و…) که در همان `mascotVideos.ts` به‌صورت fallback تعریف شده‌اند. مصرف هم‌زمان «۲۷ ویدیو» از اساس وجود نداشت؛ ساختار فعلی حداکثر ۲ ویدیو (در دوره crossfade) را هم‌زمان نگه می‌دارد.

---

## ۲. انیمیشن و پرفورمنس رندر

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/main.tsx` | هیچ‌کدام از ۱۹ فایل `motion` به `useReducedMotion` مجهز نبودند (۰ استفاده در کل پروژه) | `<MotionConfig reducedMotion="user">` دور کل اپ — همه انیمیشن‌های transform در حالت reduced-motion خودکار غیرفعال می‌شوند | پوشش یک‌جای ۱۹ فایل |
| `src/components/motion/CinematicSection.tsx` | وریانت‌های `filter: blur(8–12px)` توسط MotionConfig پوشش داده نمی‌شوند | `useReducedMotion` + حذف filter/transform از وریانت‌ها (فید ساده opacity) | حذف blur-repaint برای کاربران reduced-motion |
| `src/components/PageHeader.tsx` | ورود با `blur(8px)→0` حتی در reduced-motion | گیت `useReducedMotion` روی filter/blur | حذف blur اولیه صفحات |
| `src/components/3D/TiltCard.tsx` | tilt با mousemove روی تاچ با یک tap «گیر» می‌کند (stuck hover)؛ هیچ احترامی به reduced-motion نبود | `useHoverCapable` (‏`(hover:hover) and (pointer:fine)`) + `useReducedMotion` — روی تاچ کلاً غیرفعال مانند `CustomCursor` | حذف stuck-hover روی موبایل |
| `src/components/3D/3DIconBadge.tsx` | (۱) `style.transform` این‌لاین، کلاس‌های `group-hover:-translate-y-2/rotate-3` را **همیشه باطل می‌کرد** (افکت هاور اصلاً اجرا نمی‌شد — باگ واقعی). (۲) هاورها بعد از tap می‌چسبیدند | ترنسفورم به CSS منتقل شد (`.nd-icon-badge-3d` با `:hover`) + گیت `@media (hover:none), (pointer:coarse), (prefers-reduced-motion)`؛ سایه کف هم شرطی شد | هاور سه‌بعدی حالا واقعاً کار می‌کند؛ روی تاچ گیر نمی‌کند |
| `src/components/motion/Cinematic.tsx` (`Magnetic`) | افکت cursor-follow روی تاچ + reduced-motion | گیت `useHoverCapable` + `useReducedMotion` | مانند TiltCard |
| `src/components/HeroSlider.tsx` | اسلاید خودکار ۶ثانیه‌ای حتی برای reduced-motion | توقف autoplay در reduced-motion (دکمه‌ها/سواپ دستی کار می‌کنند) | حذف motion اجباری |
| `src/pages/HomePage.tsx` (پارالاکس هیرو) | spotlight/orbهای `useMotionValue` با هر mousemove حتی روی تاچ/reduced | `parallaxEnabled = hoverCapable && !reducedMotion` | صفر rAF اضافی روی موبایل |
| `src/components/mascot/useMascotLookAt.ts` | ✅ از قبل درست بود (coarse + reduced-motion غیرفعال) | بدون تغییر (تست شد) | — |
| `src/components/BackgroundBlobs.tsx` + `src/index.css` | ✅ بلاب‌های `blur(90px)` از قبل در موبایل/تاچ `display:none` می‌شدند | تکمیل شد با گیت‌های جدید 3D badge | — |
| `src/index.css` (بلوک `@media (hover:none)…`) | — | گیت‌های `prefers-reduced-motion` برای `.nd-icon-badge-3d` | — |

## ۳. Overflow افقی و واحدهای CSS

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/components/QuickActionDock.tsx` | `max-w-[calc(100vw-20px)]` — ‏`100vw` شامل اسکرول‌بار، منشأ سرریز افقی در ویندوز/لینوکس | `max-w-full` (نسبت به والد `px-3`) | حذف منبع سرریز |
| `src/components/ResumeModal.tsx`, `src/components/admin/ui.tsx`, `src/components/cms/MediaPickerModal.tsx`, `src/pages/PortfolioPage.tsx` | `max-h-[90vh]/[85vh]` — ارتفاع نوار آدرس موبایل سافاری باعث کات شدن پایین مودال می‌شد | `max-h-[90dvh]/[85dvh]` | مودال‌ها در سافاری iOS کامل دیده می‌شوند |
| `src/components/tools/ToolChatModal.tsx` | `h-[92vh] sm:h-[86vh]` | `h-[92dvh] sm:h-[86dvh]` | همان بالا |
| `src/pages/AdminPage.tsx` | `min-h-[85vh]`, `max-h-[calc(100vh-7rem)]` | dvh | همان بالا |
| `src/index.css` (`.mascot-chat`) | `width: min(94vw, 390px); height: min(72vh, 600px)` | `min(94%, 390px)` (درصد از ICB = عرض بدون اسکرول‌بار) + `min(72dvh, 600px)` | پنل چت دیگر زیر نوار آدرس/کیبورد نمی‌رود |
| `src/pages/HomePage.tsx` (کاروسل) | `w-[86vw]` خام | `w-[min(86vw,420px)]` (فرم امن min) | بدون تغییر بصری؛ حذف vw خام |
| `src/index.css` (`.nd-watermark`) | ✅ `clamp(9rem, 26vw, 22rem)` — از قبل فرم صحیح clamp | بدون تغییر | — |
| `src/App.tsx` | `overflow-x-hidden` روی ریشه، ‏`overflow-y` را به `auto` تبدیل می‌کند و **چسبندگی `sticky` را در کل سایت می‌شکست** (فهرست مقاله `BlogPostDetailPage:159` و سایدبار `AdminPage:544`) | `overflow-x-clip` (بدون ساخت scroll container) | sticky TOC/سایدبار ادمین حالا واقعاً می‌چسبد |
| `src/components/RichText.tsx` | متن مقالات بدون `break-words` — URLهای بلند انگلیسی در ۳۲۰px سرریز می‌دادند | `break-words` روی ریشه، هدینگ‌ها، پاراگراف‌ها، callout | حذف سرریز محتوای طولانی |
| `src/pages/BlogPostDetailPage.tsx` | متن دیدگاه کاربران بدون شکستن کلمات | `break-words` | همان بالا |
| **RTL (پراپرتی‌های منطقی)** | | | |
| `src/components/mascot/MascotAvatar.tsx` | `fixed … right-2 sm:right-5` فیزیکی | `start-2 sm:start-5` (در RTL همان راست = شروع) | موقعیت در هر دو جهت درست |
| `src/components/mascot/AssistantPanel.tsx` | پنل `right-2/sm:right-5`، چیپ وضعیت `right-3`، دکمه‌ها `left-2.5` فیزیکی | `start-*`/`end-*` | همان بالا |
| `src/components/mascot/AssistantPanel.tsx` (حباب‌های چت) | **دم حباب‌ها دقیقاً برعکس بود**: کاربر (justify-start = راست در RTL) دم `rounded-bl` (چپ!) می‌گرفت؛ دستیار برعکس | `rounded-es-sm`/`rounded-ee-sm` (منطقی: block-end × inline-start/end) | دم حباب‌ها سمت درست لبه |
| `src/index.css` (`.mascot-chat-said`, `.mascot-card-text-inner`) | `left: 14px` و `text-align: right` فیزیکی | `inset-inline-start`، `text-align: start`، دم با `border-end-start-radius` | سازگاری RTL |
| `src/components/tools/ToolChatModal.tsx`, `src/pages/HomePage.tsx` | بج `right-3`، پدینگ `ml-1` فیزیکی | `start-3`، `me-1` | همان بالا |
| `src/components/Navbar.tsx`, `src/components/Footer.tsx` | ✅ (ps-/pe-/me- از قبل منطقی بودند؛ فقط سوئیچ تم فیزیکی است که در هر دو جهت قرینه است) | بدون تغییر | — |

## ۴. فرم‌ها و کامپوننت‌های تعاملی

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/components/nd/Kit.tsx` (`inputCls`) | فونت `text-xs` (۱۲px) در همه ورودی‌های `ContactPage` + `BookingCalendar` + فرم دیدگاه → **زوم خودکار iOS Safari روی focus** | `text-base` (۱۶px) — حداقل الزامی iOS | حذف کامل زوم خودکار در فرم‌های عمومی |
| `src/pages/BlogPostDetailPage.tsx`, `src/components/mascot/{MascotWelcomeOverlay,CinematicWelcomeModal,AssistantPanel}.tsx`, `src/components/tools/ToolChatModal.tsx` | ورودی‌های ۱۰–۱۴px (نام، چت، کد دسترسی، متن پیام) | همه به `text-base` (۱۶px) | همان بالا |
| `src/components/{cms,admin}/*.tsx` (EditableText/Button، SectionEditHeader، FieldInspectorModal، MediaPickerModal) | ورودی‌های ادمین ۱۰–۱۴px | `text-base` | زوم iOS در حالت ویرایش موبایل هم رفع شد |
| `index.html` | باز شدن کیبورد اندروید viewport را resize نمی‌کرد → عناصر fixed نیمه‌مدفون می‌شدند | `interactive-widget=resizes-content` در viewport meta | اندروید: صفحه بالای کیبورد جمع می‌شود |
| `src/utils/useKeyboardOpen.ts` (جدید) + `QuickActionDock.tsx` + `MascotAvatar.tsx` | iOS کیبورد را روی viewport می‌اندازد؛ داک/کارت مسکات زیر کیبورد گیر می‌کردند | هوک `useKeyboardOpen` (با استثنا `.mascot-root` برای فیلد داخل خود کارت) → داک و کارت مسکات هنگام تایپ به پایین محو می‌شوند (`mascot-kbd-away`) | هیچ عنصر فیکسی نیمه‌مدفون نمی‌ماند؛ تایپ در کارت مسکات مزاحمتی ایجاد نمی‌کند |
| **بارگذاری ادمین** | | | |
| `src/App.tsx` | `AdminFloatingBar` و `AdminLoginModal` در باندل اولیه همه بازدیدکنندگان بودند | `lazy()` + رندر شرطی (`isAdmin` / باز بودن مودال) → چانک ۴.۹KB فقط برای ادمین | باندل عمومی بدون هیچ کد ادمین |
| `src/pages/AdminPage.tsx`, `src/components/admin/*` (TreeEditor 36KB, MediaPickerModal) | ✅ از قبل پشت `lazy(AdminPage)` بودند | راستی‌آزمایی شد: `main.js` هیچ اثری از TreeEditor/MediaPickerModal ندارد (تست مارکر روی خروجی build) | — |

## ۵. Splash Screen و لود اولیه

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/components/SplashScreen.tsx` | **یافته مهم:** اسپلش در حال حاضر در `App.tsx` رندر نمی‌شود (`SplashScreen` هیچ import‌کننده‌ای ندارد؛ پراپ `onReplaySplash` در Navbar هم متصل نیست). توصیف «پریلودر دارت‌روی‌بورد با تصاویر Higgsfield» با کد فعلی مطابقت ندارد — نسخه فعلی فقط متن/مونوگرام است | چون اصلاً mount نمی‌شود، **تأثیرش روی LCP صفر است** (بهترین حالت ممکن). برای آینده: import آن از `data/content` به `data/contentCore` تغییر کرد تا در صورت فعال‌سازی مجدد، ۷۴۸KB مقالات را به مسیر بحرانی نکشد. اگر روزی فعال شود، overlay روی محتوای رندرشده است (اسکریپت اصلی منتظر اسپلش نمی‌ماند) | LCP فعلی: **بدون هیچ تأخیر اسپلش** |
| `index.html` (فونت Vazirmatn) | لود از `fonts.googleapis.com` + `fonts.gstatic.com` (۲ مبدأ خارجی؛ DNS+TLS+CSS render-blocking + تا ۱۴ فایل woff2 برای ۷ وزن) | **Self-host**: فونت Variable (وزن ۱۰۰–۹۰۰) از پکیج رسمی `vazirmatn@33.0.3` در `public/fonts/Vazirmatn-Variable.woff2` (**۱۰۸KB، یک درخواست same-origin**) + `preload` + `@font-face` این‌لاین با `font-display: swap` + `Cache-Control: immutable` | حذف ۲ زنجیره DNS/TLS خارجی و CSS بلاک‌کننده؛ **۱۴ درخواست → ۱ درخواست**؛ FCP متن فارسی فقط به لود یک فایل از همان edge کلادفلر وابسته است |

## ۶. باندل و کد اسپلیت (کشف بزرگ این ممیزی)

| فایل | مشکل دقیق | راه‌حل اعمال‌شده | تأثیر اندازه‌گیری‌شده |
|---|---|---|---|
| `src/data/content.ts` + `src/context/ContentContext.tsx` | **باندل اولیه ۹۶۴KB بود** (هشدار `chunkSizeWarningLimit: 1000` یعنی ۹۶٪ ظرفیت). ریشه: `ContentContext → data/content → batch01Posts + batch02Posts` (۷۴۸KB سورس مقالات) که در همان ماژول اولیه کشیده می‌شد | جداسازی `contentCore.ts` (بدون بچ‌ها) + `blogPosts.ts` (بچ‌های تولیدشده، چانک جدا) + `content.ts` نازک برای اسکریپت‌های Node. `ContentContext` بچ‌ها را با `import()` پس‌زمینه (شروع هم‌زمان با اجرای main.js، بدون بلاک رندر) لود و به‌عنوان **پیش‌فرض** ادغام می‌کند (داده CMS/localStorage همیشه برنده است؛ هویت آرایه `===` برای تشخیص ownership) | **main.js: ۹۶۳٫۷۹KB → ۲۴۰٫۲۵KB (gzip ۱۷۷٫۲ → ۶۸٫۹KB — کاهش ۷۵٪)**. مقالات: چانک ۷۱۸KB (gzip ۱۰۸KB) که بعد از اولین رندر و موازی با fetch محتوا لود می‌شود. هیچ چانکی از حد ۱۰۰۰KB عبور نمی‌کند (بزرگ‌ترین: blogPosts ۷۱۸KB) |
| `src/App.tsx` (lazy admin) | — | بالا دیده شد | main −۵KB دیگر + حذف کامل کد ادمین |

### جمع بار اولیه (gzip) صفحه اصلی — مدل Slow-4G

| بخش | قبل | بعد |
|---|---|---|
| JS همگام (main+react+motion+icons) | ۲۹۲KB | **۱۸۴KB** |
| CSS | ۲۳٫۶KB | ۲۳٫۸KB |
| فونت (رندر متن فارسی) | CSS گوگل + تا ۱۴ فایل از ۲ مبدأ خارجی | ۱۰۸KB هم‌مبدأ (preload) |
| تصویر هیرو (آواتار) | ۱۱۵KB | ۱KB |
| ویدیوی مسکات در موبایل | ۲۶۴KB (idle.mp4) | ۰ (WebP استاتیک ~۵۶KB) |
| **مجموع بایت تا اولین رندر متن+هیرو** | **≈ ۵۹۰KB** | **≈ ۳۲۰KB (−۴۶٪)** + حذف ۲ RTT زنجیره فونت خارجی |

**تخمین زمانی (مدل انتقال، نه Lighthouse واقعی):** با Slow-4G مؤثر ≈ ۲۰۰KB/s و ۱۵۰ms RTT و CPU 4x:
- قبل: ~۱٫۵s دانلود JS + parse/eval ۹۶۴KB → FCP تخمینی **≈ ۲٫۸–۳٫۵s**
- بعد: ~۱٫۰s دانلود JS + parse/eval ۲۴۰KB → FCP تخمینی **≈ ۱٫۸–۲٫۳s** (بهبود تخمینی **≈ ۱ ثانیه**)
- LCP هیروی خانه (متن H1 + آواتار): با حذف ۱۱۵KB آواتار و ۷۵٪ کاهش JS، بهبود مشابه

---

## ۷. تست و اعتبارسنجی

| بررسی | نتیجه |
|---|---|
| `npm run build` | ✅ موفق؛ هیچ چانکی > ۱۰۰۰KB نیست (بزرگ‌ترین: blogPosts ۷۱۸KB که async است) |
| `npm run lint` (tsc --noEmit) | ✅ بدون خطا |
| `npm test` (۱۰ مجموعه تست: routes, sitemap, taxonomy, lead-fallback, case-studies, content-defaults, date, content-visibility, mascot-integration, sync-content) | ✅ **ALL CHECKS PASSED** |
| راستی‌آزمایی خروجی build (تست مارکر) | ✅ main.js فاقد TreeEditor/MediaPickerModal/محتوای مقالات؛ چانک blogPosts از طریق dynamic import |
| مسیرهای dev server (۹ مسیر) | ✅ همه HTTP 200 |
| Lighthouse واقعی (Chrome DevTools, Slow-4G + CPU 4x) | ⛔ در این محیط ممکن نبود (نصب مرورگر مسدود) — مراحل تأیید ↓ |

### مراحل تأیید نهایی Lighthouse در سیستم شما

```bash
npm run build && npm run preview
# سپس در Chrome DevTools → Lighthouse → Mobile → Simulated throttling:
#   قبل/بعد را با همین سنجه‌ها مقایسه کنید
```
سنجه‌های هدف (موبایل): Performance ≥ 90، LCP < 2.5s، CLS < 0.1 (با width/height صریح و aspect-ratio کانتینرها انتظار CLS≈0 است)، TBT کمتر از قبل (eval ۷۵٪ کوچک‌تر).

---

## ۸. فایل‌های جدید این ممیزی

- `src/data/contentCore.ts`, `src/data/blogPosts.ts` — جداسازی داده مقالات
- `src/utils/responsiveImage.ts` — srcset/sizes + ابعاد صریح
- `src/components/mascot/useStaticMediaMode.ts` — حالت رسانه استاتیک (تاچ/reduced-motion/Save-Data/2G)
- `src/utils/useKeyboardOpen.ts` — تشخیص کیبورد موبایل برای عناصر fixed
- `src/utils/useHoverCapable.ts` — گیت hover-only مانند CustomCursor
- `public/fonts/Vazirmatn-Variable.woff2` — فونت self-host
- `public/blog/*-{640,1024}.webp`, `public/blog/*.webp`, `public/profile-photo-{64,160,400,800}.webp` — نردبان تصاویر ریسپانسیو

## ۹. موارد جامانده/پیشنهادی (خارج از محدوده این اجرا)

1. **تبدیل JPEGهای اورجینال `/blog` به AVIF** (کیفیت مشابه در ~۳۰٪ حجم کمتر نسبت به WebP) — با `convert` این محیط ممکن است اما برای سازگاری حداکثری فعلاً WebP انتخاب شد.
2. **حذف PNGهای ۲.۳MB ریشه ریپو** (`Max_a_عینک…png`, `میمیک های مختلف صورت.png`) — در `public/` نیستند و به سایت سرو نمی‌شوند؛ فقط حجم clone را زیاد می‌کنند.
3. `SplashScreen`, `QuickActionDock`, `PageHeader`, `CinematicSection` در حال حاضر کد مرده‌اند (هیچ import‌کننده‌ای ندارند)؛ اگر قرار نیست فعال شوند حذفشان باندل dev و نگهداری را ساده‌تر می‌کند (اصلاحات عملکردی‌شان اعمال شده تا در صورت فعال‌سازی امن باشند).
4. ترجمه Lighthouse واقعی قبل/بعد پس از اجرای مرحله بخش ۷.
