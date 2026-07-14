package com.hoteltv

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

/**
 * AlertOverlayModule
 * ──────────────────
 * React Native bridge module that lets JavaScript start/stop the
 * AlertOverlayService and check whether the SYSTEM_ALERT_WINDOW permission
 * has been granted.
 *
 * JS usage:
 *   import AlertOverlayService from '../native/AlertOverlayService';
 *   AlertOverlayService.startService('10.10.120.11', '80', 'AA:BB:CC:DD:EE:FF');
 */
class AlertOverlayModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlertOverlayModule"

    /**
     * Start the background alert service.
     * @param cmsHost  CMS server hostname or IP (e.g. "10.10.120.11")
     * @param cmsPort  CMS HTTP port (e.g. "80")
     * @param mac      Device MAC address for per-room targeting
     */
    @ReactMethod
    fun startService(cmsHost: String, cmsPort: String, mac: String) {
        val ctx    = reactContext.applicationContext
        val intent = Intent(ctx, AlertOverlayService::class.java).apply {
            putExtra(AlertOverlayService.EXTRA_CMS_HOST, cmsHost)
            putExtra(AlertOverlayService.EXTRA_CMS_PORT, cmsPort)
            putExtra(AlertOverlayService.EXTRA_MAC,      mac)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    /** Stop the background alert service. */
    @ReactMethod
    fun stopService() {
        val ctx = reactContext.applicationContext
        ctx.stopService(Intent(ctx, AlertOverlayService::class.java))
    }

    /**
     * Check if SYSTEM_ALERT_WINDOW permission is granted.
     * Returns a JS Promise<boolean>.
     */
    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactContext.applicationContext))
    }

    /**
     * Open the system settings page for SYSTEM_ALERT_WINDOW so the user can
     * grant the permission manually.
     */
    @ReactMethod
    fun requestOverlayPermission() {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${reactContext.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactContext.startActivity(intent)
        } catch (_: Exception) {}
    }
}
