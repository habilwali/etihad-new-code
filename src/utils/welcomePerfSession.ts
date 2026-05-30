import { logWelcomePerf } from './welcomePerf';

type Snap = {
  mac_ms?: number;
  mac_path?: string;
  fetch_ms?: number;
  fetch_json_ms?: number;
  fetch_status?: number;
  fetch_failed?: number;
  fetch_aborted?: number;
  fetch_outcome?: string;
};

let snap: Snap = {};

export function welcomePerfFlowStart(): void {
  snap = {};
}

export function welcomePerfSetMac(ms: number, path: string): void {
  snap.mac_ms = ms;
  snap.mac_path = path;
}

export function welcomePerfSetFetchResult(opts: {
  fetchMs: number;
  jsonMs?: number;
  status?: number;
  failed?: boolean;
  aborted?: boolean;
  outcome?: string;
}): void {
  snap.fetch_ms = opts.fetchMs;
  if (opts.jsonMs !== undefined) snap.fetch_json_ms = opts.jsonMs;
  if (opts.status !== undefined) snap.fetch_status = opts.status;
  if (opts.failed) {
    snap.fetch_failed = 1;
    if (opts.aborted) snap.fetch_aborted = 1;
  }
  if (opts.outcome) snap.fetch_outcome = opts.outcome;
}

/** One line: where time went (MAC vs HTTP). Call from `useWelcomeGuest` `finally`. */
export function welcomePerfLogBreakdown(fullMs: number): void {
  const extra: Record<string, string | number> = {};
  if (snap.mac_ms !== undefined) extra.mac_ms = snap.mac_ms;
  if (snap.mac_path !== undefined) extra.mac_path = snap.mac_path;
  if (snap.fetch_ms !== undefined) extra.fetch_ms = snap.fetch_ms;
  if (snap.fetch_json_ms !== undefined) extra.fetch_json_ms = snap.fetch_json_ms;
  if (snap.fetch_status !== undefined) extra.fetch_status = snap.fetch_status;
  if (snap.fetch_failed !== undefined) extra.fetch_failed = snap.fetch_failed;
  if (snap.fetch_aborted !== undefined) extra.fetch_aborted = snap.fetch_aborted;
  if (snap.fetch_outcome !== undefined) extra.fetch_outcome = snap.fetch_outcome;
  logWelcomePerf('welcome_flow_breakdown', fullMs, extra);
  snap = {};
}
