import {
  buildEtihadPlazaHomeUrl,
  resolveCmsMediaUrl,
} from '../config/cmsEndpoints';

const FETCH_TIMEOUT_MS = 15_000;

export interface EtihadPlazaHeroPreview {
  image: string;
  category: string;
  title: string;
  statusLine: string;
}

export interface EtihadPlazaHero {
  eyebrow: string;
  titleLines: string[];
  titleGoldWord: string;
  description: string;
  preview: EtihadPlazaHeroPreview;
  cta: {primaryLabel: string; secondaryLabel: string};
}

export interface EtihadPlazaNavItem {
  id: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
}

export interface EtihadPlazaStat {
  id: string;
  n: string;
  l: string;
  sortOrder: number;
}

export interface EtihadPlazaHighlight {
  id: string;
  category: string;
  title: string;
  sub: string;
  stat: string;
  img: string;
  bgColors: string[];
  badge: string | null;
  sortOrder: number;
}

export interface EtihadPlazaGalleryItem {
  id: string;
  label: string;
  img: string;
  sortOrder: number;
}

export interface EtihadPlazaRoom {
  id: string;
  name: string;
  view: string;
  size: string;
  price: string;
  img: string;
  sortOrder: number;
}

export interface EtihadPlazaHome {
  updatedAt: string;
  screenId: string;
  hero: EtihadPlazaHero;
  navItems: EtihadPlazaNavItem[];
  stats: EtihadPlazaStat[];
  highlights: EtihadPlazaHighlight[];
  gallery: EtihadPlazaGalleryItem[];
  rooms: EtihadPlazaRoom[];
}

function devCacheBust(url: string): string {
  if (!__DEV__) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_cb=${Date.now()}`;
}

function sortByOrder<T extends {sortOrder: number}>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeHero(raw: Record<string, unknown>): EtihadPlazaHero | null {
  const eyebrow = typeof raw.eyebrow === 'string' ? raw.eyebrow : '';
  const titleLines = Array.isArray(raw.titleLines)
    ? raw.titleLines.filter((x): x is string => typeof x === 'string')
    : [];
  const titleGoldWord =
    typeof raw.titleGoldWord === 'string' ? raw.titleGoldWord : '';
  const description =
    typeof raw.description === 'string' ? raw.description : '';
  const previewRaw = raw.preview;
  if (typeof previewRaw !== 'object' || previewRaw === null) {
    return null;
  }
  const pr = previewRaw as Record<string, unknown>;
  const preview: EtihadPlazaHeroPreview = {
    image: resolveCmsMediaUrl(typeof pr.image === 'string' ? pr.image : ''),
    category: typeof pr.category === 'string' ? pr.category : '',
    title: typeof pr.title === 'string' ? pr.title : '',
    statusLine: typeof pr.statusLine === 'string' ? pr.statusLine : '',
  };
  const ctaRaw = raw.cta;
  let cta = {primaryLabel: 'EXPLORE PLAZA', secondaryLabel: 'VIEW GALLERY'};
  if (typeof ctaRaw === 'object' && ctaRaw !== null) {
    const c = ctaRaw as Record<string, unknown>;
    cta = {
      primaryLabel:
        typeof c.primaryLabel === 'string' ? c.primaryLabel : cta.primaryLabel,
      secondaryLabel:
        typeof c.secondaryLabel === 'string'
          ? c.secondaryLabel
          : cta.secondaryLabel,
    };
  }
  return {
    eyebrow,
    titleLines,
    titleGoldWord,
    description,
    preview,
    cta,
  };
}

function parseHomeData(data: Record<string, unknown>): EtihadPlazaHome | null {
  /** CMS v2 uses `header`; legacy uses `hero` — same shape. */
  const heroRaw = data.header ?? data.hero;
  if (typeof heroRaw !== 'object' || heroRaw === null) {
    return null;
  }
  const hero = normalizeHero(heroRaw as Record<string, unknown>);
  if (!hero) {
    return null;
  }

  const navItems: EtihadPlazaNavItem[] = [];
  if (Array.isArray(data.navItems)) {
    for (const row of data.navItems) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const r = row as Record<string, unknown>;
      navItems.push({
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        label: typeof r.label === 'string' ? r.label : '',
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
        enabled: r.enabled === true,
      });
    }
  }

  const stats: EtihadPlazaStat[] = [];
  if (Array.isArray(data.stats)) {
    for (const row of data.stats) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const r = row as Record<string, unknown>;
      stats.push({
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        n: typeof r.n === 'string' ? r.n : String(r.n ?? ''),
        l: typeof r.l === 'string' ? r.l : '',
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
      });
    }
  }

  const highlights: EtihadPlazaHighlight[] = [];
  if (Array.isArray(data.highlights)) {
    for (const row of data.highlights) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const r = row as Record<string, unknown>;
      const bgColors = Array.isArray(r.bgColors)
        ? r.bgColors.filter((x): x is string => typeof x === 'string')
        : [];
      highlights.push({
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        category: typeof r.category === 'string' ? r.category : '',
        title: typeof r.title === 'string' ? r.title : '',
        sub: typeof r.sub === 'string' ? r.sub : '',
        stat: typeof r.stat === 'string' ? r.stat : '',
        img: resolveCmsMediaUrl(typeof r.img === 'string' ? r.img : ''),
        bgColors: bgColors.length >= 2 ? bgColors : ['#0A0A12', '#141428'],
        badge: r.badge === null || typeof r.badge === 'string' ? r.badge : null,
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
      });
    }
  }

  const gallery: EtihadPlazaGalleryItem[] = [];
  if (Array.isArray(data.gallery)) {
    for (const row of data.gallery) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const r = row as Record<string, unknown>;
      gallery.push({
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        label: typeof r.label === 'string' ? r.label : '',
        img: resolveCmsMediaUrl(typeof r.img === 'string' ? r.img : ''),
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
      });
    }
  }

  const rooms: EtihadPlazaRoom[] = [];
  if (Array.isArray(data.rooms)) {
    for (const row of data.rooms) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }
      const r = row as Record<string, unknown>;
      rooms.push({
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        name: typeof r.name === 'string' ? r.name : '',
        view: typeof r.view === 'string' ? r.view : '',
        size: typeof r.size === 'string' ? r.size : '',
        price: typeof r.price === 'string' ? r.price : '',
        img: resolveCmsMediaUrl(typeof r.img === 'string' ? r.img : ''),
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
      });
    }
  }

  return {
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    screenId:
      typeof data.screenId === 'string' ? data.screenId : 'etihad_plaza_home',
    hero,
    navItems: sortByOrder(navItems),
    stats: sortByOrder(stats),
    highlights: sortByOrder(highlights),
    gallery: sortByOrder(gallery),
    rooms: sortByOrder(rooms),
  };
}

export type FetchEtihadPlazaHomeResult =
  | {ok: true; home: EtihadPlazaHome}
  | {ok: false; message: string};

export async function fetchEtihadPlazaHome(): Promise<FetchEtihadPlazaHomeResult> {
  const url = devCacheBust(buildEtihadPlazaHomeUrl());
  if (__DEV__) {
    console.log('[Etihad Plaza API] GET', url.split('?')[0]);
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

  const data = rec.data;
  if (typeof data !== 'object' || data === null) {
    return {ok: false, message: 'Missing data'};
  }

  const home = parseHomeData(data as Record<string, unknown>);
  if (!home) {
    return {ok: false, message: 'Invalid home payload'};
  }

  return {ok: true, home};
}
