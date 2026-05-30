const STREAM_PROXY_BASE_URL =
  process.env.HOTEL_STREAM_PROXY_BASE_URL?.replace(/\/$/, '') ??
  'http://10.10.120.11:3000';

const STREAM_PROXY_TIMEOUT_MS = 20_000;
const HLS_MANIFEST_POLL_MS = 250;
/** Copy / slow encodes may publish the playlist later than reencode. */
const HLS_MANIFEST_WAIT_MS = 20_000;
/** Each manifest probe must yield (success or fail) so one bad TCP read cannot freeze the whole wait window. */
const HLS_MANIFEST_POLL_FETCH_TIMEOUT_MS = 8_000;
const LOG_PREFIX = '[StreamProxyAPI]';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function mergeAbortSignals(
  a: AbortSignal,
  b: AbortSignal,
): {signal: AbortSignal; dispose: () => void} {
  const merged = new AbortController();
  const forward = () => {
    if (!merged.signal.aborted) {
      merged.abort();
    }
  };
  if (a.aborted || b.aborted) {
    forward();
    return {signal: merged.signal, dispose: () => undefined};
  }
  a.addEventListener('abort', forward);
  b.addEventListener('abort', forward);
  return {
    signal: merged.signal,
    dispose: () => {
      a.removeEventListener('abort', forward);
      b.removeEventListener('abort', forward);
    },
  };
}

export interface ProxyStream {
  streamId: string;
  hlsUrl: string;
  /** Present when the proxy returns a mode field (e.g. copy | reencode). */
  mode?: string;
}

export type StartProxyStreamResult =
  | ({ok: true} & ProxyStream)
  | {ok: false; message: string; httpStatus?: number}
  | {ok: false; cancelled: true};

export function isStartCancelled(
  result: StartProxyStreamResult,
): result is {ok: false; cancelled: true} {
  return (
    result.ok === false && 'cancelled' in result && result.cancelled === true
  );
}

function endpoint(path: string): string {
  return `${STREAM_PROXY_BASE_URL}${path}`;
}

function originOf(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+/i);
  return match?.[0] ?? '';
}

function normalizeProxyHlsUrl(hlsUrl: string): string {
  const proxyOrigin = originOf(STREAM_PROXY_BASE_URL);
  const hlsOrigin = originOf(hlsUrl);
  if (!proxyOrigin || !hlsOrigin || proxyOrigin === hlsOrigin) {
    return hlsUrl;
  }

  const normalized = hlsUrl.replace(/^https?:\/\/[^/]+/i, proxyOrigin);
  console.log(`${LOG_PREFIX} /stream/start hlsUrl normalized`, {
    original: hlsUrl,
    normalized,
  });
  return normalized;
}

function safeJsonParse(text: string): unknown {
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text);
}

function timeoutSignal(): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), STREAM_PROXY_TIMEOUT_MS);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(tid),
  };
}

export async function startProxyStream(
  udpUrl: string,
  options?: {signal?: AbortSignal},
): Promise<StartProxyStreamResult> {
  const trimmed = udpUrl.trim();
  if (!trimmed) {
    console.warn(`${LOG_PREFIX} start skipped: missing udpUrl`);
    return {ok: false, message: 'Missing stream URL'};
  }

  const url = endpoint('/stream/start');
  const startedAt = Date.now();
  const requestBody = {udpUrl: trimmed};
  console.log(`${LOG_PREFIX} POST /stream/start`, {
    url,
    body: requestBody,
  });

  const timeout = timeoutSignal();
  const external = options?.signal;
  const merged = external ? mergeAbortSignals(timeout.signal, external) : null;
  const fetchSignal = merged?.signal ?? timeout.signal;
  const disposeMerged = merged?.dispose ?? (() => undefined);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
      signal: fetchSignal,
    });
  } catch (error) {
    timeout.clear();
    disposeMerged();
    if (isAbortError(error)) {
      return {ok: false, cancelled: true};
    }
    console.warn(`${LOG_PREFIX} /stream/start network error`, {
      url,
      ms: Date.now() - startedAt,
      error,
    });
    return {ok: false, message: 'Stream server is unreachable'};
  }
  timeout.clear();
  disposeMerged();

  const responseText = await res.text();
  console.log(`${LOG_PREFIX} /stream/start response`, {
    url,
    status: res.status,
    ok: res.ok,
    ms: Date.now() - startedAt,
    body: responseText,
  });

  let body: unknown;
  try {
    body = safeJsonParse(responseText);
  } catch (error) {
    console.warn(`${LOG_PREFIX} /stream/start invalid JSON`, {
      url,
      status: res.status,
      body: responseText,
      error,
    });
    return {
      ok: false,
      message: 'Invalid response from stream server',
      httpStatus: res.status,
    };
  }

  const rec =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (!res.ok) {
    const message =
      typeof rec.error === 'string'
        ? rec.error
        : typeof rec.message === 'string'
        ? rec.message
        : `Stream start failed (HTTP ${res.status})`;
    console.warn(`${LOG_PREFIX} /stream/start failed`, {
      status: res.status,
      message,
      body: rec,
    });
    return {ok: false, message, httpStatus: res.status};
  }

  const streamId = typeof rec.streamId === 'string' ? rec.streamId : '';
  const rawHlsUrl = typeof rec.hlsUrl === 'string' ? rec.hlsUrl : '';
  const mode = typeof rec.mode === 'string' ? rec.mode : undefined;
  const hlsUrl = normalizeProxyHlsUrl(rawHlsUrl);
  if (!streamId || !/^https?:\/\//i.test(hlsUrl)) {
    console.warn(`${LOG_PREFIX} /stream/start invalid payload`, {
      status: res.status,
      body: rec,
    });
    return {
      ok: false,
      message: 'Stream server returned an invalid HLS URL',
      httpStatus: res.status,
    };
  }

  console.log(`${LOG_PREFIX} /stream/start success`, {
    streamId,
    hlsUrl,
  });
  return {ok: true, streamId, hlsUrl, ...(mode != null ? {mode} : {})};
}

export interface ListedProxyStream {
  streamId: string;
  udpUrl?: string;
  hlsUrl?: string;
  mode?: string;
}

/**
 * GET /streams — optional reconciliation / diagnostics.
 */
export async function listProxyStreams(): Promise<
  ListedProxyStream[] | {ok: false; message: string}
> {
  const url = endpoint('/streams');
  try {
    const res = await fetch(url, {method: 'GET', cache: 'no-store'});
    const text = await res.text();
    if (!res.ok) {
      return {ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}`};
    }
    let body: unknown;
    try {
      body = text.trim() ? JSON.parse(text) : [];
    } catch {
      return {ok: false, message: 'Invalid JSON from /streams'};
    }
    if (!Array.isArray(body)) {
      return {ok: false, message: 'Expected array from /streams'};
    }
    return body.map((row): ListedProxyStream => {
      const r =
        typeof row === 'object' && row !== null
          ? (row as Record<string, unknown>)
          : {};
      return {
        streamId: typeof r.streamId === 'string' ? r.streamId : '',
        udpUrl: typeof r.udpUrl === 'string' ? r.udpUrl : undefined,
        hlsUrl: typeof r.hlsUrl === 'string' ? r.hlsUrl : undefined,
        mode: typeof r.mode === 'string' ? r.mode : undefined,
      };
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} GET /streams error`, {url, error});
    return {ok: false, message: 'Stream server is unreachable'};
  }
}

/**
 * Polls until the HLS playlist responds with HTTP 2xx (ffmpeg often creates
 * the path shortly after /stream/start returns). Reduces ExoPlayer "404 on
 * index.m3u8" noise when the player mounts before the file exists.
 */
export async function waitForHlsManifestReady(
  hlsUrl: string,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
    isCancelled?: () => boolean;
  },
): Promise<'ready' | 'timeout' | 'cancelled'> {
  const pollMs = options?.pollMs ?? HLS_MANIFEST_POLL_MS;
  const timeoutMs = options?.timeoutMs ?? HLS_MANIFEST_WAIT_MS;
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();

  while (Date.now() < deadline) {
    if (options?.isCancelled?.()) {
      return 'cancelled';
    }
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), HLS_MANIFEST_POLL_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(hlsUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        },
        signal: ac.signal,
      });
      if (res.ok) {
        console.log(`${LOG_PREFIX} HLS manifest ready`, {
          hlsUrl,
          ms: Date.now() - startedAt,
        });
        return 'ready';
      }
    } catch {
      // Network error, abort timeout, or ffmpeg still wiring — retry until deadline.
    } finally {
      clearTimeout(tid);
    }
    if (options?.isCancelled?.()) {
      return 'cancelled';
    }
    await delay(pollMs);
  }

  console.warn(`${LOG_PREFIX} HLS manifest wait timed out`, {
    hlsUrl,
    timeoutMs,
    ms: Date.now() - startedAt,
  });
  return 'timeout';
}

export async function stopProxyStream(streamId: string): Promise<void> {
  const trimmed = streamId.trim();
  if (!trimmed) {
    console.warn(`${LOG_PREFIX} stop skipped: missing streamId`);
    return;
  }

  const url = endpoint('/stream/stop');
  const startedAt = Date.now();
  const requestBody = {streamId: trimmed};
  console.log(`${LOG_PREFIX} POST /stream/stop`, {
    url,
    body: requestBody,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(requestBody),
    });
    const responseText = await res.text();
    console.log(`${LOG_PREFIX} /stream/stop response`, {
      url,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - startedAt,
      body: responseText,
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} /stream/stop network error`, {
      url,
      streamId: trimmed,
      ms: Date.now() - startedAt,
      error,
    });
    // Stop is best-effort; switching should never block on cleanup.
  }
}
