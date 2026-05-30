/**
 * Reusable Channel Screen — In-Room Entertainment / TV Channel Viewer
 * Shared by Etihad Channel (general TV) and Etihad Channels (Etihad-related content).
 * D-pad navigation: categories ↔ sidebar (LEFT/RIGHT or UP from row 0 → categories), player (Android BACK exits)
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  InteractionManager,
  LayoutAnimation,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {PulseDot} from '../components/common';
import {AppHeader} from '../components/common/AppHeader';
import {useAppHeaderClock} from '../hooks/useAppHeaderClock';
import StreamVideoPlayer from '../components/StreamVideoPlayer';
import type {ChannelDataConfig, ChannelItem} from '../data/channelData';
import {
  isUdpStreamUrl,
  useChannelListEpoch,
  useChannelPlayerManager,
} from '../playback/channelPlayerManager';
import {prefetchStream} from '../services/streamPrefetchCache';
import {orderChannelsWithPinsFirst} from '../utils/channelPinOrder';

const {width: SW, height: SH} = Dimensions.get('window');

const C = {
  gold: Colors.primary,
  goldLight: Colors.primaryLight,
  deep: Colors.background.dark,
  border: Colors.overlay.border.gold20,
  text: Colors.text.light,
  muted: Colors.text.muted,
};

const TAB_BAR_BG = 'rgba(40,52,62,0.88)';

type Section = 'categories' | 'sidebar';

export interface ChannelScreenProps {
  onBack: () => void;
  isActive?: boolean;
  config: ChannelDataConfig;
}

// ─── Memoised sidebar row ────────────────────────────────────────────────────
// Defined outside ChannelScreen so React never re-creates the component type.
// On UP/DOWN only the two rows whose `isFocused` boolean flips will re-render;
// every other row is skipped by React.memo's shallow-equal check.
type SidebarRowProps = {
  ch: ChannelItem;
  index: number;
  isFocused: boolean;
  isPlaying: boolean;
  onPress: (index: number) => void;
};
const SidebarRow = React.memo(function SidebarRow({
  ch,
  index,
  isFocused,
  isPlaying,
  onPress,
}: SidebarRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      focusable
      onPress={() => onPress(index)}
      style={[
        st.sidebarItem,
        isPlaying && st.sidebarItemPlaying,
        isFocused && !isPlaying && st.sidebarItemRemoteFocused,
        isFocused && st.sidebarItemTvFocused,
      ]}>
      <View
        style={[
          st.sidebarLogo,
          isPlaying && st.sidebarLogoPlaying,
          isFocused && !isPlaying && st.sidebarLogoFocused,
        ]}>
        <Text
          style={[
            st.sidebarLogoTxt,
            isPlaying
              ? st.sidebarLogoTxtOnPrimary
              : ({color: ch.color} as object),
          ]}>
          {ch.name.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={st.sidebarInfo}>
        <Text
          style={[
            st.sidebarChName,
            isPlaying && st.sidebarChNameOnPrimary,
            isFocused && !isPlaying && st.sidebarChNameFocused,
          ]}
          numberOfLines={1}>
          {ch.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
});
// ────────────────────────────────────────────────────────────────────────────

const SIDEBAR_W = SW > 700 ? 260 : 200;
const SIDEBAR_IH = 62;
/**
 * First N rows (0..N-1) stay at scroll offset 0; list scrolls when focus moves to row N or below.
 * N=6: rows 0–5 pinned; from row 6 onward the list scrolls by {@link SIDEBAR_IH} per step.
 */
const SIDEBAR_SCROLL_START_INDEX = 6;
/** Approximate category tab width for horizontal scroll-into-view (padding + label). */
const CAT_TAB_EST_W = 96;
const FULLSCREEN_TOGGLE_DEBOUNCE_MS = 420;
/** Eased layout for section changes / OK apply only — not used on every list step (avoids key-repeat backlog). */
const FOCUS_NAV_LAYOUT_MS = 130;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental != null
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function configureChannelFocusAnimation(): void {
  LayoutAnimation.configureNext({
    duration: FOCUS_NAV_LAYOUT_MS,
    update: {
      type: LayoutAnimation.Types.linear,
    },
  });
}

const APPROX_CHROME_H = 72 + 1 + 55; // header + gold rule + tabs (header ~taller after AppHeader tweak)

const INITIAL_PLAYER_BOUNDS = {
  x: SIDEBAR_W,
  y: APPROX_CHROME_H,
  width: SW - SIDEBAR_W,
  height: SH - APPROX_CHROME_H,
};

export default function ChannelScreen({
  onBack,
  isActive = true,
  config,
}: ChannelScreenProps) {
  const {categories, channels, sidebarTitle} = config;
  const defaultChId = useMemo(
    () =>
      orderChannelsWithPinsFirst(channels)[0]?.id ??
      channels[0]?.id ??
      101,
    [channels],
  );

  const headerClock = useAppHeaderClock();
  const [activeCat, setActiveCat] = useState('all');
  const [activeChId, setActiveChId] = useState(defaultChId);
  const [section, setSection] = useState<Section>('categories');
  const [catIndex, setCatIndex] = useState(0);
  const [sidebarIdx, setSidebarIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  const sectionRef = useRef<Section>('categories');
  const catIndexRef = useRef(0);
  const sidebarIdxRef = useRef(0);
  const isFullscreenRef = useRef(false);
  /** Stops OK from firing twice in one press (TV remote + focused TouchableOpacity onPress). */
  const lastFullscreenToggleAtRef = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  /** After BACK is handled in onKeyDown, swallow the paired hardwareBackPress so App.tsx back does not run twice (e.g. leave channel after exiting fullscreen). */
  const consumeNextHardwareBackRef = useRef(false);
  /** Throttle UP/DOWN key-repeat: Android TV fires every ~50ms on hold which floods the JS thread. */
  const lastNavKeyAtRef = useRef(0);
  /** Minimum ms between consecutive UP/DOWN nav steps. 80ms = ~12 rows/s, fast but JS can keep up. */
  const NAV_KEY_MIN_MS = 80;

  const scrollViewRef = useRef<ScrollView>(null);
  const sidebarScrollRef = useRef<ScrollView>(null);
  const playerPaneRef = useRef<View>(null);
  const boundsRafRef = useRef<number | null>(null);
  const lastBoundsRef = useRef(INITIAL_PLAYER_BOUNDS);

  const [playerBounds, setPlayerBounds] = useState(INITIAL_PLAYER_BOUNDS);
  /**
   * Show the inline video layer immediately using {@link INITIAL_PLAYER_BOUNDS}.
   * We still run measureInWindow to snap to the real `playerPane` rect; hiding
   * until measure caused a long black preview on first open.
   */
  const [inlineVideoReady, setInlineVideoReady] = useState(true);

  /** Only push new bounds when they move/size by ≥2px — stops SurfaceView thrash
   *  when D-pad focus rings, sidebar transforms, or header re-layout nudge layout. */
  const applyPlayerBoundsIfChanged = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (width < 8 || height < 8) {
        return;
      }
      const p = lastBoundsRef.current;
      if (
        Math.abs(x - p.x) < 2 &&
        Math.abs(y - p.y) < 2 &&
        Math.abs(width - p.width) < 2 &&
        Math.abs(height - p.height) < 2
      ) {
        return;
      }
      lastBoundsRef.current = {x, y, width, height};
      setPlayerBounds({x, y, width, height});
    },
    [],
  );

  const measurePlayerPane = useCallback(() => {
    playerPaneRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 8 && height > 8 && !isFullscreenRef.current) {
        setInlineVideoReady(true);
      }
      applyPlayerBoundsIfChanged(x, y, width, height);
    });
  }, [applyPlayerBoundsIfChanged]);

  const onPlayerPaneLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (isFullscreen) {
        return;
      }
      if (boundsRafRef.current != null) {
        cancelAnimationFrame(boundsRafRef.current);
      }
      boundsRafRef.current = requestAnimationFrame(() => {
        boundsRafRef.current = null;
        measurePlayerPane();
      });
    },
    [isFullscreen, measurePlayerPane],
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      if (!isFullscreen) {
        requestAnimationFrame(measurePlayerPane);
      }
    });
    return () => sub.remove();
  }, [isFullscreen, measurePlayerPane]);

  useEffect(() => {
    if (isFullscreen) {
      return;
    }
    setInlineVideoReady(false);
    // After leaving fullscreen, force the next measure to apply — avoids stale
    // lastBoundsRef skipping an update when the inline rect differs only slightly.
    lastBoundsRef.current = {x: -10000, y: -10000, width: 1, height: 1};
    requestAnimationFrame(measurePlayerPane);
  }, [isFullscreen, measurePlayerPane]);

  const filtered = useMemo(
    () =>
      activeCat === 'all'
        ? channels
        : channels.filter(c => c.cat === activeCat),
    [activeCat, channels],
  );
  const displayChannels = useMemo(
    () => orderChannelsWithPinsFirst(filtered),
    [filtered],
  );
  const filteredRef = useRef(displayChannels);
  filteredRef.current = displayChannels;

  const listEpoch = useChannelListEpoch(displayChannels, playerKey);
  const {playbackUri, switchLoading, flushPlayback} = useChannelPlayerManager({
    channels: displayChannels,
    focusedListIndex: sidebarIdx,
    isActive,
    listEpoch,
    onActiveChannelId: setActiveChId,
    /** Coalesce rapid UP/DOWN so we do not abort every in-flight `applyWindow` (avoids stuck selection + reconnecting loop). OK still uses `flushPlayback` for instant apply. */
    debounceMs: 90,
  });

  /**
   * Sidebar up/down: row focus + scroll. Playback follows `sidebarIdx` via
   * {@link useChannelPlayerManager} (debounced apply). Do not call `flushPlayback`
   * here — per-key flush aborted proxy work and surfaced “reconnecting playback”.
   */
  const nudgeSidebarSelection = useCallback((idx: number) => {
    const ch = filteredRef.current[idx];
    if (!ch) {
      return;
    }
    sidebarIdxRef.current = idx;
    setSidebarIdx(idx);

    const lastPinnedIdx = SIDEBAR_SCROLL_START_INDEX - 1;
    const scrollY =
      idx <= lastPinnedIdx ? 0 : (idx - lastPinnedIdx) * SIDEBAR_IH;
    // animated: false — instant scroll. animated: true queues animations faster
    // than they complete on TV hardware, causing visible lag and stuck navigation.
    sidebarScrollRef.current?.scrollTo({
      y: Math.max(0, scrollY),
      animated: false,
    });
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    sectionRef.current = 'categories';
    setSection('categories');
    catIndexRef.current = 0;
    setCatIndex(0);
    sidebarIdxRef.current = 0;
    setSidebarIdx(0);
    isFullscreenRef.current = false;
    setIsFullscreen(false);
    setActiveCat('all');
    setActiveChId(defaultChId);
    setPlayerKey(k => k + 1);
    scrollViewRef.current?.scrollTo({x: 0, animated: false});
    sidebarScrollRef.current?.scrollTo({y: 0, animated: false});
    const warmList = orderChannelsWithPinsFirst(channels).slice(0, 3);
    warmList.forEach(ch => {
      const url = (ch?.videoUrl ?? '').trim();
      if (/^udp:\/\//i.test(url)) {
        prefetchStream(url).catch(() => undefined);
      }
    });
    // Defer measure until after transitions — avoids layout + measure in the same
    // turn as D-pad handling (useLayoutEffect + measure here caused stuck / wandering focus).
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(measurePlayerPane);
    });
    return () => task.cancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const tryToggleFullscreen = useCallback(() => {
    const now = Date.now();
    if (
      now - lastFullscreenToggleAtRef.current <
      FULLSCREEN_TOGGLE_DEBOUNCE_MS
    ) {
      return;
    }
    lastFullscreenToggleAtRef.current = now;
    const next = !isFullscreenRef.current;
    isFullscreenRef.current = next;
    setIsFullscreen(next);
  }, []);

  const selectChannel = useCallback(
    (idx: number) => {
      const list = filteredRef.current;
      const ch = list[idx];
      if (!ch) {
        return;
      }
      configureChannelFocusAnimation();
      sidebarIdxRef.current = idx;
      setSidebarIdx(idx);
      flushPlayback(list, idx);
    },
    [flushPlayback],
  );

  const selectCategory = useCallback(
    (idx: number) => {
      const cat = categories[idx];
      if (!cat) {
        return;
      }
      configureChannelFocusAnimation();
      setActiveCat(cat.id);
      catIndexRef.current = idx;
      setCatIndex(idx);
      sidebarIdxRef.current = 0;
      setSidebarIdx(0);
      sidebarScrollRef.current?.scrollTo({y: 0, animated: false});
    },
    [categories],
  );

  // Player manager stops proxy streams when screen goes inactive (see hook).
  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) {
      return;
    }
    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: {keyCode: number}) => {
        const kc = evt.keyCode;
        const sec = sectionRef.current;

        if (kc === 4) {
          consumeNextHardwareBackRef.current = true;
          if (isFullscreenRef.current) {
            isFullscreenRef.current = false;
            setIsFullscreen(false);
          } else {
            onBackRef.current?.();
          }
          return;
        }

        if (isFullscreenRef.current) {
          if (kc === 23 || kc === 66 || kc === 109) {
            tryToggleFullscreen();
          }
          return;
        }

        if (sec === 'categories') {
          const max = categories.length - 1;
          if (kc === 21) {
            const n = Math.max(0, catIndexRef.current - 1);
            catIndexRef.current = n;
            setCatIndex(n);
            scrollViewRef.current?.scrollTo({
              x: Math.max(0, n * CAT_TAB_EST_W - 32),
              animated: false,
            });
          } else if (kc === 22) {
            const n = Math.min(max, catIndexRef.current + 1);
            catIndexRef.current = n;
            setCatIndex(n);
            scrollViewRef.current?.scrollTo({
              x: Math.max(0, n * CAT_TAB_EST_W - 32),
              animated: false,
            });
          } else if (kc === 20) {
            configureChannelFocusAnimation();
            sectionRef.current = 'sidebar';
            setSection('sidebar');
          } else if (kc === 23 || kc === 66 || kc === 109) {
            selectCategory(catIndexRef.current);
            sectionRef.current = 'sidebar';
            setSection('sidebar');
          }
          return;
        }

        if (sec === 'sidebar') {
          const total = filteredRef.current.length;
          if (kc === 19 || kc === 20) {
            // Throttle key-repeat so the JS thread is not overwhelmed.
            const now = Date.now();
            if (now - lastNavKeyAtRef.current < NAV_KEY_MIN_MS) {
              return;
            }
            lastNavKeyAtRef.current = now;

            if (kc === 19) {
              if (sidebarIdxRef.current === 0) {
                configureChannelFocusAnimation();
                sectionRef.current = 'categories';
                setSection('categories');
                scrollViewRef.current?.scrollTo({x: 0, animated: false});
              } else {
                nudgeSidebarSelection(sidebarIdxRef.current - 1);
              }
            } else {
              if (sidebarIdxRef.current < total - 1) {
                nudgeSidebarSelection(sidebarIdxRef.current + 1);
              }
            }
          } else if (kc === 21 || kc === 22) {
            configureChannelFocusAnimation();
            sectionRef.current = 'categories';
            setSection('categories');
            scrollViewRef.current?.scrollTo({
              x: Math.max(0, catIndexRef.current * CAT_TAB_EST_W - 32),
              animated: false,
            });
          } else if (kc === 23 || kc === 66 || kc === 109) {
            selectChannel(sidebarIdxRef.current);
            tryToggleFullscreen();
          }
          return;
        }
      },
    );
    return () => sub.remove();
  }, [
    selectCategory,
    selectChannel,
    isActive,
    categories.length,
    tryToggleFullscreen,
    nudgeSidebarSelection,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) {
      return undefined;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (consumeNextHardwareBackRef.current) {
        consumeNextHardwareBackRef.current = false;
        return true;
      }
      if (isFullscreenRef.current) {
        isFullscreenRef.current = false;
        setIsFullscreen(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isActive]);

  const activeCh = channels.find(c => c.id === activeChId) ?? channels[0];

  const rawChannelUrl = (activeCh?.videoUrl ?? '').trim();
  const httpsFallback = /^https?:\/\//i.test(rawChannelUrl)
    ? rawChannelUrl
    : '';
  const displayPlaybackUri = playbackUri ?? (httpsFallback || undefined);
  // True while waiting for the proxy to produce the first HLS URL for a UDP
  // channel. Tells StreamVideoPlayer to show a "starting…" loading state instead
  // of the "No stream URL" error that would otherwise flash on the very first render.
  const managedSourceLoading =
    !playbackUri && rawChannelUrl.length > 0 && isUdpStreamUrl(rawChannelUrl);
  const channelSwitchLoading = switchLoading && !!playbackUri;

  useEffect(() => {
    if (!isActive || !activeCh?.videoUrl) {
      return;
    }
    console.log('[ChannelScreen] stream:', activeCh.videoUrl);
  }, [isActive, activeCh?.videoUrl]);

  // Memoised so clock ticks don't produce a new style object every second.
  const videoWrapStyle = useMemo(
    () =>
      isFullscreen
        ? [StyleSheet.absoluteFillObject, st.videoWrapFs]
        : [
            st.videoWrapInline,
            {
              left: playerBounds.x,
              top: playerBounds.y,
              width: playerBounds.width,
              height: playerBounds.height,
              opacity: inlineVideoReady ? 1 : 0,
            },
          ],

    [
      isFullscreen,
      inlineVideoReady,
      playerBounds.x,
      playerBounds.y,
      playerBounds.width,
      playerBounds.height,
    ],
  );

  // Badge/overlay wrapper sits at the same position as the video but is a SIBLING,
  // not a child. This keeps the fullscreen control isolated from the video layer.
  const badgeWrapStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      zIndex: 21,
      left: playerBounds.x,
      top: playerBounds.y,
      width: playerBounds.width,
      height: playerBounds.height,
      opacity: inlineVideoReady ? 1 : 0,
    }),
    [
      inlineVideoReady,
      playerBounds.x,
      playerBounds.y,
      playerBounds.width,
      playerBounds.height,
    ],
  );

  if (!activeCh) {
    return null;
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.deep} />

      {!isFullscreen && (
        <>
          <View style={st.topChrome}>
            <LinearGradient
              colors={[
                Colors.overlay.gold[5],
                'transparent',
                'rgba(28,78,122,0.05)',
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <AppHeader
              date={headerClock.date}
              time={headerClock.time}
              temperature={headerClock.temperature}
              weatherCondition={headerClock.weatherCondition}
            />
            <LinearGradient
              colors={['transparent', C.gold, 'transparent']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
              style={st.goldRule}
            />
            <View style={st.catNavBorder}>
              <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={st.catNav}
                contentContainerStyle={st.catNavContent}
                removeClippedSubviews={false}>
                {categories.map((cat, i) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => selectCategory(i)}
                    focusable
                    style={[
                      st.catBtn,
                      activeCat === cat.id && st.catBtnActive,
                      section === 'categories' &&
                        catIndex === i &&
                        activeCat !== cat.id &&
                        st.catBtnRemoteFocused,
                      section === 'categories' &&
                        catIndex === i &&
                        st.catBtnTvFocused,
                    ]}>
                    <Text
                      style={[
                        st.catBtnTxt,
                        activeCat === cat.id && st.catBtnTxtActive,
                      ]}>
                      {cat.label.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={st.playerArea}>
            <View
              style={[st.sidebar, section === 'sidebar' && st.sidebarFocused]}>
              <View style={st.sidebarHeader}>
                <PulseDot size={6} color={C.gold} />
                <Text style={st.sidebarHeaderTxt}>{sidebarTitle}</Text>
              </View>
              <ScrollView
                ref={sidebarScrollRef}
                showsVerticalScrollIndicator={false}
                style={st.sidebarScroll}
                removeClippedSubviews={false}
                keyboardShouldPersistTaps="handled">
                {displayChannels.map((ch, i) => (
                  <SidebarRow
                    key={ch.id}
                    ch={ch}
                    index={i}
                    isFocused={section === 'sidebar' && sidebarIdx === i}
                    isPlaying={ch.id === activeChId}
                    onPress={selectChannel}
                  />
                ))}
              </ScrollView>
            </View>

            <View
              ref={playerPaneRef}
              onLayout={onPlayerPaneLayout}
              collapsable={false}
              style={st.playerPane}
            />
          </View>
        </>
      )}

      {/* Video layer; fullscreen control is a sibling overlay. */}
      {isActive && (
        <View
          style={videoWrapStyle}
          focusable={false}
          pointerEvents="box-none"
          importantForAccessibility="no-hide-descendants">
          <StreamVideoPlayer
            key={`ch-player-${playerKey}`}
            uri={displayPlaybackUri}
            style={StyleSheet.absoluteFill as object}
            isFullscreen={isFullscreen}
            channelName={activeCh.name}
            managedSourceLoading={managedSourceLoading}
            channelSwitchLoading={channelSwitchLoading}
          />
        </View>
      )}

      {/* Overlay layer — fullscreen only (channel name lives in sidebar). */}
      {isActive && !isFullscreen && (
        <View
          style={badgeWrapStyle}
          pointerEvents="box-none"
          renderToHardwareTextureAndroid>
          <TouchableOpacity
            style={[st.fsBtn, st.fsBtnFocused]}
            activeOpacity={0.8}
            focusable
            onPress={tryToggleFullscreen}>
            <Text style={[st.fsBtnIcon, {color: C.deep}]}>⛶</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent', overflow: 'hidden'},

  videoWrapInline: {
    position: 'absolute',
    zIndex: 20,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoWrapFs: {
    zIndex: 2000,
    backgroundColor: '#000',
    overflow: 'hidden',
  },

  topChrome: {position: 'relative'},
  goldRule: {height: 1},
  catNavBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: TAB_BAR_BG,
  },
  catNav: {backgroundColor: TAB_BAR_BG},
  catNavContent: {paddingHorizontal: 0, backgroundColor: TAB_BAR_BG},
  catBtn: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    position: 'relative',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  catBtnActive: {backgroundColor: Colors.primary},
  catBtnRemoteFocused: {backgroundColor: Colors.overlay.gold[30]},
  catBtnTvFocused: {borderBottomColor: C.gold},
  catBtnTxt: {
    fontFamily: FontFamily.book,
    color: C.text,
    fontSize: 9,
    letterSpacing: 2.5,
  },
  catBtnTxtActive: {fontFamily: FontFamily.book, color: Colors.white},

  playerArea: {
    flex: 1,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'stretch',
  },

  sidebar: {
    width: SIDEBAR_W,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    backgroundColor: TAB_BAR_BG,
  },
  sidebarFocused: {borderRightColor: C.gold},
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: TAB_BAR_BG,
  },
  sidebarHeaderTxt: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 9,
    letterSpacing: 3,
  },
  sidebarScroll: {flex: 1, backgroundColor: TAB_BAR_BG},
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SIDEBAR_IH,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,170,127,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarItemPlaying: {
    backgroundColor: Colors.primary,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  sidebarItemRemoteFocused: {backgroundColor: Colors.overlay.gold[30]},
  sidebarItemTvFocused: {borderLeftColor: C.gold},
  sidebarLogo: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: 'rgba(200,170,127,0.07)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sidebarLogoPlaying: {
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sidebarLogoFocused: {
    borderColor: C.gold,
    backgroundColor: 'rgba(176,135,71,0.22)',
  },
  sidebarLogoTxt: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  sidebarLogoTxtOnPrimary: {color: Colors.white},
  sidebarInfo: {flex: 1, minWidth: 0},
  sidebarChName: {
    fontFamily: FontFamily.medium,
    color: C.text,
    fontSize: 11,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  sidebarChNameOnPrimary: {color: Colors.white},
  sidebarChNameFocused: {color: C.gold},

  playerPane: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
    backgroundColor: '#000',
    overflow: 'hidden',
  },

  fsBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: 'rgba(6,6,12,0.7)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsBtnIcon: {color: C.gold, fontSize: 16},
  fsBtnFocused: {
    backgroundColor: C.gold,
    borderColor: C.goldLight,
    transform: [{scale: 1.12}],
  },

  playerFocusHint: {position: 'absolute', bottom: 16, right: 12},
  playerFocusHintTxt: {
    fontFamily: FontFamily.book,
    color: 'rgba(200,170,127,0.45)',
    fontSize: 8,
    letterSpacing: 1.5,
  },

  fsCentre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPlayRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.overlay.gold[12],
    borderWidth: 2,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPlayIcon: {color: C.gold, fontSize: 34, marginLeft: 6},
});
