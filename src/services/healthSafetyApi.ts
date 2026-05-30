/**
 * Health & Safety API service
 * Fetches OHS items from the CMS and logs every step for debugging.
 */

import { buildGetHealthSafetyUrl } from '../config/cmsEndpoints';

/** Raw item shape returned by the CMS — field names may vary, all optional. */
export interface RawHealthSafetyItem {
  id?: string | number;
  name?: string;
  title?: string;
  type?: string;
  content_type?: string;
  icon?: string;
  emoji?: string;
  img?: string;
  image?: string;
  thumbnail?: string;
  image_url?: string;
  thumb?: string;
  label?: string;
  videoUrl?: string;
  video_url?: string;
  video?: string;
  hasVideo?: boolean;
  has_video?: boolean;
  desc?: string;
  description?: string;
  body?: string;
  highlight?: string;
  callout?: string;
  contact?: string;
  phone?: string;
  resources?: Array<{ label?: string; name?: string; type?: string; content_type?: string }>;
  [key: string]: unknown;
}

export interface HealthSafetyApiResult {
  items: RawHealthSafetyItem[];
  raw: unknown;
}

const TAG = '[HealthSafetyAPI]';
const SEP = '──────────────────────────────────────';

export async function fetchHealthSafetyItems(
  signal?: AbortSignal,
): Promise<HealthSafetyApiResult> {
  const url = buildGetHealthSafetyUrl();
  console.log(`${TAG} ${SEP}`);
  console.log(`${TAG} GET start`, url);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    console.warn(`${TAG} ${SEP} ERROR`, err);
    throw err;
  }

  console.log(`${TAG} HTTP status`, response.status, '(before body parse)');

  let raw: unknown;
  let bodyText = '';
  try {
    bodyText = await response.text();
    console.log(`${TAG} raw body (first 500 chars):`, bodyText.slice(0, 500));
    raw = JSON.parse(bodyText);
  } catch (err) {
    console.warn(`${TAG} JSON parse error`, err, '— raw body start:', bodyText.slice(0, 200));
    throw new Error(`HealthSafetyAPI: JSON parse failed — ${err}`);
  }

  console.log(`${TAG} parsed response:`, JSON.stringify(raw).slice(0, 600));

  // Normalise — the CMS may return { success, data: [...] } or a bare array.
  let items: RawHealthSafetyItem[] = [];
  if (Array.isArray(raw)) {
    items = raw as RawHealthSafetyItem[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data))  { items = obj.data  as RawHealthSafetyItem[]; }
    else if (Array.isArray(obj.items)) { items = obj.items as RawHealthSafetyItem[]; }
    else if (Array.isArray(obj.results)) { items = obj.results as RawHealthSafetyItem[]; }
  }

  console.log(`${TAG} normalised items count: ${items.length}`);
  console.log(`${TAG} first item:`, items[0] ? JSON.stringify(items[0]).slice(0, 400) : 'none');
  console.log(`${TAG} ${SEP}`);

  return { items, raw };
}
