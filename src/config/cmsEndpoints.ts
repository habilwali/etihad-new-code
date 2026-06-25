/**
 * CMS / realtime endpoints (alerts + notifications + welcome + IPTV + guest facilities).
 * Override with babel-plugin-transform-inline-environment-variables, or edit defaults:
 *   HOTEL_CMS_HOST, HOTEL_CMS_HTTP_PORT
 * Full origin override (https or custom path):
 *   HOTEL_CMS_BASE_URL e.g. https://my-server.com
 */
const CMS_HOST = process.env.HOTEL_CMS_HOST ?? '10.10.120.11';

const CMS_HTTP_PORT = process.env.HOTEL_CMS_HTTP_PORT ?? '80';

/** CMS HTTP origin without trailing slash (same host/port as index.php APIs). */
export function getCmsHttpOrigin(): string {
  const override = process.env.HOTEL_CMS_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, '');
  }
  return `http://${CMS_HOST}:${CMS_HTTP_PORT}`;
}

/**
 * Join a path (or relative URL) to the CMS origin without double slashes.
 * Use for API-relative assets: `uploads/foo.png`, `/uploads/foo.png`.
 */
export function joinCmsHttpPath(path: string): string {
  const base = getCmsHttpOrigin();
  const p = path.trim().replace(/^\/+/, '');
  return `${base}/${p}`;
}

/**
 * CMS sometimes stores multicast as a fake path: `/udp//@224.2.2.1` or `udp//@224.2.2.1`.
 * Normalize to proper UDP multicast URL: `udp://@224.2.2.1` — do not prefix the HTTP CMS origin.
 */
function normalizeCmsStreamPath(trimmed: string): string {
  const m = trimmed.match(/^\/?udp\/\/@(.+)$/i);
  if (m) {
    return `udp://@${m[1]}`;
  }
  return trimmed;
}

/** Absolute http(s) URLs pass through; streaming schemes (udp, rtsp, …) pass through;
 *  relative paths join to CMS origin. */
export function resolveCmsMediaUrl(relativeOrAbsolute: string): string {
  let t = relativeOrAbsolute.trim();
  if (!t) {
    return '';
  }
  // DB may contain a mistaken full URL: http://cms:8080/udp//@224… — strip origin
  const origin = getCmsHttpOrigin();
  if (t.startsWith(`${origin}/`) && /\/udp\/\/@/i.test(t)) {
    t = normalizeCmsStreamPath(t.slice(origin.length));
  } else {
    t = normalizeCmsStreamPath(t);
  }
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  // udp://, rtsp://, rtp://, file://, etc. — not CMS-relative assets
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return t;
  }
  return joinCmsHttpPath(t);
}

/**
 * TV / Etihad channel video only: UDP multicast stream for STB.
 * Non-udp results from `resolveCmsMediaUrl` (e.g. http(s), rtsp) are dropped — use "".
 * Also recovers `http://anyhost/udp//@…` → `udp://@…` when the CMS stored a bad URL.
 */
export function resolveCmsChannelStreamUrl(raw: string): string {
  let u = resolveCmsMediaUrl(raw).trim();
  if (!u) {
    return '';
  }
  if (/^udp:\/\//i.test(u)) {
    return u;
  }
  const wrongHttp = u.match(/^https?:\/\/[^/]+(\/udp\/\/@.+)$/i);
  if (wrongHttp) {
    const inner = wrongHttp[1].replace(/^\/+/, '');
    const m = inner.match(/^udp\/\/@(.+)$/i);
    if (m) {
      return `udp://@${m[1]}`;
    }
  }
  return '';
}

/** GET welcome guest by device MAC (URL-encoded). */
export function buildWelcomeApiUrl(macAddress: string): string {
  const mac = encodeURIComponent(macAddress);
  return `${getCmsHttpOrigin()}/api/welcome_api.php?mac_address=${mac}`;
}

/** IPTV packages for MAC (`getPackages.php`). */
export function buildGetPackagesUrl(mac: string): string {
  const m = encodeURIComponent(mac);
  return `${getCmsHttpOrigin()}/api/getPackages.php?mac=${m}`;
}

/**
 * IPTV channels for a category/package (`getChannels.php`).
 * On production TV builds always pass `mac` so results match `channel_mac_map`.
 */
export function buildGetChannelsUrl(categoryId: number, mac: string): string {
  const m = encodeURIComponent(mac);
  return `${getCmsHttpOrigin()}/api/getChannels.php?category_id=${encodeURIComponent(
    String(categoryId),
  )}&mac=${m}`;
}

/** Etihad TV packages for MAC (`get_etihad_packages.php`). */
export function buildGetEtihadPackagesUrl(mac: string): string {
  const m = encodeURIComponent(mac);
  return `${getCmsHttpOrigin()}/api/get_etihad_packages.php?mac=${m}`;
}



/** Etihad TV categories for MAC (`get_etihad_categories.php`). */
export function buildGetEtihadCategoriesUrl(mac: string): string {
  const m = encodeURIComponent(mac);
  return `${getCmsHttpOrigin()}/api/get_etihad_categories.php?mac=${m}`;
}

/** Etihad TV channels for a category (`get_etihad_channels.php`). */
export function buildGetEtihadChannelsUrl(categoryId: number): string {
  return `${getCmsHttpOrigin()}/api/get_etihad_channels.php?category_id=${encodeURIComponent(
    String(categoryId),
  )}`;
}

/**
 * Guest-scoped facilities for the Facilities screen (`get_guest_facilities.php`).
 * Sends TV MAC when available so the CMS can filter by guest/room if needed.
 */
export function buildGetGuestFacilitiesUrl(
  mac: string | null | undefined,
): string {
  const base = `${getCmsHttpOrigin()}/api/get_guest_facilities.php`;
  if (mac && mac.trim()) {
    return `${base}?mac=${encodeURIComponent(mac.trim().toUpperCase())}`;
  }
  return base;
}

/** Etihad Plaza TV home screen (`etihad-plaza/home.php`). */
export function buildEtihadPlazaHomeUrl(): string {
  return `${getCmsHttpOrigin()}/api/etihad-plaza/home.php`;
}

/** Hypermarket stores + catalogue images (`hypermarket.php`). */
export function buildHypermarketApiUrl(): string {
  return `${getCmsHttpOrigin()}/api/hypermarket.php`;
}

/** Dining venues + nested menus (`dining.php`). */
export function buildDiningApiUrl(): string {
  return `${getCmsHttpOrigin()}/api/dining.php`;
}

/** Global app background image (`get_background_image.php`). */
export function buildGetBackgroundImageApiUrl(): string {
  return `${getCmsHttpOrigin()}/api/get_background_image.php`;
}

/** Occupational Health & Safety items (`get_health_safety.php`). */
export function buildGetHealthSafetyUrl(): string {
  return `${getCmsHttpOrigin()}/api/get_health_safety.php`;
}

// ---------------------------------------------------------------------------
// Per-tenant targeting helpers
// ---------------------------------------------------------------------------

/** Normalise a raw MAC address to uppercase colon-separated form (AA:BB:CC:DD:EE:FF). */
export function normalizeDeviceMac(mac: string): string {
  return mac.trim().toUpperCase();
}

/**
 * WebSocket URL for the CMS real-time push channel.
 * Includes `?mac=` so the server can route per-tenant messages.
 * When `mac` is empty the legacy URL (no query string) is returned for backward compat.
 */
export function buildCmsWebSocketUrl(mac: string): string {
  const base = `ws://${CMS_HOST}:8765`;
  const m = mac.trim();
  if (!m) return base;
  return `${base}/?mac=${encodeURIComponent(normalizeDeviceMac(m))}`;
}

/**
 * Emergency-alert poll endpoint with optional MAC for per-tenant delivery.
 * Path corrected to `/emergency-alerts/index.php` (not `/index.php`).
 */
export function buildCmsAlertPollUrl(mac: string): string {
  const base = `${getCmsHttpOrigin()}/emergency-alerts/index.php?api=alert`;
  const m = mac.trim();
  if (!m) return base;
  return `${base}&mac=${encodeURIComponent(normalizeDeviceMac(m))}`;
}

/**
 * Notifications history endpoint with optional MAC for per-tenant delivery.
 * Path corrected to `/emergency-alerts/index.php` (not `/index.php`).
 */
export function buildCmsNotificationsUrl(mac: string): string {
  const base = `${getCmsHttpOrigin()}/emergency-alerts/index.php?api=notifications`;
  const m = mac.trim();
  if (!m) return base;
  return `${base}&mac=${encodeURIComponent(normalizeDeviceMac(m))}`;
}

// ---------------------------------------------------------------------------
// Legacy constants — kept for backward compat; paths corrected.
// Prefer the builder functions above for new code so MAC can be included.
// ---------------------------------------------------------------------------

/** @deprecated Use {@link buildCmsWebSocketUrl} with the device MAC instead. */
export const CMS_WS_URL = `ws://${CMS_HOST}:8765`;
/** @deprecated Use {@link buildCmsAlertPollUrl} with the device MAC instead. */
export const CMS_ALERT_POLL_URL = `${getCmsHttpOrigin()}/emergency-alerts/index.php?api=alert`;
/** @deprecated Use {@link buildCmsNotificationsUrl} with the device MAC instead. */
export const CMS_NOTIFICATIONS_REST_URL = `${getCmsHttpOrigin()}/emergency-alerts/index.php?api=notifications`;
