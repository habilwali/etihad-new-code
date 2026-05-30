import {
  buildGetGuestFacilitiesUrl,
  resolveCmsMediaUrl,
} from '../config/cmsEndpoints';
import {getDeviceMacForWelcomeApi} from '../utils/getDeviceMacForWelcome';

const FACILITIES_FETCH_TIMEOUT_MS = 15_000;

export interface FacilityFromApi {
  id: string;
  label: string;
  name: string;
  desc: string;
  phone: string;
  img: string;
  hours: unknown;
}

function devCacheBust(url: string): string {
  if (!__DEV__) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
}

function normalizeHours(raw: unknown): [string, string][] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: [string, string][] = [];
  for (const row of raw) {
    if (
      Array.isArray(row) &&
      row.length >= 2 &&
      typeof row[0] === 'string' &&
      typeof row[1] === 'string'
    ) {
      out.push([row[0], row[1]]);
    }
  }
  return out;
}

export type FacilityRow = {
  id: string;
  label: string;
  name: string;
  desc: string;
  phone: string;
  img: string;
  hours: [string, string][];
};

export function mapFacilityDto(dto: FacilityFromApi): FacilityRow {
  return {
    id: dto.id,
    label: dto.label,
    name: dto.name,
    desc: dto.desc,
    phone: dto.phone,
    img: resolveCmsMediaUrl(dto.img),
    hours: normalizeHours(dto.hours),
  };
}

export type FetchGuestFacilitiesResult =
  | {ok: true; facilities: FacilityFromApi[]}
  | {ok: false; message: string};

/**
 * GET /api/get_guest_facilities.php?mac=… (MAC from device when available).
 */
export async function fetchGuestFacilities(): Promise<FetchGuestFacilitiesResult> {
  const mac = await getDeviceMacForWelcomeApi();
  const url = devCacheBust(buildGetGuestFacilitiesUrl(mac));
  if (__DEV__) {
    console.log(
      '[Facilities API] GET guest facilities',
      url.replace(/mac=[^&]+/i, 'mac=<redacted>'),
    );
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FACILITIES_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {method: 'GET', signal: controller.signal});
    clearTimeout(tid);
  } catch {
    clearTimeout(tid);
    return {ok: false, message: 'Network error'};
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {ok: false, message: 'Invalid response'};
  }

  if (typeof body !== 'object' || body === null) {
    return {ok: false, message: 'Empty response'};
  }

  const rec = body as Record<string, unknown>;
  if (!res.ok || rec.success === false) {
    const err =
      typeof rec.error === 'string' ? rec.error : `HTTP ${res.status}`;
    return {ok: false, message: err};
  }

  if (rec.success !== true) {
    return {ok: false, message: 'Unexpected response'};
  }

  const list = rec.facilities;
  if (!Array.isArray(list)) {
    return {ok: false, message: 'Invalid facilities list'};
  }

  const facilities: FacilityFromApi[] = [];
  for (const row of list) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : String(r.id ?? '');
    const label = typeof r.label === 'string' ? r.label : '';
    const name = typeof r.name === 'string' ? r.name : '';
    const desc = typeof r.desc === 'string' ? r.desc : '';
    const phone = typeof r.phone === 'string' ? r.phone : '';
    const img = typeof r.img === 'string' ? r.img : '';
    if (!id) {
      continue;
    }
    facilities.push({
      id,
      label: label || name || id,
      name: name || label,
      desc,
      phone,
      img,
      hours: r.hours,
    });
  }

  return {ok: true, facilities};
}
