/**
 * Stable ordering for IPTV / Etihad CMS rows so "All Channels" and each category
 * list match the sequence intended by the CMS (sort fields when present).
 */

const CHANNEL_SORT_KEYS = [
  'sort_order',
  'sortOrder',
  'order',
  'display_order',
  'displayOrder',
  'position',
  'list_order',
  'seq',
] as const;

const PACKAGE_SORT_KEYS = [
  'sort_order',
  'sortOrder',
  'order',
  'display_order',
  'displayOrder',
  'position',
] as const;

function sortKeyFromRecord(
  r: Record<string, unknown>,
  keys: readonly string[],
  fallbackIndex: number,
): number {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return fallbackIndex;
}

/** Per-row channel order from CMS JSON (fallback = index in API array). */
export function channelRowSortOrder(
  r: Record<string, unknown>,
  fallbackIndex: number,
): number {
  return sortKeyFromRecord(r, CHANNEL_SORT_KEYS, fallbackIndex);
}

/** Per-row package/category order from CMS JSON (fallback = index). */
export function packageRowSortOrder(
  r: Record<string, unknown>,
  fallbackIndex: number,
): number {
  return sortKeyFromRecord(r, PACKAGE_SORT_KEYS, fallbackIndex);
}
