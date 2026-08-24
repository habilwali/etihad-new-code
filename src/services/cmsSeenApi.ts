/**
 * Report "seen" for emergency alerts / notifications to the IPTV CMS.
 *
 * POST /emergency-alerts/index.php?api=seen
 * Body: { id, mac }
 *
 * Call once when the guest actually sees the message on this TV.
 * Locally persists reported ids so restarts / re-polls do not spam the server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {buildCmsSeenUrl, normalizeDeviceMac} from '../config/cmsEndpoints';
import {getDeviceMacForWelcomeApi} from '../utils/getDeviceMacForWelcome';

const LOG = '[cmsSeen]';
const REPORTED_KEY = '@etihad/cms/seenReportedIds/v1';
const MAX_REPORTED = 500;
const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

const reportedIds = new Set<string>();
/** Ids currently being POSTed — blocks concurrent duplicate requests. */
const inflightIds = new Set<string>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded) {
    return;
  }
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(REPORTED_KEY)
      .then(raw => {
        if (raw) {
          try {
            const ids = JSON.parse(raw);
            if (Array.isArray(ids)) {
              for (const id of ids) {
                if (id != null && String(id).trim()) {
                  reportedIds.add(String(id).trim());
                }
              }
            }
          } catch {
            // ignore corrupt storage
          }
        }
        loaded = true;
      })
      .catch(() => {
        loaded = true;
      });
  }
  await loadPromise;
}

function persistReported(): void {
  const ids = Array.from(reportedIds).slice(-MAX_REPORTED);
  AsyncStorage.setItem(REPORTED_KEY, JSON.stringify(ids)).catch(() => undefined);
}

function markReported(id: string): void {
  reportedIds.add(id);
  if (reportedIds.size > MAX_REPORTED) {
    const trimmed = Array.from(reportedIds).slice(-MAX_REPORTED);
    reportedIds.clear();
    for (const x of trimmed) {
      reportedIds.add(x);
    }
  }
  persistReported();
}

type SeenResponse = {
  ok?: boolean;
  first?: boolean;
  seen?: number;
  error?: string;
};

async function postSeen(
  url: string,
  id: string,
  mac: string,
): Promise<{ok: boolean; first?: boolean}> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({id, mac}),
      signal: controller.signal,
    });
    clearTimeout(tid);
    let body: SeenResponse = {};
    try {
      body = (await res.json()) as SeenResponse;
    } catch {
      body = {};
    }
    // Server: first:false still means already counted — treat as success.
    if (body.ok === true || body.first === false) {
      return {ok: true, first: body.first};
    }
    if (__DEV__) {
      console.warn(LOG, 'server rejected', {
        status: res.status,
        error: body.error,
        id,
      });
    }
    return {ok: false};
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

/**
 * Report that this device has seen alert/notification `id`.
 * Non-blocking from the caller's perspective when using {@link reportCmsSeenOnce}.
 * Dedupes locally; optional one silent retry on network failure.
 */
export async function reportCmsSeen(
  id: string,
  macAddress?: string,
): Promise<void> {
  const trimmedId = String(id ?? '').trim();
  if (!trimmedId) {
    return;
  }

  await ensureLoaded();
  if (reportedIds.has(trimmedId) || inflightIds.has(trimmedId)) {
    return;
  }
  inflightIds.add(trimmedId);

  let mac = macAddress ? normalizeDeviceMac(macAddress) : '';
  if (!mac) {
    try {
      mac = normalizeDeviceMac(await getDeviceMacForWelcomeApi());
    } catch {
      mac = '';
    }
  }
  if (!MAC_REGEX.test(mac)) {
    inflightIds.delete(trimmedId);
    if (__DEV__) {
      console.warn(LOG, 'skip — invalid or missing MAC', {id: trimmedId, mac});
    }
    return;
  }

  const url = buildCmsSeenUrl();

  try {
    try {
      const result = await postSeen(url, trimmedId, mac);
      if (result.ok) {
        markReported(trimmedId);
        if (__DEV__) {
          console.log(LOG, 'reported', {
            id: trimmedId,
            mac,
            first: result.first !== false,
          });
        }
        return;
      }
    } catch (e) {
      if (__DEV__) {
        console.warn(LOG, 'network error, retrying once', e);
      }
    }

    // One soft retry — do not block UI; still fire-and-forget from wrapper.
    try {
      await new Promise<void>(r => setTimeout(r, 900));
      const result = await postSeen(url, trimmedId, mac);
      if (result.ok) {
        markReported(trimmedId);
        if (__DEV__) {
          console.log(LOG, 'reported after retry', {id: trimmedId, mac});
        }
      }
    } catch (e) {
      if (__DEV__) {
        console.warn(LOG, 'retry failed', e);
      }
    }
  } finally {
    inflightIds.delete(trimmedId);
  }
}

/** Fire-and-forget wrapper — never throws into UI code. */
export function reportCmsSeenOnce(id: string, macAddress?: string): void {
  void reportCmsSeen(id, macAddress).catch(() => undefined);
}

/** Alias matching the CMS integration brief. */
export const reportEmergencySeen = reportCmsSeen;
