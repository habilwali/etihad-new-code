/**
 * Sliding prefetch window (max 3 proxy streams: prev / current / next by list index).
 * Debounced zapping; current stream starts first; neighbors prefetched in background.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Platform, ToastAndroid} from 'react-native';
import type {ChannelItem} from '../data/channelData';
import {
  isStartCancelled,
  startProxyStream,
  stopProxyStream,
  waitForHlsManifestReady,
} from '../services/streamProxyApi';
import {
  awaitPlaybackWarmupForChannel,
  clearPlaybackWarmupForSource,
} from '../services/channelListsPrefetch';
import {
  evictAllExcept,
  getCachedStream,
  prefetchStream,
} from '../services/streamPrefetchCache';

const LOG = '[ChannelPlayerManager]';
const DEFAULT_DEBOUNCE_MS = 0;

export type ChannelStreamEntry = {
  streamId: string;
  hlsUrl: string;
  udpUrl: string;
};

export function isUdpStreamUrl(url: string): boolean {
  return /^udp:\/\//i.test(url.trim());
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(len - 1, i));
}

function windowIndices(
  center: number,
  len: number,
): {prev: number; cur: number; next: number} {
  const cur = clampIndex(center, len);
  return {
    prev: Math.max(0, cur - 1),
    cur,
    next: Math.min(len - 1, cur + 1),
  };
}

function windowChannelIds(
  channels: ChannelItem[],
  center: number,
): Set<number> {
  const len = channels.length;
  if (len === 0) {
    return new Set();
  }
  const {prev, cur, next} = windowIndices(center, len);
  return new Set([channels[prev].id, channels[cur].id, channels[next].id]);
}

function showErrorToast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  } else {
    console.warn(LOG, message);
  }
}

export type ChannelPlayerManagerCallbacks = {
  onLoading: (loading: boolean) => void;
  onPlaybackUrl: (hlsUrl: string, meta: {channelId: number}) => void;
  debounceMs?: number;
};

/**
 * Imperative manager — use via {@link useChannelPlayerManager} or call directly in tests.
 */
export function createChannelPlayerManager(cb: ChannelPlayerManagerCallbacks) {
  const debounceMs = cb.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const channelIdToStream = new Map<number, ChannelStreamEntry>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let runGeneration = 0;
  let startAbort: AbortController | null = null;

  const isCurrentRun = (id: number) => id === runGeneration;

  function clearDebounce(): void {
    if (debounceTimer != null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function abortInFlightStart(): void {
    startAbort?.abort();
    startAbort = null;
  }

  function stopStreamEntry(entry: ChannelStreamEntry): void {
    if (entry.streamId) {
      stopProxyStream(entry.streamId).catch(() => undefined);
    }
  }

  function pruneOutsideWindow(winIds: Set<number>): void {
    for (const [chId, entry] of [...channelIdToStream.entries()]) {
      if (!winIds.has(chId)) {
        stopStreamEntry(entry);
        channelIdToStream.delete(chId);
      }
    }
  }

  function disposeSupersededProxy(result: {
    streamId: string;
    hlsUrl: string;
  }): void {
    stopProxyStream(result.streamId).catch(() => undefined);
  }

  async function ensureUdpInMap(
    runId: number,
    ch: ChannelItem,
  ): Promise<ChannelStreamEntry | null> {
    const udpUrl = ch.videoUrl.trim();
    if (!isUdpStreamUrl(udpUrl)) {
      const hlsUrl = udpUrl;
      const entry: ChannelStreamEntry = {streamId: '', hlsUrl, udpUrl: ''};
      channelIdToStream.set(ch.id, entry);
      return entry;
    }

    if (channelIdToStream.has(ch.id)) {
      const existing = channelIdToStream.get(ch.id)!;
      if (existing.udpUrl === udpUrl) {
        return existing;
      }
      stopStreamEntry(existing);
      channelIdToStream.delete(ch.id);
    }

    const res = await startProxyStream(udpUrl);
    if (!isCurrentRun(runId)) {
      if (res.ok) {
        disposeSupersededProxy(res);
      }
      return null;
    }
    if (!res.ok) {
      if (!isStartCancelled(res)) {
        console.warn(LOG, 'prefetch start failed', ch.id, res);
      }
      return null;
    }

    await waitForHlsManifestReady(res.hlsUrl, {
      isCancelled: () => !isCurrentRun(runId),
    });

    if (!isCurrentRun(runId)) {
      disposeSupersededProxy(res);
      return null;
    }

    const entry: ChannelStreamEntry = {
      streamId: res.streamId,
      hlsUrl: res.hlsUrl,
      udpUrl,
    };
    channelIdToStream.set(ch.id, entry);
    return entry;
  }

  async function prefetchNeighbor(
    runId: number,
    channels: ChannelItem[],
    idx: number,
    winIds: Set<number>,
  ): Promise<void> {
    if (!isCurrentRun(runId) || channels.length === 0) {
      return;
    }
    const ch = channels[idx];
    if (!ch) {
      return;
    }
    await ensureUdpInMap(runId, ch);
    if (!isCurrentRun(runId)) {
      return;
    }
    pruneOutsideWindow(winIds);
  }

  async function applyWindow(
    channels: ChannelItem[],
    centerIndex: number,
  ): Promise<void> {
    if (channels.length === 0) {
      cb.onLoading(false);
      return;
    }

    const curIdx = clampIndex(centerIndex, channels.length);
    const winIds = windowChannelIds(channels, curIdx);
    const curCh = channels[curIdx];
    const url = curCh.videoUrl.trim();
    const existing = channelIdToStream.get(curCh.id);
    const entryMatches =
      !!existing &&
      (isUdpStreamUrl(url)
        ? existing.udpUrl === url && existing.streamId.length > 0
        : existing.hlsUrl === url);

    if (entryMatches && existing) {
      const runId = ++runGeneration;
      abortInFlightStart();
      startAbort = new AbortController();
      cb.onPlaybackUrl(existing.hlsUrl, {channelId: curCh.id});
      cb.onLoading(false);
      pruneOutsideWindow(winIds);
      const {prev, next} = windowIndices(curIdx, channels.length);
      prefetchNeighbor(runId, channels, prev, winIds).catch(() => undefined);
      prefetchNeighbor(runId, channels, next, winIds).catch(() => undefined);
      return;
    }

    const runId = ++runGeneration;
    abortInFlightStart();
    startAbort = new AbortController();
    const signal = startAbort.signal;

    cb.onLoading(true);

    try {
      let hlsUrl: string;

      if (isUdpStreamUrl(url)) {
        const warmed = await awaitPlaybackWarmupForChannel(curCh.id, url);
        if (warmed) {
          channelIdToStream.set(curCh.id, warmed);
          clearPlaybackWarmupForSource(curCh.id, url);
          hlsUrl = warmed.hlsUrl;
        } else {
          const res = await startProxyStream(url, {signal});
          if (!isCurrentRun(runId)) {
            if (res.ok) {
              disposeSupersededProxy(res);
            }
            return;
          }
          if (!res.ok) {
            if (!isStartCancelled(res)) {
              showErrorToast(res.message);
            }
            cb.onLoading(false);
            return;
          }

          await waitForHlsManifestReady(res.hlsUrl, {
            isCancelled: () => !isCurrentRun(runId) || signal.aborted,
          });

          if (!isCurrentRun(runId)) {
            disposeSupersededProxy(res);
            return;
          }

          channelIdToStream.set(curCh.id, {
            streamId: res.streamId,
            hlsUrl: res.hlsUrl,
            udpUrl: url,
          });
          hlsUrl = res.hlsUrl;
        }
      } else {
        const warmedHttp = await awaitPlaybackWarmupForChannel(curCh.id, url);
        if (warmedHttp) {
          channelIdToStream.set(curCh.id, warmedHttp);
          clearPlaybackWarmupForSource(curCh.id, url);
          hlsUrl = warmedHttp.hlsUrl;
        } else {
          hlsUrl = url;
          channelIdToStream.set(curCh.id, {
            streamId: '',
            hlsUrl,
            udpUrl: '',
          });
        }
      }

      if (!isCurrentRun(runId)) {
        return;
      }

      cb.onPlaybackUrl(hlsUrl, {channelId: curCh.id});
      cb.onLoading(false);

      pruneOutsideWindow(winIds);

      const {prev, next} = windowIndices(curIdx, channels.length);
      prefetchNeighbor(runId, channels, prev, winIds).catch(() => undefined);
      prefetchNeighbor(runId, channels, next, winIds).catch(() => undefined);
    } catch (e) {
      if (isCurrentRun(runId)) {
        console.warn(LOG, 'applyWindow error', e);
        showErrorToast('Stream failed');
        cb.onLoading(false);
      }
    }
  }

  function schedule(channels: ChannelItem[], index: number): void {
    clearDebounce();
    if (debounceMs <= 0) {
      applyWindow(channels, index).catch(() => undefined);
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyWindow(channels, index).catch(() => undefined);
    }, debounceMs);
  }

  function flush(channels: ChannelItem[], index: number): void {
    clearDebounce();
    applyWindow(channels, index).catch(() => undefined);
  }

  function stopAll(): void {
    runGeneration += 1;
    clearDebounce();
    abortInFlightStart();
    for (const [, entry] of channelIdToStream.entries()) {
      stopStreamEntry(entry);
    }
    channelIdToStream.clear();
    cb.onLoading(false);
  }

  function getChannelStreamMap(): ReadonlyMap<number, ChannelStreamEntry> {
    return channelIdToStream;
  }

  return {
    schedule,
    flush,
    stopAll,
    /** Cancel a pending debounced `schedule` without tearing down active streams. */
    cancelPendingSchedule: clearDebounce,
    getChannelStreamMap,
  };
}

export type ChannelPlayerManager = ReturnType<
  typeof createChannelPlayerManager
>;

export function useChannelPlayerManager(args: {
  channels: ChannelItem[];
  /** Sidebar / list row index into `channels` (filtered list). */
  focusedListIndex: number;
  isActive: boolean;
  /** Changes when filtered list identity or hard remount (e.g. playerKey) changes. */
  listEpoch: string;
  onActiveChannelId: (channelId: number) => void;
  debounceMs?: number;
}): {
  playbackUri: string | null;
  switchLoading: boolean;
  flushPlayback: (channels: ChannelItem[], index: number) => void;
  getStreamMap: () => ReadonlyMap<number, ChannelStreamEntry>;
} {
  const debounceMs = args.debounceMs ?? 90;
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const activeIdxRef = useRef(-1);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyAcRef = useRef<AbortController | null>(null);
  const prefetchAcRef = useRef<AbortController | null>(null);
  const prefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsRef = useRef(args.channels);
  channelsRef.current = args.channels;
  const onActiveChannelIdRef = useRef(args.onActiveChannelId);
  onActiveChannelIdRef.current = args.onActiveChannelId;
  const prevListEpochRef = useRef<string | null>(null);

  useEffect(() => {
    if (!args.isActive) {
      evictAllExcept([]);
      setPlaybackUri(null);
      setSwitchLoading(false);
      activeIdxRef.current = -1;
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      applyAcRef.current?.abort();
    }
  }, [args.isActive]);

  useEffect(() => {
    if (!args.isActive || args.channels.length === 0) {
      return;
    }
    // Debounce prefetch by 200ms so rapid key-repeat does not spawn/abort
    // prefetch requests on every individual UP/DOWN keystroke.
    if (prefetchDebounceRef.current != null) {
      clearTimeout(prefetchDebounceRef.current);
    }
    prefetchDebounceRef.current = setTimeout(() => {
      prefetchDebounceRef.current = null;
      const list = channelsRef.current;
      const focused = args.focusedListIndex;
      const toWarm: string[] = [];
      for (let offset = -1; offset <= 2; offset += 1) {
        const idx = focused + offset;
        if (idx < 0 || idx >= list.length) {
          continue;
        }
        const url = list[idx]?.videoUrl?.trim() ?? '';
        if (/^udp:\/\//i.test(url)) {
          toWarm.push(url);
        }
      }
      if (!toWarm.length) {
        return;
      }
      prefetchAcRef.current?.abort();
      const ac = new AbortController();
      prefetchAcRef.current = ac;
      toWarm.forEach(url => {
        prefetchStream(url, ac.signal).catch(() => undefined);
      });
    }, 200);
    return () => {
      if (prefetchDebounceRef.current != null) {
        clearTimeout(prefetchDebounceRef.current);
        prefetchDebounceRef.current = null;
      }
    };
  }, [args.focusedListIndex, args.channels, args.isActive]);

  const applyChannel = useCallback(
    async (list: ChannelItem[], idx: number) => {
      const safeIdx = clampIndex(idx, list.length);
      const ch = list[safeIdx];
      if (!ch) {
        return;
      }
      const url = (ch.videoUrl ?? '').trim();
      onActiveChannelIdRef.current(ch.id);

      if (/^udp:\/\//i.test(url)) {
        const cached = getCachedStream(url);
        if (cached) {
          setPlaybackUri(cached.hlsUrl);
          setSwitchLoading(false);
          return;
        }
        setSwitchLoading(true);
        applyAcRef.current?.abort();
        const ac = new AbortController();
        applyAcRef.current = ac;
        const entry = await prefetchStream(url, ac.signal);
        if (ac.signal.aborted) {
          return;
        }
        setSwitchLoading(false);
        if (entry) {
          setPlaybackUri(entry.hlsUrl);
        }
      } else if (/^https?:\/\//i.test(url)) {
        setPlaybackUri(url);
        setSwitchLoading(false);
      } else {
        setPlaybackUri(null);
        setSwitchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const prev = prevListEpochRef.current;
    prevListEpochRef.current = args.listEpoch;
    if (!args.isActive || args.channels.length === 0) {
      return;
    }
    if (prev == null || prev === args.listEpoch) {
      return;
    }
    evictAllExcept([]);
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    activeIdxRef.current = args.focusedListIndex;
    void applyChannel(args.channels, args.focusedListIndex);
  }, [
    args.listEpoch,
    args.isActive,
    args.channels,
    args.focusedListIndex,
    applyChannel,
  ]);

  useEffect(() => {
    if (!args.isActive) {
      return;
    }
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }
    const delayMs = activeIdxRef.current === -1 ? 0 : debounceMs;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const list = channelsRef.current;
      const focused = args.focusedListIndex;
      // Wait until the list is non-empty. If we advanced `activeIdxRef` while
      // `list.length === 0`, we'd skip the real first apply once data arrives
      // (`activeIdxRef === focused` forever).
      if (list.length === 0) {
        return;
      }
      if (activeIdxRef.current !== focused) {
        activeIdxRef.current = focused;
        void applyChannel(list, focused);
      }
    }, delayMs);
    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    args.focusedListIndex,
    // args.channels intentionally omitted — read via channelsRef inside the timeout.
    // Including it would reset the debounce timer on every channel-list reference
    // change, which is not wanted during navigation.
    args.isActive,
    debounceMs,
    applyChannel,
  ]);

  const flushPlayback = useCallback(
    (list: ChannelItem[], idx: number) => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      activeIdxRef.current = idx;
      void applyChannel(list, idx);
    },
    [applyChannel],
  );

  const getStreamMap = useCallback(
    () => new Map<number, ChannelStreamEntry>(),
    [],
  );

  return {playbackUri, switchLoading, flushPlayback, getStreamMap};
}

/** Stable epoch string for filtered channel lists (content-based, not array identity). */
export function useChannelListEpoch(
  channels: ChannelItem[],
  remountKey: number,
): string {
  // The O(n) string join runs only when `channels` reference changes (category
  // switch / config reload), NOT on every render caused by UP/DOWN navigation.
  return useMemo(
    () =>
      `${remountKey}:${channels.map(c => `${c.id}:${c.videoUrl}`).join(';')}`,
    [remountKey, channels],
  );
}
