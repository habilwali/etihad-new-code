/**
 * Background prefetch for TV channel list APIs so the home → channel path is warm.
 * Start prefetch from App on mount (runs during splash); channel screens read
 * peek*() for instant UI when the request already finished. After a successful
 * list load, the first row’s stream is warmed (/stream/start + manifest wait)
 * so opening TV Channel does not pay that cost on the first play.
 */

import {
  logDevAllChannelList,
  type ChannelDataConfig,
  type ChannelItem,
} from '../data/channelData';
import {resolveCmsChannelStreamUrl} from '../config/cmsEndpoints';
import {getDeviceMacForWelcomeApi} from '../utils/getDeviceMacForWelcome';
import {
  fetchIptvChannels,
  fetchIptvPackages,
  type IptvChannelRow,
  type IptvPackageRow,
  type IptvPackagesResult,
} from './iptvCmsApi';
import {
  fetchEtihadChannels,
  fetchEtihadPackages,
  type EtihadChannelRow,
  type EtihadPackageRow,
  type EtihadPackagesResult,
} from './etihadTvApi';
import {
  startProxyStream,
  stopProxyStream,
  waitForHlsManifestReady,
} from './streamProxyApi';

/** Hotel default preview multicast — warmed at JS boot before TV Channel screen. */
export const DEFAULT_TV_UDP_WARMUP_URL = 'udp://@224.2.2.2:2068';

/** Warmup row uses this `channelId` until list load copies a real id for the same UDP. */
const DEFAULT_UDP_WARMUP_SENTINEL_CHANNEL_ID = -1;

export type ChannelDataLoadResult =
  | {ok: true; config: ChannelDataConfig}
  | {ok: false; message: string};

function hashHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 35% 42%)`;
}

function iptvRowToItem(ch: IptvChannelRow, packageId: number): ChannelItem {
  const offline = /offline|disabled|down/i.test(String(ch.status || ''));
  return {
    id: ch.id,
    cat: String(packageId),
    name: ch.name,
    program: ch.status ? String(ch.status) : 'Live',
    time: '—',
    progress: 0,
    hd: true,
    live: !offline,
    color: hashHue(ch.name),
    videoUrl: resolveCmsChannelStreamUrl(ch.stream_url),
  };
}

function etihadRowToItem(ch: EtihadChannelRow, packageId: number): ChannelItem {
  const offline = /offline|disabled|down/i.test(String(ch.status || ''));
  return {
    id: ch.id,
    cat: String(packageId),
    name: ch.name,
    program: ch.status ? String(ch.status) : 'Live',
    time: '—',
    progress: 0,
    hd: true,
    live: !offline,
    color: hashHue(ch.name),
    videoUrl: resolveCmsChannelStreamUrl(ch.stream_url),
  };
}

function iptvPackagesError(
  res: Extract<IptvPackagesResult, {ok: false}>,
): string {
  switch (res.reason) {
    case 'invalid_mac':
      return res.message || 'Invalid device';
    case 'client_not_found':
      return res.message || 'Device not registered';
    case 'not_checked_in':
      return res.message || 'Please check in';
    case 'no_mac':
      return 'Unable to read this device.';
    case 'network':
      return res.message || 'Network error.';
    default:
      return res.message || 'Could not load packages';
  }
}

function etihadPackagesError(
  res: Extract<EtihadPackagesResult, {ok: false}>,
): string {
  switch (res.reason) {
    case 'invalid_mac':
      return res.message || 'Invalid device';
    case 'client_not_found':
      return res.message || 'Device not registered';
    case 'not_checked_in':
      return res.message || 'Please check in';
    case 'no_mac':
      return 'Unable to read this device.';
    case 'network':
      return res.message || 'Network error.';
    default:
      return res.message || 'Could not load packages';
  }
}

async function buildIptvChannelItems(
  mac: string,
  packages: IptvPackageRow[],
): Promise<ChannelItem[]> {
  const results = await Promise.all(
    packages.map(p => fetchIptvChannels(p.id, mac)),
  );
  const items: ChannelItem[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < packages.length; i++) {
    const res = results[i];
    const pkg = packages[i];
    if (!res.ok) {
      continue;
    }
    for (const ch of res.channels) {
      if (seen.has(ch.id)) {
        continue;
      }
      seen.add(ch.id);
      items.push(iptvRowToItem(ch, pkg.id));
    }
  }
  logDevAllChannelList('iptvPrefetch', items);
  return items;
}

async function buildEtihadChannelItems(
  packages: EtihadPackageRow[],
): Promise<ChannelItem[]> {
  const results = await Promise.all(
    packages.map(p => fetchEtihadChannels(p.id)),
  );
  const items: ChannelItem[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < packages.length; i++) {
    const res = results[i];
    const pkg = packages[i];
    if (!res.ok) {
      continue;
    }
    for (const ch of res.channels) {
      if (seen.has(ch.id)) {
        continue;
      }
      seen.add(ch.id);
      items.push(etihadRowToItem(ch, pkg.id));
    }
  }
  logDevAllChannelList('etihadPrefetch', items);
  return items;
}

async function loadIptvTvChannelData(): Promise<ChannelDataLoadResult> {
  const mac = await getDeviceMacForWelcomeApi();
  const pkgRes = await fetchIptvPackages(mac);
  if (!pkgRes.ok) {
    return {ok: false, message: iptvPackagesError(pkgRes)};
  }
  if (pkgRes.packages.length === 0) {
    return {ok: false, message: 'No packages available for this device.'};
  }
  const channels = await buildIptvChannelItems(mac, pkgRes.packages);
  if (channels.length === 0) {
    return {ok: false, message: 'No channels assigned for this device.'};
  }
  const categories = [
    {id: 'all', label: 'All Channels'},
    ...pkgRes.packages.map(p => ({
      id: String(p.id),
      label: p.name,
    })),
  ];
  return {
    ok: true,
    config: {
      sidebarTitle: 'CHANNELS',
      categories,
      channels,
    },
  };
}

async function loadEtihadChannelListData(): Promise<ChannelDataLoadResult> {
  const mac = await getDeviceMacForWelcomeApi();
  const pkgRes = await fetchEtihadPackages(mac);
  if (!pkgRes.ok) {
    return {ok: false, message: etihadPackagesError(pkgRes)};
  }
  if (pkgRes.packages.length === 0) {
    return {
      ok: false,
      message: 'No Etihad packages available for this device.',
    };
  }
  const channels = await buildEtihadChannelItems(pkgRes.packages);
  if (channels.length === 0) {
    return {
      ok: false,
      message: 'No Etihad channels assigned for this device.',
    };
  }
  const categories = [
    {id: 'all', label: 'All Channels'},
    ...pkgRes.packages.map(p => ({
      id: String(p.id),
      label: p.name,
    })),
  ];
  return {
    ok: true,
    config: {
      sidebarTitle: 'ETIHAD TV',
      categories,
      channels,
    },
  };
}

/** First-row playback warmup — consumed by channelPlayerManager to skip cold /stream/start. */
export type PlaybackWarmupRow = {
  channelId: number;
  streamId: string;
  hlsUrl: string;
  /** Trimmed channel `videoUrl` (UDP or HTTP). */
  sourceUrl: string;
};

async function runFirstRowPlaybackWarmup(
  config: ChannelDataConfig,
): Promise<PlaybackWarmupRow | null> {
  const first = config.channels[0];
  if (!first) {
    return null;
  }
  const sourceUrl = first.videoUrl.trim();
  if (!sourceUrl) {
    return null;
  }
  if (!/^udp:\/\//i.test(sourceUrl)) {
    return {
      channelId: first.id,
      streamId: '',
      hlsUrl: sourceUrl,
      sourceUrl,
    };
  }
  if (sourceUrl === DEFAULT_TV_UDP_WARMUP_URL && defaultUdpWarmupPromise) {
    await defaultUdpWarmupPromise;
    if (
      defaultUdpWarmupRow &&
      defaultUdpWarmupRow.sourceUrl === sourceUrl
    ) {
      return {
        channelId: first.id,
        streamId: defaultUdpWarmupRow.streamId,
        hlsUrl: defaultUdpWarmupRow.hlsUrl,
        sourceUrl,
      };
    }
  }
  const res = await startProxyStream(sourceUrl);
  if (!res.ok) {
    return null;
  }
  await waitForHlsManifestReady(res.hlsUrl);
  return {
    channelId: first.id,
    streamId: res.streamId,
    hlsUrl: res.hlsUrl,
    sourceUrl,
  };
}

function stopWarmupStream(row: PlaybackWarmupRow | null): void {
  if (row?.streamId) {
    stopProxyStream(row.streamId).catch(() => undefined);
  }
}

function rowToStreamEntry(
  row: PlaybackWarmupRow,
  url: string,
): {streamId: string; hlsUrl: string; udpUrl: string} {
  const trimmed = url.trim();
  return {
    streamId: row.streamId,
    hlsUrl: row.hlsUrl,
    udpUrl: /^udp:\/\//i.test(trimmed) ? trimmed : '',
  };
}

let defaultUdpWarmupGen = 0;
let defaultUdpWarmupRow: PlaybackWarmupRow | null = null;
let defaultUdpWarmupPromise: Promise<PlaybackWarmupRow | null> | null = null;

/**
 * Start `/stream/start` + manifest wait for {@link DEFAULT_TV_UDP_WARMUP_URL} as soon
 * as the bundle loads (before TV Channel screen). Safe to call multiple times.
 */
export function startDefaultTvUdpPlaybackWarmup(): void {
  if (defaultUdpWarmupPromise != null || defaultUdpWarmupRow != null) {
    return;
  }
  const gen = ++defaultUdpWarmupGen;
  defaultUdpWarmupPromise = (async (): Promise<PlaybackWarmupRow | null> => {
    const res = await startProxyStream(DEFAULT_TV_UDP_WARMUP_URL);
    if (gen !== defaultUdpWarmupGen) {
      if (res.ok) {
        stopProxyStream(res.streamId).catch(() => undefined);
      }
      return null;
    }
    if (!res.ok) {
      return null;
    }
    const manifestOutcome = await waitForHlsManifestReady(res.hlsUrl, {
      isCancelled: () => gen !== defaultUdpWarmupGen,
    });
    if (gen !== defaultUdpWarmupGen) {
      stopProxyStream(res.streamId).catch(() => undefined);
      return null;
    }
    if (manifestOutcome === 'cancelled') {
      stopProxyStream(res.streamId).catch(() => undefined);
      return null;
    }
    return {
      channelId: DEFAULT_UDP_WARMUP_SENTINEL_CHANNEL_ID,
      streamId: res.streamId,
      hlsUrl: res.hlsUrl,
      sourceUrl: DEFAULT_TV_UDP_WARMUP_URL,
    };
  })()
    .then(row => {
      if (gen !== defaultUdpWarmupGen) {
        if (row?.streamId) {
          stopProxyStream(row.streamId).catch(() => undefined);
        }
        return null;
      }
      defaultUdpWarmupRow = row;
      return row;
    })
    .catch(() => null)
    .finally(() => {
      if (gen === defaultUdpWarmupGen) {
        defaultUdpWarmupPromise = null;
      }
    });
}

function matchDefaultUdpSentinelWarmup(
  row: PlaybackWarmupRow | null,
  channelId: number,
  trimmed: string,
): {streamId: string; hlsUrl: string; udpUrl: string} | null {
  if (
    !row ||
    row.sourceUrl !== trimmed ||
    trimmed !== DEFAULT_TV_UDP_WARMUP_URL
  ) {
    return null;
  }
  if (row.channelId !== DEFAULT_UDP_WARMUP_SENTINEL_CHANNEL_ID) {
    return null;
  }
  return rowToStreamEntry(row, trimmed);
}

let iptvPlaybackWarmupRow: PlaybackWarmupRow | null = null;
let iptvPlaybackWarmupPromise: Promise<PlaybackWarmupRow | null> | null = null;
let iptvPlaybackWarmupGen = 0;

function beginIptvFirstRowPlaybackWarmup(config: ChannelDataConfig): void {
  stopWarmupStream(iptvPlaybackWarmupRow);
  iptvPlaybackWarmupRow = null;
  const gen = ++iptvPlaybackWarmupGen;
  iptvPlaybackWarmupPromise = runFirstRowPlaybackWarmup(config)
    .then(row => {
      if (gen !== iptvPlaybackWarmupGen) {
        if (row?.streamId) {
          stopProxyStream(row.streamId).catch(() => undefined);
        }
        return null;
      }
      iptvPlaybackWarmupRow = row;
      return row;
    })
    .catch(() => null);
}

let etihadPlaybackWarmupRow: PlaybackWarmupRow | null = null;
let etihadPlaybackWarmupPromise: Promise<PlaybackWarmupRow | null> | null =
  null;
let etihadPlaybackWarmupGen = 0;

function beginEtihadFirstRowPlaybackWarmup(config: ChannelDataConfig): void {
  stopWarmupStream(etihadPlaybackWarmupRow);
  etihadPlaybackWarmupRow = null;
  const gen = ++etihadPlaybackWarmupGen;
  etihadPlaybackWarmupPromise = runFirstRowPlaybackWarmup(config)
    .then(row => {
      if (gen !== etihadPlaybackWarmupGen) {
        if (row?.streamId) {
          stopProxyStream(row.streamId).catch(() => undefined);
        }
        return null;
      }
      etihadPlaybackWarmupRow = row;
      return row;
    })
    .catch(() => null);
}

/**
 * If the list prefetch already started the proxy for this channel/source, return it
 * (awaiting in-flight warmup when needed). Used by ChannelPlayerManager.
 */
export async function awaitPlaybackWarmupForChannel(
  channelId: number,
  url: string,
): Promise<{streamId: string; hlsUrl: string; udpUrl: string} | null> {
  const trimmed = url.trim();
  const match = (
    row: PlaybackWarmupRow | null,
  ): {streamId: string; hlsUrl: string; udpUrl: string} | null =>
    row && row.channelId === channelId && row.sourceUrl === trimmed
      ? rowToStreamEntry(row, url)
      : null;

  let hit = match(iptvPlaybackWarmupRow);
  if (hit) {
    return hit;
  }
  hit = matchDefaultUdpSentinelWarmup(defaultUdpWarmupRow, channelId, trimmed);
  if (hit) {
    return hit;
  }
  if (iptvPlaybackWarmupPromise) {
    await iptvPlaybackWarmupPromise;
    hit = match(iptvPlaybackWarmupRow);
    if (hit) {
      return hit;
    }
    hit = matchDefaultUdpSentinelWarmup(defaultUdpWarmupRow, channelId, trimmed);
    if (hit) {
      return hit;
    }
  }
  if (defaultUdpWarmupPromise) {
    await defaultUdpWarmupPromise;
    hit = match(iptvPlaybackWarmupRow);
    if (hit) {
      return hit;
    }
    hit = matchDefaultUdpSentinelWarmup(defaultUdpWarmupRow, channelId, trimmed);
    if (hit) {
      return hit;
    }
  }
  hit = match(etihadPlaybackWarmupRow);
  if (hit) {
    return hit;
  }
  if (etihadPlaybackWarmupPromise) {
    await etihadPlaybackWarmupPromise;
    return match(etihadPlaybackWarmupRow);
  }
  return null;
}

/** Drop warmup row after manager adopted it (stops double-consume). */
export function clearPlaybackWarmupForSource(
  channelId: number,
  url: string,
): void {
  const t = url.trim();
  if (
    iptvPlaybackWarmupRow &&
    iptvPlaybackWarmupRow.channelId === channelId &&
    iptvPlaybackWarmupRow.sourceUrl === t
  ) {
    iptvPlaybackWarmupRow = null;
  }
  if (
    etihadPlaybackWarmupRow &&
    etihadPlaybackWarmupRow.channelId === channelId &&
    etihadPlaybackWarmupRow.sourceUrl === t
  ) {
    etihadPlaybackWarmupRow = null;
  }
  if (
    t === DEFAULT_TV_UDP_WARMUP_URL &&
    defaultUdpWarmupRow &&
    defaultUdpWarmupRow.sourceUrl === t
  ) {
    defaultUdpWarmupRow = null;
  }
}

/**
 * If channel data was loaded outside the stock IPTV prefetch (e.g. a custom CMS
 * screen), run the same first-row UDP→HLS warmup so {@link awaitPlaybackWarmupForChannel}
 * can skip cold `/stream/start` when ChannelScreen opens.
 */
export function scheduleIptvFirstRowPlaybackWarmup(
  config: ChannelDataConfig,
): void {
  beginIptvFirstRowPlaybackWarmup(config);
}

/**
 * Same for Etihad package list shape when loaded outside prefetch.
 */
export function scheduleEtihadFirstRowPlaybackWarmup(
  config: ChannelDataConfig,
): void {
  beginEtihadFirstRowPlaybackWarmup(config);
}

// ─── IPTV “TV Channel” (Welcome → tv icon) ───────────────────────────────────

let iptvTvPromise: Promise<ChannelDataLoadResult> | null = null;
let iptvTvLastResult: ChannelDataLoadResult | null = null;

function finalizeIptvTvResult(r: ChannelDataLoadResult): ChannelDataLoadResult {
  iptvTvLastResult = r;
  return r;
}

/** Latest settled result, if any — use for instant first paint when opening TV Channel. */
export function peekIptvTvChannelConfig(): ChannelDataLoadResult | null {
  return iptvTvLastResult;
}

/** Fire-and-forget: safe to call multiple times. */
export function startPrefetchIptvTvChannels(): void {
  if (iptvTvPromise == null) {
    iptvTvPromise = loadIptvTvChannelData()
      .catch(
        (): ChannelDataLoadResult => ({
          ok: false,
          message: 'Network error.',
        }),
      )
      .then(r => {
        finalizeIptvTvResult(r);
        if (r.ok) {
          beginIptvFirstRowPlaybackWarmup(r.config);
        }
        return r;
      });
  }
}

export function resetIptvTvChannelPrefetch(): void {
  stopWarmupStream(iptvPlaybackWarmupRow);
  iptvPlaybackWarmupRow = null;
  iptvPlaybackWarmupPromise = null;
  iptvPlaybackWarmupGen += 1;
  defaultUdpWarmupGen += 1;
  stopWarmupStream(defaultUdpWarmupRow);
  defaultUdpWarmupRow = null;
  defaultUdpWarmupPromise = null;
  iptvTvPromise = null;
  iptvTvLastResult = null;
  startDefaultTvUdpPlaybackWarmup();
}

/** Awaits in-flight prefetch or starts one; used by EtihadChannelScreen. */
export async function awaitIptvTvChannelConfig(): Promise<ChannelDataLoadResult> {
  startPrefetchIptvTvChannels();
  return iptvTvPromise!;
}

// ─── Etihad Channel (Welcome → Etihad Channel icon) ──────────────────────────

let etihadListPromise: Promise<ChannelDataLoadResult> | null = null;
let etihadListLastResult: ChannelDataLoadResult | null = null;

function finalizeEtihadListResult(
  r: ChannelDataLoadResult,
): ChannelDataLoadResult {
  etihadListLastResult = r;
  return r;
}

export function peekEtihadChannelListConfig(): ChannelDataLoadResult | null {
  return etihadListLastResult;
}

export function startPrefetchEtihadChannelList(): void {
  if (etihadListPromise == null) {
    etihadListPromise = loadEtihadChannelListData()
      .catch(
        (): ChannelDataLoadResult => ({
          ok: false,
          message: 'Network error.',
        }),
      )
      .then(r => {
        finalizeEtihadListResult(r);
        if (r.ok) {
          beginEtihadFirstRowPlaybackWarmup(r.config);
        }
        return r;
      });
  }
}

export function resetEtihadChannelListPrefetch(): void {
  stopWarmupStream(etihadPlaybackWarmupRow);
  etihadPlaybackWarmupRow = null;
  etihadPlaybackWarmupPromise = null;
  etihadPlaybackWarmupGen += 1;
  etihadListPromise = null;
  etihadListLastResult = null;
}

export async function awaitEtihadChannelListConfig(): Promise<ChannelDataLoadResult> {
  startPrefetchEtihadChannelList();
  return etihadListPromise!;
}
