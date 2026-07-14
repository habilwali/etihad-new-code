package com.hoteltv

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.*
import android.widget.ImageButton
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * AlertOverlayService
 * ───────────────────
 * Android foreground service that keeps running even when the HotelTV app is
 * closed or the user is in another app (YouTube, browser, etc.).
 *
 * What it does:
 *  1. Polls the CMS emergency-alert endpoint every POLL_INTERVAL_SEC seconds.
 *  2. Connects to the CMS WebSocket for real-time push delivery.
 *  3. When an alert arrives, draws a full-screen overlay using
 *     SYSTEM_ALERT_WINDOW so it appears over ANY app currently on screen.
 *  4. Auto-dismisses after AUTO_DISMISS_SEC seconds (with a live countdown).
 *
 * Started by:
 *  • MainApplication.onCreate() on every app launch.
 *  • BootReceiver after the device boots (reads saved config from SharedPrefs).
 *  • AlertOverlayModule (React Native bridge) when JS calls startService().
 */
class AlertOverlayService : Service() {

    // ── Constants ──────────────────────────────────────────────────────────────
    companion object {
        const val CHANNEL_ID        = "hotel_alert_service"
        const val NOTIF_ID          = 1001
        const val POLL_INTERVAL_SEC = 20L
        const val AUTO_DISMISS_SEC  = 30

        // Intent extras
        const val EXTRA_CMS_HOST  = "cms_host"
        const val EXTRA_CMS_PORT  = "cms_port"
        const val EXTRA_MAC       = "mac_address"

        // SharedPreferences key
        const val PREFS_NAME           = "alert_service_prefs"
        const val PREFS_SHOWN_IDS      = "shown_alert_ids"
    }

    // ── State ──────────────────────────────────────────────────────────────────
    private val mainHandler    = Handler(Looper.getMainLooper())
    private val executor       = Executors.newScheduledThreadPool(2)
    private var pollFuture: ScheduledFuture<*>? = null
    private var wsThread: Thread? = null
    private var wsRunning      = false

    private var cmsHost        = "10.10.120.11"
    private var cmsPort        = "80"
    private var macAddress     = ""

    // Currently displayed overlay view (null when no alert is showing)
    private var overlayView: View? = null
    private var dismissRunnable: Runnable? = null

    // Track IDs we have already shown — persisted in SharedPrefs so reboots
    // and service restarts don't re-show alerts the user has already seen.
    private val shownAlertIds  = mutableSetOf<String>()

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildForegroundNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Read config from intent or fall back to saved SharedPrefs
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        cmsHost    = intent?.getStringExtra(EXTRA_CMS_HOST)  ?: prefs.getString(EXTRA_CMS_HOST,  cmsHost)    ?: cmsHost
        cmsPort    = intent?.getStringExtra(EXTRA_CMS_PORT)  ?: prefs.getString(EXTRA_CMS_PORT,  cmsPort)    ?: cmsPort
        macAddress = intent?.getStringExtra(EXTRA_MAC)       ?: prefs.getString(EXTRA_MAC,       macAddress) ?: macAddress

        // Persist config for BootReceiver restarts
        prefs.edit()
            .putString(EXTRA_CMS_HOST, cmsHost)
            .putString(EXTRA_CMS_PORT, cmsPort)
            .putString(EXTRA_MAC,      macAddress)
            .apply()

        // Restore previously shown alert IDs so we don't re-show them after restart
        val saved = prefs.getStringSet(PREFS_SHOWN_IDS, emptySet()) ?: emptySet()
        shownAlertIds.addAll(saved)

        startPolling()
        startWebSocket()
        return START_STICKY  // restart automatically if killed by OS
    }

    override fun onDestroy() {
        super.onDestroy()
        wsRunning = false
        wsThread?.interrupt()
        pollFuture?.cancel(true)
        executor.shutdownNow()
        dismissOverlay()
    }

    // ── Polling ────────────────────────────────────────────────────────────────

    private fun startPolling() {
        pollFuture?.cancel(false)
        pollFuture = executor.scheduleWithFixedDelay({
            fetchAlerts()
        }, 0L, POLL_INTERVAL_SEC, TimeUnit.SECONDS)
    }

    private fun fetchAlerts() {
        try {
            val mac  = if (macAddress.isNotEmpty()) "&mac=${macAddress}" else ""
            val url  = "http://$cmsHost:$cmsPort/emergency-alerts/index.php?api=alert$mac"
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 8_000
            conn.readTimeout    = 8_000
            conn.requestMethod  = "GET"

            if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                val body = BufferedReader(InputStreamReader(conn.inputStream)).readText()
                parseAndShowAlerts(body)
            }
            conn.disconnect()
        } catch (_: Exception) { /* network error — silently ignore */ }
    }

    // ── WebSocket ──────────────────────────────────────────────────────────────

    private fun startWebSocket() {
        if (wsRunning) return
        wsRunning = true
        wsThread = Thread {
            while (wsRunning) {
                try {
                    connectWebSocket()
                } catch (_: Exception) { /* reconnect */ }
                if (wsRunning) Thread.sleep(5_000) // wait 5 s before retry
            }
        }.also { it.isDaemon = true; it.start() }
    }

    /**
     * Minimal WebSocket client using raw sockets (no external dependency).
     * Handles the WS handshake and reads text frames.
     */
    private fun connectWebSocket() {
        val mac    = if (macAddress.isNotEmpty()) "/?mac=${macAddress}" else "/"
        val wsUrl  = "ws://$cmsHost:8765$mac"

        // Use Android's built-in HttpURLConnection trick: upgrade to WS manually
        // via a lightweight hand-rolled frame reader (avoids OkHttp dependency).
        val socket = java.net.Socket()
        socket.connect(java.net.InetSocketAddress(cmsHost, 8765), 8_000)
        socket.soTimeout = 60_000

        val out = socket.getOutputStream()
        val inp = java.io.BufferedReader(java.io.InputStreamReader(socket.getInputStream()))

        // Send HTTP upgrade request
        val key  = android.util.Base64.encodeToString(java.util.UUID.randomUUID().toString().toByteArray(), android.util.Base64.NO_WRAP)
        val path = if (macAddress.isNotEmpty()) "/?mac=$macAddress" else "/"
        val req  = "GET $path HTTP/1.1\r\nHost: $cmsHost:8765\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n"
        out.write(req.toByteArray())
        out.flush()

        // Read response headers until blank line
        var line = inp.readLine()
        while (!line.isNullOrEmpty()) { line = inp.readLine() }

        // Read raw WS frames
        val rawIn = socket.getInputStream()
        val buf   = ByteArray(8192)
        while (wsRunning && !socket.isClosed) {
            val b0  = rawIn.read(); if (b0 < 0) break
            val b1  = rawIn.read(); if (b1 < 0) break
            val masked = (b1 and 0x80) != 0
            var len = (b1 and 0x7F).toLong()
            if (len == 126L) {
                len = ((rawIn.read() shl 8) or rawIn.read()).toLong()
            } else if (len == 127L) {
                len = 0; repeat(8) { len = (len shl 8) or rawIn.read().toLong() }
            }
            val mask = if (masked) ByteArray(4).also { rawIn.read(it) } else null
            val payload = ByteArray(len.toInt())
            var read = 0
            while (read < len) { read += rawIn.read(payload, read, (len - read).toInt()) }
            if (mask != null) { payload.forEachIndexed { i, b -> payload[i] = (b.toInt() xor mask[i % 4].toInt()).toByte() } }
            val opcode = b0 and 0x0F
            if (opcode == 1) {  // text frame
                parseAndShowAlerts(String(payload))
            }
        }
        socket.close()
    }

    // ── Alert Parsing ──────────────────────────────────────────────────────────

    /** Mirror JS isTruthyActive() from useAlertListener */
    private fun isTruthyActive(v: Any?): Boolean {
        if (v == null) return false
        if (v is Boolean) return v
        if (v is Int) return v == 1
        if (v is String) {
            val s = v.trim().lowercase()
            return s == "1" || s == "true" || s == "yes" || s == "on"
        }
        return false
    }

    /** Stable ID from content — prevents re-showing same alert across polls/restarts */
    private fun stableContentId(title: String, message: String): String =
        (title + "|" + message).hashCode().toString()

    private fun parseAndShowAlerts(raw: String) {
        try {
            val items: List<JSONObject> = when {
                raw.trimStart().startsWith('[') -> {
                    val arr = org.json.JSONArray(raw)
                    (0 until arr.length()).map { arr.getJSONObject(it) }
                }
                raw.trimStart().startsWith('{') -> listOf(JSONObject(raw))
                else -> return
            }

            for (obj in items) {
                val activeVal = obj.opt("active")

                // If CMS marks alert as inactive/dismissed → dismiss overlay
                val isDismiss = activeVal == false || activeVal == 0 ||
                    (activeVal is String && listOf("false","0","no","off")
                        .contains(activeVal.trim().lowercase())) ||
                    obj.optString("status","").trim().lowercase()
                        .let { it == "dismiss" || it == "dismissed" }

                if (isDismiss) {
                    mainHandler.post { dismissOverlay() }
                    continue
                }

                // Only show when active=true/1, OR when active is absent but has content
                val active = isTruthyActive(activeVal)
                if (!active && activeVal != null) continue   // active field present but false-y

                val title   = obj.optString("title",   obj.optString("subject",  "Alert"))
                val message = obj.optString("message", obj.optString("body", obj.optString("content", "")))
                if (title.isEmpty() && message.isEmpty()) continue

                // Stable ID — never use currentTimeMillis() as fallback
                val id = obj.optString("id", obj.optString("alert_id",
                    obj.optString("notification_id", stableContentId(title, message))))

                if (shownAlertIds.contains(id)) continue

                shownAlertIds.add(id)
                if (shownAlertIds.size > 200) shownAlertIds.clear()
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putStringSet(PREFS_SHOWN_IDS, shownAlertIds.toSet())
                    .apply()

                mainHandler.post { showOverlay(title, message) }
                return
            }
        } catch (_: Exception) { /* malformed JSON */ }
    }

    // ── Overlay ────────────────────────────────────────────────────────────────

    private fun showOverlay(title: String, message: String) {
        if (!Settings.canDrawOverlays(this)) return
        dismissOverlay() // dismiss any existing overlay first

        val wm     = getSystemService(WINDOW_SERVICE) as WindowManager
        val inflater = LayoutInflater.from(this)
        val view   = inflater.inflate(R.layout.alert_overlay, null)

        val tvTitle   = view.findViewById<TextView>(R.id.alert_title)
        val tvMessage = view.findViewById<TextView>(R.id.alert_message)
        val tvTimer   = view.findViewById<TextView>(R.id.alert_timer)
        val btnDismiss= view.findViewById<ImageButton>(R.id.alert_dismiss)

        tvTitle.text   = title
        tvMessage.text = message

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_SYSTEM_ALERT

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        wm.addView(view, params)
        overlayView = view

        // Countdown + auto-dismiss
        var secondsLeft = AUTO_DISMISS_SEC
        val tick = object : Runnable {
            override fun run() {
                if (overlayView == null) return
                tvTimer.text = "Dismissing in $secondsLeft s"
                if (secondsLeft <= 0) { dismissOverlay(); return }
                secondsLeft--
                mainHandler.postDelayed(this, 1_000)
            }
        }
        mainHandler.post(tick)
        dismissRunnable = Runnable { mainHandler.removeCallbacks(tick); dismissOverlay() }

        btnDismiss.setOnClickListener { dismissRunnable?.run() }
    }

    private fun dismissOverlay() {
        val view = overlayView ?: return
        overlayView = null
        try {
            val wm = getSystemService(WINDOW_SERVICE) as WindowManager
            wm.removeView(view)
        } catch (_: Exception) {}
    }

    // ── Notification Channel ───────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Hotel Alert Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background service for hotel emergency alerts"
                setShowBadge(false)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hotel Alert Service")
            .setContentText("Monitoring for emergency alerts")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .build()
}
