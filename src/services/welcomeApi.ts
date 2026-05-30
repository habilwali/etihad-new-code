import { buildWelcomeApiUrl } from '../config/cmsEndpoints';
import { logWelcomePerf } from '../utils/welcomePerf';
import { welcomePerfSetFetchResult } from '../utils/welcomePerfSession';

/** Fail fast if CMS is unreachable; increase if your server is consistently slow. */
const WELCOME_FETCH_TIMEOUT_MS = 12_000;

/** Normalized guest payload for the welcome screen (camelCase). */
export interface WelcomeGuestPayload {
  roomNumber: string;
  clientName: string;
  welcomeMessage: string;
  category: string;
  signatureTitle: string;
}

export interface WelcomeApiSuccessJson {
  success: true;
  room_number: string;
  client_name: string;
  welcome_message: string;
  category: string;
  signature_title: string;
}

export interface WelcomeApiErrorJson {
  success: false;
  error: string;
}

export type WelcomeApiFailureReason =
  | 'network'
  | 'no_mac'
  | 'bad_request'
  | 'not_found'
  | 'server_error'
  | 'invalid_json'
  | 'success_false'
  | 'http_error';

export type WelcomeApiResult =
  | { ok: true; data: WelcomeGuestPayload }
  | { ok: false; reason: WelcomeApiFailureReason; message: string; httpStatus?: number };

function mapSuccess(body: WelcomeApiSuccessJson): WelcomeGuestPayload {
  return {
    roomNumber: String(body.room_number ?? ''),
    clientName: String(body.client_name ?? 'Guest'),
    welcomeMessage: String(body.welcome_message ?? 'Welcome'),
    category: String(body.category ?? ''),
    signatureTitle: String(body.signature_title ?? ''),
  };
}

function reasonForStatus(status: number): WelcomeApiFailureReason {
  if (status === 400) return 'bad_request';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'http_error';
}

/**
 * GET /api/welcome_api.php?mac_address=… (mac URL-encoded by caller via buildWelcomeApiUrl).
 */
export async function fetchWelcomeByMac(macAddress: string): Promise<WelcomeApiResult> {
  const trimmed = macAddress.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_mac', message: 'Missing MAC address' };
  }

  const url = buildWelcomeApiUrl(trimmed);
  const safeUrl = url.replace(/(mac_address=)[^&]+/i, '$1<redacted>');
  console.log('[WelcomeAPI] GET start', safeUrl);

  const t0 = Date.now();
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WELCOME_FETCH_TIMEOUT_MS);
  try {
    res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = e instanceof Error && e.name === 'AbortError';
    const failMs = Date.now() - t0;
    logWelcomePerf('welcome_fetch_failed', failMs, { aborted: aborted ? 1 : 0 });
    welcomePerfSetFetchResult({
      fetchMs: failMs,
      failed: true,
      aborted,
      outcome: 'network_or_timeout',
    });
    console.log(
      aborted ? '[WelcomeAPI] timeout or aborted' : '[WelcomeAPI] network error',
      e,
    );
    return {
      ok: false,
      reason: 'network',
      message: aborted ? `Welcome API timeout (${WELCOME_FETCH_TIMEOUT_MS / 1000}s)` : 'Network request failed',
    };
  }

  const fetchMs = Date.now() - t0;
  console.log('[WelcomeAPI] HTTP status', res.status, '(before body parse)');

  const tJson = Date.now();
  let body: unknown;
  try {
    body = await res.json();
  } catch (eJson) {
    const invalidJsonMs = Date.now() - tJson;
    logWelcomePerf('welcome_fetch', fetchMs, {
      json_ms: invalidJsonMs,
      status: res.status,
      outcome: 'invalid_json',
    });
    welcomePerfSetFetchResult({
      fetchMs,
      jsonMs: invalidJsonMs,
      status: res.status,
      outcome: 'invalid_json',
    });
    console.log('[WelcomeAPI] invalid JSON, status=', res.status, eJson);
    return {
      ok: false,
      reason: 'invalid_json',
      message: 'Invalid JSON response',
      httpStatus: res.status,
    };
  }

  const jsonMs = Date.now() - tJson;
  logWelcomePerf('welcome_fetch', fetchMs, {
    json_ms: jsonMs,
    status: res.status,
    note: 'ms_until_fetch_done_includes_download; compare curl from PC',
  });
  welcomePerfSetFetchResult({
    fetchMs,
    jsonMs,
    status: res.status,
    outcome: 'ok',
  });

  if (typeof body !== 'object' || body === null) {
    return {
      ok: false,
      reason: 'invalid_json',
      message: 'Empty or invalid response',
      httpStatus: res.status,
    };
  }

  console.log('[WelcomeAPI] response', {
    httpStatus: res.status,
    url: safeUrl,
    body,
  });

  const record = body as Record<string, unknown>;

  if (record.success === false) {
    const err = typeof record.error === 'string' ? record.error : 'Unknown error';
    return {
      ok: false,
      reason: res.ok ? 'success_false' : reasonForStatus(res.status),
      message: err,
      httpStatus: res.status,
    };
  }

  if (!res.ok) {
    const err = typeof record.error === 'string' ? record.error : `HTTP ${res.status}`;
    return {
      ok: false,
      reason: reasonForStatus(res.status),
      message: err,
      httpStatus: res.status,
    };
  }

  if (record.success !== true) {
    return {
      ok: false,
      reason: 'success_false',
      message: typeof record.error === 'string' ? record.error : 'success is not true',
      httpStatus: res.status,
    };
  }

  try {
    const data = mapSuccess(body as WelcomeApiSuccessJson);
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      reason: 'invalid_json',
      message: 'Malformed success payload',
      httpStatus: res.status,
    };
  }
}
