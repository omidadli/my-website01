package site.omidadli.smsuploader

object BankSmsFilter {
    private val OTP_KEYWORDS = listOf(
        "رمز پویا",
        "رمز دوم",
        "کد تایید",
        "کد تأیید",
        "کد ورود",
        "کد فعالسازی",
        "کد اعتبارسنجی",
        "otp",
        "verification code",
        "security code"
    )

    private val BANK_INDICATORS = listOf(
        "بانک",
        "واریز",
        "حساب",
        "مبلغ",
        "ریال",
        "تومان",
        "بستانکار",
        "مانده",
        "بلوبانک",
        "ویپاد",
        "bank",
        "variz"
    )

    private fun normalizeDigits(text: String): String {
        val sb = StringBuilder(text.length)
        for (ch in text) {
            when (ch) {
                in '۰'..'۹' -> sb.append(('0'.code + (ch.code - '۰'.code)).toChar())
                in '٠'..'٩' -> sb.append(('0'.code + (ch.code - '٠'.code)).toChar())
                'ي' -> sb.append('ی')
                'ك' -> sb.append('ک')
                else -> sb.append(ch)
            }
        }
        return sb.toString()
    }

    /**
     * Hard local security boundary: OTP / dynamic password SMS messages are NEVER uploaded.
     */
    fun isOtpMessage(body: String): Boolean {
        val norm = normalizeDigits(body).lowercase()
        return OTP_KEYWORDS.any { norm.contains(it) }
    }

    /**
     * Checks whether the SMS looks like a banking financial notification.
     */
    fun looksLikeBankSms(sender: String, body: String): Boolean {
        if (isOtpMessage(body)) return false
        val norm = normalizeDigits(body).lowercase()
        val cleanSender = sender.trim()
        // Iranian bank SMS senders typically start with 983000..., 982000..., 981000..., +98..., or Bank name
        val bankSenderLike = cleanSender.any { it.isLetter() } ||
            cleanSender.contains("1000") ||
            cleanSender.contains("2000") ||
            cleanSender.contains("3000") ||
            cleanSender.contains("5000") ||
            cleanSender.length in 4..16

        val keywordMatches = BANK_INDICATORS.count { norm.contains(it) }
        return bankSenderLike && keywordMatches >= 2
    }
}
