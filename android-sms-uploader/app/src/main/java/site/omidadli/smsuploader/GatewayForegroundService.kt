package site.omidadli.smsuploader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.Timer
import java.util.TimerTask

class GatewayForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "omidpay_sms_gateway_channel"
        private const val NOTIFICATION_ID = 4201

        fun start(context: Context) {
            val intent = Intent(context, GatewayForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, GatewayForegroundService::class.java))
        }
    }

    private var heartbeatTimer: Timer? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        val notif = buildNotification("آماده دریافت و تایید خودکار پیامک‌های واریز بانکی")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }
        startHeartbeatLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!PrefsStore.isReady(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    private fun startHeartbeatLoop() {
        heartbeatTimer?.cancel()
        heartbeatTimer = Timer("OmidPayHeartbeat", true).apply {
            // Immediate ping + every 3 minutes
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    if (!PrefsStore.isReady(this@GatewayForegroundService)) return
                    GatewayApiClient.sendHeartbeatAndFlush(this@GatewayForegroundService)
                    val summary = PrefsStore.getLastPingSummary(this@GatewayForegroundService)
                    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.notify(NOTIFICATION_ID, buildNotification(summary))
                }
            }, 500L, 180_000L)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "سرویس تایید خودکار کارت به کارت",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "حفظ اتصال پایدار برای دریافت آنی پیامک‌های واریز بانکی"
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(subtitle: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("درگاه پیامکی امید عدلی فعال است")
            .setContentText(subtitle)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .build()
    }

    override fun onDestroy() {
        heartbeatTimer?.cancel()
        heartbeatTimer = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
