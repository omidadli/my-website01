package site.omidadli.smsuploader

import android.Manifest
import android.content.BroadcastReceiver
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var statusBadge: TextView
    private lateinit var statsView: TextView
    private lateinit var pingView: TextView
    private lateinit var urlInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var consentBox: CheckBox
    private lateinit var permStatusView: TextView
    private lateinit var toggleServiceBtn: Button
    private lateinit var logsView: TextView

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread { refreshUi() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
        setContentView(buildContentView())
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(PrefsStore.ACTION_STATUS_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(statusReceiver, filter)
        }
        refreshUi()
    }

    override fun onPause() {
        try {
            unregisterReceiver(statusReceiver)
        } catch (_: Exception) {}
        super.onPause()
    }

    private fun cardBg(strokeHex: String = "#1F2937"): GradientDrawable =
        GradientDrawable().apply {
            setColor(Color.parseColor("#111827"))
            cornerRadius = dp(18).toFloat()
            setStroke(dp(1), Color.parseColor(strokeHex))
        }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun buildContentView(): View {
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#090D16"))
            isFillViewport = true
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(22), dp(18), dp(32))
        }

        // 1. Header & Live Status Card
        val headerCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg("#10B981")
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        val title = TextView(this).apply {
            text = "⚡ درگاه کارت‌به‌کارت خودکار امید عدلی"
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }
        statusBadge = TextView(this).apply {
            textSize = 13f
            setPadding(0, dp(8), 0, dp(4))
        }
        pingView = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#9CA3AF"))
        }
        statsView = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#34D399"))
            setPadding(0, dp(6), 0, 0)
        }
        headerCard.addView(title)
        headerCard.addView(statusBadge)
        headerCard.addView(pingView)
        headerCard.addView(statsView)
        root.addView(headerCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })

        // 2. Server & Device Token Config Card
        val cfgCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg()
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        cfgCard.addView(TextView(this).apply {
            text = "۱. تنظیمات اتصال به سرور سایت"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        })

        val pasteBtn = Button(this).apply {
            text = "📋 الصاق خودکار رشته اتصال از کلیپ‌بورد"
            isAllCaps = false
            setBackgroundColor(Color.parseColor("#4F46E5"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                val cb = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = cb.primaryClip?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() ?: ""
                if (PrefsStore.applyQuickJsonConfig(this@MainActivity, clip)) {
                    urlInput.setText(PrefsStore.getServerUrl(this@MainActivity))
                    tokenInput.setText(PrefsStore.getDeviceToken(this@MainActivity))
                    Toast.makeText(this@MainActivity, "تنظیمات با موفقیت جایگذاری شد ✅", Toast.LENGTH_SHORT).show()
                    refreshUi()
                } else {
                    Toast.makeText(this@MainActivity, "ابتدا دکمه «کپی رشته اتصال» را در پنل ادمین سایت بزنید.", Toast.LENGTH_LONG).show()
                }
            }
        }
        cfgCard.addView(pasteBtn, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10); bottomMargin = dp(10) })

        urlInput = EditText(this).apply {
            hint = "https://omidadli.site/api/payment"
            setText(PrefsStore.getServerUrl(this@MainActivity))
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#6B7280"))
            textDirection = View.TEXT_DIRECTION_LTR
            gravity = Gravity.LEFT
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }
        tokenInput = EditText(this).apply {
            hint = "Device Token (omid_dev_...)"
            setText(PrefsStore.getDeviceToken(this@MainActivity))
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#6B7280"))
            textDirection = View.TEXT_DIRECTION_LTR
            gravity = Gravity.LEFT
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        }
        cfgCard.addView(urlInput)
        cfgCard.addView(tokenInput)

        consentBox = CheckBox(this).apply {
            text = "تأیید می‌کنم پیامک‌های واریز بانکی (به‌جز رمزهای پویا/OTP که روی خود گوشی فیلتر و مسدود می‌شوند) به سرور اختصاصی خودم ارسال شوند."
            isChecked = PrefsStore.isConsentAccepted(this@MainActivity)
            setTextColor(Color.parseColor("#D1D5DB"))
            textSize = 12f
            setOnCheckedChangeListener { _, checked ->
                PrefsStore.setConsentAccepted(this@MainActivity, checked)
                refreshUi()
            }
        }
        cfgCard.addView(consentBox, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })

        val saveBtn = Button(this).apply {
            text = "ذخیره تنظیمات و تست پینگ سرور"
            isAllCaps = false
            setBackgroundColor(Color.parseColor("#059669"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                PrefsStore.setServerUrl(this@MainActivity, urlInput.text.toString())
                PrefsStore.setDeviceToken(this@MainActivity, tokenInput.text.toString())
                Thread {
                    val ok = GatewayApiClient.sendHeartbeatAndFlush(this@MainActivity)
                    runOnUiThread {
                        Toast.makeText(
                            this@MainActivity,
                            if (ok) "اتصال به سرور با موفقیت تأیید شد ✅" else "خطا در اتصال؛ آدرس سرور و توکن را بررسی کنید.",
                            Toast.LENGTH_LONG
                        ).show()
                        refreshUi()
                    }
                }.start()
            }
        }
        cfgCard.addView(saveBtn, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        root.addView(cfgCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })

        // 3. Permissions & Battery Optimization Card
        val permCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg()
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        permCard.addView(TextView(this).apply {
            text = "۲. دسترسی پیامک و بهینه‌سازی باتری"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        })
        permStatusView = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#D1D5DB"))
            setPadding(0, dp(8), 0, dp(10))
        }
        permCard.addView(permStatusView)

        val grantPermBtn = Button(this).apply {
            text = "اعطای دسترسی پیامک و اعلان"
            isAllCaps = false
            setOnClickListener { requestNeededPermissions() }
        }
        val batteryBtn = Button(this).apply {
            text = "غیرفعال‌سازی محدودیت باتری (Unrestricted)"
            isAllCaps = false
            setOnClickListener { requestIgnoreBatteryOptimizations() }
        }
        permCard.addView(grantPermBtn)
        permCard.addView(batteryBtn)
        root.addView(permCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })

        // 4. Service Master Switch
        toggleServiceBtn = Button(this).apply {
            textSize = 15f
            isAllCaps = false
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setOnClickListener { toggleListenerService() }
        }
        root.addView(toggleServiceBtn, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })

        // 5. Event Logs Card
        val logCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg()
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        logCard.addView(TextView(this).apply {
            text = "گزارش رویدادهای اخیر روی گوشی"
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        })
        logsView = TextView(this).apply {
            textSize = 11.5f
            setTextColor(Color.parseColor("#9CA3AF"))
            setPadding(0, dp(8), 0, 0)
        }
        logCard.addView(logsView)
        root.addView(logCard)

        scroll.addView(root)
        return scroll
    }

    private fun hasSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    private fun isIgnoringBatteryOpt(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun requestNeededPermissions() {
        val perms = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 101)
    }

    private fun requestIgnoreBatteryOptimizations() {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun toggleListenerService() {
        PrefsStore.setServerUrl(this, urlInput.text.toString())
        PrefsStore.setDeviceToken(this, tokenInput.text.toString())

        if (PrefsStore.isServiceEnabled(this)) {
            PrefsStore.setServiceEnabled(this, false)
            GatewayForegroundService.stop(this)
            PrefsStore.appendLog(this, "سرویس شنونده توسط کاربر متوقف شد.")
        } else {
            if (!hasSmsPermission()) {
                Toast.makeText(this, "ابتدا دسترسی دریافت پیامک را اعطا کنید.", Toast.LENGTH_LONG).show()
                requestNeededPermissions()
                return
            }
            if (!PrefsStore.isConsentAccepted(this)) {
                Toast.makeText(this, "لطفاً تیک تأیید ارسال پیامک‌های بانکی را فعال کنید.", Toast.LENGTH_LONG).show()
                return
            }
            if (!PrefsStore.getServerUrl(this).startsWith("https://") || PrefsStore.getDeviceToken(this).isBlank()) {
                Toast.makeText(this, "آدرس سرور (https) و توکن دستگاه الزامی است.", Toast.LENGTH_LONG).show()
                return
            }
            PrefsStore.setServiceEnabled(this, true)
            GatewayForegroundService.start(this)
            PrefsStore.appendLog(this, "✅ سرویس شنونده پیامک بانکی فعال شد.")
        }
        refreshUi()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refreshUi()
    }

    private fun refreshUi() {
        val active = PrefsStore.isReady(this) && hasSmsPermission()
        statusBadge.text = if (active) "🟢 وضعیت: فعال و آماده تأیید آنی واریزی‌ها" else "⚪ وضعیت: غیرفعال / نیازمند تکمیل تنظیمات"
        statusBadge.setTextColor(Color.parseColor(if (active) "#34D399" else "#FBBF24"))

        pingView.text = "وضعیت سرور: ${PrefsStore.getLastPingSummary(this)}"
        val pendingQ = OfflineQueueDb(this).countPending()
        statsView.text = "ارسال‌شده: ${PrefsStore.getUploadedCount(this)} | تطبیق موفق: ${PrefsStore.getMatchedCount(this)} | صف آفلاین: $pendingQ"

        val smsOk = if (hasSmsPermission()) "✅ فعال" else "❌ اعطا نشده"
        val batOk = if (isIgnoringBatteryOpt()) "✅ بدون محدودیت" else "⚠️ محدود (پیشنهاد: غیرفعال کنید)"
        permStatusView.text = "دسترسی پیامک: $smsOk\nبهینه‌سازی باتری: $batOk"

        val enabled = PrefsStore.isServiceEnabled(this)
        toggleServiceBtn.text = if (enabled) "⏹ توقف سرویس تایید خودکار" else "▶️ شروع سرویس تایید خودکار پیامک"
        toggleServiceBtn.setBackgroundColor(Color.parseColor(if (enabled) "#DC2626" else "#10B981"))
        toggleServiceBtn.setTextColor(Color.WHITE)

        val logs = PrefsStore.getLogs(this)
        logsView.text = if (logs.isEmpty()) "هنوز رویدادی ثبت نشده است." else logs.joinToString("\n")
    }
}
