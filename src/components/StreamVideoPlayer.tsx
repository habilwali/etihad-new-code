import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Video, {
  type OnBufferData,
  type OnPlaybackStateChangedData,
  type OnProgressData,
  type OnVideoErrorData,
} from 'react-native-video';
import {Colors} from '../theme/colors';
import {FontFamily} from '../theme/typography';
import {
  isStartCancelled,
  startProxyStream,
  stopProxyStream,
  waitForHlsManifestReady,
  type ProxyStream,
} from '../services/streamProxyApi';

const LOG_PREFIX = '[StreamVideoPlayer]';
const PLAYBACK_ERROR_REMOUNT_MS = 450;
const PLAYBACK_404_RESTART_AFTER = 3;

function stringifyUnknown(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isLikelyHttp404FromVideoError(error: OnVideoErrorData): boolean {
  const text = stringifyUnknown(error).toLowerCase();
  return (
    text.includes('response code: 404') ||
    text.includes('http 404') ||
    text.includes('status code: 404') ||
    text.includes('error_code_io_bad_http_status')
  );
}

export interface StreamVideoPlayerProps {
  uri: string | null | undefined;
  style?: ViewStyle | object;
  isFullscreen?: boolean;
  paused?: boolean;
  channelName?: string;
  /** Parent-managed IPTV: no URI yet (e.g. UDP) — show starting overlay, do not treat as fatal empty. */
  managedSourceLoading?: boolean;
  /** Overlay while parent resolves next HLS (previous URI may still be mounted). */
  channelSwitchLoading?: boolean;
}

type Status =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'buffering'
  | 'reconnecting'
  | 'failed';

type SourceKind =
  | {kind: 'empty'; uri: ''}
  | {kind: 'proxy'; uri: string}
  | {kind: 'direct'; uri: string};

function getSourceKind(value: string | null | undefined): SourceKind {
  if (typeof value !== 'string') {
    return {kind: 'empty', uri: ''};
  }

  const uri = value.trim();
  if (!uri || /^(null|undefined|false)$/i.test(uri)) {
    return {kind: 'empty', uri: ''};
  }

  if (
    [...uri].some(ch => {
      const code = ch.charCodeAt(0);
      return code <= 32 || code === 127;
    })
  ) {
    return {kind: 'empty', uri: ''};
  }

  if (/^udp:\/\//i.test(uri)) {
    return {kind: 'proxy', uri};
  }

  if (/^(http|https|file):\/\//i.test(uri)) {
    return {kind: 'direct', uri};
  }

  return {kind: 'empty', uri: ''};
}

function StreamVideoPlayer({
  uri,
  style,
  isFullscreen = false,
  paused = false,
  channelName,
  managedSourceLoading = false,
  channelSwitchLoading = false,
}: StreamVideoPlayerProps) {
  const source = getSourceKind(uri);
  const sourceKey = `${source.kind}:${source.uri}`;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [playbackRemountKey, setPlaybackRemountKey] = useState(0);
  /** Compact preview loader while switching UDP but keeping the previous frame visible. */
  const [previewChannelLoading, setPreviewChannelLoading] = useState(false);
  const activeProxyRef = useRef<ProxyStream | null>(null);
  const requestSeqRef = useRef(0);
  const playbackErrorRetriesRef = useRef(0);
  const playback404StreakRef = useRef(0);
  const playbackRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const playbackRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** After first successful frame; used to avoid blanking the old channel while the next proxy stream starts. */
  const surfaceEstablishedRef = useRef(false);
  const previousUrlRef = useRef<string>('');

  const stopActiveProxy = useCallback(() => {
    const active = activeProxyRef.current;
    activeProxyRef.current = null;
    if (active) {
      stopProxyStream(active.streamId).catch(() => undefined);
    }
  }, []);

  /** Superseded /stream/start: never stop a stream we never attached when nothing is active yet (duplicate in-flight same UDP). */
  const disposeSupersededStartResult = useCallback((result: ProxyStream) => {
    const active = activeProxyRef.current;
    if (!active) {
      console.log(
        `${LOG_PREFIX} superseded /stream/start before attach — not stopping`,
        {
          streamId: result.streamId,
        },
      );
      return;
    }
    if (active.streamId !== result.streamId) {
      console.log(`${LOG_PREFIX} stopping stale proxy stream`, {
        staleStreamId: result.streamId,
        activeStreamId: active.streamId,
      });
      stopProxyStream(result.streamId).catch(() => undefined);
    } else {
      console.log(`${LOG_PREFIX} stale start returned active stream`, {
        streamId: result.streamId,
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      if (playbackRetryTimerRef.current != null) {
        clearTimeout(playbackRetryTimerRef.current);
        playbackRetryTimerRef.current = null;
      }
      if (playbackRestartTimerRef.current != null) {
        clearTimeout(playbackRestartTimerRef.current);
        playbackRestartTimerRef.current = null;
      }
      stopActiveProxy();
    };
  }, [stopActiveProxy]);

  const proxyStartSessionRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setErrorMsg('');
    playbackErrorRetriesRef.current = 0;
    playback404StreakRef.current = 0;
    if (playbackRetryTimerRef.current != null) {
      clearTimeout(playbackRetryTimerRef.current);
      playbackRetryTimerRef.current = null;
    }
    if (playbackRestartTimerRef.current != null) {
      clearTimeout(playbackRestartTimerRef.current);
      playbackRestartTimerRef.current = null;
    }
    setPlaybackRemountKey(0);

    if (source.kind === 'empty') {
      if (managedSourceLoading) {
        setPreviewChannelLoading(false);
        setVideoUrl(null);
        setStatus('starting');
        setErrorMsg('');
        stopActiveProxy();
        return () => undefined;
      }
      console.warn(`${LOG_PREFIX} empty source`, {channelName, uri});
      setPreviewChannelLoading(false);
      setVideoUrl(null);
      setStatus('failed');
      setErrorMsg('No stream URL');
      stopActiveProxy();
      return;
    }

    if (source.kind === 'direct') {
      const isNewUrl = source.uri !== previousUrlRef.current;
      previousUrlRef.current = source.uri;
      if (isNewUrl && surfaceEstablishedRef.current) {
        setPreviewChannelLoading(true);
      } else if (!surfaceEstablishedRef.current) {
        setPreviewChannelLoading(false);
        setStatus('starting');
      }
      console.log(`${LOG_PREFIX} direct source selected`, {
        channelName,
        uri: source.uri,
      });
      setVideoUrl(source.uri);
      playbackErrorRetriesRef.current = 0;
      playback404StreakRef.current = 0;
      setPlaybackRemountKey(0);
      stopActiveProxy();
      return;
    }

    const isNewUrl = source.uri !== previousUrlRef.current;
    previousUrlRef.current = source.uri;
    if (source.kind === 'proxy' && isNewUrl && surfaceEstablishedRef.current) {
      setPreviewChannelLoading(true);
    } else if (!surfaceEstablishedRef.current) {
      setPreviewChannelLoading(false);
      setStatus('starting');
    }
    console.log(`${LOG_PREFIX} proxy source selected`, {
      channelName,
      udpUrl: source.uri,
    });

    proxyStartSessionRef.current?.abort();
    const sessionAc = new AbortController();
    proxyStartSessionRef.current = sessionAc;

    const startNextStream = async () => {
      const previousProxy = activeProxyRef.current;
      const result = await startProxyStream(source.uri, {
        signal: sessionAc.signal,
      });

      if (requestSeqRef.current !== requestSeq) {
        if (result.ok) {
          disposeSupersededStartResult(result);
        }
        return;
      }

      if (!result.ok) {
        if (isStartCancelled(result)) {
          return;
        }
        if (previousProxy) {
          activeProxyRef.current = null;
          surfaceEstablishedRef.current = false;
          setVideoUrl(null);
          stopProxyStream(previousProxy.streamId).catch(() => undefined);
        }
        setStatus('failed');
        setErrorMsg(result.message);
        setPreviewChannelLoading(false);
        return;
      }

      const manifestOutcome = await waitForHlsManifestReady(result.hlsUrl, {
        isCancelled: () => requestSeqRef.current !== requestSeq,
      });

      if (requestSeqRef.current !== requestSeq) {
        if (result.ok) {
          disposeSupersededStartResult(result);
        }
        return;
      }

      if (manifestOutcome === 'cancelled') {
        return;
      }

      if (manifestOutcome === 'timeout') {
        console.log(
          `${LOG_PREFIX} HLS manifest not confirmed before timeout, starting playback anyway`,
          {
            channelName,
            hlsUrl: result.hlsUrl,
          },
        );
      }

      activeProxyRef.current = {
        streamId: result.streamId,
        hlsUrl: result.hlsUrl,
      };
      console.log(`${LOG_PREFIX} setting video URL`, {
        channelName,
        streamId: result.streamId,
        hlsUrl: result.hlsUrl,
      });
      setVideoUrl(result.hlsUrl);
      setStatus('starting');
      playbackErrorRetriesRef.current = 0;
      playback404StreakRef.current = 0;
      setPlaybackRemountKey(0);

      if (previousProxy && previousProxy.streamId !== result.streamId) {
        setTimeout(() => {
          stopProxyStream(previousProxy.streamId).catch(() => undefined);
        }, 0);
      }
    };
    startNextStream().catch(() => {
      if (requestSeqRef.current === requestSeq) {
        setStatus('failed');
        setErrorMsg('Stream start failed');
        setPreviewChannelLoading(false);
      }
    });

    return () => {
      sessionAc.abort();
    };
    // sourceKey is the playback identity; channelName is display-only and must not retrigger /stream/start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceKey,
    managedSourceLoading,
    stopActiveProxy,
    disposeSupersededStartResult,
  ]);

  const handleLoad = useCallback(() => {
    console.log(`${LOG_PREFIX} onLoad`, {channelName, videoUrl});
    surfaceEstablishedRef.current = true;
    setPreviewChannelLoading(false);
    playbackErrorRetriesRef.current = 0;
    playback404StreakRef.current = 0;
    if (playbackRetryTimerRef.current != null) {
      clearTimeout(playbackRetryTimerRef.current);
      playbackRetryTimerRef.current = null;
    }
    if (playbackRestartTimerRef.current != null) {
      clearTimeout(playbackRestartTimerRef.current);
      playbackRestartTimerRef.current = null;
    }
    setStatus('playing');
  }, [channelName, videoUrl]);

  const handleReadyForDisplay = useCallback(() => {
    console.log(`${LOG_PREFIX} onReadyForDisplay`, {channelName, videoUrl});
    surfaceEstablishedRef.current = true;
    setPreviewChannelLoading(false);
    playbackErrorRetriesRef.current = 0;
    playback404StreakRef.current = 0;
    if (playbackRetryTimerRef.current != null) {
      clearTimeout(playbackRetryTimerRef.current);
      playbackRetryTimerRef.current = null;
    }
    if (playbackRestartTimerRef.current != null) {
      clearTimeout(playbackRestartTimerRef.current);
      playbackRestartTimerRef.current = null;
    }
    setStatus('playing');
  }, [channelName, videoUrl]);

  /** Some Android TV builds render frames before `onLoad` / `onReadyForDisplay`; hide the blocking overlay once native playback is real. */
  const markNativePlaybackStarted = useCallback(() => {
    surfaceEstablishedRef.current = true;
    setPreviewChannelLoading(false);
    setStatus(current => {
      if (current === 'failed' || current === 'reconnecting') {
        return current;
      }
      if (current === 'starting') {
        return 'playing';
      }
      return current;
    });
  }, []);

  const handleProgress = useCallback((data: OnProgressData) => {
    const ct = data.currentTime ?? 0;
    const pd = data.playableDuration ?? 0;
    const sd = data.seekableDuration ?? 0;
    if (ct <= 0 && pd <= 0 && sd <= 0) {
      return;
    }
    surfaceEstablishedRef.current = true;
    setPreviewChannelLoading(false);
    setStatus(current => {
      if (current === 'failed' || current === 'reconnecting') {
        return current;
      }
      if (current === 'starting') {
        return 'playing';
      }
      return current;
    });
  }, []);

  const handlePlaybackStateChanged = useCallback(
    (e: OnPlaybackStateChangedData) => {
      if (!e.isPlaying) {
        return;
      }
      markNativePlaybackStarted();
    },
    [markNativePlaybackStarted],
  );

  const handleBuffer = useCallback(
    (event: OnBufferData) => {
      console.log(`${LOG_PREFIX} onBuffer`, {
        channelName,
        videoUrl,
        isBuffering: event.isBuffering,
      });
      setStatus(current => {
        if (
          current === 'failed' ||
          current === 'starting' ||
          current === 'reconnecting'
        ) {
          return current;
        }
        return event.isBuffering ? 'buffering' : 'playing';
      });
    },
    [channelName, videoUrl],
  );

  const handleError = useCallback(
    (error: OnVideoErrorData) => {
      if (playbackRetryTimerRef.current != null) {
        clearTimeout(playbackRetryTimerRef.current);
        playbackRetryTimerRef.current = null;
      }

      const is404 = isLikelyHttp404FromVideoError(error);
      if (is404) {
        playback404StreakRef.current += 1;
      } else {
        playback404StreakRef.current = 0;
      }

      const nextRetry = playbackErrorRetriesRef.current + 1;
      playbackErrorRetriesRef.current = nextRetry;

      const shouldRestartFromProxy =
        source.kind === 'proxy' &&
        is404 &&
        playback404StreakRef.current >= PLAYBACK_404_RESTART_AFTER;

      if (shouldRestartFromProxy) {
        console.warn(
          `${LOG_PREFIX} repeated HTTP 404 on HLS — restarting proxy`,
          {
            channelName,
            udpUrl: source.uri,
            videoUrl,
          },
        );
      } else if (
        is404 &&
        playback404StreakRef.current < PLAYBACK_404_RESTART_AFTER
      ) {
        console.log(
          `${LOG_PREFIX} HLS HTTP 404 (manifest may still be publishing)`,
          {
            channelName,
            videoUrl,
            streak: playback404StreakRef.current,
          },
        );
      } else {
        console.warn(`${LOG_PREFIX} onError`, {
          channelName,
          videoUrl,
          error,
        });
      }

      if (shouldRestartFromProxy) {
        playback404StreakRef.current = 0;
        playbackErrorRetriesRef.current = 0;

        if (playbackRestartTimerRef.current != null) {
          clearTimeout(playbackRestartTimerRef.current);
          playbackRestartTimerRef.current = null;
        }

        const udpUrl = source.uri;
        const requestSeqAtError = requestSeqRef.current;

        setStatus('reconnecting');
        setErrorMsg('');
        setPreviewChannelLoading(false);

        playbackRestartTimerRef.current = setTimeout(() => {
          playbackRestartTimerRef.current = null;

          (async () => {
            if (requestSeqRef.current !== requestSeqAtError) {
              return;
            }

            const previousProxy = activeProxyRef.current;
            setStatus('starting');

            try {
              const result = await startProxyStream(udpUrl, {
                signal: proxyStartSessionRef.current?.signal,
              });
              if (requestSeqRef.current !== requestSeqAtError) {
                if (result.ok) {
                  disposeSupersededStartResult(result);
                }
                return;
              }

              if (!result.ok) {
                if (isStartCancelled(result)) {
                  return;
                }
                setStatus('failed');
                setErrorMsg(result.message);
                setPreviewChannelLoading(false);
                return;
              }

              const manifestOutcome = await waitForHlsManifestReady(
                result.hlsUrl,
                {
                  isCancelled: () =>
                    requestSeqRef.current !== requestSeqAtError,
                },
              );

              if (requestSeqRef.current !== requestSeqAtError) {
                disposeSupersededStartResult(result);
                return;
              }

              if (manifestOutcome === 'cancelled') {
                return;
              }

              if (manifestOutcome === 'timeout') {
                console.log(
                  `${LOG_PREFIX} HLS manifest not confirmed after restart, attaching anyway`,
                  {channelName, hlsUrl: result.hlsUrl},
                );
              }

              activeProxyRef.current = {
                streamId: result.streamId,
                hlsUrl: result.hlsUrl,
              };
              console.log(`${LOG_PREFIX} refreshed HLS URL after 404 streak`, {
                channelName,
                streamId: result.streamId,
                hlsUrl: result.hlsUrl,
              });
              setVideoUrl(result.hlsUrl);
              setStatus('starting');
              setPlaybackRemountKey(k => k + 1);

              if (previousProxy && previousProxy.streamId !== result.streamId) {
                setTimeout(() => {
                  stopProxyStream(previousProxy.streamId).catch(
                    () => undefined,
                  );
                }, 0);
              }
            } catch {
              if (requestSeqRef.current === requestSeqAtError) {
                setStatus('failed');
                setErrorMsg('Stream restart failed');
                setPreviewChannelLoading(false);
              }
            }
          })().catch(() => undefined);
        }, PLAYBACK_ERROR_REMOUNT_MS);

        return;
      }

      if (playbackRestartTimerRef.current != null) {
        clearTimeout(playbackRestartTimerRef.current);
        playbackRestartTimerRef.current = null;
      }

      console.log(`${LOG_PREFIX} playback error — remounting player`, {
        channelName,
        videoUrl,
        attempt: nextRetry,
        http404Streak: playback404StreakRef.current,
      });
      setStatus('reconnecting');
      setErrorMsg('');
      setPreviewChannelLoading(false);

      playbackRetryTimerRef.current = setTimeout(() => {
        playbackRetryTimerRef.current = null;
        setPlaybackRemountKey(k => k + 1);
        setStatus('starting');
      }, PLAYBACK_ERROR_REMOUNT_MS);
    },
    [
      channelName,
      disposeSupersededStartResult,
      source.kind,
      source.uri,
      videoUrl,
    ],
  );

  const handleLoadStart = useCallback(() => {
    console.log(`${LOG_PREFIX} onLoadStart`, {channelName, videoUrl});
  }, [channelName, videoUrl]);

  const suppressProxyStartingOverlay =
    (source.kind === 'proxy' || source.kind === 'direct') &&
    status === 'starting' &&
    !!videoUrl &&
    surfaceEstablishedRef.current;

  /** Inline preview: hide switch / buffering / compact zap loaders (keep last frame). */
  const suppressInlineLoadChrome =
    !isFullscreen &&
    (channelSwitchLoading ||
      status === 'buffering' ||
      previewChannelLoading);

  const showOverlay =
    status === 'failed' ||
    status === 'reconnecting' ||
    (!surfaceEstablishedRef.current &&
      !suppressInlineLoadChrome &&
      (status === 'buffering' ||
        (channelSwitchLoading && status !== 'playing') ||
        (status === 'starting' && !suppressProxyStartingOverlay)));
  const label =
    status === 'failed'
      ? errorMsg || 'Stream unavailable'
      : status === 'reconnecting'
      ? 'Reconnecting playback...'
      : channelSwitchLoading
      ? 'Switching channel...'
      : status === 'buffering'
      ? 'Buffering...'
      : source.kind === 'proxy'
      ? 'Starting stream...'
      : 'Starting video...';

  const videoSource =
    videoUrl && /\.m3u8(\?|$)/i.test(videoUrl)
      ? {
          uri: videoUrl,
          type: 'm3u8' as const,
          minLoadRetryCount: 3,
          bufferConfig: {
            minBufferMs: 3000,
            maxBufferMs: 10000,
            bufferForPlaybackMs: 1000,
            bufferForPlaybackAfterRebufferMs: 2000,
            live: {
              targetOffsetMs: 3000,
              minOffsetMs: 1500,
              maxOffsetMs: 8000,
            },
          },
        }
      : {uri: videoUrl as string};

  return (
    <View
      style={[st.root, style, isFullscreen && st.fullscreen]}
      focusable={false}
      collapsable={false}>
      {!!videoUrl && status !== 'failed' && (
        <Video
          key={`hls-${playbackRemountKey}`}
          source={videoSource}
          style={StyleSheet.absoluteFill}
          paused={paused}
          muted={false}
          volume={1}
          repeat={false}
          resizeMode="contain"
          controls={false}
          playInBackground={false}
          playWhenInactive={false}
          preventsDisplaySleepDuringVideoPlayback
          onLoadStart={handleLoadStart}
          onLoad={handleLoad}
          onReadyForDisplay={handleReadyForDisplay}
          onProgress={handleProgress}
          onPlaybackStateChanged={handlePlaybackStateChanged}
          onBuffer={handleBuffer}
          onError={handleError}
        />
      )}

      {previewChannelLoading &&
        (source.kind === 'proxy' || source.kind === 'direct') &&
        isFullscreen && (
        <View style={st.previewLoaderWrap} pointerEvents="none">
          <View style={st.previewLoaderCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={st.previewLoaderText} numberOfLines={2}>
              {channelName ? `Loading ${channelName}…` : 'Loading channel…'}
            </Text>
          </View>
        </View>
      )}

      {showOverlay && (
        <View style={st.overlay}>
          {status === 'failed' ? (
            <>
              <Text style={st.icon}>!</Text>
              <Text style={st.label}>{label}</Text>
              {!!channelName && <Text style={st.sub}>{channelName}</Text>}
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={st.label}>
                {channelName ? `${label} ${channelName}` : label}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default memo(StreamVideoPlayer);

const st = StyleSheet.create({
  root: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fullscreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
  },
  previewLoaderWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 14,
    paddingHorizontal: 12,
    zIndex: 8,
  },
  previewLoaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    maxWidth: '92%',
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  previewLoaderText: {
    flexShrink: 1,
    fontFamily: FontFamily.book,
    color: Colors.primary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  icon: {
    color: Colors.primary,
    fontSize: 30,
  },
  label: {
    fontFamily: FontFamily.book,
    color: Colors.primary,
    fontSize: 12,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sub: {
    fontFamily: FontFamily.book,
    color: Colors.text.muted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 4,
  },
});
