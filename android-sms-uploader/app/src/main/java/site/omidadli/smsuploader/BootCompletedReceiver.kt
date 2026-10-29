package site.omidadli.smsuploader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (
            intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            if (PrefsStore.isReady(context)) {
                PrefsStore.appendLog(context, "راه‌اندازی خودکار سرویس پس از روشن شدن گوشی.")
                GatewayForegroundService.start(context)
            }
        }
    }
}
