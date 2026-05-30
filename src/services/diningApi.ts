import {buildDiningApiUrl, resolveCmsMediaUrl} from '../config/cmsEndpoints';

const FETCH_TIMEOUT_MS = 15_000;

export const DINING_TAB_KEYS = [
  'Starters',
  'Mains',
  'Desserts',
  'Drinks',
] as const;

export type DiningTab = (typeof DINING_TAB_KEYS)[number];

export type DiningMenuItem = {
  name: string;
  desc: string;
  price: string;
  badge: string | null;
  img: string | null;
};

export type DiningMenuData = Record<DiningTab, DiningMenuItem[]>;

export type DiningVenue = {
  id: number;
  name: string;
  emoji: string;
  cuisine: string;
  michelin: string | null;
  heroImg: string;
  menu: DiningMenuData;
};

function devCacheBust(url: string): string {
  if (!__DEV__) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
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

function resolveMediaUrl(raw: string | null): string {
  if (raw === null || typeof raw !== 'string') {
    return '';
  }
  const t = raw.trim();
  if (!t) {
    return '';
  }
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  return resolveCmsMediaUrl(t);
}

/** CMS may use snake_case or nested `{ url }` for the dining hero. */
function pickHeroImageRaw(r: Record<string, unknown>): string {
  const keys = [
    'heroImg',
    'hero_image',
    'heroImage',
    'cover_image',
    'coverImage',
    'hero',
    'banner',
    'image',
  ] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) {
      return v;
    }
    if (typeof v === 'object' && v !== null && 'url' in v) {
      const u = (v as {url?: unknown}).url;
      if (typeof u === 'string' && u.trim()) {
        return u;
      }
    }
  }
  return '';
}

function parseMenuItem(raw: unknown): DiningMenuItem | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name : '';
  const desc = typeof r.desc === 'string' ? r.desc : '';
  const price =
    typeof r.price === 'string'
      ? r.price
      : typeof r.price === 'number' && Number.isFinite(r.price)
        ? String(r.price)
        : '';
  const badgeRaw = r.badge;
  const badge =
    badgeRaw === null || typeof badgeRaw === 'string' ? badgeRaw : null;
  const imgRaw = r.img;
  const imgStr =
    imgRaw === null
      ? null
      : typeof imgRaw === 'string'
        ? imgRaw.trim() || null
        : null;
  const imgResolved = imgStr ? resolveMediaUrl(imgStr) : null;
  const item: DiningMenuItem = {
    name,
    desc,
    price,
    badge,
    img: imgResolved && imgResolved.length > 0 ? imgResolved : null,
  };
  const hasText =
    item.name.trim().length > 0 ||
    item.desc.trim().length > 0 ||
    item.price.trim().length > 0;
  if (!hasText && item.img === null) {
    return null;
  }
  return item;
}

function parseMenuData(raw: unknown): DiningMenuData {
  const empty = (): DiningMenuData => ({
    Starters: [],
    Mains: [],
    Desserts: [],
    Drinks: [],
  });
  if (typeof raw !== 'object' || raw === null) {
    return empty();
  }
  const o = raw as Record<string, unknown>;
  const out = empty();
  for (const tab of DINING_TAB_KEYS) {
    const arr = o[tab];
    out[tab] = Array.isArray(arr)
      ? arr
          .map(parseMenuItem)
          .filter((x): x is DiningMenuItem => x !== null)
      : [];
  }
  return out;
}

function parseVenue(raw: unknown): DiningVenue | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = parseId(r.id);
  if (id === null) {
    return null;
  }
  const name = typeof r.name === 'string' ? r.name : '';
  const emoji = typeof r.emoji === 'string' ? r.emoji : '🍽️';
  const cuisine = typeof r.cuisine === 'string' ? r.cuisine : '';
  const michelinRaw = r.michelin;
  const michelin =
    michelinRaw === null || typeof michelinRaw === 'string'
      ? michelinRaw
      : null;
  const heroRaw = pickHeroImageRaw(r);
  const heroImg = heroRaw.trim() ? resolveMediaUrl(heroRaw) : '';
  const menu = parseMenuData(r.menu);

  return {
    id,
    name,
    emoji,
    cuisine,
    michelin,
    heroImg,
    menu,
  };
}

function extractVenuesArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) {
    return body;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const rec = body as Record<string, unknown>;
  if (Array.isArray(rec.data)) {
    return rec.data;
  }
  if (Array.isArray(rec.venues)) {
    return rec.venues;
  }
  const data = rec.data;
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.venues)) {
      return d.venues;
    }
  }
  return null;
}

function parseDiningPayload(body: unknown): DiningVenue[] {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Dining API: empty response');
  }
  if (Array.isArray(body)) {
    const out: DiningVenue[] = [];
    for (const row of body) {
      const v = parseVenue(row);
      if (v) {
        out.push(v);
      }
    }
    return out;
  }
  const rec = body as Record<string, unknown>;
  if (rec.success === false) {
    const err =
      typeof rec.error === 'string' ? rec.error : 'Dining API failed';
    throw new Error(err);
  }
  const rows = extractVenuesArray(body);
  if (rows === null) {
    throw new Error('Dining API: missing venues array');
  }
  const out: DiningVenue[] = [];
  for (const row of rows) {
    const v = parseVenue(row);
    if (v) {
      out.push(v);
    }
  }
  return out;
}

/** Fetches venues + nested menus from CMS `api/dining.php`. */
export async function fetchDiningVenues(): Promise<DiningVenue[]> {
  const url = devCacheBust(buildDiningApiUrl());
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
    throw new Error('Dining API: network error');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Dining API: invalid JSON');
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

  return parseDiningPayload(body);
}
