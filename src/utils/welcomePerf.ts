/**
 * Performance logging for the Welcome flow (Metro + `adb logcat`).
 *
 * How to interpret:
 * - **mac_resolve_ms** high → frontend/Android: native MAC scan (sysfs, getprop) or device-info.
 *   Fix: set WELCOME_DEVICE_MAC_OVERRIDE to skip probing.
 * - **welcome_fetch_ms** high → network + server: TV → CMS round-trip until response is received.
 *   Compare with `curl` / browser from a PC on the same LAN; if curl is also slow → **backend** (PHP/DB/network).
 *   If curl is fast but fetch_ms high → Wi‑Fi/Ethernet path, firewall, or wrong host/port on device.
 * - **welcome_json_ms** high → rare; huge response body or slow bridge.
 * - **welcome_flow_breakdown** (`ms` = full run): includes **mac_ms**, **fetch_ms**, **mac_path**, **fetch_outcome**
 *   in one log line so you do not need earlier `mac_resolve` / `welcome_fetch` entries.
 */

export function logWelcomePerf(phase: string, ms: number, extra?: Record<string, string | number>): void {
  console.log('[WelcomePerf]', { phase, ms, ...extra });
}
