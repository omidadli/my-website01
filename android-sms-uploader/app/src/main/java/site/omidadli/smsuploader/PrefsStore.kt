package site.omidadli.smsuploader

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PrefsStore {
    private const val PREF_NAME = "omidpay_sms_uploader_prefs"
    const val ACTION_STATUS_CHANGED = "site.omidadli.smsuploader.STATUS_CHANGED"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    var serverUrl: String = ""
        private set

    fun getServerUrl(ctx: Context): String =
        prefs(ctx).getString("server_url", "https://omidadli.site/api/payment") ?: ""

    fun setServerUrl(ctx: Context, value: String) {
        prefs(ctx).edit().putString("server_url", value.trim().trimEnd('/')).apply()
    }

    fun getDeviceToken(ctx: Context): String =
        prefs(ctx).getString("device_token", "") ?: ""

    fun setDeviceToken(ctx: Context, value: String) {
        prefs(ctx).edit().putString("device_token", value.trim()).apply()
    }

    fun isConsentAccepted(ctx: Context): Boolean =
        prefs(ctx).getBoolean("consent_accepted", false)

    fun setConsentAccepted(ctx: Context, accepted: Boolean) {
        prefs(ctx).edit().putBoolean("consent_accepted", accepted).apply()
    }

    fun isServiceEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean("service_enabled", false)

    fun setServiceEnabled(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean("service_enabled", enabled).apply()
    }

    fun isReady(ctx: Context): Boolean =
        isConsentAccepted(ctx) &&
            isServiceEnabled(ctx) &&
            getServerUrl(ctx).startsWith("https://") &&
            getDeviceToken(ctx).isNotBlank()

    fun getUploadedCount(ctx: Context): Int = prefs(ctx).getInt("uploaded_count", 0)
    fun incrementUploaded(ctx: Context) {
        prefs(ctx).edit().putInt("uploaded_count", getUploadedCount(ctx) + 1).apply()
    }

    fun getMatchedCount(ctx: Context): Int = prefs(ctx).getInt("matched_count", 0)
    fun incrementMatched(ctx: Context) {
        prefs(ctx).edit().putInt("matched_count", getMatchedCount(ctx) + 1).apply()
    }

    fun getLastPingSummary(ctx: Context): String =
        prefs(ctx).getString("last_ping", "هنوز اتصالی برقرار نشده") ?: ""

    fun setLastPingSummary(ctx: Context, text: String) {
        prefs(ctx).edit().putString("last_ping", text).apply()
    }

    fun appendLog(ctx: Context, message: String) {
        val stamp = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        val raw = prefs(ctx).getString("event_logs", "[]") ?: "[]"
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        val next = JSONArray()
        next.put("[$stamp] $message")
        for (i in 0 until minOf(arr.length(), 29)) {
            next.put(arr.optString(i))
        }
        prefs(ctx).edit().putString("event_logs", next.toString()).apply()
        ctx.sendBroadcast(android.content.Intent(ACTION_STATUS_CHANGED).setPackage(ctx.packageName))
    }

    fun getLogs(ctx: Context): List<String> {
        val raw = prefs(ctx).getString("event_logs", "[]") ?: "[]"
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        val out = mutableListOf<String>()
        for (i in 0 until arr.length()) out.add(arr.optString(i))
        return out
    }

    /**
     * Parses the 1-click JSON connection payload copied from Admin -> Payment Gateway -> Devices:
     * {"serverUrl":"https://omidadli.site/api/payment","deviceToken":"omid_dev_...","deviceName":"..."}
     */
    fun applyQuickJsonConfig(ctx: Context, rawText: String): Boolean {
        return try {
            val obj = JSONObject(rawText.trim())
            val url = obj.optString("server_url", obj.optString("serverUrl", "")).trim()
            val token = obj.optString("device_token", obj.optString("deviceToken", "")).trim()
            if (url.isEmpty() || token.isEmpty()) return false
            setServerUrl(ctx, url)
            setDeviceToken(ctx, token)
            appendLog(ctx, "پیکربندی ۱-کلیکی با موفقیت بارگذاری شد.")
            true
        } catch (_: Exception) {
            false
        }
    }
}
