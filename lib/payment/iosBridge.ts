/**
 * lib/payment/iosBridge.ts — Standalone iOS < 16 (iPhone X / iOS 12–16+) Web App (PWA)
 * with 1-Step BluBank + Telegram Bot Auto-Sync, Apple Shortcuts Bridge & Forensic Receipt Review.
 *
 * Engineered specifically for older Mobile Safari / WebKit on iPhone X (iOS 12, 13, 14, 15):
 *  - Pure #hex / rgba() CSS (zero oklch(), color-mix(), @layer, or inset:)
 *  - Classic margins instead of relying on CSS Flexbox `gap` (unsupported in iOS < 14.5)
 *  - Pure ES5/ES6 inline script (zero `?.`, `??`, or `.replaceAll(` which break < iOS 13.4)
 *  - 16px form inputs so Mobile Safari never forces viewport zoom on tap
 *  - Full iPhone X OLED safe-area insets (Notch + Home Indicator)
 */

export const renderIosBridgeIconSvg = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071324"/>
      <stop offset="100%" stop-color="#0B1930"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>
  <rect width="180" height="180" rx="40" fill="url(#bg)"/>
  <circle cx="90" cy="90" r="64" fill="#38BDF8" fill-opacity="0.14"/>
  <path d="M98 34 L54 94 L84 94 L76 146 L126 84 L95 84 Z" fill="url(#bolt)"/>
</svg>`;

export const renderIosBridgeManifest = (origin: string): string =>
  JSON.stringify(
    {
      name: 'درگاه هوشمند بلوبانک و تلگرام (امید عدلی)',
      short_name: 'درگاه بلوبانک',
      description: 'وب‌اپلیکیشن اختصاصی آیفون برای همگام‌سازی بلوبانک، ربات تلگرام و تایید آنی تراکنش‌ها',
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

export const renderIosBridgeServiceWorker = (): string => `/* iOS 12-16 Compatible Service Worker for /sms-bridge (v2) */
var CACHE_NAME = 'omidpay-ios-bridge-v2';
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
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) {
          return k !== CACHE_NAME ? caches.delete(k) : Promise.resolve();
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
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
  <title>درگاه هوشمند بلوبانک و تلگرام | امید عدلی</title>

  <!-- iOS Full-Screen Home Screen Web App (iOS 12 / 13 / 14 / 15 / 16+) -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="درگاه بلوبانک" />
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
      padding-top: 24px;
      padding-top: calc(env(safe-area-inset-top, 20px) + 12px);
      padding-bottom: 104px;
      padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 92px);
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
    .card-blu {
      background: linear-gradient(135deg, #0C2444 0%, #091526 100%);
      border: 1px solid rgba(56, 189, 248, 0.42);
    }
    .card-emerald {
      background: linear-gradient(135deg, #06281E 0%, #0F172A 100%);
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .card-amber {
      background-color: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.38);
    }
    .card-rose {
      background-color: rgba(244, 63, 94, 0.09);
      border: 1px solid rgba(244, 63, 94, 0.4);
    }
    .row-between {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
    }
    .badge-ok { background-color: rgba(16, 185, 129, 0.18); color: #34D399; }
    .badge-blu { background-color: rgba(56, 189, 248, 0.18); color: #7DD3FC; }
    .badge-warn { background-color: rgba(245, 158, 11, 0.18); color: #FBBF24; }
    .badge-err { background-color: rgba(239, 68, 68, 0.18); color: #F87171; }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-left: 6px;
    }
    .dot-ok { background-color: #10B981; box-shadow: 0 0 8px #10B981; }
    .dot-warn { background-color: #F59E0B; }
    h1 { font-size: 17px; margin: 0; font-weight: 800; }
    h2 { font-size: 15px; margin: 0 0 8px 0; font-weight: 800; color: #F1F5F9; }
    p { margin: 6px 0; font-size: 13px; color: #94A3B8; }
    label.lbl {
      display: block;
      font-size: 12.5px;
      font-weight: 700;
      color: #E2E8F0;
      margin-top: 12px;
      margin-bottom: 5px;
    }
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
      border-color: #38BDF8;
    }
    .ltr {
      direction: ltr;
      text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .pair-input {
      text-align: center;
      letter-spacing: 8px;
      font-size: 22px !important;
      font-weight: 800;
      padding: 12px;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      text-decoration: none;
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
    .btn-blu { background-color: #0284C7; }
    .btn-indigo { background-color: #4F46E5; }
    .btn-slate { background-color: #1E293B; border: 1px solid #334155; color: #E2E8F0; }
    .btn-amber { background-color: #D97706; color: #FFFFFF; }
    .btn-rose { background-color: #E11D48; color: #FFFFFF; }
    .btn-sm { padding: 8px 12px; font-size: 12px; border-radius: 11px; width: auto; display: inline-block; }
    /* RTL-safe 2-column flex without relying on Flexbox gap (iOS < 14.5 safe!) */
    .grid-2 {
      display: flex;
      margin-top: 10px;
    }
    .grid-2 > * { flex: 1; }
    .grid-2 > * + * { margin-right: 10px; }
    .grid-3 {
      display: flex;
      margin-top: 10px;
    }
    .grid-3 > * { flex: 1; }
    .grid-3 > * + * { margin-right: 8px; }
    .stat-box {
      background-color: rgba(255, 255, 255, 0.05);
      border-radius: 14px;
      padding: 9px 8px;
      text-align: center;
    }
    .stat-val { font-size: 17px; font-weight: 900; color: #34D399; }
    .stat-lbl { font-size: 10.5px; color: #94A3B8; }
    .sync-pills {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
    }
    .sync-pill {
      font-size: 11px;
      padding: 3px 9px;
      border-radius: 999px;
      background-color: rgba(255, 255, 255, 0.07);
      color: #CBD5E1;
      margin-left: 6px;
      margin-bottom: 5px;
    }
    .order-item {
      background-color: #090D16;
      border: 1px solid rgba(56, 189, 248, 0.38);
      border-radius: 16px;
      padding: 14px;
      margin-top: 10px;
    }
    .review-item {
      background-color: #090D16;
      border: 1px solid rgba(244, 63, 94, 0.45);
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
      background-color: #0284C7;
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
      color: #7DD3FC;
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
      top: 20px;
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
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
    }
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.85);
      z-index: 980;
      padding: 24px 16px;
      overflow-y: auto;
    }
    .modal-box {
      max-width: 480px;
      margin: 20px auto;
      background-color: #111827;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 14px;
    }
    .tabbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: rgba(11, 17, 30, 0.95);
      -webkit-backdrop-filter: blur(18px);
      backdrop-filter: blur(18px);
      border-top: 1px solid #1E293B;
      display: flex;
      justify-content: space-around;
      padding-top: 8px;
      padding-bottom: 12px;
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
      cursor: pointer;
      padding: 4px 8px;
    }
    .tab-btn.active { color: #38BDF8; }
    .tab-ico { font-size: 19px; line-height: 1; margin-bottom: 3px; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>

  <!-- Receipt Image Modal for Inspecting Suspicious Receipts on iPhone X -->
  <div id="receiptModal" class="modal-backdrop hidden" onclick="closeReceiptModal()">
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="row-between" style="margin-bottom:10px;">
        <b style="font-size:14px;">🧾 تصویر رسید ارسالی مشتری</b>
        <button type="button" class="btn btn-slate btn-sm" onclick="closeReceiptModal()">بستن ✕</button>
      </div>
      <img id="receiptModalImg" src="" alt="Receipt" style="width:100%;border-radius:12px;display:block;" />
    </div>
  </div>

  <div class="app-wrap">
    <!-- Top Unified Status Header -->
    <div class="card card-blu">
      <div class="row-between">
        <h1>🟦 درگاه بلوبانک و تلگرام</h1>
        <span id="connBadge" class="badge badge-warn">
          <span id="connDot" class="dot dot-warn"></span>
          <span id="connText">آماده راه‌اندازی</span>
        </span>
      </div>
      <div id="syncPills" class="sync-pills">
        <span id="pillCard" class="sync-pill">💳 کارت: ثبت نشده</span>
        <span id="pillTg" class="sync-pill">🤖 تلگرام: بررسی...</span>
        <span id="pillAi" class="sync-pill">🧠 رسیدخوان: بررسی...</span>
      </div>
      <div class="grid-3">
        <div class="stat-box">
          <div id="statPending" class="stat-val" style="color:#38BDF8;">۰</div>
          <div class="stat-lbl">منتظر واریز</div>
        </div>
        <div class="stat-box">
          <div id="statReview" class="stat-val" style="color:#FBBF24;">۰</div>
          <div class="stat-lbl">رسید مشکوک</div>
        </div>
        <div class="stat-box">
          <div id="statMatched" class="stat-val">۰</div>
          <div class="stat-lbl">تاییدشده</div>
        </div>
      </div>
    </div>

    <!-- Install to Home Screen Hint (only shown in regular Safari on iPhone) -->
    <div id="installHint" class="card card-amber hidden">
      <div style="font-size:13px;font-weight:800;color:#FDE68A;">📲 نصب روی صفحه اصلی آیفون X:</div>
      <p style="color:#FEF3C7;font-size:12px;margin-top:4px;">
        پایین سافاری دکمه <b>Share (⬆️)</b> و سپس <b>Add to Home Screen</b> را بزنید، بعد آیکون نصب‌شده را باز کرده و فرم زیر را فقط یک‌بار پر کنید!
      </p>
    </div>

    <!-- ================= TAB 1: LIVE RADAR, RECEIPT REVIEW & INSTANT SMS ================= -->
    <div id="tab-radar">
      <!-- Shown automatically when not yet configured -->
      <div id="unpairedNotice" class="card card-emerald hidden">
        <h2>✨ راه‌اندازی ۱ دقیقه‌ای (بدون نیاز به لپ‌تاپ!)</h2>
        <p style="color:#D1FAE5;">
          فقط شماره کارت بلوبانک و اطلاعات ربات تلگرام خود را یک‌بار در تب «⚙️ تنظیمات ساده» وارد کنید تا همه‌چیز خودکار سینک شود.
        </p>
        <button type="button" class="btn btn-blu" onclick="switchTab('settings')" style="margin-top:10px;">
          شروع تنظیم یک‌مرحله‌ای بلوبانک و تلگرام ←
        </button>
      </div>

      <!-- Suspicious Receipts Queue (Only shown when a receipt is flagged suspicious / needs_review!) -->
      <div id="reviewCard" class="card card-rose hidden">
        <div class="row-between">
          <h2 style="margin:0;color:#FDA4AF;">🧐 رسیدهای مشکوک نیازمند بررسی شما</h2>
          <span class="badge badge-err">بررسی دستی</span>
        </div>
        <p style="color:#FECDD3;font-size:12px;">
          رسیدهای معتبر و کامل به‌صورت خودکار تایید می‌شوند؛ فقط رسیدهایی که مغایرت یا ابهام دارند اینجا می‌آیند:
        </p>
        <div id="reviewList"></div>
      </div>

      <!-- Instant Clipboard / Auto-Paste Box -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 style="margin:0;">📩 اعتبارسنجی آنی پیامک بلوبانک</h2>
          <span id="queueBadge" class="badge badge-warn hidden">صف آفلاین: ۰</span>
        </div>
        <p style="margin-bottom:10px;">
          علاوه بر اتوماسیون خودکار Shortcuts و فوروارد در ربات تلگرام، هر زمان پیامک بلوبانک را کپی کردید کافی است دکمه زیر را لمس کنید:
        </p>
        <button type="button" id="btnClipboard" class="btn" onclick="readClipboardAndSend()">
          📋 خواندن پیامک بلوبانک از کلیپ‌بورد و تایید آنی
        </button>
        <div style="margin-top:10px;">
          <textarea
            id="smsBox"
            rows="2"
            placeholder="یا پیامک بلوبانک را اینجا Paste کنید (خودکار بدون دکمه تایید می‌شود)..."
          ></textarea>
        </div>
        <div class="grid-2">
          <button type="button" class="btn btn-slate" onclick="submitBoxSms()">بررسی متن بالا</button>
          <button type="button" class="btn btn-slate" onclick="pollServer(true)">🔄 بروزرسانی زنده</button>
        </div>
      </div>

      <!-- Live Pending Orders Radar -->
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0;">📡 مشتریان منتظر واریز در همین لحظه</h2>
          <button type="button" id="soundBtn" class="btn btn-slate btn-sm" onclick="toggleSound()">🔔 صدا: روشن</button>
        </div>
        <div id="pendingList" style="margin-top:8px;">
          <p style="text-align:center;padding:14px 0;">در حال حاضر فاکتور بازی در انتظار پرداخت نیست.</p>
        </div>
      </div>
    </div>

    <!-- ================= TAB 2: 1-ACTION BLUBANK SHORTCUT & TELEGRAM SYNC ================= -->
    <div id="tab-automation" class="hidden">
      <div class="card card-blu">
        <h2>⚡ سینک خودکار پیامک‌های بلوبانک در آیفون X</h2>
        <p style="color:#E0F2FE;">
          طراحی را آن‌قدر ساده کردیم که در برنامه <b>Shortcuts</b> آیفون X (iOS 14 / 15) فقط به <b>۱ اکشن واحد</b> نیاز دارید (بدون نیاز به URL Encode یا هدر!):
        </p>
        <div id="shortcutUrlBox" class="code-block ltr">ابتدا اطلاعات کارت بلوبانک را در تب تنظیمات ذخیره کنید</div>
        <button type="button" class="btn btn-blu" onclick="copyAndOpenShortcuts()">
          ⚡ کپی لینک اختصاصی + باز کردن برنامه Shortcuts آیفون
        </button>
        <button type="button" class="btn btn-slate" style="margin-top:8px;" onclick="copyShortcutUrl()">
          📋 فقط کپی لینک اتصال بلوبانک
        </button>
      </div>

      <div class="card">
        <h2>فقط ۱ بار در برنامه Shortcuts آیفون انجام دهید (۳۰ ثانیه):</h2>

        <div class="step-box">
          <span class="step-num">۱</span>
          در برنامه <b>Shortcuts (میانبرها)</b> به تب وسط <b>Automation</b> بروید ← <b>Create Personal Automation</b> ← گزینه <b>Message (پیام)</b> را بزنید.
        </div>

        <div class="step-box">
          <span class="step-num">۲</span>
          در قسمت <b>Message Contains (پیام حاوی)</b> کلمه <b>بلوبانک</b> (یا کلمه <b>نشست</b> / <b>واریز</b>) را بنویسید و <b>Next</b> بزنید.
        </div>

        <div class="step-box">
          <span class="step-num">۳</span>
          روی <b>Add Action</b> بزنید و فقط اکشن <b>Get Contents of URL</b> را اضافه کنید:
          <br/>• در قسمت URL لینک کپی‌شده بالا را Paste کنید.
          <br/>• روی فلش <b>Show More</b> بزنید، <b>Method</b> را روی <b>POST</b> بگذارید، <b>Request Body</b> را روی <b>File</b> بگذارید و متغیر <b>Shortcut Input</b> را انتخاب کنید ← <b>Done</b>!
        </div>

        <div class="step-box" style="border-color:rgba(16,185,129,0.45);">
          <b style="color:#34D399;">🤖 روش دوم (فوق‌سریع داخل خود تلگرام!):</b>
          <br/>هر زمان داخل تلگرام بودید، اگر پیامک واریز بلوبانک را کپی و مستقیماً داخل <b>ربات تلگرام خودتان</b> ارسال (Paste) کنید هم ربات به‌طور خودکار مبلغ یکتا را تشخیص داده و اشتراک مشتری را در کمتر از ۱ ثانیه فعال می‌کند!
        </div>
      </div>

      <div class="card">
        <h2>☁️ روش سوم: ۱۰۰٪ بدون لمس ۲۴ ساعته از طریق ایمیل بلوبانک</h2>
        <p>
          اگر در اپلیکیشن بلوبانک ارسال رایگان ایمیل تراکنش را روشن کنید، با قرار دادن کد آماده زیر در <span class="ltr">script.google.com</span> جیمیل‌تان، حتی وقتی آیفون خاموش باشد واریزها خودکار تایید می‌شوند:
        </p>
        <button type="button" class="btn btn-slate" onclick="copyGmailScript()">
          📋 کپی کد آماده Google Apps Script بلوبانک
        </button>
      </div>
    </div>

    <!-- ================= TAB 3: SMS & MATCH LOGS ================= -->
    <div id="tab-logs" class="hidden">
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0;">📜 گزارش پیامک‌ها و تراکنش‌ها</h2>
          <button type="button" class="btn btn-slate btn-sm" onclick="pollServer(true)">بروزرسانی</button>
        </div>
        <div id="logsContainer" style="margin-top:10px;">
          <p>هنوز گزارشی ثبت نشده است.</p>
        </div>
      </div>
    </div>

    <!-- ================= TAB 4: 1-STEP ESSENTIAL SETUP ================= -->
    <div id="tab-settings" class="hidden">
      <div class="card card-blu">
        <h2>🚀 تنظیم یک‌مرحله‌ای بلوبانک و ربات تلگرام</h2>
        <p style="color:#E0F2FE;">
          فقط همین اطلاعات ضروری را پر کنید تا وب‌اپ آیفون، درگاه سایت، ربات تلگرام و سیستم هوشمند تشخیص رسید بانکی به‌صورت یکپارچه سینک شوند:
        </p>

        <div id="adminPassWrap">
          <label class="lbl" for="setupAdminPass">🔑 رمز مدیریت سایت (فقط برای اولین اتصال):</label>
          <input
            type="password"
            id="setupAdminPass"
            class="ltr"
            placeholder="Admin Password"
          />
        </div>

        <label class="lbl" for="setupCardNumber">💳 شماره کارت ۱۶ رقمی بلوبانک شما:</label>
        <input
          type="tel"
          id="setupCardNumber"
          maxlength="19"
          class="ltr"
          placeholder="6219 8619 .... ...."
          oninput="onCardInput()"
        />
        <div id="cardDetectHint" style="font-size:11.5px;color:#7DD3FC;margin-top:4px;"></div>

        <label class="lbl" for="setupHolderName">👤 نام و نام خانوادگی صاحب حساب بلوبانک:</label>
        <input
          type="text"
          id="setupHolderName"
          placeholder="مثلاً امید عدلی (دقیقاً مطابق رسید بانکی)"
        />

        <label class="lbl" for="setupBotToken">🤖 توکن ربات تلگرام (از BotFather — اختیاری اگر قبلاً ست شده):</label>
        <input
          type="text"
          id="setupBotToken"
          class="ltr"
          placeholder="123456789:AAH..."
        />

        <label class="lbl" for="setupAdminChatId">🆔 آیدی عددی تلگرام شما (جهت دریافت اعلان و تایید رسید):</label>
        <input
          type="tel"
          id="setupAdminChatId"
          class="ltr"
          placeholder="مثلاً 123456789"
        />

        <label class="lbl" for="setupGeminiKey">🧠 کلید Gemini تشخیص هوشمند رسید (اختیاری — خودکار از کلید سایت می‌خواند):</label>
        <input
          type="password"
          id="setupGeminiKey"
          class="ltr"
          placeholder="خالی بگذارید تا از هوش مصنوعی سایت استفاده شود"
        />

        <button type="button" id="btnSaveSetup" class="btn" style="margin-top:16px;" onclick="submitOneStepSetup()">
          ✅ ذخیره و همگام‌سازی خودکار با بلوبانک و تلگرام
        </button>
        <button type="button" id="btnSelfTest" class="btn btn-blu hidden" style="margin-top:10px;" onclick="runSystemSelfTest()">
          🧪 تست خودکار اتصال بلوبانک و ربات تلگرام
        </button>
      </div>

      <!-- Alternative 6-digit pairing if generated from desktop /admin -->
      <div class="card">
        <h2>🔢 یا اتصال با کد ۶ رقمی پنل ادمین</h2>
        <p>اگر قبلاً در پنل دسکتاپ کارت را ثبت کرده‌اید، می‌توانید فقط کد ۶ رقمی را بزنید:</p>
        <input
          type="tel"
          id="pairCodeInput"
          maxlength="6"
          class="ltr pair-input"
          placeholder="------"
        />
        <div class="grid-2">
          <button type="button" class="btn btn-indigo" onclick="submitPairCode()">اتصال با کد ۶ رقمی</button>
          <button type="button" class="btn btn-slate" onclick="clearDeviceConfig()">قطع اتصال گوشی</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Native-style iOS Bottom Tab Bar -->
  <div class="tabbar">
    <button type="button" id="nav-radar" class="tab-btn active" onclick="switchTab('radar')">
      <span class="tab-ico">📡</span>
      <span>رادار و رسیدها</span>
    </button>
    <button type="button" id="nav-automation" class="tab-btn" onclick="switchTab('automation')">
      <span class="tab-ico">⚡</span>
      <span>سینک بلوبانک</span>
    </button>
    <button type="button" id="nav-logs" class="tab-btn" onclick="switchTab('logs')">
      <span class="tab-ico">📜</span>
      <span>گزارش‌ها</span>
    </button>
    <button type="button" id="nav-settings" class="tab-btn" onclick="switchTab('settings')">
      <span class="tab-ico">⚙️</span>
      <span>تنظیمات ساده</span>
    </button>
  </div>

  <script>
    (function() {
      var ORIGIN = ${JSON.stringify(safeOrigin)} || (window.location.protocol + '//' + window.location.host);
      var TOKEN_KEY = 'omidpay_ios_device_token';
      var NAME_KEY = 'omidpay_ios_device_name';
      var QUEUE_KEY = 'omidpay_ios_offline_queue';
      var SOUND_KEY = 'omidpay_ios_sound_on';

      var OTP_WORDS = ['رمز پویا', 'رمز دوم', 'کد تایید', 'کد تأیید', 'کد ورود', 'کد فعالسازی', 'این کد را در اختیار', 'کد تغییر رمز', 'otp', 'verification code', 'security code'];
      var knownPendingIds = {};
      var knownReviewIds = {};
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

      function luhnCheck16(digits) {
        if (!/^\\d{16}$/.test(digits) || /^(\\d)\\1{15}$/.test(digits)) return false;
        var sum = 0;
        for (var i = 0; i < 16; i++) {
          var d = Number(digits.charAt(i));
          if (i % 2 === 0) {
            d *= 2;
            if (d > 9) d -= 9;
          }
          sum += d;
        }
        return sum % 10 === 0;
      }

      function detectBankLabel(digits) {
        if (digits.indexOf('62198619') === 0 || digits.indexOf('62198618') === 0 || digits.indexOf('62198617') === 0) return '🟦 بلوبانک (سامان)';
        if (digits.indexOf('621986') === 0) return '🏦 بانک سامان';
        if (digits.indexOf('610433') === 0 || digits.indexOf('991975') === 0) return '🏦 بانک ملت';
        if (digits.indexOf('603799') === 0) return '🏦 بانک ملی';
        if (digits.indexOf('50222915') === 0) return '🟦 ویپاد (پاسارگاد)';
        if (digits.indexOf('502229') === 0 || digits.indexOf('639347') === 0) return '🏦 بانک پاسارگاد';
        if (digits.indexOf('622106') === 0 || digits.indexOf('639194') === 0) return '🏦 بانک پارسیان';
        return '💳 شبکه شتاب';
      }

      window.onCardInput = function() {
        var el = byId('setupCardNumber');
        var hint = byId('cardDetectHint');
        if (!el || !hint) return;
        var digits = toEnDigits(el.value).replace(/\\D/g, '').slice(0, 16);
        el.value = digits.replace(/(\\d{4})(?=\\d)/g, '$1 ');
        if (!digits.length) {
          hint.textContent = '';
          return;
        }
        var bank = detectBankLabel(digits);
        if (digits.length === 16) {
          if (luhnCheck16(digits)) {
            hint.style.color = '#34D399';
            hint.textContent = bank + ' — شماره کارت ۱۶ رقمی معتبر است ✅';
          } else {
            hint.style.color = '#F87171';
            hint.textContent = '⚠️ یکی از ارقام شماره کارت اشتباه تایپ شده است.';
          }
        } else {
          hint.style.color = '#7DD3FC';
          hint.textContent = bank + ' (' + toFa(digits.length) + ' از ۱۶ رقم)';
        }
      };

      function showToast(msg, isErr) {
        var el = byId('toast');
        if (!el) return;
        el.style.backgroundColor = isErr ? '#7F1D1D' : '#065F46';
        el.style.borderColor = isErr ? '#F87171' : '#34D399';
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 3800);
      }

      var memStore = {};
      function sGet(key) {
        try {
          var v = localStorage.getItem(key);
          if (v !== null && v !== undefined) return v;
        } catch (e) {}
        return memStore[key] || '';
      }
      function sSet(key, val) {
        memStore[key] = String(val);
        try { localStorage.setItem(key, String(val)); } catch (e) {}
      }
      function sDel(key) {
        delete memStore[key];
        try { localStorage.removeItem(key); } catch (e) {}
      }

      function getToken() {
        return sGet(TOKEN_KEY);
      }

      function setToken(tok, name) {
        if (tok) {
          sSet(TOKEN_KEY, tok);
          if (name) sSet(NAME_KEY, name);
        } else {
          sDel(TOKEN_KEY);
          sDel(NAME_KEY);
        }
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
          var raw = sGet(QUEUE_KEY);
          var arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
      }

      function saveQueue(arr) {
        sSet(QUEUE_KEY, JSON.stringify(arr.slice(-30)));
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
        return sGet(SOUND_KEY) !== '0';
      }

      window.toggleSound = function() {
        var next = !isSoundOn();
        sSet(SOUND_KEY, next ? '1' : '0');
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
        if (tab === 'settings' && getToken()) {
          loadExistingConfig();
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
        xhr.timeout = 20000;
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
        var passWrap = byId('adminPassWrap');
        var testBtn = byId('btnSelfTest');
        if (passWrap) {
          passWrap.className = tok ? 'hidden' : '';
        }
        if (testBtn) {
          testBtn.className = tok ? 'btn btn-blu' : 'btn btn-blu hidden';
        }
        if (!box) return;
        if (!tok) {
          box.textContent = 'ابتدا در تب «⚙️ تنظیمات ساده» کارت بلوبانک خود را ذخیره کنید.';
          byId('unpairedNotice').className = 'card card-emerald';
        } else {
          box.textContent = ORIGIN + '/api/payment/ios/sms?token=' + encodeURIComponent(tok);
          byId('unpairedNotice').className = 'card card-emerald hidden';
        }
      }

      window.runSystemSelfTest = function() {
        if (!getToken()) {
          showToast('ابتدا اطلاعات بلوبانک را ذخیره کنید.', true);
          return;
        }
        var btn = byId('btnSelfTest');
        btn.disabled = true;
        btn.textContent = '⏳ در حال تست عملی بلوبانک و تلگرام...';
        apiJson('POST', '/api/payment/ios/self-test', {}, function(status, res) {
          btn.disabled = false;
          btn.textContent = '🧪 تست خودکار اتصال بلوبانک و ربات تلگرام';
          if (status === 200 && res && res.ok && res.sms_matched) {
            playChime();
            showToast('✅ تست کامل موفق! کارت ' + (res.card_bank || 'بلوبانک') + ' و پیامک واریز ۱۰۰٪ کار می‌کنند' + (res.telegram_sent ? ' + پیام تلگرام ارسال شد!' : '!'));
            pollServer(false);
          } else {
            showToast('خطا در تست خودکار اتصال.', true);
          }
        });
      };

      function loadExistingConfig() {
        if (!getToken()) return;
        apiJson('GET', '/api/payment/ios/config', null, function(status, res) {
          if (status === 200 && res && res.ok) {
            if (res.card) {
              var cInput = byId('setupCardNumber');
              var hInput = byId('setupHolderName');
              if (cInput && !cInput.value) {
                cInput.value = res.card.formatted || res.card.number || '';
                window.onCardInput();
              }
              if (hInput && !hInput.value) {
                hInput.value = res.card.holder_name || '';
              }
            }
            if (res.telegram) {
              var aInput = byId('setupAdminChatId');
              var bInput = byId('setupBotToken');
              if (aInput && !aInput.value && res.telegram.admin_ids) {
                aInput.value = res.telegram.admin_ids;
              }
              if (bInput && !bInput.value && res.telegram.configured) {
                bInput.placeholder = '✅ متصل است' + (res.telegram.bot_username ? ' (@' + res.telegram.bot_username + ')' : '') + ' — فقط برای تغییر پر کنید';
              }
            }
            if (res.vision_ready) {
              var gInput = byId('setupGeminiKey');
              if (gInput && !gInput.value) {
                gInput.placeholder = '✅ سیستم تشخیص هوشمند رسید فعال است';
              }
            }
          }
        });
      }

      window.submitOneStepSetup = function() {
        var cardDigits = toEnDigits(byId('setupCardNumber').value || '').replace(/\\D/g, '');
        var holder = String(byId('setupHolderName').value || '').trim();
        var adminPass = String(byId('setupAdminPass').value || '').trim();
        var botToken = String(byId('setupBotToken').value || '').trim();
        var adminChatId = toEnDigits(byId('setupAdminChatId').value || '').trim();
        var geminiKey = String(byId('setupGeminiKey').value || '').trim();

        if (!getToken() && !adminPass) {
          showToast('لطفاً رمز مدیریت سایت را وارد کنید.', true);
          byId('setupAdminPass').focus();
          return;
        }
        if (!luhnCheck16(cardDigits)) {
          showToast('شماره کارت ۱۶ رقمی بلوبانک معتبر نیست.', true);
          byId('setupCardNumber').focus();
          return;
        }
        if (holder.length < 3) {
          showToast('نام و نام خانوادگی صاحب حساب بلوبانک را وارد کنید.', true);
          byId('setupHolderName').focus();
          return;
        }

        var btn = byId('btnSaveSetup');
        btn.textContent = '⏳ در حال همگام‌سازی بلوبانک و تلگرام...';
        btn.disabled = true;

        apiJson('POST', '/api/payment/ios/setup', {
          adminPassword: adminPass,
          cardNumber: cardDigits,
          holderName: holder,
          telegramBotToken: botToken,
          telegramAdminId: adminChatId,
          geminiVisionKey: geminiKey,
          deviceModel: navigator.platform + ' (iPhone BluBank)'
        }, function(status, res) {
          btn.disabled = false;
          btn.textContent = '✅ ذخیره و همگام‌سازی خودکار با بلوبانک و تلگرام';

          if (status === 200 && res && res.ok && res.device_token) {
            setToken(res.device_token, res.device_name || 'آیفون بلوبانک');
            byId('setupAdminPass').value = '';
            byId('setupBotToken').value = '';
            byId('setupGeminiKey').value = '';
            playChime();
            showToast('🎉 بلوبانک، ربات تلگرام و آیفون شما با موفقیت همگام شدند!');
            pollServer(false);
            switchTab('automation');
          } else {
            var errMsg = (res && res.error && (res.error.message || res.error)) || 'خطا در ذخیره تنظیمات. رمز مدیریت را بررسی کنید.';
            showToast(String(errMsg), true);
          }
        });
      };

      window.copyShortcutUrl = function() {
        var tok = getToken();
        if (!tok) {
          showToast('ابتدا کارت بلوبانک را در تب تنظیمات ذخیره کنید.', true);
          switchTab('settings');
          return;
        }
        var url = ORIGIN + '/api/payment/ios/sms?token=' + encodeURIComponent(tok);
        copyToClipboard(url, 'لینک اختصاصی Shortcuts کپی شد ✅');
      };

      window.copyAndOpenShortcuts = function() {
        var tok = getToken();
        if (!tok) {
          showToast('ابتدا کارت بلوبانک را در تب تنظیمات ذخیره کنید.', true);
          switchTab('settings');
          return;
        }
        var url = ORIGIN + '/api/payment/ios/sms?token=' + encodeURIComponent(tok);
        copyToClipboard(url, 'لینک کپی شد — در حال باز کردن Shortcuts...');
        setTimeout(function() {
          window.location.href = 'shortcuts://';
        }, 450);
      };

      window.copyGmailScript = function() {
        var tok = getToken() || 'YOUR_DEVICE_TOKEN';
        var endpoint = ORIGIN + '/api/payment/ios/sms?token=' + tok;
        var script = [
          '// Google Apps Script — همگام‌سازی ۲۴ ساعته ایمیل‌های واریز بلوبانک با درگاه سایت',
          '// در script.google.com یک پروژه بسازید و Trigger زمانی هر 1 دقیقه روی checkBluBankEmails بگذارید.',
          'function checkBluBankEmails() {',
          '  var threads = GmailApp.search(\\'is:unread ("بلوبانک" OR "واریز" OR "نشست" OR "بستانکار") newer_than:1d\\', 0, 10);',
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
        copyToClipboard(script, 'اسکریپت ابری بلوبانک کپی شد ✅');
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
            showToast('✅ آیفون شما با موفقیت متصل شد!');
            switchTab('radar');
            pollServer(true);
          } else {
            var errMsg = (res && res.error && (res.error.message || res.error)) || 'کد ۶ رقمی نامعتبر یا منقضی است.';
            showToast(String(errMsg), true);
          }
        });
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
          showToast('🔒 پیامک حاوی رمز پویا / کد ورود است و به دلایل امنیتی ارسال نشد.', true);
          byId('smsBox').value = '';
          return;
        }
        if (!getToken()) {
          showToast('ابتدا در تب تنظیمات ساده، کارت بلوبانک خود را ثبت کنید.', true);
          switchTab('settings');
          return;
        }
        apiJson('POST', '/api/payment/ios/sms', {
          sender: 'BluBank-iOS',
          body: clean,
          deviceModel: 'iPhone (BluBank WebApp)'
        }, function(status, res) {
          if (status >= 200 && status < 300 && res && res.ok) {
            byId('smsBox').value = '';
            if (res.matched) {
              playChime();
              showToast('🎉 واریز بلوبانک تطبیق یافت و اشتراک مشتری تحویل شد!');
            } else {
              showToast('پیامک بررسی شد (' + (res.status || 'ثبت شد') + ')');
            }
            pollServer(false);
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
          receivedAt: first.ts
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
              showToast('کلیپ‌بورد خالی است؛ پیامک بلوبانک را کپی یا پایین Paste کنید.', true);
              return;
            }
            byId('smsBox').value = txt;
            sendSmsPayload(txt);
          }).catch(function() {
            byId('smsBox').focus();
            showToast('در iOS زیر ۱۶ روی کادر پایین بزنید و Paste را لمس کنید تا خودکار تایید شود.');
          });
        } else {
          byId('smsBox').focus();
          showToast('روی کادر متن بزنید و گزینه Paste را لمس کنید.');
        }
      };

      window.quickConfirmInvoice = function(paymentId, amountTomanStr) {
        if (!window.confirm('آیا واریز مبلغ ' + amountTomanStr + ' تومان به حساب بلوبانک خود را تایید می‌کنید؟')) {
          return;
        }
        apiJson('POST', '/api/payment/ios/quick-confirm', { paymentId: paymentId }, function(status, res) {
          if (status === 200 && res && res.ok) {
            playChime();
            showToast('✅ پرداخت تایید شد و کد اشتراک برای مشتری در سایت و تلگرام ارسال گردید!');
            pollServer(false);
          } else {
            showToast('خطا در تایید تراکنش.', true);
          }
        });
      };

      window.decideSuspiciousReceipt = function(paymentId, op) {
        var msg = op === 'approve'
          ? 'آیا پس از بررسی، این رسید بانکی را تایید و اشتراک مشتری را فعال می‌کنید؟'
          : 'آیا این رسید مشکوک رد شود؟';
        if (!window.confirm(msg)) return;
        apiJson('POST', '/api/payment/ios/review-decision', { paymentId: paymentId, op: op }, function(status, res) {
          if (status === 200 && res && res.ok) {
            showToast(op === 'approve' ? '✅ رسید تایید و اشتراک مشتری فعال شد!' : '❌ رسید مشکوک رد شد.');
            pollServer(false);
          } else {
            showToast('خطا در ثبت تصمیم.', true);
          }
        });
      };

      window.viewReceiptPhoto = function(paymentId) {
        apiJson('GET', '/api/payment/ios/receipt-image?payment_id=' + encodeURIComponent(paymentId), null, function(status, res) {
          if (status === 200 && res && res.ok && res.data_uri) {
            byId('receiptModalImg').src = res.data_uri;
            byId('receiptModal').className = 'modal-backdrop';
          } else {
            showToast('تصویری برای این رسید ثبت نشده است.', true);
          }
        });
      };

      window.closeReceiptModal = function() {
        byId('receiptModal').className = 'modal-backdrop hidden';
        byId('receiptModalImg').src = '';
      };

      window.pollServer = function(manual) {
        var tok = getToken();
        if (!tok) return;
        flushOfflineQueue();
        apiJson('GET', '/api/payment/ios/poll', null, function(status, res) {
          if (status === 200 && res && res.ok) {
            byId('connBadge').className = 'badge badge-ok';
            byId('connDot').className = 'dot dot-ok';
            byId('connText').textContent = 'متصل و همگام';

            if (res.card_summary) {
              byId('pillCard').textContent = '💳 ' + (res.card_summary.bank || 'کارت فعال') + ' (' + res.card_summary.holder_name + ')';
            }
            byId('pillTg').textContent = res.telegram_ready ? '🤖 تلگرام: متصل ✅' : '🤖 تلگرام: تنظیم‌نشده';
            byId('pillAi').textContent = res.vision_ready ? '🧠 رسیدخوان: فعال ✅' : '🧠 رسیدخوان: دستی';

            var pendings = res.pending_orders || [];
            var reviews = res.review_orders || [];
            byId('statPending').textContent = toFa(pendings.length);
            byId('statReview').textContent = toFa(reviews.length);
            byId('statMatched').textContent = toFa(res.matched_count || 0);

            renderReviewOrders(reviews);
            renderPendingOrders(pendings);
            renderLogs(res.recent_logs || []);
            if (manual) showToast('وضعیت با سرور همگام‌سازی شد ✅');
          } else if (status === 401) {
            byId('connBadge').className = 'badge badge-err';
            byId('connText').textContent = 'نیاز به اتصال مجدد';
          } else {
            byId('connBadge').className = 'badge badge-warn';
            byId('connText').textContent = 'آفلاین / تلاش مجدد';
          }
        });
      };

      function renderReviewOrders(list) {
        var card = byId('reviewCard');
        var box = byId('reviewList');
        if (!list.length) {
          card.className = 'card card-rose hidden';
          box.innerHTML = '';
          return;
        }
        card.className = 'card card-rose';
        var hasNew = false;
        var html = '';
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (!knownReviewIds[r.id]) {
            knownReviewIds[r.id] = true;
            hasNew = true;
          }
          var tomanStr = fmtComma(Math.floor((r.payable_amount_rial || 0) / 10));
          html += '<div class="review-item">' +
            '<div class="row-between">' +
              '<span style="font-size:12px;font-weight:800;color:#FB7185;">⚠️ رسید نیازمند بررسی</span>' +
              '<span class="ltr" style="font-size:11px;color:#94A3B8;">' + escHtml(r.phone || '') + '</span>' +
            '</div>' +
            '<div style="font-size:16px;font-weight:900;color:#FDE047;margin:4px 0;">مبلغ فاکتور: ' + tomanStr + ' تومان</div>' +
            '<div style="font-size:12px;color:#E2E8F0;">📦 ' + escHtml(r.description || r.product_name || r.order_id) + '</div>' +
            (r.receipt_ref ? '<div style="font-size:11.5px;color:#7DD3FC;margin-top:3px;">🔢 پیگیری: <span class="ltr">' + escHtml(r.receipt_ref) + '</span></div>' : '') +
            (r.receipt_note ? '<div style="font-size:11.5px;color:#FCA5A5;margin-top:4px;background:rgba(0,0,0,0.3);padding:8px;border-radius:10px;">' + escHtml(r.receipt_note) + '</div>' : '') +
            (r.has_image ? '<button type="button" class="btn btn-slate" style="margin-top:8px;padding:9px;" onclick="viewReceiptPhoto(\\'' + escHtml(r.id) + '\\')">🖼 مشاهده تصویر رسید ارسالی</button>' : '') +
            '<div class="grid-2">' +
              '<button type="button" class="btn" style="padding:10px;" onclick="decideSuspiciousReceipt(\\'' + escHtml(r.id) + '\\', \\'approve\\')">✅ تایید و تحویل</button>' +
              '<button type="button" class="btn btn-rose" style="padding:10px;" onclick="decideSuspiciousReceipt(\\'' + escHtml(r.id) + '\\', \\'reject\\')">❌ رد رسید</button>' +
            '</div>' +
          '</div>';
        }
        box.innerHTML = html;
        if (hasNew) playChime();
      }

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
              '<span style="font-size:12px;font-weight:800;color:#38BDF8;">⏳ منتظر واریز بلوبانک</span>' +
              '<span class="ltr" style="font-size:11px;color:#94A3B8;">' + toFa(mins) + ':' + toFa(secs < 10 ? '0' + secs : secs) + '</span>' +
            '</div>' +
            '<div class="amount-big">' + tomanStr + ' تومان</div>' +
            '<div style="font-size:11.5px;color:#94A3B8;">مبلغ دقیق پیامک بلوبانک: <b style="color:#E2E8F0;">' + rialStr + ' ریال</b></div>' +
            '<div style="font-size:12px;color:#CBD5E1;margin-top:4px;">📦 ' + escHtml(o.description || o.product_name || o.order_id) +
              (o.phone ? ' • <span class="ltr">' + escHtml(o.phone) + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn btn-amber" style="margin-top:10px;padding:10px;" onclick="quickConfirmInvoice(\\'' + escHtml(o.id) + '\\', \\'' + escHtml(tomanStr) + '\\')">' +
              '✅ واریز به بلوبانکم نشست — تایید ۱-ضربه‌ای' +
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
      } else {
        // Open directly on the simple 1-step setup screen on first launch!
        switchTab('settings');
      }

      setInterval(function() {
        if (getToken()) pollServer(false);
      }, 5000);
    })();
  </script>
</body>
</html>`;
};
