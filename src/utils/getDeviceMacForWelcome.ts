import { NativeModules, Platform } from 'react-native';
import { getMacAddress } from 'react-native-device-info';
import {
  DEFAULT_DEVICE_MAC,
  WELCOME_DEVICE_MAC_OVERRIDE,
  WELCOME_MAC_FALLBACK_AFTER_PROBE,
} from '../config/welcomeDevice';
import { logWelcomePerf } from './welcomePerf';
import { welcomePerfSetMac } from './welcomePerfSession';

const INVALID_PRIVACY_MAC = '02:00:00:00:00:00';

type HardwareMacNative = {
  getPreferredMac: () => Promise<string>;
  getDiagnosticInfo?: () => Promise<string>;
};

const HardwareMac = NativeModules.HardwareMac as HardwareMacNative | undefined;

/** Logs sysfs / NIC / getprop snapshot when MAC cannot be resolved (use adb logcat). */
export async function logHardwareMacDiagnostics(): Promise<void> {
  if (Platform.OS !== 'android' || !HardwareMac?.getDiagnosticInfo) return;
  try {
    const text = await HardwareMac.getDiagnosticInfo();
    console.log('[HardwareMac] diagnostic (share with support if MAC is empty):\n', text);
  } catch (e) {
    console.log('[HardwareMac] diagnostic failed', e);
  }
}

/** Uppercase MAC with colons, suitable for CMS `mac_address` matching. */
export function normalizeMacForCms(mac: string): string {
  return mac.trim().toUpperCase();
}

function resolvedFallbackMac(): string {
  const fromConfig = WELCOME_MAC_FALLBACK_AFTER_PROBE.trim();
  return normalizeMacForCms(fromConfig || DEFAULT_DEVICE_MAC);
}

/**
 * Native MAC: sysfs + NetworkInterface — **Ethernet and Wi‑Fi** (whichever exists on the device).
 */
async function getHardwareMacFromNative(): Promise<string | null> {
  if (Platform.OS !== 'android' || !HardwareMac?.getPreferredMac) return null;
  try {
    const raw = await HardwareMac.getPreferredMac();
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return null;
    if (s.toUpperCase() === INVALID_PRIVACY_MAC) return null;
    return normalizeMacForCms(s);
  } catch {
    return null;
  }
}

async function getMacFromDeviceInfo(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const mac = await getMacAddress();
    if (mac && mac.trim().length > 0 && mac.toUpperCase() !== INVALID_PRIVACY_MAC) {
      return normalizeMacForCms(mac);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function logMacResolve(t0: number, path: string): void {
  const ms = Date.now() - t0;
  logWelcomePerf('mac_resolve', ms, { path });
  welcomePerfSetMac(ms, path);
}

/** Single shared promise — all concurrent callers share the same hardware probe. */
let _macPromise: Promise<string> | undefined;

/**
 * MAC for all CMS calls: override → Android hardware probe → configured fallback → {@link DEFAULT_DEVICE_MAC}.
 * Always returns a non-empty string (never null).
 * Result is cached after the first resolution so subsequent calls are instant.
 */
export function getDeviceMacForWelcomeApi(): Promise<string> {
  if (!_macPromise) {
    _macPromise = _resolveDeviceMac();
  }
  return _macPromise;
}

async function _resolveDeviceMac(): Promise<string> {
  const t0 = Date.now();

  const override = WELCOME_DEVICE_MAC_OVERRIDE.trim();
  if (override.length > 0) {
    logMacResolve(t0, 'override');
    return normalizeMacForCms(override);
  }

  if (Platform.OS !== 'android') {
    logMacResolve(t0, 'non_android_default');
    return resolvedFallbackMac();
  }

  const [nativeMac, deviceInfoMac] = await Promise.all([
    getHardwareMacFromNative(),
    getMacFromDeviceInfo(),
  ]);
  if (nativeMac) {
    logMacResolve(t0, 'native');
    return nativeMac;
  }
  if (deviceInfoMac) {
    logMacResolve(t0, 'device_info');
    return deviceInfoMac;
  }

  await logHardwareMacDiagnostics();

  const fallback = resolvedFallbackMac();
  console.log(
    '[WelcomeGuest] hardware MAC unavailable — using fallback MAC for CMS APIs',
  );
  logMacResolve(t0, 'fallback_config');
  return fallback;
}
