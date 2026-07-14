/**
 * AlertOverlayService — JS bridge to the Android AlertOverlayModule.
 *
 * Wraps the native module so TypeScript callers get proper types and a safe
 * no-op fallback on iOS / when the module is unavailable.
 */
import { NativeModules, Platform } from 'react-native';

const { AlertOverlayModule } = NativeModules;

const AlertOverlayService = {
  /**
   * Start the background foreground service that monitors the CMS for alerts
   * and shows a system overlay when one arrives — even if another app is open.
   *
   * @param cmsHost  CMS server IP or hostname (e.g. "10.10.120.11")
   * @param cmsPort  CMS HTTP port as string (e.g. "80")
   * @param mac      Device MAC address for per-room targeting
   */
  startService(cmsHost: string, cmsPort: string, mac: string): void {
    if (Platform.OS !== 'android' || !AlertOverlayModule) return;
    AlertOverlayModule.startService(cmsHost, cmsPort, mac);
  },

  /** Stop the background service. */
  stopService(): void {
    if (Platform.OS !== 'android' || !AlertOverlayModule) return;
    AlertOverlayModule.stopService();
  },

  /** Returns true if SYSTEM_ALERT_WINDOW permission has been granted. */
  async canDrawOverlays(): Promise<boolean> {
    if (Platform.OS !== 'android' || !AlertOverlayModule) return false;
    return AlertOverlayModule.canDrawOverlays();
  },

  /**
   * Open the Android settings page so the user can grant "Draw over other apps"
   * permission. Call this when canDrawOverlays() returns false.
   */
  requestOverlayPermission(): void {
    if (Platform.OS !== 'android' || !AlertOverlayModule) return;
    AlertOverlayModule.requestOverlayPermission();
  },
};

export default AlertOverlayService;
