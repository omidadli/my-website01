package site.omidadli.smsuploader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Telephony
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class SmsBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (!PrefsStore.isReady(context)) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        // Group multi-part SMS chunks by originating sender
        val grouped = LinkedHashMap<String, Pair<Long, StringBuilder>>()
        for (msg in messages) {
            val sender = msg.displayOriginatingAddress ?: msg.originatingAddress ?: "UNKNOWN"
            val ts = if (msg.timestampMillis > 0) msg.timestampMillis else System.currentTimeMillis()
            val entry = grouped.getOrPut(sender) { Pair(ts, StringBuilder()) }
            entry.second.append(msg.messageBody ?: "")
        }

        val pendingResult = goAsync()
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "omidpay:sms_upload_lock")
        wakeLock.acquire(15_000L)

        Thread {
            try {
                val isoFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val queue = OfflineQueueDb(context)
                var queuedAny = false

                for ((sender, pair) in grouped) {
                    val body = pair.second.toString().trim()
                    if (body.isEmpty()) continue

                    // Privacy protection: never upload OTP / dynamic password SMS messages
                    if (BankSmsFilter.isOtpMessage(body)) {
                        PrefsStore.appendLog(context, "🔒 پیامک حاوی رمز پویا/کد تأیید نادیده گرفته شد (ارسال نشد).")
                        continue
                    }

                    if (!BankSmsFilter.looksLikeBankSms(sender, body)) {
                        continue
                    }

                    val iso = isoFmt.format(Date(pair.first))
                    queue.enqueue(sender, body, iso)
                    queuedAny = true
                }

                if (queuedAny) {
                    GatewayApiClient.flushQueue(context)
                }
            } finally {
                if (wakeLock.isHeld) wakeLock.release()
                pendingResult.finish()
            }
        }.start()
    }
}
