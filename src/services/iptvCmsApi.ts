import {buildGetChannelsUrl, buildGetPackagesUrl} from '../config/cmsEndpoints';
import {
  channelRowSortOrder,
  packageRowSortOrder,
} from '../utils/channelCmsOrdering';

const IPTV_FETCH_TIMEOUT_MS = 20_000;

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export interface IptvPackageRow {
  id: number;
  name: string;
  price: number;
  image: string;
}

export interface IptvChannelRow {
  id: number;
  name: string;
  stream_url: string;
  logo: string;
  status: string;
}

export type IptvPackagesFailureReason =
  | 'network'
  | 'invalid_mac'
  | 'client_not_found'
  | 'not_checked_in'
  | 'invalid_json'
  | 'success_false'
  | 'no_mac';

export type IptvPackagesResult =
  | {ok: true; mac: string; packages: IptvPackageRow[]}
  | {
      ok: false;
      reason: IptvPackagesFailureReason;
      message: string;
      httpStatus?: number;
    };

export type IptvChannelsFailureReason =
  | 'network'
  | 'bad_request'
  | 'invalid_json'
  | 'success_false'
  | 'no_mac';

export type IptvChannelsResult =
  | {
      ok: true;
      categoryId: number;
      macFilter: string | null;
      channels: IptvChannelRow[];
    }
  | {
      ok: false;
      reason: IptvChannelsFailureReason;
      message: string;
      httpStatus?: number;
    };

function devCacheBust(url: string): string {
  if (!__DEV__) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
}

function packagesFailure(
  reason: IptvPackagesFailureReason,
  message: string,
  httpStatus?: number,
): IptvPackagesResult {
  return {ok: false, reason, message, httpStatus};
}

function channelsFailure(
  reason: IptvChannelsFailureReason,
  message: string,
  httpStatus?: number,
): IptvChannelsResult {
  return {ok: false, reason, message, httpStatus};
}

/**
 * Load channel packages/categories visible for this MAC (CMS `getPackages.php`).
 */
export async function fetchIptvPackages(
  macAddress: string,
): Promise<IptvPackagesResult> {
  const mac = macAddress.trim().toUpperCase();
  if (!mac) {
    return packagesFailure('no_mac', 'Missing MAC address');
  }
  if (!MAC_REGEX.test(mac)) {
    return packagesFailure('invalid_mac', 'Invalid device');
  }

  const url = devCacheBust(buildGetPackagesUrl(mac));
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), IPTV_FETCH_TIMEOUT_MS);
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
    return packagesFailure(
      'invalid_json',
      'Invalid response from server',
      res.status,
    );
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
    const err =
      typeof rec.error === 'string' ? rec.error : 'Device not registered';
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

  const rawList = rec.packages;
  if (!Array.isArray(rawList)) {
    return packagesFailure('invalid_json', 'Invalid packages list', res.status);
  }

  const scoredPkgs: {order: number; pkg: IptvPackageRow}[] = [];
  for (let idx = 0; idx < rawList.length; idx++) {
    const row = rawList[idx];
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    const name = typeof r.name === 'string' ? r.name : '';
    const price = typeof r.price === 'number' ? r.price : Number(r.price) || 0;
    const image = typeof r.image === 'string' ? r.image : '';
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }
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

/**
 * Load channels for one CMS category/package. Always pass `mac` on TV so the CMS
 * filters by `channel_mac_map` (required for correct in-room line-up).
 */
export async function fetchIptvChannels(
  categoryId: number,
  macAddress: string,
): Promise<IptvChannelsResult> {
  const mac = macAddress.trim().toUpperCase();
  if (!mac) {
    return channelsFailure('no_mac', 'Missing MAC address');
  }
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return channelsFailure('bad_request', 'Invalid package');
  }

  const url = devCacheBust(buildGetChannelsUrl(categoryId, mac));
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), IPTV_FETCH_TIMEOUT_MS);
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
    return channelsFailure(
      'invalid_json',
      'Invalid response from server',
      res.status,
    );
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

  const scoredCh: {order: number; ch: IptvChannelRow}[] = [];
  for (let idx = 0; idx < rawList.length; idx++) {
    const row = rawList[idx];
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    const name = typeof r.name === 'string' ? r.name : '';
    const stream_url = typeof r.stream_url === 'string' ? r.stream_url : '';
    const logo = typeof r.logo === 'string' ? r.logo : '';
    const status = typeof r.status === 'string' ? r.status : '';
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }
    scoredCh.push({
      order: channelRowSortOrder(r, idx),
      ch: {
        id,
        name: name || `Channel ${id}`,
        stream_url,
        logo,
        status,
      },
    });
  }
  scoredCh.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.ch.id - b.ch.id,
  );
  const channels = scoredCh.map(s => s.ch);

  const macFilter =
    typeof rec.mac_filter === 'string'
      ? rec.mac_filter
      : rec.mac_filter === null
      ? null
      : mac;

  return {
    ok: true,
    categoryId:
      typeof rec.category_id === 'number' ? rec.category_id : categoryId,
    macFilter,
    channels,
  };
}
