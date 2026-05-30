import type {ImageSourcePropType} from 'react-native';
import {
  buildHypermarketApiUrl,
  resolveCmsMediaUrl,
} from '../config/cmsEndpoints';

const FETCH_TIMEOUT_MS = 15_000;

export type HypermarketRecord = {
  id: number;
  name: string;
  emoji: string;
  tagline: string;
  location: string;
  badge: string | null;
  color: string;
  hours: string;
  floorArea: string;
  /** Remote `https://…` URLs, or CMS-relative paths (e.g. `uploads/flyer.png`). */
  images: string[];
};

function devCacheBust(url: string): string {
  if (!__DEV__) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
}

function imageStringToSource(raw: string): ImageSourcePropType {
  const t = raw.trim();
  if (!t) {
    return {uri: ''};
  }
  if (/^https?:\/\//i.test(t)) {
    return {uri: t};
  }
  return {uri: resolveCmsMediaUrl(t)};
}

function parseId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseHypermarketRow(raw: unknown): HypermarketRecord | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = parseId(r.id);
  if (id === null) {
    return null;
  }
  const str = (k: string, fallback = '') =>
    typeof r[k] === 'string' ? (r[k] as string) : fallback;
  const images = Array.isArray(r.images)
    ? r.images.filter((x): x is string => typeof x === 'string')
    : [];
  const badgeRaw = r.badge;
  const badge =
    badgeRaw === null || typeof badgeRaw === 'string' ? badgeRaw : null;

  return {
    id,
    name: str('name'),
    emoji: str('emoji', '🛒'),
    tagline: str('tagline'),
    location: str('location'),
    badge,
    color: str('color', '#1a1a2e'),
    hours: str('hours'),
    floorArea: str('floorArea'),
    images,
  };
}

function extractHypermarketsArray(
  body: Record<string, unknown>,
): unknown[] | null {
  if (Array.isArray(body.hypermarkets)) {
    return body.hypermarkets;
  }
  const data = body.data;
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.hypermarkets)) {
      return d.hypermarkets;
    }
  }
  return null;
}

function parseHypermarketPayload(body: unknown): HypermarketRecord[] {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Hypermarket API: empty response');
  }
  const rec = body as Record<string, unknown>;
  if (rec.success === false) {
    const err =
      typeof rec.error === 'string' ? rec.error : 'Hypermarket API failed';
    throw new Error(err);
  }
  const rows = extractHypermarketsArray(rec);
  if (rows === null) {
    throw new Error('Hypermarket API: missing hypermarkets array');
  }
  const out: HypermarketRecord[] = [];
  for (const row of rows) {
    const parsed = parseHypermarketRow(row);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

/** Fetches store list + catalogue image paths from CMS `api/hypermarket.php`. */
export async function fetchHypermarketCatalog(): Promise<HypermarketRecord[]> {
  const url = devCacheBust(buildHypermarketApiUrl());
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {Accept: 'application/json'},
      signal: controller.signal,
    });
    clearTimeout(tid);
  } catch {
    clearTimeout(tid);
    throw new Error('Hypermarket API: network error');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Hypermarket API: invalid JSON');
  }

  if (!res.ok) {
    const rec =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : null;
    const msg =
      rec && typeof rec.error === 'string'
        ? rec.error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return parseHypermarketPayload(body);
}

export function catalogueSourcesForStore(
  store: HypermarketRecord,
): ImageSourcePropType[] {
  return store.images.map(imageStringToSource).filter(s => {
    if (typeof s !== 'object' || s === null || !('uri' in s)) {
      return false;
    }
    const u = typeof s.uri === 'string' ? s.uri : '';
    return u.length > 0;
  });
}
