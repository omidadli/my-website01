package site.omidadli.smsuploader

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object GatewayApiClient {
    private const val APP_VERSION = "1.0.0"

    private fun readBatteryLevel(ctx: Context): Int {
        return try {
            val status = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = status?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = status?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100) / scale else -1
        } catch (_: Exception) {
            -1
        }
    }

    private fun deviceModelName(): String =
        "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})"

    private fun postJson(endpointUrl: String, token: String, payload: JSONObject): Pair<Int, JSONObject?> {
        val conn = (URL(endpointUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 15_000
            doInput = true
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("X-Device-Token", token)
        }
        return try {
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.let {
                BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use { r -> r.readText() }
            } ?: ""
            val json = try { JSONObject(text) } catch (_: Exception) { null }
            Pair(code, json)
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Sends heartbeat ping to /api/payment/device/ping and flushes any queued offline SMS.
     */
    fun sendHeartbeatAndFlush(ctx: Context): Boolean {
        val baseUrl = PrefsStore.getServerUrl(ctx)
        val token = PrefsStore.getDeviceToken(ctx)
        if (baseUrl.isBlank() || token.isBlank()) return false

        val ok = try {
            val body = JSONObject().apply {
                put("batteryLevel", readBatteryLevel(ctx))
                put("deviceModel", deviceModelName())
                put("appVersion", APP_VERSION)
            }
            val (code, json) = postJson("$baseUrl/device/ping", token, body)
            if (code == 200 && json?.optBoolean("ok") == true) {
                val dataObj = json.optJSONObject("data")
                val pendingOrders = dataObj?.optInt("pending_payments", -1)?.takeIf { it >= 0 }
                    ?: json.optInt("pendingOrdersCount", 0)
                PrefsStore.setLastPingSummary(ctx, "متصل ✅ (فاکتورهای باز سرور: $pendingOrders)")
                true
            } else {
                val err = json?.optString("error") ?: "HTTP $code"
                PrefsStore.setLastPingSummary(ctx, "خطا در اتصال: $err")
                PrefsStore.appendLog(ctx, "خطای پینگ سرور: $err")
                false
            }
        } catch (e: Exception) {
            PrefsStore.setLastPingSummary(ctx, "عدم دسترسی به اینترنت / سرور")
            false
        }

        flushQueue(ctx)
        return ok
    }

    /**
     * Flushes queued banking SMS messages in strict FIFO order.
     */
    @Synchronized
    fun flushQueue(ctx: Context) {
        if (!PrefsStore.isReady(ctx)) return
        val baseUrl = PrefsStore.getServerUrl(ctx)
        val token = PrefsStore.getDeviceToken(ctx)
        val queue = OfflineQueueDb(ctx)
        val items = queue.peekBatch()

        for (item in items) {
            try {
                val payload = JSONObject().apply {
                    put("sender", item.sender)
                    put("body", item.body)
                    put("receivedAt", item.receivedAtIso)
                    put("batteryLevel", readBatteryLevel(ctx))
                    put("deviceModel", deviceModelName())
                    put("appVersion", APP_VERSION)
                }
                val (code, json) = postJson("$baseUrl/device/sms", token, payload)
                if (code in 200..299 && json?.optBoolean("ok") == true) {
                    queue.deleteById(item.id)
                    PrefsStore.incrementUploaded(ctx)
                    val status = json.optString("status", "")
                    val matched = json.optBoolean("matched", false)
                    val payId = json.optString("matchedPaymentId", "")
                    if (matched) {
                        PrefsStore.incrementMatched(ctx)
                        PrefsStore.appendLog(ctx, "✅ واریز بانکی تطبیق یافت! شناسه تراکنش: $payId")
                    } else {
                        PrefsStore.appendLog(ctx, "پیامک بانکی بررسی شد ($status)")
                    }
                } else if (code == 401 || code == 403) {
                    PrefsStore.appendLog(ctx, "❌ توکن دستگاه نامعتبر یا غیرفعال است (HTTP $code)")
                    break
                } else {
                    queue.incrementAttempt(item.id)
                }
            } catch (e: Exception) {
                queue.incrementAttempt(item.id)
                PrefsStore.appendLog(ctx, "ذخیره در صف آفلاین (تلاش مجدد خودکار): ${e.message ?: "خطای شبکه"}")
                break
            }
        }
    }
}
