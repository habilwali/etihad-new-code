/**
 * IPTV CMS: packages (getPackages.php) → channels for package (getChannels.php + mac).
 * TV: always sends device MAC for both steps so assignments match channel_mac_map.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {PulseDot} from '../components/common';
import StreamVideoPlayer from '../components/StreamVideoPlayer';
import {resolveCmsChannelStreamUrl, resolveCmsMediaUrl} from '../config/cmsEndpoints';
import {getDeviceMacForWelcomeApi} from '../utils/getDeviceMacForWelcome';
import {
  fetchIptvChannels,
  fetchIptvPackages,
  type IptvChannelRow,
  type IptvPackageRow,
  type IptvPackagesResult,
} from '../services/iptvCmsApi';

const {width: SW} = Dimensions.get('window');

const C = {
  gold: Colors.primary,
  goldLight: Colors.primaryLight,
  deep: Colors.background.dark,
  border: Colors.overlay.border.gold20,
  text: Colors.text.light,
  muted: Colors.text.muted,
};

const SIDEBAR_W = SW > 700 ? 260 : 200;
const SIDEBAR_IH = 62;
const PKG_CARD_H = 120;
/** OK can fire twice in one press (global key + focused fullscreen button onPress). */
const FULLSCREEN_TOGGLE_DEBOUNCE_MS = 420;

type PkgSection = 'back' | 'list';
type ChSection = 'backPkg' | 'sidebar' | 'player';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${
    months[d.getMonth()]
  } ${d.getFullYear()}`;
}

function packageErrorMessage(
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
      return 'Unable to read this device. Contact support.';
    case 'network':
      return (
        res.message || 'Network error. Check connection to the hotel server.'
      );
    default:
      return res.message || 'Could not load packages';
  }
}

function hashHue(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 35% 42%)`;
}

export interface CmsIptvChannelsScreenProps {
  onBack: () => void;
  isActive?: boolean;
}

export default function CmsIptvChannelsScreen({
  onBack,
  isActive = true,
}: CmsIptvChannelsScreenProps) {
  const [step, setStep] = useState<'packages' | 'channels'>('packages');
  const [reloadToken, setReloadToken] = useState(0);
  const [mac, setMac] = useState<string | null>(null);
  const [packages, setPackages] = useState<IptvPackageRow[]>([]);
  const [pkgStatus, setPkgStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [pkgError, setPkgError] = useState('');

  const [selectedPkg, setSelectedPkg] = useState<IptvPackageRow | null>(null);
  const [channels, setChannels] = useState<IptvChannelRow[]>([]);
  const [chStatus, setChStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [chError, setChError] = useState('');

  const [time, setTime] = useState(new Date());
  const [pkgSection, setPkgSection] = useState<PkgSection>('list');
  const [pkgIndex, setPkgIndex] = useState(0);
  const [chSection, setChSection] = useState<ChSection>('sidebar');
  const [sidebarIdx, setSidebarIdx] = useState(0);
  const [activeChId, setActiveChId] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paused, setPaused] = useState(false);

  const pkgSectionRef = useRef<PkgSection>('list');
  const pkgIndexRef = useRef(0);
  const chSectionRef = useRef<ChSection>('sidebar');
  const sidebarIdxRef = useRef(0);
  const isFullscreenRef = useRef(false);
  const lastFullscreenToggleAtRef = useRef(0);
  const pausedRef = useRef(false);
  const stepRef = useRef(step);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  stepRef.current = step;

  const sidebarScrollRef = useRef<ScrollView>(null);
  const pkgScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    setStep('packages');
    setSelectedPkg(null);
    setChannels([]);
    setPackages([]);
    setMac(null);
    setPkgError('');
    setChError('');
    setPkgStatus('loading');
    setChStatus('loading');
    setPkgIndex(0);
    pkgIndexRef.current = 0;
    setPkgSection('list');
    pkgSectionRef.current = 'list';
    setSidebarIdx(0);
    sidebarIdxRef.current = 0;
    setChSection('sidebar');
    chSectionRef.current = 'sidebar';
    setIsFullscreen(false);
    isFullscreenRef.current = false;
    setPaused(false);
    pausedRef.current = false;
    setReloadToken(x => x + 1);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || step !== 'packages') {
      return;
    }
    let cancelled = false;
    (async () => {
      setPkgStatus('loading');
      setPkgError('');
      const m = await getDeviceMacForWelcomeApi();
      if (cancelled) {
        return;
      }
      setMac(m);
      const res = await fetchIptvPackages(m);
      if (cancelled) {
        return;
      }
      if (res.ok) {
        setPackages(res.packages);
        setPkgStatus('ready');
        setPkgIndex(0);
        pkgIndexRef.current = 0;
      } else {
        setPkgStatus('error');
        setPkgError(packageErrorMessage(res));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, step, reloadToken]);

  useEffect(() => {
    if (!isActive || step !== 'channels' || !selectedPkg || !mac) {
      return;
    }
    let cancelled = false;
    (async () => {
      setChStatus('loading');
      setChError('');
      // Production TV: mac is required so getChannels filters by channel_mac_map.
      const res = await fetchIptvChannels(selectedPkg.id, mac);
      if (cancelled) {
        return;
      }
      if (res.ok) {
        setChannels(res.channels);
        const first = res.channels[0];
        setActiveChId(first?.id ?? 0);
        setSidebarIdx(0);
        sidebarIdxRef.current = 0;
        setChStatus('ready');
        setBuffering(true);
      } else {
        setChStatus('error');
        setChError(res.message || 'Could not load channels');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, step, selectedPkg, mac]);

  useEffect(() => {
    if (chSection !== 'sidebar') {
      return;
    }
    sidebarScrollRef.current?.scrollTo({
      y: Math.max(0, sidebarIdx * SIDEBAR_IH - SIDEBAR_IH),
      animated: false,
    });
  }, [sidebarIdx, chSection]);

  useEffect(() => {
    if (step !== 'packages' || pkgStatus !== 'ready') {
      return;
    }
    pkgScrollRef.current?.scrollTo({
      y: Math.max(0, pkgIndex * PKG_CARD_H - PKG_CARD_H),
      animated: false,
    });
  }, [pkgIndex, step, pkgStatus]);

  const openPackage = useCallback((pkg: IptvPackageRow) => {
    setSelectedPkg(pkg);
    setStep('channels');
    stepRef.current = 'channels';
    setChSection('sidebar');
    chSectionRef.current = 'sidebar';
    setIsFullscreen(false);
    isFullscreenRef.current = false;
  }, []);

  const goBackToPackages = useCallback(() => {
    setStep('packages');
    stepRef.current = 'packages';
    setSelectedPkg(null);
    setChannels([]);
    setChStatus('loading');
    setPkgSection('list');
    pkgSectionRef.current = 'list';
    setReloadToken(x => x + 1);
  }, []);

  const selectChannel = useCallback(
    (idx: number) => {
      const ch = channels[idx];
      if (!ch) {
        return;
      }
      setActiveChId(ch.id);
      sidebarIdxRef.current = idx;
      setSidebarIdx(idx);
      pausedRef.current = false;
      setPaused(false);
      setBuffering(true);
      chSectionRef.current = 'player';
      setChSection('player');
    },
    [channels],
  );

  const tryToggleFullscreen = useCallback(() => {
    const now = Date.now();
    if (now - lastFullscreenToggleAtRef.current < FULLSCREEN_TOGGLE_DEBOUNCE_MS) {
      return;
    }
    lastFullscreenToggleAtRef.current = now;
    const n = !isFullscreenRef.current;
    isFullscreenRef.current = n;
    setIsFullscreen(n);
  }, []);

  const activeCh = channels.find(c => c.id === activeChId) ?? channels[0];
  const streamUri =
    activeCh && activeCh.stream_url.trim()
      ? resolveCmsChannelStreamUrl(activeCh.stream_url)
      : '';

  const isOffline = (ch: IptvChannelRow) =>
    /offline|disabled|down/i.test(String(ch.status || ''));

  useEffect(() => {
    if (!isActive || step !== 'channels' || !streamUri) return;
    console.log(streamUri);
  }, [isActive, step, streamUri]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) {
      return;
    }
    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: {keyCode: number}) => {
        const kc = evt.keyCode;
        const stp = stepRef.current;

        if (kc === 4) {
          if (isFullscreenRef.current) {
            isFullscreenRef.current = false;
            setIsFullscreen(false);
          } else if (stp === 'channels') {
            goBackToPackages();
          } else {
            onBackRef.current?.();
          }
          return;
        }

        if (stp === 'packages') {
          const sec = pkgSectionRef.current;
          const list = packages;
          const max = Math.max(0, list.length - 1);

          if (kc === 19) {
            if (sec === 'list' && pkgIndexRef.current === 0) {
              pkgSectionRef.current = 'back';
              setPkgSection('back');
            } else if (sec === 'list') {
              const n = pkgIndexRef.current - 1;
              pkgIndexRef.current = n;
              setPkgIndex(n);
            }
          } else if (kc === 20) {
            if (sec === 'back') {
              pkgSectionRef.current = 'list';
              setPkgSection('list');
            } else if (pkgIndexRef.current < max) {
              const n = pkgIndexRef.current + 1;
              pkgIndexRef.current = n;
              setPkgIndex(n);
            }
          } else if (kc === 23 || kc === 66 || kc === 109) {
            if (sec === 'back') {
              onBackRef.current?.();
            } else {
              const p = list[pkgIndexRef.current];
              if (p) {
                openPackage(p);
              }
            }
          }
          return;
        }

        if (stp === 'channels' && chStatus === 'ready' && channels.length > 0) {
          const sec = chSectionRef.current;
          const total = channels.length;

          if (isFullscreenRef.current) {
            if (kc === 23 || kc === 66 || kc === 109) {
              tryToggleFullscreen();
            }
            return;
          }

          if (sec === 'backPkg') {
            if (kc === 20) {
              chSectionRef.current = 'sidebar';
              setChSection('sidebar');
            } else if (kc === 23 || kc === 66 || kc === 109) {
              goBackToPackages();
            }
            return;
          }

          if (sec === 'sidebar') {
            if (kc === 19) {
              if (sidebarIdxRef.current === 0) {
                chSectionRef.current = 'backPkg';
                setChSection('backPkg');
              } else {
                const n = sidebarIdxRef.current - 1;
                sidebarIdxRef.current = n;
                setSidebarIdx(n);
              }
            } else if (kc === 20 && sidebarIdxRef.current < total - 1) {
              const n = sidebarIdxRef.current + 1;
              sidebarIdxRef.current = n;
              setSidebarIdx(n);
            } else if (kc === 22) {
              chSectionRef.current = 'player';
              setChSection('player');
            } else if (kc === 23 || kc === 66 || kc === 109) {
              selectChannel(sidebarIdxRef.current);
            }
            return;
          }

          if (sec === 'player') {
            if (kc === 23 || kc === 66 || kc === 109) {
              tryToggleFullscreen();
            } else if (kc === 19) {
              chSectionRef.current = 'backPkg';
              setChSection('backPkg');
            } else if (kc === 21) {
              chSectionRef.current = 'sidebar';
              setChSection('sidebar');
            }
          }
        }
      },
    );
    return () => sub.remove();
  }, [
    isActive,
    packages,
    channels,
    chStatus,
    openPackage,
    goBackToPackages,
    selectChannel,
    tryToggleFullscreen,
  ]);

  const renderHeader = () => (
    <View style={st.header}>
      <View style={st.brand}>
        <Image
          source={require('../assets/header/ethiad-logo-marketing.png')}
          style={st.brandLogo}
          resizeMode="contain"
        />
      </View>
      <View style={st.headerRight}>
        <View style={st.clockWrap}>
          <Text style={st.clockTime}>
            {pad(time.getHours())}:{pad(time.getMinutes())}
          </Text>
          <Text style={st.clockDate}>{formatDate(time)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => onBack()}
          focusable
          activeOpacity={0.75}
          style={[
            st.backBtn,
            step === 'packages' && pkgSection === 'back' && st.backBtnFocused,
          ]}>
          <Text
            style={[
              st.backBtnTxt,
              step === 'packages' && pkgSection === 'back' && {color: C.deep},
            ]}>
            ‹ BACK
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (step === 'packages') {
    return (
      <View style={st.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.deep} />
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
        {renderHeader()}
        <LinearGradient
          colors={['transparent', C.gold, 'transparent']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={st.goldRule}
        />
        <View style={st.pkgTitleRow}>
          <PulseDot size={6} color={C.gold} />
          <Text style={st.pkgTitle}>CHANNEL PACKAGES</Text>
        </View>

        {pkgStatus === 'loading' && (
          <View style={st.centerBox}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={st.hint}>Loading packages…</Text>
          </View>
        )}

        {pkgStatus === 'error' && (
          <View style={st.centerBox}>
            <Text style={st.errorTitle}>Could not load packages</Text>
            <Text style={st.errorBody}>{pkgError}</Text>
            <TouchableOpacity
              style={st.retryBtn}
              onPress={() => setReloadToken(x => x + 1)}
              focusable>
              <Text style={st.retryBtnTxt}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        )}

        {pkgStatus === 'ready' && packages.length === 0 && (
          <View style={st.centerBox}>
            <Text style={st.errorBody}>
              No packages available for this room.
            </Text>
            <Text style={st.hint}>
              Check CMS: guest checked in, categories visible, MAC mapped.
            </Text>
          </View>
        )}

        {pkgStatus === 'ready' && packages.length > 0 && (
          <ScrollView
            ref={pkgScrollRef}
            style={st.pkgScroll}
            scrollEventThrottle={16}
            contentContainerStyle={st.pkgScrollContent}>
            {packages.map((pkg, i) => {
              const focused = pkgSection === 'list' && pkgIndex === i;
              const uri = resolveCmsMediaUrl(pkg.image);
              return (
                <TouchableOpacity
                  key={pkg.id}
                  activeOpacity={0.85}
                  focusable
                  onPress={() => openPackage(pkg)}
                  style={[st.pkgRow, focused && st.pkgRowFocused]}>
                  <View style={st.pkgThumbWrap}>
                    {uri ? (
                      <FastImage
                        source={{uri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable}}
                        style={st.pkgThumb}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : (
                      <View style={[st.pkgThumb, st.pkgThumbPlaceholder]}>
                        <Text style={st.pkgThumbTxt}>
                          {pkg.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={st.pkgMeta}>
                    <Text
                      style={[st.pkgName, focused && {color: C.gold}]}
                      numberOfLines={2}>
                      {pkg.name}
                    </Text>
                    <Text style={st.pkgPrice}>
                      {pkg.price > 0 ? `${pkg.price}` : 'Included'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.deep} />
      <LinearGradient
        colors={[Colors.overlay.gold[5], 'transparent', 'rgba(28,78,122,0.05)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={{flex: 1}}>
        <View style={st.header}>
          <View style={st.brand}>
            <Image
              source={require('../assets/header/ethiad-logo-marketing.png')}
              style={st.brandLogo}
              resizeMode="contain"
            />
          </View>
          <View style={st.headerRight}>
            <View style={st.clockWrap}>
              <Text style={st.clockTime}>
                {pad(time.getHours())}:{pad(time.getMinutes())}
              </Text>
              <Text style={st.clockDate}>{formatDate(time)}</Text>
            </View>
            <TouchableOpacity
              onPress={goBackToPackages}
              focusable
              activeOpacity={0.75}
              style={[
                st.backBtn,
                chSection === 'backPkg' && st.backBtnFocused,
              ]}>
              <Text
                style={[
                  st.backBtnTxt,
                  chSection === 'backPkg' && {color: C.deep},
                ]}>
                ‹ PACKAGES
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <LinearGradient
          colors={['transparent', C.gold, 'transparent']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={st.goldRule}
        />

        <View style={st.catNavBorder}>
          <View style={st.pkgBreadcrumb}>
            <PulseDot size={5} color={C.gold} />
            <Text style={st.pkgBreadcrumbTxt} numberOfLines={1}>
              {selectedPkg?.name ?? 'Channels'}
            </Text>
          </View>
        </View>

        {chStatus === 'loading' && (
          <View
            style={[
              st.playerArea,
              {alignItems: 'center', justifyContent: 'center'},
            ]}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={st.hint}>Loading channels…</Text>
          </View>
        )}

        {chStatus === 'error' && (
          <View
            style={[
              st.playerArea,
              {alignItems: 'center', justifyContent: 'center'},
            ]}>
            <Text style={st.errorTitle}>Channels unavailable</Text>
            <Text style={st.errorBody}>{chError}</Text>
            <TouchableOpacity
              style={st.retryBtn}
              onPress={goBackToPackages}
              focusable>
              <Text style={st.retryBtnTxt}>BACK TO PACKAGES</Text>
            </TouchableOpacity>
          </View>
        )}

        {chStatus === 'ready' && channels.length === 0 && (
          <View
            style={[
              st.playerArea,
              {alignItems: 'center', justifyContent: 'center'},
            ]}>
            <Text style={st.errorBody}>No channels for this package.</Text>
            <Text style={st.hint}>Verify CMS assignments for this MAC.</Text>
          </View>
        )}

        {chStatus === 'ready' && channels.length > 0 && activeCh && (
          <View style={st.playerArea}>
            <View
              style={[
                st.sidebar,
                chSection === 'sidebar' && st.sidebarFocused,
              ]}>
              <View style={st.sidebarHeader}>
                <PulseDot size={6} color={C.gold} />
                <Text style={st.sidebarHeaderTxt}>CHANNELS</Text>
              </View>
              <ScrollView
                ref={sidebarScrollRef}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                removeClippedSubviews
                style={st.sidebarScroll}>
                {channels.map((ch, i) => {
                  const playing = ch.id === activeChId;
                  const focused = chSection === 'sidebar' && sidebarIdx === i;
                  const offline = isOffline(ch);
                  const logoUri = resolveCmsMediaUrl(ch.logo);
                  return (
                    <TouchableOpacity
                      key={ch.id}
                      activeOpacity={0.75}
                      focusable
                      onPress={() => selectChannel(i)}
                      style={[
                        st.sidebarItem,
                        playing && st.sidebarItemPlaying,
                        focused && st.sidebarItemFocused,
                        offline && {opacity: 0.45},
                      ]}>
                      {(playing || focused) && (
                        <LinearGradient
                          colors={[
                            focused
                              ? 'rgba(200,170,127,0.18)'
                              : 'rgba(200,170,127,0.09)',
                            'transparent',
                          ]}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      {playing && <View style={st.sidebarPlayingBar} />}
                      {focused && !playing && (
                        <View style={st.sidebarFocusBar} />
                      )}
                      <View
                        style={[
                          st.sidebarLogo,
                          playing && st.sidebarLogoPlaying,
                          focused && st.sidebarLogoFocused,
                        ]}>
                        {logoUri ? (
                          <FastImage
                            source={{uri: logoUri, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable}}
                            style={st.logoImg}
                            resizeMode={FastImage.resizeMode.cover}
                          />
                        ) : (
                          <Text
                            style={[
                              st.sidebarLogoTxt,
                              {color: hashHue(ch.name)},
                            ]}>
                            {ch.name.slice(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={st.sidebarInfo}>
                        <Text
                          style={[
                            st.sidebarChName,
                            (playing || focused) && {color: C.gold},
                          ]}
                          numberOfLines={1}>
                          {ch.name}
                        </Text>
                        {offline ? (
                          <Text style={st.offlineLbl}>Offline</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={st.playerPane}>
              {streamUri ? (
                <>
                  {isOffline(activeCh) ? (
                    <View style={st.bufferOverlay}>
                      <Text style={st.bufferTxt}>Channel offline</Text>
                    </View>
                  ) : (
                    <StreamVideoPlayer
                      key="etv-inline-player"
                      uri={streamUri}
                      style={StyleSheet.absoluteFill}
                      paused={paused || !isActive || isOffline(activeCh)}
                      channelName={activeCh.name}
                    />
                  )}
                </>
              ) : (
                <View style={st.bufferOverlay}>
                  <Text style={st.bufferTxt}>No stream URL</Text>
                </View>
              )}

              <TouchableOpacity
                style={[st.fsBtn, chSection === 'player' && st.fsBtnFocused]}
                activeOpacity={0.8}
                focusable
                onPress={tryToggleFullscreen}>
                <Text
                  style={[
                    st.fsBtnIcon,
                    chSection === 'player' && {color: C.deep},
                  ]}>
                  ⛶
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {isFullscreen && streamUri && activeCh && !isOffline(activeCh) && (
        <StreamVideoPlayer
          key="etv-fullscreen-player"
          uri={streamUri}
          isFullscreen
          paused={paused || !isActive}
          channelName={activeCh.name}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: C.deep,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  brand: {flexDirection: 'row', alignItems: 'center', gap: 14},
  brandLogo: {width: 140, height: 45},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 20},
  clockWrap: {alignItems: 'flex-end'},
  clockTime: {
    fontFamily: FontFamily.light,
    color: C.goldLight,
    fontSize: 24,
    letterSpacing: 1,
    lineHeight: 28,
  },
  clockDate: {
    fontFamily: FontFamily.book,
    color: C.muted,
    fontSize: 8,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  backBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtnFocused: {backgroundColor: C.gold, borderColor: C.goldLight},
  backBtnTxt: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 11,
    letterSpacing: 2,
  },
  goldRule: {height: 1},
  pkgTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pkgTitle: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 11,
    letterSpacing: 3,
  },
  pkgScroll: {flex: 1},
  pkgScrollContent: {padding: 20, paddingBottom: 40},
  pkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(6,6,12,0.75)',
  },
  pkgRowFocused: {
    borderColor: C.gold,
    backgroundColor: 'rgba(200,170,127,0.08)',
  },
  pkgThumbWrap: {borderRadius: 6, overflow: 'hidden'},
  pkgThumb: {width: 100, height: 72, backgroundColor: 'rgba(200,170,127,0.07)'},
  pkgThumbPlaceholder: {alignItems: 'center', justifyContent: 'center'},
  pkgThumbTxt: {fontFamily: FontFamily.bold, color: C.gold, fontSize: 14},
  pkgMeta: {flex: 1, minWidth: 0},
  pkgName: {
    fontFamily: FontFamily.medium,
    color: C.text,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  pkgPrice: {
    fontFamily: FontFamily.book,
    color: C.muted,
    fontSize: 11,
    marginTop: 6,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  hint: {
    fontFamily: FontFamily.book,
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 14,
    marginBottom: 8,
  },
  errorBody: {
    fontFamily: FontFamily.book,
    color: C.text,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 4,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnTxt: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 11,
    letterSpacing: 2,
  },
  catNavBorder: {borderBottomWidth: 1, borderBottomColor: C.border},
  pkgBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: C.deep,
  },
  pkgBreadcrumbTxt: {
    fontFamily: FontFamily.book,
    color: C.gold,
    fontSize: 10,
    letterSpacing: 2,
    flex: 1,
  },
  playerArea: {
    flex: 1,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
  },
  sidebar: {
    width: SIDEBAR_W,
    borderRightWidth: 1,
    borderRightColor: C.border,
    backgroundColor: 'rgba(6,6,12,0.75)',
  },
  sidebarFocused: {borderRightColor: C.gold},
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: 'rgba(200,170,127,0.04)',
  },
  sidebarHeaderTxt: {
    fontFamily: FontFamily.medium,
    color: C.gold,
    fontSize: 9,
    letterSpacing: 3,
  },
  sidebarScroll: {flex: 1},
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,170,127,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarItemPlaying: {borderBottomColor: 'rgba(200,170,127,0.14)'},
  sidebarItemFocused: {borderBottomColor: 'rgba(200,170,127,0.22)'},
  sidebarPlayingBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: C.gold,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  sidebarFocusBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: C.goldLight,
    opacity: 0.55,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
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
    overflow: 'hidden',
  },
  sidebarLogoPlaying: {
    borderColor: C.gold,
    backgroundColor: 'rgba(200,170,127,0.15)',
  },
  sidebarLogoFocused: {
    borderColor: C.goldLight,
    backgroundColor: 'rgba(200,170,127,0.11)',
  },
  logoImg: {width: 38, height: 38},
  sidebarLogoTxt: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  sidebarInfo: {flex: 1, minWidth: 0},
  sidebarChName: {
    fontFamily: FontFamily.medium,
    color: C.text,
    fontSize: 11,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  offlineLbl: {fontFamily: FontFamily.book, color: C.muted, fontSize: 8},
  playerPane: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bufferTxt: {
    fontFamily: FontFamily.book,
    color: C.gold,
    fontSize: 11,
    letterSpacing: 2,
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
  fsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.deep,
    justifyContent: 'center',
  },
});

