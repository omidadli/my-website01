/**
 * lib/payment/iosBridge.ts — Standalone iOS < 16 (iPhone X / iOS 12–16+) Web App (PWA)
 * & Apple Shortcuts / Back-Tap / Cloud-Email Bridge UI.
 *
 * Engineered specifically for older Mobile Safari / WebKit on iPhone X (iOS 13, 14, 15):
 *  - Pure #hex / rgba() CSS (zero oklch() or color-mix() which require iOS 16.4+)
 *  - Pure ES5/ES6 inline script (zero `?.`, `??`, or `replaceAll` which break < iOS 13.4)
 *  - 16px form inputs so Mobile Safari never forces viewport zoom on tap
 *  - Full iPhone X OLED safe-area insets (Notch + Home Indicator)
 *  - Standalone `apple-mobile-web-app-capable="yes"` Home Screen WebClip + Service Worker
 */

export const renderIosBridgeIconSvg = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071318"/>
      <stop offset="100%" stop-color="#0B172A"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>
  <rect width="180" height="180" rx="40" fill="url(#bg)"/>
  <circle cx="90" cy="90" r="64" fill="#10B981" fill-opacity="0.14"/>
  <path d="M98 34 L54 94 L84 94 L76 146 L126 84 L95 84 Z" fill="url(#bolt)"/>
</svg>`;

export const renderIosBridgeManifest = (origin: string): string =>
  JSON.stringify(
    {
      name: 'درگاه پیامکی امید عدلی (iPhone Bridge)',
      short_name: 'درگاه پیامکی',
      description: 'وب‌اپلیکیشن اختصاصی آیفون برای دریافت و تایید آنی پیامک‌های واریز بانکی',
      start_url: `${origin}/sms-bridge`,
      scope: `${origin}/sms-bridge`,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#070B14',
      theme_color: '#070B14',
      dir: 'rtl',
      lang: 'fa-IR',
      icons: [
        {
          src: `${origin}/sms-bridge/icon.svg`,
          sizes: '180x180 512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        },
      ],
    },
    null,
    2
  );

export const renderIosBridgeServiceWorker = (): string => `/* iOS 12-16 Compatible Service Worker for /sms-bridge */
var CACHE_NAME = 'omidpay-ios-bridge-v1';
var SHELL_URLS = ['/sms-bridge', '/sms-bridge/manifest.webmanifest', '/sms-bridge/icon.svg'];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_URLS).catch(function() {});
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET' || req.url.indexOf('/api/payment/') !== -1) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        return res;
      })
      .catch(function() {
        return caches.match(req).then(function(cached) {
          return cached || caches.match('/sms-bridge');
        });
      })
  );
});
`;

export const renderIosSmsBridgeHtml = (origin: string): string => {
  const safeOrigin = String(origin || '').replace(/\/+$/, '');
  const iconDataUri =
    'data:image/svg+xml;utf8,' + encodeURIComponent(renderIosBridgeIconSvg());

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <title>درگاه پیامکی آیفون | امید عدلی</title>

  <!-- iOS Full-Screen Home Screen Web App (iOS 11 / 12 / 13 / 14 / 15 / 16+) -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="درگاه پیامکی" />
  <meta name="theme-color" content="#070B14" />
  <link rel="manifest" href="/sms-bridge/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="${iconDataUri}" />
  <link rel="icon" type="image/svg+xml" href="/sms-bridge/icon.svg" />

  <style>
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #070B14;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      line-height: 1.6;
      min-height: 100%;
      overscroll-behavior-y: none;
    }
    .app-wrap {
      max-width: 520px;
      margin: 0 auto;
      padding-top: 16px;
      padding-top: calc(env(safe-area-inset-top, 20px) + 12px);
      padding-bottom: 96px;
      padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 88px);
      padding-left: 16px;
      padding-right: 16px;
    }
    .card {
      background-color: #111827;
      border: 1px solid #1F2937;
      border-radius: 20px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .card-emerald {
      background: linear-gradient(135deg, #06281E 0%, #0F172A 100%);
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .card-amber {
      background-color: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .card-indigo {
      background: linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%);
      border: 1px solid rgba(99, 102, 241, 0.4);
    }
    .row-between {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .badge-ok { background-color: rgba(16, 185, 129, 0.18); color: #34D399; }
    .badge-warn { background-color: rgba(245, 158, 11, 0.18); color: #FBBF24; }
    .badge-err { background-color: rgba(239, 68, 68, 0.18); color: #F87171; }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-ok { background-color: #10B981; box-shadow: 0 0 8px #10B981; }
    .dot-warn { background-color: #F59E0B; }
    h1 { font-size: 17px; margin: 0; font-weight: 800; }
    h2 { font-size: 15px; margin: 0 0 8px 0; font-weight: 800; color: #F1F5F9; }
    p { margin: 6px 0; font-size: 13px; color: #94A3B8; }
    /* IMPORTANT: 16px prevents iOS < 16 Safari auto-zoom on focus! */
    input, textarea {
      width: 100%;
      background-color: #090D16;
      color: #FFFFFF;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 16px !important;
      font-family: inherit;
      outline: none;
      -webkit-appearance: none;
    }
    input:focus, textarea:focus {
      border-color: #10B981;
    }
    .ltr {
      direction: ltr;
      text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .pair-input {
      text-align: center;
      letter-spacing: 8px;
      font-size: 24px !important;
      font-weight: 800;
      padding: 14px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      border: none;
      border-radius: 14px;
      padding: 13px 16px;
      font-size: 14px;
      font-weight: 800;
      font-family: inherit;
      cursor: pointer;
      color: #FFFFFF;
      background-color: #10B981;
      transition: opacity 0.15s;
    }
    .btn:active { opacity: 0.78; }
    .btn-indigo { background-color: #4F46E5; }
    .btn-slate { background-color: #1E293B; border: 1px solid #334155; color: #E2E8F0; }
    .btn-amber { background-color: #D97706; color: #FFFFFF; }
    .btn-sm { padding: 9px 12px; font-size: 12px; border-radius: 11px; width: auto; }
    .grid-2 {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    .grid-2 > * { flex: 1; }
    .stat-box {
      background-color: rgba(255, 255, 255, 0.04);
      border-radius: 14px;
      padding: 10px 12px;
      text-align: center;
    }
    .stat-val { font-size: 18px; font-weight: 900; color: #34D399; }
    .stat-lbl { font-size: 11px; color: #94A3B8; }
    .order-item {
      background-color: #090D16;
      border: 1px solid rgba(245, 158, 11, 0.38);
      border-radius: 16px;
      padding: 14px;
      margin-top: 10px;
    }
    .amount-big {
      font-size: 19px;
      font-weight: 900;
      color: #34D399;
      margin: 4px 0;
    }
    .step-box {
      background-color: #090D16;
      border: 1px solid #1E293B;
      border-radius: 14px;
      padding: 12px;
      margin-top: 10px;
      font-size: 12.5px;
      color: #CBD5E1;
    }
    .step-num {
      display: inline-block;
      background-color: #4F46E5;
      color: #FFF;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      border-radius: 50%;
      font-weight: 800;
      font-size: 12px;
      margin-left: 6px;
    }
    .code-block {
      background-color: #05080F;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 10px;
      font-size: 11.5px;
      word-break: break-all;
      color: #6EE7B7;
      margin: 8px 0;
    }
    .log-item {
      border-bottom: 1px solid #1E293B;
      padding: 9px 0;
      font-size: 12px;
    }
    .log-item:last-child { border-bottom: none; }
    .toast {
      position: fixed;
      top: calc(env(safe-area-inset-top, 16px) + 12px);
      left: 16px;
      right: 16px;
      max-width: 488px;
      margin: 0 auto;
      background-color: #065F46;
      border: 1px solid #34D399;
      color: #FFFFFF;
      padding: 12px 16px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 700;
      z-index: 999;
      display: none;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    }
    .tabbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: rgba(11, 17, 30, 0.94);
      -webkit-backdrop-filter: blur(18px);
      backdrop-filter: blur(18px);
      border-top: 1px solid #1E293B;
      display: flex;
      justify-content: space-around;
      padding-top: 8px;
      padding-bottom: 10px;
      padding-bottom: calc(env(safe-area-inset-bottom, 12px) + 6px);
      z-index: 900;
    }
    .tab-btn {
      background: none;
      border: none;
      color: #64748B;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      cursor: pointer;
      padding: 4px 10px;
    }
    .tab-btn.active { color: #34D399; }
    .tab-ico { font-size: 19px; line-height: 1; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>

  <div class="app-wrap">
    <!-- Top Status Header -->
    <div class="card card-emerald">
      <div class="row-between">
        <h1>⚡ درگاه پیامکی آیفون</h1>
        <span id="connBadge" class="badge badge-warn">
          <span id="connDot" class="dot dot-warn"></span>
          <span id="connText">نیازمند اتصال</span>
        </span>
      </div>
      <p id="deviceSub" style="margin-top:6px;color:#A7F3D0;font-size:12px;">
        بهینه‌شده برای iPhone X و iOS 13 / 14 / 15+
      </p>
      <div class="grid-2">
        <div class="stat-box">
          <div id="statPending" class="stat-val">۰</div>
          <div class="stat-lbl">فاکتور منتظر واریز</div>
        </div>
        <div class="stat-box">
          <div id="statMatched" class="stat-val">۰</div>
          <div class="stat-lbl">واریز تاییدشده</div>
        </div>
      </div>
    </div>

    <!-- Install to Home Screen Hint (only shown in regular Safari, hidden once opened from Home Screen) -->
    <div id="installHint" class="card card-amber hidden">
      <div style="font-size:13px;font-weight:800;color:#FDE68A;">📲 نصب به‌صورت اپلیکیشن روی صفحه اصلی آیفون X:</div>
      <p style="color:#FEF3C7;font-size:12px;margin-top:4px;">
        در نوار پایین سافاری دکمه <b>Share (⬆️)</b> را بزنید و گزینه <b>Add to Home Screen (افزودن به صفحه اصلی)</b> را انتخاب کنید تا مثل اپ بومی تمام‌صفحه روی آیفون شما نصب شود؛ سپس کد ۶ رقمی اتصال را داخل آن وارد کنید.
      </p>
    </div>

    <!-- ================= TAB 1: LIVE RADAR & INSTANT SMS MATCH ================= -->
    <div id="tab-radar">
      <!-- Unpaired Prompt -->
      <div id="unpairedNotice" class="card card-indigo hidden">
        <h2>🔑 ابتدا آیفون خود را متصل کنید</h2>
        <p style="color:#C7D2FE;">
          در پنل ادمین سایت (بخش درگاه کارت‌به‌کارت خودکار ← گوشی‌ها) یک توکن جدید بسازید و <b>کد ۶ رقمی اتصال آیفون</b> را در تب «⚙️ اتصال گوشی» وارد کنید.
        </p>
        <button type="button" class="btn btn-indigo" onclick="switchTab('settings')" style="margin-top:10px;">
          ورود کد ۶ رقمی اتصال آیفون ←
        </button>
      </div>

      <!-- Instant Clipboard / Auto-Paste Box -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 style="margin:0;">📩 تطبیق فوری پیامک بانک</h2>
          <span id="queueBadge" class="badge badge-warn hidden">صف آفلاین: ۰</span>
        </div>
        <p style="margin-bottom:10px;">
          پیامک بانک را کپی کنید و دکمه سبز زیر را بزنید (یا در کادر زیر Paste کنید تا <b>به‌صورت خودکار بدون دکمه</b> بررسی و تایید شود):
        </p>
        <button type="button" id="btnClipboard" class="btn" onclick="readClipboardAndSend()">
          📋 خواندن خودکار پیامک از کلیپ‌بورد و تطبیق
        </button>
        <div style="margin-top:10px;">
          <textarea
            id="smsBox"
            rows="3"
            placeholder="یا پیامک بانک را اینجا Paste کنید (به‌محض الصاق، خودکار ارسال می‌شود)..."
          ></textarea>
        </div>
        <div class="grid-2">
          <button type="button" class="btn btn-slate" onclick="submitBoxSms()">ارسال دستی متن بالا</button>
          <button type="button" class="btn btn-slate" onclick="pollServer(true)">🔄 بروزرسانی زنده</button>
        </div>
        <p style="font-size:11px;color:#64748B;margin-top:8px;">
          🔒 حفاظت حریم خصوصی روی خود آیفون: پیامک‌های حاوی «رمز پویا / کد تأیید» مستقیماً روی گوشی مسدود می‌شوند و هرگز به سرور فرستاده نمی‌شوند.
        </p>
      </div>

      <!-- Live Pending Orders Radar -->
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0;">📡 رادار زنده مشتریان در انتظار واریز</h2>
          <button type="button" id="soundBtn" class="btn btn-slate btn-sm" onclick="toggleSound()">🔔 صدا: روشن</button>
        </div>
        <div id="pendingList" style="margin-top:8px;">
          <p style="text-align:center;padding:14px 0;">در حال حاضر فاکتور بازی در انتظار پرداخت نیست.</p>
        </div>
      </div>
    </div>

    <!-- ================= TAB 2: iOS < 16 SHORTCUTS & ZERO-TAP AUTOMATION ================= -->
    <div id="tab-automation" class="hidden">
      <div class="card card-indigo">
        <h2>⚡ اتصال خودکار به پیامک‌های آیفون X (مخصوص iOS زیر ۱۶)</h2>
        <p style="color:#E0E7FF;">
          در سیستم‌عامل iOS اپل اجازه خواندن مستقیم صندوق پیامک را به مرورگر سافاری نمی‌دهد، اما اپلیکیشن پیش‌فرض <b>Shortcuts (میانبرها)</b> روی آیفون X شما دسترسی مستقیم سیستمی به پیامک‌های دریافتی دارد!
        </p>
        <p style="color:#A7F3D0;font-weight:700;">
          ما یک آدرس ویژه بدون نیاز به هدر و JSON طراحی کرده‌ایم که در iOS 13 / 14 / 15 فقط با ۲ بلوک ساده کار می‌کند:
        </p>
        <div id="shortcutUrlBox" class="code-block ltr">ابتدا گوشی را در تب تنظیمات متصل کنید</div>
        <button type="button" class="btn" onclick="copyShortcutUrl()">
          📋 کپی آدرس اختصاصی میانبر آیفون
        </button>
      </div>

      <div class="card">
        <h2>گام‌به‌گام ساخت اتوماسیون پیامک در iOS 14 و iOS 15</h2>

        <div class="step-box">
          <span class="step-num">۱</span>
          برنامه پیش‌فرض <b>Shortcuts (میانبرها)</b> آیفون را باز کنید، از پایین تب وسط <b>Automation (اتوماسیون)</b> را بزنید و <b>Create Personal Automation</b> را انتخاب کنید.
        </div>

        <div class="step-box">
          <span class="step-num">۲</span>
          گزینه <b>Message (پیام)</b> را انتخاب کنید. در بخش <b>Message Contains (پیام حاوی)</b> کلمه <b>واریز</b> (یا سرشماره بانک خود در بخش Sender) را وارد کنید و <b>Next</b> را بزنید.
        </div>

        <div class="step-box">
          <span class="step-num">۳</span>
          دکمه <b>Add Action</b> را بزنید، عبارت <b>URL Encode</b> (کدگذاری URL) را جستجو و اضافه کنید. روی متغیر ورودی آن بزنید و <b>Shortcut Input (ورودی میانبر)</b> را انتخاب کنید.
        </div>

        <div class="step-box">
          <span class="step-num">۴</span>
          دوباره <b>+</b> را بزنید و اکشن <b>Get Contents of URL (دریافت محتوای URL)</b> را اضافه کنید. آدرس کپی‌شده از کادر بالا را Paste کنید و دقیقاً در انتهای آن (بعد از <code class="ltr">text=</code>) متغیر <b>URL Encoded Text</b> را قرار دهید و <b>Done</b> را بزنید!
        </div>

        <div class="step-box" style="border-color:rgba(16,185,129,0.4);">
          <b style="color:#34D399;">💡 نحوه عملکرد در iOS زیر ۱۶ + ۳ ترفند طلایی آیفون X:</b>
          <br/>• <b>حالت استاندارد iOS 14/15:</b> به‌محض رسیدن پیامک بانک، بنر میانبر بالای صفحه آیفون ظاهر می‌شود و با <b>یک لمس روی Run (اجرا)</b> (حتی روی صفحه قفل!) پیامک در نیم‌ثانیه تطبیق و اشتراک مشتری تحویل می‌شود.
          <br/>• <b>ترفند ضربه به پشت آیفون X (Back Tap):</b> یک میانبر عادی با ۳ اکشن (<code class="ltr">Get Clipboard -> URL Encode -> Get Contents of URL</code>) بسازید و در <code class="ltr">Settings -> Accessibility -> Touch -> Back Tap -> Double Tap</code> به دو ضربه پشت گوشی وصل کنید!
          <br/>• <b>اگر آیفون X شما جیلبریک است (iOS 14/15):</b> نصب توییک رایگان <b>Truecuts</b> گزینه <code class="ltr">Ask Before Running</code> را خاموش می‌کند تا ۱۰۰٪ خودکار و بدون حتی یک لمس اجرا شود!
        </div>
      </div>

      <!-- 100% Zero-Tap Cloud Bank Email Bridge -->
      <div class="card">
        <h2>☁️ روش مکمل ۱۰۰٪ بدون لمس (حتی وقتی آیفون خاموش است!)</h2>
        <p>
          اگر ایمیل اطلاع‌رسانی واریز بانک (سامان، ملت، پاسارگاد، بلوبانک، پارسیان و...) را روی جیمیل خود فعال کنید، اسکریپت رایگان زیر در فضای ابری گوگل هر ۱ دقیقه ایمیل‌های واریز بانک را به همین درگاه می‌فرستد (کاملاً خودکار ۲۴ ساعته):
        </p>
        <button type="button" class="btn btn-slate" onclick="copyGmailScript()">
          📋 کپی اسکریپت آماده Google Apps Script
        </button>
      </div>
    </div>

    <!-- ================= TAB 3: SMS & MATCH LOGS ================= -->
    <div id="tab-logs" class="hidden">
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0;">📜 آخرین پیامک‌ها و تطبیق‌ها</h2>
          <button type="button" class="btn btn-slate btn-sm" onclick="pollServer(true)">بروزرسانی</button>
        </div>
        <div id="logsContainer" style="margin-top:10px;">
          <p>هنوز گزارشی ثبت نشده است.</p>
        </div>
      </div>
    </div>

    <!-- ================= TAB 4: PAIRING & SETTINGS ================= -->
    <div id="tab-settings" class="hidden">
      <div class="card card-indigo">
        <h2>🔢 اتصال سریع آیفون با کد ۶ رقمی</h2>
        <p style="color:#E0E7FF;">
          کد ۶ رقمی نمایش‌داده‌شده در پنل مدیریت سایت (بخش درگاه کارت‌به‌کارت خودکار ← گوشی‌ها) را وارد کنید:
        </p>
        <input
          type="tel"
          id="pairCodeInput"
          maxlength="6"
          class="ltr pair-input"
          placeholder="------"
        />
        <button type="button" class="btn" style="margin-top:10px;" onclick="submitPairCode()">
          ✅ تایید کد ۶ رقمی و اتصال آیفون
        </button>
      </div>

      <div class="card">
        <h2>⚙️ تنظیم دستی توکن (پیشرفته)</h2>
        <p>در صورت تمایل می‌توانید مستقیماً توکن دستگاه (<code class="ltr">omid_dev_...</code>) یا رشته JSON کپی‌شده از پنل ادمین را وارد کنید:</p>
        <input
          type="text"
          id="manualTokenInput"
          class="ltr"
          placeholder="omid_dev_..."
          style="margin-top:6px;"
        />
        <div class="grid-2">
          <button type="button" class="btn btn-indigo" onclick="saveManualToken()">ذخیره توکن و تست اتصال</button>
          <button type="button" class="btn btn-slate" onclick="clearDeviceConfig()">قطع اتصال گوشی</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Native-style iOS Bottom Tab Bar -->
  <div class="tabbar">
    <button type="button" id="nav-radar" class="tab-btn active" onclick="switchTab('radar')">
      <span class="tab-ico">📡</span>
      <span>رادار و تایید</span>
    </button>
    <button type="button" id="nav-automation" class="tab-btn" onclick="switchTab('automation')">
      <span class="tab-ico">⚡</span>
      <span>خودکارسازی iOS</span>
    </button>
    <button type="button" id="nav-logs" class="tab-btn" onclick="switchTab('logs')">
      <span class="tab-ico">📜</span>
      <span>گزارش‌ها</span>
    </button>
    <button type="button" id="nav-settings" class="tab-btn" onclick="switchTab('settings')">
      <span class="tab-ico">⚙️</span>
      <span>اتصال گوشی</span>
    </button>
  </div>

  <script>
    (function() {
      var ORIGIN = ${JSON.stringify(safeOrigin)} || (window.location.protocol + '//' + window.location.host);
      var TOKEN_KEY = 'omidpay_ios_device_token';
      var NAME_KEY = 'omidpay_ios_device_name';
      var QUEUE_KEY = 'omidpay_ios_offline_queue';
      var SOUND_KEY = 'omidpay_ios_sound_on';

      var OTP_WORDS = ['رمز پویا', 'رمز دوم', 'کد تایید', 'کد تأیید', 'کد ورود', 'کد فعالسازی', 'otp', 'verification code'];
      var knownPendingIds = {};
      var audioCtx = null;

      function byId(id) { return document.getElementById(id); }

      function toFa(val) {
        var fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(val === undefined || val === null ? '' : val).replace(/[0-9]/g, function(d) {
          return fa[Number(d)] || d;
        });
      }

      function toEnDigits(str) {
        return String(str || '')
          .replace(/[۰-۹]/g, function(d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
          .replace(/[٠-٩]/g, function(d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
      }

      function fmtComma(num) {
        var s = String(Math.floor(Number(num) || 0));
        return toFa(s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, '٬'));
      }

      function escHtml(s) {
        return String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function showToast(msg, isErr) {
        var el = byId('toast');
        if (!el) return;
        el.style.backgroundColor = isErr ? '#7F1D1D' : '#065F46';
        el.style.borderColor = isErr ? '#F87171' : '#34D399';
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 3600);
      }

      function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
      }

      function setToken(tok, name) {
        try {
          if (tok) {
            localStorage.setItem(TOKEN_KEY, tok);
            if (name) localStorage.setItem(NAME_KEY, name);
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(NAME_KEY);
          }
        } catch (e) {}
        updateShortcutUrlDisplay();
      }

      function isOtpSms(text) {
        var norm = toEnDigits(text).toLowerCase();
        for (var i = 0; i < OTP_WORDS.length; i++) {
          if (norm.indexOf(OTP_WORDS[i]) !== -1) return true;
        }
        return false;
      }

      function getQueue() {
        try {
          var raw = localStorage.getItem(QUEUE_KEY);
          var arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
      }

      function saveQueue(arr) {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr.slice(-30))); } catch (e) {}
        renderQueueBadge();
      }

      function renderQueueBadge() {
        var q = getQueue();
        var b = byId('queueBadge');
        if (!b) return;
        if (q.length > 0) {
          b.textContent = 'صف آفلاین: ' + toFa(q.length);
          b.className = 'badge badge-warn';
        } else {
          b.className = 'badge badge-warn hidden';
        }
      }

      function isSoundOn() {
        try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; }
      }

      window.toggleSound = function() {
        var next = !isSoundOn();
        try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch (e) {}
        byId('soundBtn').textContent = next ? '🔔 صدا: روشن' : '🔕 صدا: خاموش';
        if (next) playChime();
      };

      function playChime() {
        if (!isSoundOn()) return;
        try {
          var Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          if (!audioCtx) audioCtx = new Ctx();
          if (audioCtx.state === 'suspended') audioCtx.resume();
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          osc.frequency.setValueAtTime(1174, audioCtx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.46);
        } catch (e) {}
      }

      window.switchTab = function(tab) {
        var tabs = ['radar', 'automation', 'logs', 'settings'];
        for (var i = 0; i < tabs.length; i++) {
          var t = tabs[i];
          var panel = byId('tab-' + t);
          var nav = byId('nav-' + t);
          if (panel) panel.className = (t === tab) ? '' : 'hidden';
          if (nav) nav.className = (t === tab) ? 'tab-btn active' : 'tab-btn';
        }
      };

      function copyToClipboard(text, okMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            showToast(okMsg || 'در کلیپ‌بورد آیفون کپی شد ✅');
          }).catch(function() { fallbackCopy(text, okMsg); });
        } else {
          fallbackCopy(text, okMsg);
        }
      }

      function fallbackCopy(text, okMsg) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          showToast(okMsg || 'کپی شد ✅');
        } catch (e) {
          showToast('متن را نگه‌دارید و Copy را بزنید.', true);
        }
        document.body.removeChild(ta);
      }

      function apiJson(method, path, bodyObj, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, ORIGIN + path, true);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        var tok = getToken();
        if (tok) xhr.setRequestHeader('X-Device-Token', tok);
        xhr.timeout = 15000;
        xhr.onreadystatechange = function() {
          if (xhr.readyState !== 4) return;
          var parsed = null;
          try { parsed = JSON.parse(xhr.responseText || '{}'); } catch (e) { parsed = null; }
          cb(xhr.status, parsed);
        };
        xhr.onerror = function() { cb(0, null); };
        xhr.ontimeout = function() { cb(0, null); };
        xhr.send(bodyObj ? JSON.stringify(bodyObj) : null);
      }

      function updateShortcutUrlDisplay() {
        var tok = getToken();
        var box = byId('shortcutUrlBox');
        var manual = byId('manualTokenInput');
        if (manual && tok) manual.value = tok;
        if (!box) return;
        if (!tok) {
          box.textContent = 'ابتدا در تب «⚙️ اتصال گوشی» کد ۶ رقمی را وارد کنید.';
          byId('unpairedNotice').className = 'card card-indigo';
        } else {
          box.textContent = ORIGIN + '/api/payment/ios/sms?token=' + encodeURIComponent(tok) + '&text=';
          byId('unpairedNotice').className = 'card card-indigo hidden';
        }
      }

      window.copyShortcutUrl = function() {
        var tok = getToken();
        if (!tok) {
          showToast('ابتدا گوشی را در تب تنظیمات متصل کنید.', true);
          switchTab('settings');
          return;
        }
        var url = ORIGIN + '/api/payment/ios/sms?token=' + encodeURIComponent(tok) + '&text=';
        copyToClipboard(url, 'آدرس میانبر iOS کپی شد ✅');
      };

      window.copyGmailScript = function() {
        var tok = getToken() || 'YOUR_DEVICE_TOKEN';
        var endpoint = ORIGIN + '/api/payment/ios/sms?token=' + tok;
        var script = [
          '// Google Apps Script — ارسال خودکار ۲۴ ساعته ایمیل‌های واریز بانک به درگاه سایت',
          '// در script.google.com یک پروژه جدید بسازید و Trigger زمانی هر 1 دقیقه روی checkBankEmails بگذارید.',
          'function checkBankEmails() {',
          '  var threads = GmailApp.search(\\'is:unread ("واریز" OR "بستانکار" OR "بلوبانک") newer_than:1d\\', 0, 10);',
          '  for (var i = 0; i < threads.length; i++) {',
          '    var msgs = threads[i].getMessages();',
          '    for (var j = 0; j < msgs.length; j++) {',
          '      if (!msgs[j].isUnread()) continue;',
          '      var body = msgs[j].getPlainBody() || msgs[j].getSubject();',
          '      UrlFetchApp.fetch(\\'' + endpoint + '\\', {',
          '        method: \\'post\\',',
          '        contentType: \\'text/plain; charset=utf-8\\',',
          '        payload: body',
          '      });',
          '      msgs[j].markRead();',
          '    }',
          '  }',
          '}'
        ].join('\\n');
        copyToClipboard(script, 'کد Google Apps Script کپی شد ✅');
      };

      window.submitPairCode = function() {
        var raw = toEnDigits(byId('pairCodeInput').value || '').replace(/\\D/g, '');
        if (raw.length !== 6) {
          showToast('کد اتصال باید دقیقاً ۶ رقم باشد.', true);
          return;
        }
        apiJson('POST', '/api/payment/ios/pair', { code: raw, deviceModel: navigator.platform + ' (iOS WebApp)' }, function(status, res) {
          if (status === 200 && res && res.ok && res.device_token) {
            setToken(res.device_token, res.device_name || 'آیفون متصل');
            byId('pairCodeInput').value = '';
            showToast('✅ آیفون شما با موفقیت به درگاه متصل شد!');
            switchTab('radar');
            pollServer(true);
          } else {
            var errMsg = (res && res.error && (res.error.message || res.error)) || 'کد ۶ رقمی نامعتبر یا منقضی است.';
            showToast(String(errMsg), true);
          }
        });
      };

      window.saveManualToken = function() {
        var raw = String(byId('manualTokenInput').value || '').trim();
        if (!raw) {
          showToast('توکن یا رشته اتصال را وارد کنید.', true);
          return;
        }
        if (raw.charAt(0) === '{') {
          try {
            var j = JSON.parse(raw);
            raw = j.device_token || j.deviceToken || '';
          } catch (e) {}
        }
        if (!raw) {
          showToast('فرمت توکن معتبر نیست.', true);
          return;
        }
        setToken(raw, 'آیفون متصل');
        pollServer(true);
        showToast('توکن ذخیره شد ✅');
      };

      window.clearDeviceConfig = function() {
        setToken('', '');
        byId('connBadge').className = 'badge badge-warn';
        byId('connDot').className = 'dot dot-warn';
        byId('connText').textContent = 'قطع شد';
        showToast('اتصال این گوشی پاک شد.');
      };

      function sendSmsPayload(smsText) {
        var clean = String(smsText || '').trim();
        if (!clean) {
          showToast('متن پیامک خالی است.', true);
          return;
        }
        if (isOtpSms(clean)) {
          showToast('🔒 پیامک حاوی رمز پویا / کد تأیید است و به دلایل امنیتی ارسال نشد.', true);
          byId('smsBox').value = '';
          return;
        }
        if (!getToken()) {
          showToast('ابتدا آیفون را در تب «اتصال گوشی» جفت‌سازی کنید.', true);
          switchTab('settings');
          return;
        }
        apiJson('POST', '/api/payment/ios/sms', {
          sender: 'iOS-Bridge',
          body: clean,
          deviceModel: 'iPhone (iOS WebApp)'
        }, function(status, res) {
          if (status >= 200 && status < 300 && res && res.ok) {
            byId('smsBox').value = '';
            if (res.matched) {
              playChime();
              showToast('🎉 واریز بانکی تطبیق یافت و اشتراک مشتری فعال شد!');
            } else {
              showToast('پیامک بررسی شد (' + (res.status || 'ثبت شد') + ')');
            }
            pollServer(true);
          } else if (status === 0) {
            var q = getQueue();
            q.push({ body: clean, ts: new Date().toISOString() });
            saveQueue(q);
            byId('smsBox').value = '';
            showToast('اینترنت قطع است؛ در صف آفلاین ذخیره شد و خودکار ارسال می‌شود.');
          } else {
            var msg = (res && res.error && (res.error.message || res.error)) || ('خطا HTTP ' + status);
            showToast(String(msg), true);
          }
        });
      }

      function flushOfflineQueue() {
        if (!getToken()) return;
        var q = getQueue();
        if (!q.length) return;
        var first = q[0];
        apiJson('POST', '/api/payment/ios/sms', {
          sender: 'iOS-OfflineQueue',
          body: first.body,
          receivedAt: first.ts,
          deviceModel: 'iPhone (iOS WebApp)'
        }, function(status, res) {
          if (status >= 200 && status < 300 && res && res.ok) {
            var cur = getQueue();
            cur.shift();
            saveQueue(cur);
            if (cur.length > 0) setTimeout(flushOfflineQueue, 400);
          }
        });
      }

      window.submitBoxSms = function() {
        sendSmsPayload(byId('smsBox').value);
      };

      window.readClipboardAndSend = function() {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function(txt) {
            if (!txt || !String(txt).trim()) {
              showToast('کلیپ‌بورد خالی است؛ پیامک بانک را کپی یا در کادر پایین Paste کنید.', true);
              return;
            }
            byId('smsBox').value = txt;
            sendSmsPayload(txt);
          }).catch(function() {
            byId('smsBox').focus();
            showToast('در iOS زیر ۱۶ روی کادر پایین بزنید و Paste را انتخاب کنید تا خودکار ارسال شود.');
          });
        } else {
          byId('smsBox').focus();
          showToast('روی کادر متن بزنید و گزینه Paste را لمس کنید.');
        }
      };

      window.quickConfirmInvoice = function(paymentId, amountTomanStr) {
        if (!window.confirm('آیا واریز مبلغ دقیق ' + amountTomanStr + ' تومان به حساب بانکی خود را رویت کردید و تایید می‌کنید؟')) {
          return;
        }
        apiJson('POST', '/api/payment/ios/quick-confirm', { paymentId: paymentId }, function(status, res) {
          if (status === 200 && res && res.ok) {
            playChime();
            showToast('✅ پرداخت تایید شد و کد اشتراک برای مشتری ارسال گردید!');
            pollServer(true);
          } else {
            showToast('خطا در تایید تراکنش.', true);
          }
        });
      };

      window.pollServer = function(manual) {
        var tok = getToken();
        if (!tok) return;
        flushOfflineQueue();
        apiJson('GET', '/api/payment/ios/poll', null, function(status, res) {
          if (status === 200 && res && res.ok) {
            byId('connBadge').className = 'badge badge-ok';
            byId('connDot').className = 'dot dot-ok';
            byId('connText').textContent = 'آنلاین و فعال';
            if (res.device_name) {
              byId('deviceSub').textContent = 'گوشی متصل: ' + res.device_name + ' • همگام‌سازی زنده هر ۵ ثانیه';
            }
            byId('statPending').textContent = toFa((res.pending_orders || []).length);
            byId('statMatched').textContent = toFa(res.matched_count || 0);

            renderPendingOrders(res.pending_orders || []);
            renderLogs(res.recent_logs || []);
            if (manual) showToast('وضعیت با سرور همگام‌سازی شد ✅');
          } else if (status === 401) {
            byId('connBadge').className = 'badge badge-err';
            byId('connText').textContent = 'توکن نامعتبر';
          } else {
            byId('connBadge').className = 'badge badge-warn';
            byId('connText').textContent = 'آفلاین / تلاش مجدد';
          }
        });
      };

      function renderPendingOrders(list) {
        var box = byId('pendingList');
        if (!list.length) {
          box.innerHTML = '<p style="text-align:center;padding:12px 0;">در حال حاضر فاکتور بازی در انتظار پرداخت نیست.</p>';
          return;
        }
        var hasNew = false;
        var html = '';
        for (var i = 0; i < list.length; i++) {
          var o = list[i];
          if (!knownPendingIds[o.id]) {
            knownPendingIds[o.id] = true;
            hasNew = true;
          }
          var tomanStr = fmtComma(Math.floor((o.payable_amount_rial || 0) / 10));
          var rialStr = fmtComma(o.payable_amount_rial || 0);
          var mins = Math.max(0, Math.floor((o.seconds_remaining || 0) / 60));
          var secs = Math.max(0, (o.seconds_remaining || 0) % 60);
          html += '<div class="order-item">' +
            '<div class="row-between">' +
              '<span style="font-size:12px;font-weight:800;color:#FBBF24;">⏳ در انتظار واریز مشتری</span>' +
              '<span class="ltr" style="font-size:11px;color:#94A3B8;">' + toFa(mins) + ':' + toFa(secs < 10 ? '0' + secs : secs) + '</span>' +
            '</div>' +
            '<div class="amount-big">' + tomanStr + ' تومان</div>' +
            '<div style="font-size:11.5px;color:#94A3B8;">معادل دقیق پیامک ریالی: <b style="color:#E2E8F0;">' + rialStr + ' ریال</b></div>' +
            '<div style="font-size:12px;color:#CBD5E1;margin-top:4px;">📦 ' + escHtml(o.description || o.product_name || o.order_id) +
              (o.phone ? ' • <span class="ltr">' + escHtml(o.phone) + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn btn-amber" style="margin-top:10px;padding:10px;" onclick="quickConfirmInvoice(\\'' + escHtml(o.id) + '\\', \\'' + escHtml(tomanStr) + '\\')">' +
              '✅ واریز این مبلغ دقیق به کارتم نشست — تایید آنی' +
            '</button>' +
          '</div>';
        }
        box.innerHTML = html;
        if (hasNew) playChime();
      }

      function renderLogs(logs) {
        var box = byId('logsContainer');
        if (!logs.length) {
          box.innerHTML = '<p>هنوز پیامکی ثبت نشده است.</p>';
          return;
        }
        var html = '';
        for (var i = 0; i < logs.length; i++) {
          var l = logs[i];
          var badgeCls = l.status === 'matched' ? 'badge-ok' : (l.status === 'ignored_otp' ? 'badge-err' : 'badge-warn');
          html += '<div class="log-item">' +
            '<div class="row-between">' +
              '<span class="badge ' + badgeCls + '">' + escHtml(l.status) + '</span>' +
              '<span class="ltr" style="font-size:11px;color:#64748B;">' + escHtml(String(l.created_at || '').slice(11, 19)) + '</span>' +
            '</div>' +
            (l.parsed_amount_rial > 0 ? '<div style="color:#34D399;font-weight:700;margin-top:4px;">' + fmtComma(l.parsed_amount_rial) + ' ریال</div>' : '') +
            '<div style="color:#94A3B8;margin-top:2px;">' + escHtml(l.body_sanitized || '') + '</div>' +
          '</div>';
        }
        box.innerHTML = html;
      }

      // Auto-send immediately when pasting into smsBox!
      var boxEl = byId('smsBox');
      if (boxEl) {
        boxEl.addEventListener('paste', function() {
          setTimeout(function() {
            if (boxEl.value && String(boxEl.value).trim().length > 8) {
              sendSmsPayload(boxEl.value);
            }
          }, 80);
        });
      }

      // Check URL hash for 1-tap pairing (#token=omid_dev_...) or incoming #sms=...
      var hash = String(window.location.hash || '').replace(/^#/, '');
      if (hash) {
        var parts = hash.split('&');
        for (var h = 0; h < parts.length; h++) {
          var kv = parts[h].split('=');
          if (kv[0] === 'token' && kv[1]) {
            setToken(decodeURIComponent(kv[1]), 'آیفون متصل');
          }
          if (kv[0] === 'sms' && kv[1]) {
            var incomingSms = decodeURIComponent(kv[1].replace(/\\+/g, ' '));
            setTimeout(function() { sendSmsPayload(incomingSms); }, 300);
          }
        }
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      // Show "Add to Home Screen" hint when opened in Safari (not standalone) on iOS
      var isStandalone = (window.navigator && window.navigator.standalone === true) ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      var ua = navigator.userAgent || '';
      if (!isStandalone && /iPhone|iPad|iPod/i.test(ua)) {
        byId('installHint').className = 'card card-amber';
      }

      byId('soundBtn').textContent = isSoundOn() ? '🔔 صدا: روشن' : '🔕 صدا: خاموش';
      renderQueueBadge();
      updateShortcutUrlDisplay();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sms-bridge/sw.js').catch(function() {});
      }

      if (getToken()) {
        pollServer(false);
      }
      setInterval(function() {
        if (getToken()) pollServer(false);
      }, 5000);
    })();
  </script>
</body>
</html>`;
};
