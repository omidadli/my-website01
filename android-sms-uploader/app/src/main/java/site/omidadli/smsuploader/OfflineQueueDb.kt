package site.omidadli.smsuploader

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class QueuedSms(
    val id: Long,
    val sender: String,
    val body: String,
    val receivedAtIso: String,
    val attempts: Int
)

class OfflineQueueDb(context: Context) : SQLiteOpenHelper(context, "omidpay_sms_queue.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS pending_sms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                body TEXT NOT NULL,
                received_at_iso TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun enqueue(sender: String, body: String, receivedAtIso: String): Long {
        val cv = ContentValues().apply {
            put("sender", sender)
            put("body", body)
            put("received_at_iso", receivedAtIso)
            put("attempts", 0)
            put("created_at_ms", System.currentTimeMillis())
        }
        return writableDatabase.insert("pending_sms", null, cv)
    }

    fun peekBatch(limit: Int = 15): List<QueuedSms> {
        val list = mutableListOf<QueuedSms>()
        // Drop stale messages older than 90 minutes (gateway invoices expire after 30 minutes)
        val cutoff = System.currentTimeMillis() - 90L * 60L * 1000L
        writableDatabase.delete("pending_sms", "created_at_ms < ? OR attempts > 20", arrayOf(cutoff.toString()))

        readableDatabase.query(
            "pending_sms",
            arrayOf("id", "sender", "body", "received_at_iso", "attempts"),
            null,
            null,
            null,
            null,
            "id ASC",
            limit.toString()
        ).use { c ->
            while (c.moveToNext()) {
                list.add(
                    QueuedSms(
                        id = c.getLong(0),
                        sender = c.getString(1),
                        body = c.getString(2),
                        receivedAtIso = c.getString(3),
                        attempts = c.getInt(4)
                    )
                )
            }
        }
        return list
    }

    fun deleteById(id: Long) {
        writableDatabase.delete("pending_sms", "id = ?", arrayOf(id.toString()))
    }

    fun incrementAttempt(id: Long) {
        writableDatabase.execSQL("UPDATE pending_sms SET attempts = attempts + 1 WHERE id = ?", arrayOf<Any>(id))
    }

    fun countPending(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM pending_sms", null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }
}
