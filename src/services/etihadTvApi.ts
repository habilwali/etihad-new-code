/**
 * Etihad TV channel API service.
 *
 * Endpoints used (separate from the standard IPTV CMS API):
 *   - get_etihad_packages.php?mac=<MAC>          → packages / category list
 *   - get_etihad_categories.php?mac=<MAC>         → categories (alternative)
 *   - get_etihad_channels.php?category_id=<id>   → channels for a category
 *
 * The channels endpoint does NOT require a MAC (unlike the TV Channel API).
 */

import {
  buildGetEtihadPackagesUrl,
  buildGetEtihadChannelsUrl,
} from '../config/cmsEndpoints';
import {
  channelRowSortOrder,
  packageRowSortOrder,
} from '../utils/channelCmsOrdering';

const FETCH_TIMEOUT_MS = 20_000;
const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/* ─── Shared types (same shape as iptvCmsApi so ChannelScreen can reuse them) ─ */

export interface EtihadPackageRow {
  id: number;
  name: string;
  price: number;
  image: string;
}

export interface EtihadChannelRow {
  id: number;
  name: string;
  stream_url: string;
  logo: string;
  status: string;
}

export type EtihadPackagesFailureReason =
  | 'network'
  | 'invalid_mac'
  | 'client_not_found'
  | 'not_checked_in'
  | 'invalid_json'
  | 'success_false'
  | 'no_mac';

export type EtihadPackagesResult =
  | {ok: true; mac: string; packages: EtihadPackageRow[]}
  | {ok: false; reason: EtihadPackagesFailureReason; message: string; httpStatus?: number};

export type EtihadChannelsResult =
  | {ok: true; categoryId: number; channels: EtihadChannelRow[]}
  | {ok: false; reason: 'network' | 'bad_request' | 'invalid_json' | 'success_false'; message: string; httpStatus?: number};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function devCacheBust(url: string): string {
  if (!__DEV__) {return url;}
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
}

function packagesFailure(
  reason: EtihadPackagesFailureReason,
  message: string,
  httpStatus?: number,
): EtihadPackagesResult {
  return {ok: false, reason, message, httpStatus};
}

function channelsFailure(
  reason: 'network' | 'bad_request' | 'invalid_json' | 'success_false',
  message: string,
  httpStatus?: number,
): EtihadChannelsResult {
  return {ok: false, reason, message, httpStatus};
}

/* ─── fetchEtihadPackages ──────────────────────────────────────────────────── */

/**
 * Load Etihad TV packages/categories visible for this MAC.
 * Calls `get_etihad_packages.php?mac=<MAC>`.
 */
export async function fetchEtihadPackages(
  macAddress: string,
): Promise<EtihadPackagesResult> {
  const mac = macAddress.trim().toUpperCase();
  if (!mac) {return packagesFailure('no_mac', 'Missing MAC address');}
  if (!MAC_REGEX.test(mac)) {return packagesFailure('invalid_mac', 'Invalid device');}

  const url = devCacheBust(buildGetEtihadPackagesUrl(mac));
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {method: 'GET', signal: controller.signal});
    clearTimeout(tid);
  } catch {
    clearTimeout(tid);
    return packagesFailure('network', 'Network request failed');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return packagesFailure('invalid_json', 'Invalid response from server', res.status);
  }

  if (typeof body !== 'object' || body === null) {
    return packagesFailure('invalid_json', 'Empty response', res.status);
  }

  const rec = body as Record<string, unknown>;

  if (res.status === 400) {
    const err = typeof rec.error === 'string' ? rec.error : 'Invalid device';
    return packagesFailure('invalid_mac', err, 400);
  }
  if (res.status === 404) {
    const err = typeof rec.error === 'string' ? rec.error : 'Device not registered';
    return packagesFailure('client_not_found', err, 404);
  }
  if (res.status === 403) {
    const err = typeof rec.error === 'string' ? rec.error : 'Please check in';
    return packagesFailure('not_checked_in', err, 403);
  }
  if (rec.success === false) {
    const err = typeof rec.error === 'string' ? rec.error : 'Request failed';
    return packagesFailure('success_false', err, res.status);
  }
  if (!res.ok) {
    return packagesFailure('success_false', `HTTP ${res.status}`, res.status);
  }
  if (rec.success !== true) {
    return packagesFailure('success_false', 'Unexpected response', res.status);
  }

  // API may return the list under "packages" or "categories"
  const rawList = Array.isArray(rec.packages)
    ? rec.packages
    : Array.isArray(rec.categories)
    ? rec.categories
    : null;

  if (!rawList) {
    return packagesFailure('invalid_json', 'Invalid packages list', res.status);
  }

  const scoredPkgs: {order: number; pkg: EtihadPackageRow}[] = [];
  for (let idx = 0; idx < rawList.length; idx++) {
    const row = rawList[idx];
    if (typeof row !== 'object' || row === null) {continue;}
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    const name = typeof r.name === 'string' ? r.name : '';
    const price = typeof r.price === 'number' ? r.price : Number(r.price) || 0;
    const image = typeof r.image === 'string' ? r.image : '';
    if (!Number.isFinite(id) || id <= 0) {continue;}
    scoredPkgs.push({
      order: packageRowSortOrder(r, idx),
      pkg: {id, name: name || `Package ${id}`, price, image},
    });
  }
  scoredPkgs.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.pkg.id - b.pkg.id,
  );
  const packages = scoredPkgs.map(s => s.pkg);

  const macOut = typeof rec.mac === 'string' ? rec.mac : mac;
  return {ok: true, mac: macOut, packages};
}

/* ─── fetchEtihadChannels ──────────────────────────────────────────────────── */

/**
 * Load Etihad TV channels for one category.
 * Calls `get_etihad_channels.php?category_id=<id>` — no MAC required.
 */
export async function fetchEtihadChannels(
  categoryId: number,
): Promise<EtihadChannelsResult> {
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return channelsFailure('bad_request', 'Invalid category');
  }

  const url = devCacheBust(buildGetEtihadChannelsUrl(categoryId));
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {method: 'GET', signal: controller.signal});
    clearTimeout(tid);
  } catch {
    clearTimeout(tid);
    return channelsFailure('network', 'Network request failed');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return channelsFailure('invalid_json', 'Invalid response from server', res.status);
  }

  if (typeof body !== 'object' || body === null) {
    return channelsFailure('invalid_json', 'Empty response', res.status);
  }

  const rec = body as Record<string, unknown>;

  if (res.status === 400 || rec.success === false) {
    const err = typeof rec.error === 'string' ? rec.error : 'Invalid request';
    return channelsFailure('bad_request', err, res.status);
  }
  if (!res.ok) {
    return channelsFailure('success_false', `HTTP ${res.status}`, res.status);
  }
  if (rec.success !== true) {
    return channelsFailure('success_false', 'Unexpected response', res.status);
  }

  const rawList = rec.channels;
  if (!Array.isArray(rawList)) {
    return channelsFailure('invalid_json', 'Invalid channels list', res.status);
  }

  const scoredCh: {order: number; ch: EtihadChannelRow}[] = [];
  for (let idx = 0; idx < rawList.length; idx++) {
    const row = rawList[idx];
    if (typeof row !== 'object' || row === null) {continue;}
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    const name = typeof r.name === 'string' ? r.name : '';
    const stream_url = typeof r.stream_url === 'string' ? r.stream_url : '';
    const logo = typeof r.logo === 'string' ? r.logo : '';
    const status = typeof r.status === 'string' ? r.status : '';
    if (!Number.isFinite(id) || id <= 0) {continue;}
    scoredCh.push({
      order: channelRowSortOrder(r, idx),
      ch: {id, name: name || `Channel ${id}`, stream_url, logo, status},
    });
  }
  scoredCh.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.ch.id - b.ch.id,
  );
  const channels = scoredCh.map(s => s.ch);

  return {ok: true, categoryId, channels};
}
