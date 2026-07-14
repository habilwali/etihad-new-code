package com.hoteltv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * BootReceiver
 * ────────────
 * Listens for BOOT_COMPLETED and QUICKBOOT_POWERON (some Chinese TV boxes).
 * When the device powers on, restarts AlertOverlayService so alert monitoring
 * resumes without the user needing to open the HotelTV app first.
 *
 * Config (cms host, port, mac) is read from SharedPreferences where
 * AlertOverlayService saved them on its last run.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED &&
            intent?.action != "android.intent.action.QUICKBOOT_POWERON") return

        val prefs = context.getSharedPreferences(
            AlertOverlayService.PREFS_NAME, Context.MODE_PRIVATE
        )
        val cmsHost = prefs.getString(AlertOverlayService.EXTRA_CMS_HOST, "10.10.120.11") ?: "10.10.120.11"
        val cmsPort = prefs.getString(AlertOverlayService.EXTRA_CMS_PORT, "80")           ?: "80"
        val mac     = prefs.getString(AlertOverlayService.EXTRA_MAC,      "")             ?: ""

        val serviceIntent = Intent(context, AlertOverlayService::class.java).apply {
            putExtra(AlertOverlayService.EXTRA_CMS_HOST, cmsHost)
            putExtra(AlertOverlayService.EXTRA_CMS_PORT, cmsPort)
            putExtra(AlertOverlayService.EXTRA_MAC,      mac)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
