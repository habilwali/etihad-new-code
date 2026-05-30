import {
  startProxyStream,
  stopProxyStream,
  waitForHlsManifestReady,
} from './streamProxyApi';

export interface CachedStream {
  streamId: string;
  hlsUrl: string;
  udpUrl: string;
  readyAt: number;
}

const cache = new Map<string, CachedStream>();
const inflight = new Map<string, Promise<CachedStream | null>>();
const CACHE_TTL_MS = 90_000;

export function getCachedStream(udpUrl: string): CachedStream | null {
  const entry = cache.get(udpUrl);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.readyAt > CACHE_TTL_MS) {
    cache.delete(udpUrl);
    return null;
  }
  return entry;
}

export function setCachedStream(entry: CachedStream): void {
  cache.set(entry.udpUrl, entry);
}

export function evictCachedStream(udpUrl: string): void {
  const entry = cache.get(udpUrl);
  cache.delete(udpUrl);
  inflight.delete(udpUrl);
  if (entry) {
    stopProxyStream(entry.streamId).catch(() => undefined);
  }
}

export function evictAllExcept(keepUrls: string[]): void {
  const keep = new Set(keepUrls);
  for (const [url, entry] of [...cache.entries()]) {
    if (!keep.has(url)) {
      cache.delete(url);
      stopProxyStream(entry.streamId).catch(() => undefined);
    }
  }
  for (const url of [...inflight.keys()]) {
    if (!keep.has(url)) {
      inflight.delete(url);
    }
  }
}

export async function prefetchStream(
  udpUrl: string,
  signal?: AbortSignal,
): Promise<CachedStream | null> {
  const existing = getCachedStream(udpUrl);
  if (existing) {
    return existing;
  }

  const inFlight = inflight.get(udpUrl);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async (): Promise<CachedStream | null> => {
    try {
      const result = await startProxyStream(udpUrl, {signal});
      if (!result.ok || signal?.aborted) {
        inflight.delete(udpUrl);
        return null;
      }
      const manifestOutcome = await waitForHlsManifestReady(result.hlsUrl, {
        isCancelled: () => !!signal?.aborted,
      });
      inflight.delete(udpUrl);
      if (signal?.aborted || manifestOutcome === 'cancelled') {
        stopProxyStream(result.streamId).catch(() => undefined);
        return null;
      }
      const entry: CachedStream = {
        streamId: result.streamId,
        hlsUrl: result.hlsUrl,
        udpUrl,
        readyAt: Date.now(),
      };
      cache.set(udpUrl, entry);
      return entry;
    } catch {
      inflight.delete(udpUrl);
      return null;
    }
  })();

  inflight.set(udpUrl, promise);
  return promise;
}
