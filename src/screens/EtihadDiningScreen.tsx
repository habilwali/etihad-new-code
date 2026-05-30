/**
 * Etihad Plaza Hotel — Dining / Menu Screen
 * React Native TV App · Facilities-aligned type + slate bars · Full D-Pad Navigation
 *
 * Navigation layout:
 *   'sidebar'   – restaurant list  (UP/DOWN to move, OK to select)
 *   'tabs'      – Starters / Mains / Desserts / Drinks (LEFT/RIGHT, OK selects)
 *   'items'     – menu item list   (UP/DOWN to scroll, LEFT → back to sidebar)
 *
 * Remote key codes (Android TV):
 *   19 = UP | 20 = DOWN | 21 = LEFT | 22 = RIGHT | 23/66 = OK | 4 = BACK
 *
 * Hero section uses a bundled static image (see DINING_HERO_STATIC below).
 */

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  DeviceEventEmitter,
  Platform,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { FontFamily } from '../theme/typography';
import { Colors } from '../theme/colors';
import { AppHeader } from '../components/common/AppHeader';
import { useAppHeaderClock } from '../hooks/useAppHeaderClock';
import {
  fetchDiningVenues,
  DINING_TAB_KEYS,
  type DiningVenue,
  type DiningMenuItem,
} from '../services/diningApi';

// Bundled dining hero (burgers / brisket art) — no network, works offline.
const DINING_HERO_STATIC = require('../assets/images/dining-hero.jpg');

const { width: SW, height: SH } = Dimensions.get('window');

/** Matches WelcomeScreen bottom nav / Hypermarket — venue strip & sidebar */
const BOTTOM_BAR_BG = 'rgba(40,52,62,0.88)';

/* ─── THEME (Facilities-aligned text + Etihad primary) ─────────────────────── */
const C = {
  bg: Colors.background.dark,
  surface: Colors.midnightDune[600],
  panel: Colors.midnightDune[600],
  gold: Colors.primary,
  goldLight: Colors.primaryLight,
  goldDim: Colors.overlay.gold[35],
  text: Colors.text.light,
  muted: Colors.text.muted,
  border: Colors.overlay.gold[15],
  borderDim: Colors.overlay.gold[8],
  focusBorder: Colors.overlay.gold[75],
  focusBg: Colors.overlay.gold[10],
  selectedBg: Colors.overlay.gold[12],
};

/* ─── SIDEBAR WIDTH ─────────────────────────────────────── */
const SIDEBAR_W = 280;
const CONTENT_W = SW - SIDEBAR_W;

/* ─── TABS (must match API `menu` keys) ───────────────────────────────────── */

const BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'Signature':   { bg: Colors.overlay.gold[15],  color: Colors.primary,            border: Colors.overlay.gold[40] },
  "Chef's Pick": { bg: 'rgba(0,161,178,0.15)',   color: Colors.saadiyatBlue[300],  border: 'rgba(0,161,178,0.4)'  },
  'Popular':     { bg: Colors.overlay.gold[12],  color: Colors.primaryLight,       border: Colors.overlay.gold[35] },
  'New':         { bg: 'rgba(254,170,0,0.15)',   color: Colors.desertSunrise[400], border: 'rgba(254,170,0,0.4)'  },
  'Fine Wine':   { bg: Colors.overlay.gold[10],  color: Colors.primaryLight,       border: Colors.overlay.gold[30] },
  'Ritual':      { bg: Colors.overlay.gold[10],  color: Colors.primary,            border: Colors.overlay.gold[30] },
};

type NavSection = 'sidebar' | 'tabs' | 'items';

export interface EtihadDiningScreenProps {
  onBack?: () => void;
  isActive?: boolean;
}

/* ─── HELPERS ────────────────────────────────────────────── */

/* ─── BADGE ──────────────────────────────────────────────── */
function Badge({ label }: { label: string | null }) {
  if (!label) return null;
  const b = BADGE_STYLES[label] ?? BADGE_STYLES['Signature'];
  return (
    <View style={[s.badge, { backgroundColor: b.bg, borderColor: b.border }]}>
      <Text style={[s.badgeTxt, { color: b.color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/* ─── GOLD RULE ──────────────────────────────────────────── */
function GoldRule() {
  return (
    <LinearGradient
      colors={['transparent', Colors.primary, Colors.primaryLight, Colors.primary, 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={s.goldRule}
    />
  );
}

/* ─── MENU ITEM ROW ──────────────────────────────────────── */
const MenuItemRow = React.memo(function MenuItemRow({
  item, focused, isLast,
}: { item: DiningMenuItem; focused: boolean; isLast: boolean }) {
  return (
    <View style={[s.menuItem, !isLast && s.menuItemBorder, focused && s.menuItemFocused]}>
      {item.img ? (
        <View style={s.itemImgWrap}>
          <Image source={{ uri: item.img }} style={s.itemImg} resizeMode="cover" />
          {focused && (
            <LinearGradient
              colors={[Colors.overlay.gold[20], 'transparent']}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      ) : (
        <View style={[s.itemImgWrap, s.itemImgPlaceholder]}>
          <Text style={s.itemPlaceholderGlyph}>✦</Text>
        </View>
      )}

      <View style={s.itemBody}>
        <View style={s.itemNameRow}>
          <Text style={[s.itemName, focused && s.itemNameFocused]} numberOfLines={1}>
            {item.name}
          </Text>
          <Badge label={item.badge} />
        </View>
        <Text style={s.itemDesc} numberOfLines={2}>{item.desc}</Text>
      </View>

      <Text style={[s.itemPrice, focused && s.itemPriceFocused]}>{item.price}</Text>
    </View>
  );
});

/* ─── MAIN SCREEN ────────────────────────────────────────── */
export default function EtihadDiningScreen({ onBack, isActive = false }: EtihadDiningScreenProps) {
  const headerClock = useAppHeaderClock();

  /* ── state ── */
  const [navSection,  setNavSection]  = useState<NavSection>('sidebar');
  const [restIdx,     setRestIdx]     = useState(0);
  const [tabIdx,      setTabIdx]      = useState(0);
  const [itemIdx,     setItemIdx]     = useState(0);
  const [dining,      setDining]      = useState<DiningVenue[]>([]);
  const [diningLoad,  setDiningLoad]  = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');

  /* ── refs (avoid stale closures in event listener) ── */
  const navRef     = useRef<NavSection>('sidebar');
  const restRef    = useRef(0);
  const tabRef     = useRef(0);
  const itemRef    = useRef(0);
  const diningRef  = useRef<DiningVenue[]>([]);
  const onBackRef  = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => { diningRef.current = dining; }, [dining]);

  const setNav  = useCallback((v: NavSection) => { navRef.current  = v; setNavSection(v);  }, []);
  const setRest = useCallback((v: number)      => { restRef.current = v; setRestIdx(v);     }, []);
  const setTab  = useCallback((v: number)      => { tabRef.current  = v; setTabIdx(v);      }, []);
  const setItem = useCallback((v: number)      => { itemRef.current = v; setItemIdx(v);     }, []);

  /* ── scroll refs ── */
  const sidebarScrollRef = useRef<ScrollView>(null);
  const menuScrollRef    = useRef<ScrollView>(null);

  /* ── fetch dining feed when screen is active ── */
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setDiningLoad('loading');
    fetchDiningVenues()
      .then(rows => {
        if (cancelled) return;
        setDining(rows);
        setDiningLoad(rows.length ? 'ready' : 'error');
      })
      .catch(() => {
        if (!cancelled) {
          setDining([]);
          setDiningLoad('error');
        }
      });
    return () => { cancelled = true; };
  }, [isActive]);

  /* ── reset item index when restaurant or tab changes ── */
  useEffect(() => { setItem(0); }, [restIdx, tabIdx]);

  /* ── auto-scroll sidebar to keep focused restaurant visible ── */
  useEffect(() => {
    sidebarScrollRef.current?.scrollTo({ y: restIdx * 110, animated: true });
  }, [restIdx]);

  /* ── auto-scroll menu list to keep focused item visible ── */
  useEffect(() => {
    if (navSection === 'items') {
      menuScrollRef.current?.scrollTo({ y: itemIdx * 120, animated: true });
    }
  }, [itemIdx, navSection]);

  /* ── reset on screen (de)activation ── */
  useEffect(() => {
    if (isActive) {
      setNav('sidebar'); setRest(0); setTab(0); setItem(0);
    }
  }, [isActive]);

  /* ── D-PAD HANDLER ── */
  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) return;

    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode: number }) => {
      const kc  = evt.keyCode;
      const sec = navRef.current;

      /* BACK */
      if (kc === 4) { onBackRef.current?.(); return; }

      /* UP */
      if (kc === 19) {
        if (sec === 'sidebar') {
          setRest(Math.max(0, restRef.current - 1));
        } else if (sec === 'items') {
          if (itemRef.current > 0) {
            setItem(itemRef.current - 1);
          } else {
            setNav('tabs'); // jump back to tabs when at top of list
          }
        }
        // tabs: nothing above — stay
      }

      /* DOWN */
      else if (kc === 20) {
        if (sec === 'sidebar') {
          setRest(
            Math.min(
              Math.max(0, diningRef.current.length - 1),
              restRef.current + 1,
            ),
          );
        } else if (sec === 'tabs') {
          setNav('items'); setItem(0);
        } else if (sec === 'items') {
          const list =
            diningRef.current[restRef.current]?.menu[
              DINING_TAB_KEYS[tabRef.current]
            ] ?? [];
          setItem(Math.min(list.length - 1, itemRef.current + 1));
        }
      }

      /* LEFT */
      else if (kc === 21) {
        if (sec === 'tabs') {
          if (tabRef.current > 0) { setTab(tabRef.current - 1); }
          else { setNav('sidebar'); }
        } else if (sec === 'items') {
          setNav('tabs');
        }
      }

      /* RIGHT */
      else if (kc === 22) {
        if (sec === 'sidebar') {
          setNav('tabs');
        } else if (sec === 'tabs') {
          if (tabRef.current < DINING_TAB_KEYS.length - 1) {
            setTab(tabRef.current + 1);
          } else {
            setNav('items'); setItem(0);
          }
        }
      }

      /* OK / SELECT */
      else if (kc === 23 || kc === 66) {
        if (sec === 'sidebar') {
          setNav('tabs'); setTab(0);
        } else if (sec === 'tabs') {
          setNav('items'); setItem(0);
        }
        // items: view-only, no action
      }
    });

    return () => sub.remove();
  }, [isActive]);

  if (!isActive) {
    return <View style={s.root} />;
  }

  if (dining.length === 0 && diningLoad !== 'error') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadTxt}>Loading dining…</Text>
        </View>
      </View>
    );
  }

  if (diningLoad === 'error' || dining.length === 0) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={s.loadWrap}>
          <Text style={s.loadTitle}>Dining data unavailable</Text>
          <Text style={s.loadTxt}>
            Deploy{' '}
            <Text style={{ color: Colors.primary }}>cms/api/dining.php</Text>
            {' '}and{' '}
            <Text style={{ color: Colors.primary }}>dining.json</Text>
            {' '}to your CMS{' '}
            <Text style={{ color: Colors.primary }}>/api/</Text>
            {' '}folder, or set HOTEL_CMS_HOST / HOTEL_CMS_BASE_URL.
          </Text>
        </View>
      </View>
    );
  }

  const rest       = dining[restIdx] ?? dining[0]!;
  const menuData   = rest.menu;
  const activeTab  = DINING_TAB_KEYS[tabIdx];
  const items      = menuData[activeTab] ?? [];

  /* ─── RENDER ─────────────────────────────────────────────── */
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <AppHeader
        date={headerClock.date}
        time={headerClock.time}
        temperature={headerClock.temperature}
        weatherCondition={headerClock.weatherCondition}
      />

      {/* Hero: static bundled image + gradient + venue title */}
      <ImageBackground
        key={`hero-${rest.id}`}
        source={DINING_HERO_STATIC}
        style={s.heroWrap}
        imageStyle={s.heroBgImage}
        resizeMode="cover"
      >
        {/* Subtle dark gradient so text stays legible regardless of image brightness */}
        <LinearGradient
          colors={[
            'rgba(20,30,38,0.45)',
            'rgba(20,30,38,0.60)',
            'transparent',
          ]}
          locations={[0, 0.35, 1]}
          style={s.heroGradientLayer}
          pointerEvents="none"
        />

        {/* Restaurant name + cuisine overlay — bottom-left */}
        <View style={s.heroOverlay} pointerEvents="box-none">
          <LinearGradient
            colors={[Colors.primary, Colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.heroAccentLine}
          />
          <Text style={s.heroName}>{rest.name}</Text>
          <Text style={s.heroCuisine}>{rest.cuisine.toUpperCase()}</Text>
        </View>
      </ImageBackground>

      {/* ── BODY: SIDEBAR + CONTENT ───────────────────────── */}
      <View style={s.body}>

        {/* ── SIDEBAR ── */}
        <View style={[s.sidebar, navSection === 'sidebar' && s.sidebarFocused]}>
          <View style={s.sidebarHeader}>
            <Text style={s.sidebarHeaderTxt}>VENUES</Text>
            <View style={s.sidebarHeaderLine} />
          </View>

          <ScrollView
            ref={sidebarScrollRef}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            scrollEventThrottle={16}
          >
            {dining.map((r, i) => {
              const active  = i === restIdx;
              const focused = navSection === 'sidebar' && i === restIdx;
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => { setRest(i); setNav('tabs'); setTab(0); }}
                  activeOpacity={0.85}
                  focusable
                >
                  <View style={[
                    s.sidebarItem,
                    active  && s.sidebarItemActive,
                    focused && s.sidebarItemFocused,
                  ]}>
                    {active && (
                      <LinearGradient
                        colors={[Colors.overlay.gold[12], 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Text style={s.sidebarEmoji}>{r.emoji}</Text>
                    <View style={s.sidebarItemBody}>
                      <Text style={[s.sidebarName, (active || focused) && s.sidebarNameActive]}>
                        {r.name}
                      </Text>
                      <Text style={s.sidebarCuisine}>{r.cuisine.toUpperCase()}</Text>
                      {r.michelin && <Text style={s.sidebarMichelin}>{r.michelin}</Text>}
                    </View>
                    {focused && (
                      <View style={s.sidebarArrow}>
                        <Text style={s.sidebarArrowTxt}>›</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Nav hint */}
          <View style={s.sidebarHint}>
            <GoldRule />
            <View style={s.hintRow}>
              <Text style={s.hintKey}>↕</Text>
              <Text style={s.hintLabel}>Browse</Text>
              <Text style={s.hintKey}>›</Text>
              <Text style={s.hintLabel}>Menu</Text>
            </View>
          </View>
        </View>

        {/* ── CONTENT ── */}
        <View style={s.content}>

          {/* ── MENU TABS ── */}
          <View style={[s.tabBar, navSection === 'tabs' && s.tabBarFocused]}>
            {DINING_TAB_KEYS.map((tab, i) => {
              const active  = i === tabIdx;
              const focused = navSection === 'tabs' && i === tabIdx;
              const count   = (menuData[tab] ?? []).length;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => { setTab(i); setNav('items'); setItem(0); }}
                  activeOpacity={0.8}
                  focusable
                  style={[s.tabBtn, focused && s.tabBtnFocused]}
                >
                  <Text style={[s.tabLabel, (active || focused) && s.tabLabelActive]}>
                    {tab.toUpperCase()}
                  </Text>
                  <Text style={[s.tabCount, (active || focused) && { color: C.gold }]}>
                    {count} items
                  </Text>
                  {active && (
                    <LinearGradient
                      colors={[Colors.primary, Colors.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.tabLine}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── ITEM LIST ── */}
          <ScrollView
            ref={menuScrollRef}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            scrollEventThrottle={16}
            style={s.itemsList}
          >
            {items.map((item, i) => (
              <MenuItemRow
                key={`${i}-${item.name}`}
                item={item}
                focused={navSection === 'items' && i === itemIdx}
                isLast={i === items.length - 1}
              />
            ))}

            {/* Allergen note */}
            <View style={s.allergenBox}>
              <Text style={s.allergenIcon}>ℹ</Text>
              <Text style={s.allergenTxt}>
                Please inform your server of any allergies or dietary requirements.
                Our culinary team is happy to adapt any dish for you.
              </Text>
            </View>
          </ScrollView>

        </View>
      </View>

    </View>
  );
}

/* ─── STYLES ─────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  /* LOADING / ERROR */
  loadWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  loadTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: C.text,
    textAlign: 'center',
  },
  loadTxt: {
    fontFamily: FontFamily.book,
    fontSize: 11,
    lineHeight: 17,
    color: C.muted,
    textAlign: 'center',
  },

  /* GOLD RULE */
  goldRule: { height: 1 },

  /* ─────────────────────────────────────────────────────────────────────────
   * HERO
   * heroWrap     – outer container; fixes height and clips the bitmap.
   * heroBgImage  – styles applied to the <Image> inside <ImageBackground>;
   *                must match heroWrap dimensions for a full-bleed cover.
   * ───────────────────────────────────────────────────────────────────────── */
  heroWrap: {
    width: '100%',
    height: SH * 0.33,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: C.panel,   // shown while the image is loading
  },
  heroBgImage: {
    width: SW,
    height: SH * 0.33,
  },
  heroGradientLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroAccentLine: { width: 28, height: 2, borderRadius: 1 },
  heroName: {
    fontFamily: FontFamily.book,
    fontSize: 24,
    color: C.text,
    letterSpacing: 0.4,
  },
  heroCuisine: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.2,
    color: C.text,
  },

  /* BODY */
  body: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },

  /* SIDEBAR */
  sidebar: {
    width: SIDEBAR_W,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    backgroundColor: BOTTOM_BAR_BG,
    flexDirection: 'column',
  },
  sidebarFocused: {
    borderRightColor: 'rgba(255,255,255,0.14)',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  sidebarHeaderTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.text,
  },
  sidebarHeaderLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 14,
    position: 'relative',
  },
  sidebarItemActive:  { borderLeftColor: C.gold },
  sidebarItemFocused: { borderLeftColor: C.gold, backgroundColor: C.focusBg },
  sidebarEmoji:       { fontSize: 24, width: 32, textAlign: 'center' },
  sidebarItemBody:    { flex: 1 },
  sidebarName: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  sidebarNameActive: { fontFamily: FontFamily.text, color: C.text },
  sidebarCuisine: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.2,
    color: C.text,
  },
  sidebarMichelin: { fontSize: 11, marginTop: 4 },
  sidebarArrow: {
    width: 22,
    height: 22,
    backgroundColor: C.gold,
    borderRadius: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarArrowTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 14,
    color: Colors.button.primaryText,
    textAlign: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'android' ? { marginTop: 2 } : {}),
  },
  sidebarHint: { paddingTop: 2, paddingBottom: 14 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 10,
  },
  hintKey: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: C.gold,
    backgroundColor: Colors.overlay.gold[12],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.overlay.gold[35],
  },
  hintLabel: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.text,
    marginRight: 8,
  },

  /* CONTENT */
  content: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'column',
  },

  /* TABS */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: BOTTOM_BAR_BG,
  },
  tabBarFocused: { borderBottomColor: C.focusBorder },
  tabBtn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    position: 'relative',
  },
  tabBtnFocused: { backgroundColor: C.focusBg },
  tabLabel: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: 2,
  },
  tabLabelActive: { fontFamily: FontFamily.text, color: C.text },
  tabCount: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
  },
  tabLine: {
    position: 'absolute',
    bottom: -1, left: 20, right: 20,
    height: 2,
  },

  /* SECTION LABEL (available for future use) */
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
  },
  sectionLabelLine:     { width: 24, height: 1, backgroundColor: C.gold, opacity: 0.6 },
  sectionLabelTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    letterSpacing: 0.2,
    color: C.text,
  },
  sectionLabelLineLong: { flex: 1, height: 1, backgroundColor: C.borderDim },

  /* ITEMS LIST */
  itemsList: { flex: 1, paddingHorizontal: 32 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 20,
    borderRadius: 3,
    paddingHorizontal: 8,
    marginVertical: 1,
  },
  menuItemBorder:  { borderBottomWidth: 1, borderBottomColor: C.borderDim },
  menuItemFocused: {
    backgroundColor: Colors.overlay.gold[6],
    borderWidth: 1,
    borderColor: Colors.overlay.gold[35],
    borderRadius: 3,
  },
  itemImgWrap: {
    width: 100,
    height: 72,
    borderRadius: 3,
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: C.border,
  },
  itemImgPlaceholder: {
    backgroundColor: Colors.overlay.gold[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPlaceholderGlyph: {
    fontFamily: FontFamily.book,
    fontSize: 28,
    color: C.text,
  },
  itemImg:     { width: '100%', height: '100%' },
  itemBody:    { flex: 1 },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 7,
  },
  itemName: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: C.text,
    letterSpacing: 0.2,
  },
  itemNameFocused: { fontFamily: FontFamily.text, color: C.text },
  itemDesc: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
  },
  itemPrice: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
    color: C.gold,
    letterSpacing: 0.3,
    minWidth: 110,
    textAlign: 'right',
  },
  itemPriceFocused: { color: C.goldLight },

  /* BADGE */
  badge: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 7.5,
    letterSpacing: 1.2,
  },

  /* ALLERGEN */
  allergenBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    margin: 16,
    marginTop: 20,
    marginBottom: 28,
    backgroundColor: Colors.overlay.gold[5],
    borderWidth: 1,
    borderColor: C.borderDim,
    borderRadius: 2,
    padding: 14,
  },
  allergenIcon: { fontSize: 12, color: C.text, marginTop: 1 },
  allergenTxt: {
    fontFamily: FontFamily.book,
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
  },
});