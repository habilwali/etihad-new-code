/**
 * Etihad Plaza Hotel — TV Home Screen (EY Plaza)
 * React Native TV App · Etihad Brand · Full D-Pad Navigation
 *
 * Sections (focusable zones):
 *   'nav'        – top nav bar          LEFT/RIGHT to move, OK to select
 *   'hero'       – hero CTA buttons     LEFT/RIGHT, OK to activate
 *   'highlights' – feature strip cards  LEFT/RIGHT, OK → detail
 *   'gallery'    – photo grid (3 columns)     ARROWS move focus · OK → full-screen
 *   'rooms'      – room cards           LEFT/RIGHT, OK → detail
 *
 * Key codes: 19=UP 20=DOWN 21=LEFT 22=RIGHT 23/66=OK 4=BACK
 */

import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  DeviceEventEmitter,
  Platform,
  ActivityIndicator,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import RetryImage from '../utils/RetryImage';
import LinearGradient from 'react-native-linear-gradient';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {
  fetchEtihadPlazaHome,
  type EtihadPlazaGalleryItem,
  type EtihadPlazaHome,
} from '../services/etihadPlazaApi';
import {AppHeader} from '../components/common/AppHeader';
import {useAppHeaderClock} from '../hooks/useAppHeaderClock';

const {width: SW, height: SH} = Dimensions.get('window');
/** Used for scroll offsets until the hero block reports its real height via `onLayout`. */
const PLAZA_HERO_FALLBACK_H = SH * 0.5;
/** Gap under hero before the next separator; folded into scroll `HERO_H`. */
const HERO_SECTION_TAIL_GAP = 24;
/** Gap above the gallery `GoldRule`; folded into scroll `GALLERY_Y`. */
const GALLERY_GOLD_RULE_TOP_GAP = 22;

/* ─── THEME (Etihad brand — primary gold #B08747 for borders, CTAs, accents) ─ */
const C = {
  bg: Colors.background.dark,
  surface: Colors.midnightDune[600],
  panel: Colors.midnightDune[600],
  gold: Colors.primary,
  goldLight: Colors.primaryLight,
  text: Colors.text.light,
  muted: Colors.jebelGrey[300],
  /** Card / nav rules — primary gold tint */
  border: Colors.overlay.gold[20],
  borderHi: Colors.overlay.gold[75],
  focusBg: Colors.overlay.gold[10],
  /** Dividers (stats, room cards) — primary gold, not neutral grey */
  sep: Colors.overlay.gold[18],
  green: Colors.saadiyatBlue[400],
};

type Section = 'nav' | 'hero' | 'highlights' | 'gallery' | 'rooms';

function maxIdx(len: number): number {
  return Math.max(0, len - 1);
}

const GALLERY_GRID_COLS = 3;
const GALLERY_GRID_GAP = 16;
/** Matches `section` horizontal padding (44 × 2). */
const GALLERY_SECTION_H_PAD = 88;
const GAL_CELL_W =
  (SW - GALLERY_SECTION_H_PAD - GALLERY_GRID_GAP * (GALLERY_GRID_COLS - 1)) /
  GALLERY_GRID_COLS;
const GAL_CELL_H = Math.round(GAL_CELL_W * 0.72);

function estimateGallerySectionScrollHeight(itemCount: number): number {
  const rows = Math.max(1, Math.ceil(itemCount / GALLERY_GRID_COLS));
  const headerBlock = 118;
  return headerBlock + rows * (GAL_CELL_H + GALLERY_GRID_GAP) + 28;
}

function galleryNavLeft(i: number, len: number): number {
  if (len <= 0) {
    return 0;
  }
  const row = Math.floor(i / GALLERY_GRID_COLS);
  const col = i % GALLERY_GRID_COLS;
  if (col > 0) {
    return i - 1;
  }
  if (row > 0) {
    const prevRowStart = (row - 1) * GALLERY_GRID_COLS;
    const prevRowCount = Math.min(GALLERY_GRID_COLS, len - prevRowStart);
    return prevRowStart + prevRowCount - 1;
  }
  return i;
}

function galleryNavRight(i: number, len: number): number {
  if (len <= 0) {
    return 0;
  }
  const row = Math.floor(i / GALLERY_GRID_COLS);
  const col = i % GALLERY_GRID_COLS;
  const rowStart = row * GALLERY_GRID_COLS;
  const inRow = Math.min(GALLERY_GRID_COLS, len - rowStart);
  if (col < inRow - 1) {
    return i + 1;
  }
  const nextRowStart = rowStart + GALLERY_GRID_COLS;
  if (nextRowStart < len) {
    return nextRowStart;
  }
  return i;
}

function galleryNavUp(i: number, len: number): number {
  if (len <= 0) {
    return 0;
  }
  const next = i - GALLERY_GRID_COLS;
  return next >= 0 ? next : i;
}

function galleryNavDown(i: number, len: number): number {
  if (len <= 0) {
    return 0;
  }
  const next = i + GALLERY_GRID_COLS;
  return next < len ? next : i;
}

export interface EtihadPlazaScreenProps {
  onBack?: () => void;
  isActive?: boolean;
}

function GoldRule({style = {}}: {style?: object}) {
  return (
    <LinearGradient
      colors={[
        'transparent',
        Colors.primary,
        Colors.primaryLight,
        Colors.primary,
        'transparent',
      ]}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 0}}
      style={[s.goldRule, style]}
    />
  );
}

function Eyebrow({children}: {children: string}) {
  return (
    <View style={s.eyebrow}>
      <View style={s.eyebrowLine} />
      <Text style={s.eyebrowTxt}>{children}</Text>
    </View>
  );
}

/** Renders `titleLines` with `titleGoldWord` as accent when a whole line matches (CMS pattern). */
function HeroTitleBlock({
  titleLines,
  titleGoldWord,
}: {
  titleLines: string[];
  titleGoldWord: string;
}) {
  const gw = titleGoldWord.trim();
  if (titleLines.length === 0) {
    return gw ? (
      <Text style={s.heroTitle}>
        <Text style={s.heroTitleGold}>{titleGoldWord}</Text>
      </Text>
    ) : null;
  }
  return (
    <Text style={s.heroTitle}>
      {titleLines.map((line, i) => {
        const lineGold = gw.length > 0 && line.trim() === gw;
        const sep = i < titleLines.length - 1 ? '\n' : '';
        if (lineGold) {
          return (
            <Text key={`tl-${i}`} style={s.heroTitleGold}>
              {line}
              {sep}
            </Text>
          );
        }
        return (
          <Text key={`tl-${i}`}>
            {line}
            {sep}
          </Text>
        );
      })}
    </Text>
  );
}

function FullScreenView({item}: {item: EtihadPlazaGalleryItem | null}) {
  if (!item) {
    return null;
  }
  return (
    <View style={s.fsOverlay} pointerEvents="none">
      <FastImage
        source={{
          uri: item.img,
          priority: FastImage.priority.normal,
          cache: FastImage.cacheControl.immutable,
        }}
        style={s.fsImg}
        resizeMode={FastImage.resizeMode.cover}
      />
      <LinearGradient
        colors={['transparent', 'transparent', Colors.overlay.midnight[96]]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.fsLabel}>
        <Text style={s.fsLabelTxt}>{item.label.toUpperCase()}</Text>
        <Text style={s.fsClose}>Press BACK to close</Text>
      </View>
    </View>
  );
}

export default function EtihadPlazaScreen({
  onBack,
  isActive = false,
}: EtihadPlazaScreenProps) {
  const headerClock = useAppHeaderClock();
  const [section, setSection] = useState<Section>('hero');
  const [_navIdx, setNavIdx] = useState(0);
  const [heroBtnIdx, setHeroBtnIdx] = useState(0);
  const [hlIdx, setHlIdx] = useState(0);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [roomIdx, setRoomIdx] = useState(0);
  const [fullScreen, setFullScreen] = useState<EtihadPlazaGalleryItem | null>(
    null,
  );
  const [activeRoom, setActiveRoom] = useState(0);

  const [home, setHome] = useState<EtihadPlazaHome | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  /** Measured hero height (content-sized); `null` until first layout. */
  const [heroLayoutH, setHeroLayoutH] = useState<number | null>(null);
  /** Scroll content Y of gallery section + inner offset to grid (row scroll). */
  const [gallerySectionY, setGallerySectionY] = useState<number | null>(null);
  const [galleryGridY, setGalleryGridY] = useState(0);

  const hero = home?.hero;
  const highlights = useMemo(() => home?.highlights ?? [], [home?.highlights]);
  const gallery = useMemo(() => home?.gallery ?? [], [home?.gallery]);
  const rooms = useMemo(() => home?.rooms ?? [], [home?.rooms]);
  const stats = useMemo(() => home?.stats ?? [], [home?.stats]);
  const showHighlights = highlights.length > 0;
  const showRooms = rooms.length > 0;
  const showStats = stats.length > 0;
  const navLabels = useMemo(
    () => home?.navItems.filter(n => n.enabled).map(n => n.label) ?? [],
    [home?.navItems],
  );

  const galleryRef = useRef(gallery);
  const listsRef = useRef({
    hl: highlights.length,
    gal: gallery.length,
    rm: rooms.length,
    nav: navLabels.length,
  });
  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);
  useEffect(() => {
    listsRef.current = {
      hl: highlights.length,
      gal: gallery.length,
      rm: rooms.length,
      nav: navLabels.length,
    };
  }, [highlights.length, gallery.length, rooms.length, navLabels.length]);

  const sRef = useRef<Section>('hero');
  const navRef = useRef(0);
  const hbRef = useRef(0);
  const hlRef = useRef(0);
  const galRef = useRef(0);
  const rmRef = useRef(0);
  const fsRef = useRef<EtihadPlazaGalleryItem | null>(null);
  const onBkRef = useRef(onBack);
  useEffect(() => {
    onBkRef.current = onBack;
  }, [onBack]);

  const setSec = useCallback((v: Section) => {
    sRef.current = v;
    setSection(v);
  }, []);
  const setNav = useCallback((v: number) => {
    navRef.current = v;
    setNavIdx(v);
  }, []);
  const setHB = useCallback((v: number) => {
    hbRef.current = v;
    setHeroBtnIdx(v);
  }, []);
  const setHL = useCallback((v: number) => {
    hlRef.current = v;
    setHlIdx(v);
  }, []);
  const setGal = useCallback((v: number) => {
    galRef.current = v;
    setGalleryIdx(v);
  }, []);
  const setRm = useCallback((v: number) => {
    rmRef.current = v;
    setRoomIdx(v);
  }, []);
  const setFS = useCallback((v: EtihadPlazaGalleryItem | null) => {
    fsRef.current = v;
    setFullScreen(v);
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    setErrorMsg('');
    (async () => {
      const res = await fetchEtihadPlazaHome();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setHome(null);
        setErrorMsg(res.message);
        setLoadState('error');
        return;
      }
      setHome(res.home);
      setLoadState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, reloadToken]);

  useEffect(() => {
    setHeroLayoutH(null);
    setGallerySectionY(null);
    setGalleryGridY(0);
  }, [home]);

  const mainRef = useRef<ScrollView>(null);
  const hlScrollRef = useRef<ScrollView>(null);
  const rmScrollRef = useRef<ScrollView>(null);

  const gallerySectionH = useMemo(
    () => estimateGallerySectionScrollHeight(gallery.length),
    [gallery.length],
  );

  /* Scroll positions — tuned so section headers stay fully visible (no overscroll) */
  const NAV_H = 69;
  const HERO_H = (heroLayoutH ?? PLAZA_HERO_FALLBACK_H) + HERO_SECTION_TAIL_GAP;
  const SECTION_HIGHLIGHTS = 400;
  const SECTION_GALLERY = gallerySectionH;

  const HERO_Y = 0;
  const HL_Y = NAV_H + HERO_H + 2;
  const hlBlockH = showHighlights ? SECTION_HIGHLIGHTS : 0;
  const GALLERY_Y = HL_Y + hlBlockH + GALLERY_GOLD_RULE_TOP_GAP;
  const ROOMS_Y = GALLERY_Y + SECTION_GALLERY;

  useEffect(() => {
    const yMap: Record<Section, number> = {
      nav: 0,
      hero: HERO_Y,
      highlights: HL_Y,
      gallery: GALLERY_Y,
      rooms: ROOMS_Y,
    };
    mainRef.current?.scrollTo({y: Math.max(0, yMap[section]), animated: true});
  }, [section, HERO_Y, HL_Y, GALLERY_Y, ROOMS_Y, heroLayoutH, gallerySectionH]);

  useEffect(() => {
    hlScrollRef.current?.scrollTo({x: hlIdx * 260, animated: true});
  }, [hlIdx]);
  useEffect(() => {
    rmScrollRef.current?.scrollTo({x: roomIdx * 320, animated: true});
  }, [roomIdx]);

  /** Keep the focused gallery row in view (main vertical scroll, row-by-row). */
  useEffect(() => {
    if (section !== 'gallery' || gallery.length === 0) {
      return;
    }
    if (gallerySectionY == null) {
      return;
    }
    const row = Math.floor(galleryIdx / GALLERY_GRID_COLS);
    const rowPitch = GAL_CELL_H + GALLERY_GRID_GAP;
    const rowTop = gallerySectionY + galleryGridY + row * rowPitch;
    const lead = 72;
    const y = Math.max(GALLERY_Y, Math.max(0, rowTop - lead));
    const id = requestAnimationFrame(() => {
      mainRef.current?.scrollTo({y, animated: true});
    });
    return () => cancelAnimationFrame(id);
  }, [
    galleryIdx,
    section,
    gallery.length,
    gallerySectionY,
    galleryGridY,
    GALLERY_Y,
  ]);

  useEffect(() => {
    if (isActive) {
      setSec('hero');
      setNav(0);
      setHB(0);
      setHL(0);
      setGal(0);
      setRm(0);
      setFS(null);
      setHeroLayoutH(null);
      setGallerySectionY(null);
      setGalleryGridY(0);
      mainRef.current?.scrollTo({y: 0, animated: false});
    }
  }, [isActive, setSec, setNav, setHB, setHL, setGal, setRm, setFS]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) {
      return;
    }
    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: {keyCode: number}) => {
        const kc = evt.keyCode;
        const sec = sRef.current;

        if (fsRef.current) {
          if (kc === 4) {
            setFS(null);
            return;
          }
          return;
        }

        if (kc === 4) {
          onBkRef.current?.();
          return;
        }

        if (kc === 19) {
          if (sec === 'nav') {
            setSec('hero');
          } else if (sec === 'hero') {
            setSec('nav');
          } else if (sec === 'highlights') {
            setSec('hero');
          } else if (sec === 'gallery') {
            const len = listsRef.current.gal;
            const cur = galRef.current;
            const up = galleryNavUp(cur, len);
            if (up !== cur) {
              setGal(up);
            } else {
              setSec(listsRef.current.hl > 0 ? 'highlights' : 'hero');
            }
          } else if (sec === 'rooms') {
            setSec('gallery');
          }
        } else if (kc === 20) {
          const L = listsRef.current;
          if (sec === 'nav') {
            setSec('hero');
            setHB(0);
          } else if (sec === 'hero') {
            if (L.hl > 0) {
              setSec('highlights');
            } else if (L.gal > 0) {
              setSec('gallery');
            } else if (L.rm > 0) {
              setSec('rooms');
            }
          } else if (sec === 'highlights') {
            if (L.gal > 0) {
              setSec('gallery');
            }
          } else if (sec === 'gallery') {
            const len = listsRef.current.gal;
            const cur = galRef.current;
            const down = galleryNavDown(cur, len);
            if (down !== cur) {
              setGal(down);
            } else if (listsRef.current.rm > 0) {
              setSec('rooms');
            }
          }
        } else if (kc === 21) {
          if (sec === 'nav') {
            setNav(Math.max(0, navRef.current - 1));
          } else if (sec === 'hero') {
            setHB(Math.max(0, hbRef.current - 1));
          } else if (sec === 'highlights') {
            setHL(Math.max(0, hlRef.current - 1));
          } else if (sec === 'gallery') {
            const len = listsRef.current.gal;
            setGal(galleryNavLeft(galRef.current, len));
          } else if (sec === 'rooms') {
            setRm(Math.max(0, rmRef.current - 1));
          }
        } else if (kc === 22) {
          const L = listsRef.current;
          if (sec === 'nav') {
            setNav(Math.min(maxIdx(L.nav), navRef.current + 1));
          } else if (sec === 'hero') {
            setHB(Math.min(1, hbRef.current + 1));
          } else if (sec === 'highlights') {
            setHL(Math.min(maxIdx(L.hl), hlRef.current + 1));
          } else if (sec === 'gallery') {
            const len = listsRef.current.gal;
            setGal(galleryNavRight(galRef.current, len));
          } else if (sec === 'rooms') {
            setRm(Math.min(maxIdx(L.rm), rmRef.current + 1));
          }
        } else if (kc === 23 || kc === 66) {
          if (sec === 'nav') {
            setSec('hero');
          } else if (sec === 'hero') {
            if (hbRef.current === 0) {
              if (listsRef.current.hl > 0) {
                setSec('highlights');
              } else if (listsRef.current.gal > 0) {
                setSec('gallery');
              }
            } else if (listsRef.current.gal > 0) {
              setSec('gallery');
            }
          } else if (sec === 'gallery') {
            const item = galleryRef.current[galRef.current];
            if (item) {
              setFS(item);
            }
          } else if (sec === 'rooms') {
            setActiveRoom(rmRef.current);
          }
        }
      },
    );
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- D-pad handler uses refs; only isActive should rebind
  }, [isActive]);

  const showFullLoader = isActive && home === null && loadState !== 'error';
  const showError = isActive && home === null && loadState === 'error';

  if (showError) {
    return (
      <View style={s.root}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={s.loadingOverlayBody}>
          <Text style={s.errorStateTitle}>Unable to load Etihad Plaza</Text>
          <Text style={s.errorStateBody}>{errorMsg || 'Unknown error'}</Text>
          <TouchableOpacity
            onPress={() => setReloadToken(t => t + 1)}
            activeOpacity={0.85}
            style={s.apiRetryBtn}>
            <Text style={s.apiRetryTxt}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showFullLoader) {
    return (
      <View style={s.root}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={s.loadingOverlayBody}>
          <ActivityIndicator size="large" color={C.gold} />
          <Text style={s.loadingHint}>Loading plaza…</Text>
        </View>
      </View>
    );
  }

  if (!home || !hero) {
    return <View style={s.root} />;
  }

  return (
    <View style={s.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <FullScreenView item={fullScreen} />

      <ScrollView
        ref={mainRef}
        scrollEnabled
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        contentContainerStyle={s.scrollContent}
        style={{flex: 1}}>
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />

        <GoldRule />

        {/* HERO — height from content + optional bottom inset for stats strip */}
        <View
          style={[s.hero, showStats && s.heroBottomForStats]}
          onLayout={e => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) {
              setHeroLayoutH(prev => (prev === h ? prev : h));
            }
          }}>
          <View style={s.heroContent}>
            <View style={s.heroLeft}>
              <View style={s.heroPreviewCard}>
                <RetryImage
                  uri={hero.preview.image}
                  style={s.heroPreviewImg}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={[
                    'transparent',
                    'transparent',
                    Colors.overlay.midnight[96],
                  ]}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.heroPreviewBody}>
                  <Text style={s.heroPreviewCat}>{hero.preview.category}</Text>
                  <Text style={s.heroPreviewTitle}>{hero.preview.title}</Text>
                  <View style={s.liveRow}>
                    <View style={s.liveDot} />
                    <Text style={s.heroPreviewSub}>
                      {hero.preview.statusLine}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={s.heroRight}>
              <Eyebrow>{hero.eyebrow}</Eyebrow>
              <HeroTitleBlock
                titleLines={hero.titleLines}
                titleGoldWord={hero.titleGoldWord}
              />
              <Text style={s.heroDesc}>{hero.description}</Text>

              <View style={s.heroBtns}>
                <TouchableOpacity
                  onPress={() => {
                    setHB(0);
                    if (highlights.length > 0) {
                      setSec('highlights');
                    } else if (gallery.length > 0) {
                      setSec('gallery');
                    }
                  }}
                  activeOpacity={0.85}
                  focusable>
                  <LinearGradient
                    colors={
                      section === 'hero' && heroBtnIdx === 0
                        ? [C.goldLight, C.gold]
                        : [C.gold, C.goldLight]
                    }
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={[
                      s.btnGold,
                      section === 'hero' && heroBtnIdx === 0 && s.btnFocused,
                    ]}>
                    <Text style={s.btnGoldTxt}>{hero.cta.primaryLabel}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setHB(1);
                    setSec('gallery');
                  }}
                  activeOpacity={1}
                  focusable
                  style={[
                    s.btnGhost,
                    section === 'hero' && heroBtnIdx === 1 && s.btnGhostFocused,
                  ]}>
                  <Text
                    style={[
                      s.btnGhostTxt,
                      section === 'hero' &&
                        heroBtnIdx === 1 &&
                        s.btnGhostTxtFocused,
                    ]}>
                    {hero.cta.secondaryLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[s.statsBar, !showStats && s.statsBarHidden]}>
            {showStats &&
              stats.map((stat, i) => (
                <View
                  key={stat.id}
                  style={[s.statItem, i < stats.length - 1 && s.statBorder]}>
                  <Text style={s.statNum}>{stat.n}</Text>
                  <Text style={s.statLabel}>{stat.l.toUpperCase()}</Text>
                </View>
              ))}
          </View>
        </View>

        <GoldRule />

        {/* HIGHLIGHTS (optional — omitted when CMS has no `highlights` array) */}
        {showHighlights ? (
          <View
            style={[s.section, section === 'highlights' && s.sectionFocused]}>
            <View style={s.sectionHdr}>
              <Eyebrow>SIGNATURE EXPERIENCES</Eyebrow>
              <Text style={s.sectionTitle}>
                Discover <Text style={s.sectionGold}>Excellence</Text>
              </Text>
              <Text style={s.sectionHint}>
                LEFT / RIGHT to browse · OK to select
              </Text>
            </View>

            <ScrollView
              ref={hlScrollRef}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              removeClippedSubviews
              contentContainerStyle={s.hlStrip}>
              {highlights.map((hl, i) => {
                const focused = section === 'highlights' && hlIdx === i;
                return (
                  <View
                    key={hl.id}
                    style={[s.hlCard, focused && s.hlCardFocused]}>
                    <RetryImage
                      uri={hl.img}
                      style={s.hlImg}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={[
                        'transparent',
                        'transparent',
                        Colors.overlay.midnight[96],
                      ]}
                      locations={[0, 0.25, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    {focused && (
                      <LinearGradient
                        colors={[
                          Colors.primary,
                          Colors.primaryLight,
                          Colors.primary,
                        ]}
                        start={{x: 0, y: 0}}
                        end={{x: 1, y: 0}}
                        style={s.hlFocusLine}
                      />
                    )}
                    <View style={s.hlBody}>
                      <View style={s.hlTopRow}>
                        <Text style={s.hlCat}>{hl.category}</Text>
                        {hl.badge && <Text style={s.hlBadge}>{hl.badge}</Text>}
                      </View>
                      <Text style={[s.hlTitle, focused && s.hlTitleFocused]}>
                        {hl.title}
                      </Text>
                      <Text style={s.hlSub}>{hl.sub}</Text>
                      <View style={s.hlStatRow}>
                        <LinearGradient
                          colors={[Colors.primary, Colors.primaryLight]}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                          style={s.hlStatLine}
                        />
                        <Text style={s.hlStat}>{hl.stat}</Text>
                      </View>
                    </View>
                    {focused && (
                      <View style={s.hlFocusPill}>
                        <Text style={s.hlFocusPillTxt}>● SELECTED</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={s.dots}>
              {highlights.map((_, i) => (
                <View key={i} style={[s.dot, i === hlIdx && s.dotActive]} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={s.galleryGoldRuleAbove}>
          <GoldRule />
        </View>

        {/* GALLERY */}
        <View
          style={[s.section, section === 'gallery' && s.sectionFocused]}
          onLayout={e => {
            setGallerySectionY(e.nativeEvent.layout.y);
          }}>
          <View style={s.sectionHdr}>
            <Eyebrow>PHOTO GALLERY</Eyebrow>
            <View style={s.sectionHdrRow}>
              <Text style={s.sectionTitle}>
                Captured in <Text style={s.sectionGold}>Light</Text>
              </Text>
              <Text style={s.sectionHint}>↑ ↓ ← → · OK full-screen</Text>
            </View>
          </View>

          <View
            onLayout={e => {
              setGalleryGridY(e.nativeEvent.layout.y);
            }}>
            <View style={s.galGrid}>
            {gallery.map((item, i) => {
              const focused = section === 'gallery' && galleryIdx === i;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  onPress={() => setFS(item)}
                  focusable
                  style={[
                    s.galCard,
                    {width: GAL_CELL_W, height: GAL_CELL_H},
                    focused && s.galCardFocused,
                  ]}>
                  <RetryImage
                    uri={item.img}
                    style={s.galImg}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={[
                      'transparent',
                      'transparent',
                      Colors.overlay.midnight[96],
                    ]}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  {focused && (
                    <View style={s.galFocusFrame}>
                      <LinearGradient
                        colors={[
                          Colors.primary,
                          Colors.primaryLight,
                          Colors.primary,
                        ]}
                        start={{x: 0, y: 0}}
                        end={{x: 1, y: 0}}
                        style={s.galFocusTop}
                      />
                    </View>
                  )}
                  <View style={s.galLabel}>
                    <Text style={s.galLabelTxt}>
                      {item.label.toUpperCase()}
                    </Text>
                    {focused && (
                      <Text style={s.galOpenHint}>Press OK to open</Text>
                    )}
                  </View>
                  {focused && (
                    <View style={s.galZoomIcon}>
                      <Text style={s.galZoomGlyph}>⊕</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          </View>
        </View>

        <GoldRule />

        {/* ROOMS (optional — omitted when CMS has no `rooms` array) */}
        {showRooms ? (
          <View style={[s.section, section === 'rooms' && s.sectionFocused]}>
            <View style={s.sectionHdr}>
              <Eyebrow>ACCOMMODATION</Eyebrow>
              <View style={s.sectionHdrRow}>
                <Text style={s.sectionTitle}>
                  Spaces for <Text style={s.sectionGold}>Living</Text>
                </Text>
                <Text style={s.sectionHint}>LEFT / RIGHT to browse</Text>
              </View>
            </View>

            <ScrollView
              ref={rmScrollRef}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              removeClippedSubviews
              contentContainerStyle={s.rmStrip}>
              {rooms.map((room, i) => {
                const focused = section === 'rooms' && roomIdx === i;
                const selected = activeRoom === i;
                return (
                  <View
                    key={room.id}
                    style={[
                      s.rmCard,
                      focused && s.rmCardFocused,
                      selected && s.rmCardSelected,
                    ]}>
                    {selected && (
                      <LinearGradient
                        colors={[Colors.overlay.gold[14], 'transparent']}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <View style={s.rmThumb}>
                      <RetryImage
                        uri={room.img}
                        style={s.rmImg}
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={[
                          'transparent',
                          'transparent',
                          Colors.overlay.midnight[96],
                        ]}
                        locations={[0, 0.45, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={s.rmViewBadge}>
                        <Text style={s.rmViewBadgeTxt}>
                          {room.view.toUpperCase()}
                        </Text>
                      </View>
                      {focused && (
                        <LinearGradient
                          colors={[
                            Colors.primary,
                            Colors.primaryLight,
                            Colors.primary,
                          ]}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                          style={s.rmFocusLine}
                        />
                      )}
                    </View>
                    <View style={s.rmBody}>
                      <Text style={[s.rmName, focused && s.rmNameFocused]}>
                        {room.name}
                      </Text>
                      <Text style={s.rmSize}>{room.size.toUpperCase()}</Text>
                      <View style={s.rmDivider} />
                      <View style={s.rmFooter}>
                        <View>
                          <Text style={s.rmFromLabel}>FROM</Text>
                          <Text
                            style={[s.rmPrice, focused && s.rmPriceFocused]}>
                            {room.price}
                          </Text>
                          <Text style={s.rmNight}>/night</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={s.dots}>
              {rooms.map((_, i) => (
                <View key={i} style={[s.dot, i === roomIdx && s.dotActive]} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const HL_CARD_W = SW * 0.19;
const RM_CARD_W = SW * 0.23;

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent'},
  scrollContent: {paddingBottom: 0},
  loadingOverlayBody: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingHint: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: C.goldLight,
    letterSpacing: 1.5,
  },
  errorStateTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
    color: C.gold,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  errorStateBody: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: C.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 32,
  },
  apiRetryBtn: {
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  apiRetryTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: C.gold,
  },
  goldRule: {height: 1},
  galleryGoldRuleAbove: {
    marginTop: GALLERY_GOLD_RULE_TOP_GAP,
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingVertical: 14,
    height: 68,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  navFocused: {backgroundColor: 'transparent'},
  navBrand: {},
  navLogo: {width: 140, height: 45},
  brandSub: {
    fontFamily: FontFamily.book,
    fontSize: 8,
    letterSpacing: 3.5,
    color: C.goldLight,
    marginTop: 3,
  },
  navLinks: {flexDirection: 'row', gap: 28, alignItems: 'center'},
  navItem: {paddingVertical: 4, position: 'relative'},
  navItemFocused: {
    backgroundColor: C.focusBg,
    paddingHorizontal: 12,
    borderRadius: 2,
  },
  navItemTxt: {
    fontFamily: FontFamily.book,
    fontSize: 9.5,
    letterSpacing: 2.8,
    color: C.goldLight,
  },
  navItemTxtFocused: {fontFamily: FontFamily.text, color: C.gold},
  navUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 1.5,
  },
  navRight: {alignItems: 'flex-end', gap: 6},
  navTime: {
    fontFamily: FontFamily.book,
    fontSize: 9,
    letterSpacing: 2.5,
    color: C.goldLight,
  },
  navLiveDot: {flexDirection: 'row', alignItems: 'center', gap: 6},
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: C.green},
  navLiveTxt: {
    fontFamily: FontFamily.book,
    fontSize: 8,
    letterSpacing: 2,
    color: C.green,
  },

  hero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    marginBottom: HERO_SECTION_TAIL_GAP,
  },
  /** Reserves space for the absolutely-positioned stats strip inside the hero. */
  heroBottomForStats: {paddingBottom: 62},
  heroBg: {...StyleSheet.absoluteFillObject},
  heroBackdrop: {
    position: 'absolute',
    top: 24,
    left: 28,
    right: 28,
    bottom: 60,
    borderRadius: 4,
    overflow: 'hidden',
  },
  heroBackdropGradient: {flex: 1},
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 0,
    gap: 36,
  },
  heroLeft: {width: SW * 0.48},
  heroPreviewCard: {
    height: Math.min(Math.round(SH * 0.58), 720),
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  heroPreviewImg: {width: '100%', height: '100%'},
  heroPreviewBody: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  heroPreviewCat: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.gold,
    marginBottom: 6,
  },
  heroPreviewTitle: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: C.text,
    marginBottom: 5,
  },
  liveRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
  heroPreviewSub: {
    fontFamily: FontFamily.book,
    fontSize: 9,
    color: C.goldLight,
    letterSpacing: 0.3,
  },

  heroRight: {flex: 1, minWidth: 0, maxWidth: '52%'},
  heroTitle: {
    fontFamily: FontFamily.book,
    fontSize: 52,
    color: C.text,
    lineHeight: 60,
    marginBottom: 16,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  heroTitleGold: {
    color: C.gold,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  heroDesc: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.goldLight,
    marginBottom: 32,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  heroBtns: {flexDirection: 'row', gap: 14},
  btnGold: {paddingHorizontal: 28, paddingVertical: 13},
  btnFocused: {
    transform: [{scale: 1.02}],
  },
  btnGoldTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 9.5,
    letterSpacing: 2.5,
    color: Colors.button.primaryText,
  },
  btnGhost: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.overlay.gold[40],
    backgroundColor: 'transparent',
  },
  btnGhostFocused: {
    borderColor: C.gold,
    borderWidth: 2,
    backgroundColor: 'transparent',
    transform: [{scale: 1.02}],
  },
  btnGhostTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 9.5,
    letterSpacing: 2.5,
    color: C.gold,
  },
  btnGhostTxtFocused: {color: C.goldLight},

  statsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  statItem: {flex: 1, paddingVertical: 18, alignItems: 'center'},
  statBorder: {borderRightWidth: 1, borderRightColor: C.sep},
  statsBarHidden: {
    height: 0,
    minHeight: 0,
    paddingVertical: 0,
    borderTopWidth: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  statNum: {
    fontFamily: FontFamily.book,
    fontSize: 26,
    color: C.gold,
    lineHeight: 30,
    marginBottom: 5,
  },
  statLabel: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.goldLight,
  },

  section: {
    paddingHorizontal: 44,
    paddingTop: 36,
    paddingBottom: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: Colors.overlay.gold[14],
  },
  sectionFocused: {
    backgroundColor: 'transparent',
    borderBottomColor: Colors.overlay.gold[35],
  },
  sectionHdr: {marginBottom: 24},
  sectionHdrRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: FontFamily.book,
    fontSize: 24,
    color: C.text,
    letterSpacing: 0.4,
  },
  sectionGold: {color: C.gold},
  sectionHint: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.goldLight,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  eyebrowLine: {width: 24, height: 1, backgroundColor: C.gold, opacity: 0.8},
  eyebrowTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.text,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },

  hlStrip: {paddingRight: 16, gap: 12},
  hlCard: {
    width: HL_CARD_W,
    height: 240,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  hlCardFocused: {borderColor: C.goldLight, borderWidth: 2},
  hlImg: {...StyleSheet.absoluteFillObject},
  hlFocusLine: {position: 'absolute', top: 0, left: 0, right: 0, height: 2.5},
  hlBody: {position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16},
  hlTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hlCat: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.goldLight,
  },
  hlBadge: {fontSize: 13},
  hlTitle: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: C.text,
    marginBottom: 5,
  },
  hlTitleFocused: {fontFamily: FontFamily.text, color: C.gold},
  hlSub: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.goldLight,
    marginBottom: 10,
  },
  hlStatRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  hlStatLine: {width: 20, height: 1},
  hlStat: {
    fontFamily: FontFamily.book,
    fontSize: 9,
    letterSpacing: 1.5,
    color: C.goldLight,
  },
  hlFocusPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: Colors.overlay.gold[18],
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hlFocusPillTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.gold,
  },

  galGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GALLERY_GRID_GAP,
  },
  galCard: {
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  galCardFocused: {borderColor: C.goldLight, borderWidth: 2},
  galImg: {...StyleSheet.absoluteFillObject},
  galFocusFrame: {...StyleSheet.absoluteFillObject},
  galFocusTop: {position: 'absolute', top: 0, left: 0, right: 0, height: 2.5},
  galLabel: {position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14},
  galLabelTxt: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
    color: C.text,
    marginBottom: 4,
  },
  galOpenHint: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.gold,
  },
  galZoomIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.gold,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galZoomGlyph: {fontSize: 14, color: C.gold},

  rmStrip: {paddingRight: 16, gap: 16},
  rmCard: {
    width: RM_CARD_W,
    backgroundColor: 'transparent',
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  rmCardFocused: {borderColor: C.goldLight, borderWidth: 2},
  rmCardSelected: {borderColor: C.gold},
  rmThumb: {height: 180, position: 'relative', overflow: 'hidden'},
  rmImg: {width: '100%', height: '100%'},
  rmFocusLine: {position: 'absolute', top: 0, left: 0, right: 0, height: 2.5},
  rmViewBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 1,
  },
  rmViewBadgeTxt: {
    fontFamily: FontFamily.book,
    fontSize: 7.5,
    letterSpacing: 2,
    color: C.goldLight,
  },
  rmBody: {padding: 18},
  rmName: {
    fontFamily: FontFamily.book,
    fontSize: 18,
    color: C.text,
    marginBottom: 5,
  },
  rmNameFocused: {color: C.gold},
  rmSize: {
    fontFamily: FontFamily.book,
    fontSize: 8,
    letterSpacing: 2,
    color: C.goldLight,
    marginBottom: 12,
  },
  rmDivider: {height: 1, backgroundColor: C.sep, marginBottom: 12},
  rmFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  rmFromLabel: {
    fontFamily: FontFamily.book,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: C.goldLight,
    marginBottom: 3,
  },
  rmPrice: {fontFamily: FontFamily.medium, fontSize: 17, color: C.gold},
  rmPriceFocused: {color: C.gold},
  rmNight: {fontFamily: FontFamily.book, fontSize: 9, color: C.goldLight},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 0},
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.overlay.gold[35],
  },
  dotActive: {width: 20, backgroundColor: C.gold},

  fsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: 'transparent',
  },
  fsImg: {width: '100%', height: '100%'},
  fsLabel: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  fsLabelTxt: {
    fontFamily: FontFamily.book,
    fontSize: 24,
    letterSpacing: 0.4,
    color: C.text,
  },
  fsClose: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.2,
    color: C.goldLight,
  },
});
