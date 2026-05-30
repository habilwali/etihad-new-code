/**
 * Default device identity when the TV does not expose a hardware MAC (common on Android TV)
 * or for iOS/dev. Used app-wide: Welcome, IPTV, Etihad TV, facilities, etc.
 * Must exist in CMS (`clients.mac_address`) for APIs that validate the MAC.
 */
export const DEFAULT_DEVICE_MAC = 'A8:2C:3E:7C:32:A9';

/**
 * Optional: skip all hardware detection and use this MAC everywhere.
 * Must match `clients.mac_address` in the CMS. Example: 'D4:1B:81:CD:74:F7'
 */
export const WELCOME_DEVICE_MAC_OVERRIDE = '';

/**
 * After hardware probe fails, use this MAC (defaults to {@link DEFAULT_DEVICE_MAC}).
 * Set to another value if this deployment maps “unknown MAC” to a different CMS row.
 */
export const WELCOME_MAC_FALLBACK_AFTER_PROBE = DEFAULT_DEVICE_MAC;
