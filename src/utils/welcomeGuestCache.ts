import type { WelcomeGuestPayload } from '../services/welcomeApi';

/** How long we reuse the last successful welcome payload per MAC (faster Metro refresh / relaunch). */
const TTL_MS = 10 * 60 * 1000;

let entry: { mac: string; data: WelcomeGuestPayload; at: number } | null = null;

export function readWelcomeGuestCache(mac: string): WelcomeGuestPayload | null {
  const key = mac.trim().toUpperCase();
  if (!entry || entry.mac !== key) return null;
  if (Date.now() - entry.at > TTL_MS) {
    entry = null;
    return null;
  }
  return entry.data;
}

export function writeWelcomeGuestCache(mac: string, data: WelcomeGuestPayload): void {
  entry = { mac: mac.trim().toUpperCase(), data, at: Date.now() };
}
