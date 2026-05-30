/**
 * Etihad Airways Plaza — Employee Welcome Screen (1280×720 TV)
 * Single component with all sub-components; pixel-perfect layout.
 * Typography: Etihad Altis (FontFamily) per brand guidelines.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  Image,
  ImageBackground,
  ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import { FontFamily } from '../theme/typography';
import { Colors } from '../theme/colors';
import { AppHeader } from '../components/common/AppHeader';
import { useAppHeaderClock } from '../hooks/useAppHeaderClock';

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');
const DESIGN_WIDTH = 1280;
const scale = WINDOW_WIDTH / DESIGN_WIDTH;
const s = (n: number) => Math.round(n * scale);

// ─── Types ─────────────────────────────────────────────────────────────────
export interface NavItemData {
  id: string;
  icon: 'health' | 'dining' | 'cart' | 'plaza' | 'facilities' | 'channel' | 'tv' | 'notifications';
  label: string; // use '\n' for line breaks
}

export interface WelcomeScreenProps {
  onNavItemPress?: (item: NavItemData, index: number) => void;
  onNotificationsPress?: () => void;
  notificationCount?: number;
  guestName?: string;
  /** From Welcome API `welcome_message` (e.g. "Welcome"). */
  welcomeMessage?: string;
  /** From Welcome API `signature_title` (optional line under subtitle). */
  signatureTitle?: string;
  /** Shown on bottom bar, e.g. "Room NO: 101" or "Room NO: —". */
  roomNavLabel?: string;
  /** Optional overrides; omit for live Open-Meteo weather in the header. */
  temperature?: number;
  weatherCondition?: string;
  activeNavIndex?: number;
  navItems?: NavItemData[];
  /** When true, filters out the notifications nav item (for testing when notifications feature is disabled) */
  hideNotificationsNav?: boolean;
  backgroundImageSource?: ImageSourcePropType | null;
  isActive?: boolean;
}

// ─── Default nav items (order as per spec) ───────────────────────────────────
const DEFAULT_NAV_ITEMS: NavItemData[] = [
  { id: '1', icon: 'health', label: 'Occupational\nHealth & Safety' },
  { id: '2', icon: 'dining', label: 'Dining' },
  { id: '3', icon: 'cart', label: 'Hypermarket' },
  { id: '4', icon: 'plaza', label: 'EY Plaza' },
  { id: '5', icon: 'facilities', label: 'Etihad\nFacilities' },
  { id: '6', icon: 'channel', label: 'Etihad\nChannel' },
  { id: '7', icon: 'tv', label: 'TV Channel' },
  { id: '8', icon: 'notifications', label: 'Messages' },
];

// ─── Colors (Etihad brand — primary gold ~50%, secondary ~30%) ───────────────
const COLORS = {
  gold: Colors.primary,
  goldAlt: Colors.primaryLight,
  white: Colors.white,
  secondary: Colors.text.muted,
  overlay: Colors.overlay.black[45],
  navBg: Colors.background.dark,
  navDivider: Colors.overlay.white[35],
  activeNav: Colors.overlay.gold[75],
};


// ─── Sub-component: Welcome text ────────────────────────────────────────────
const WelcomeText = React.memo(function WelcomeText({
  guestName,
  welcomeMessage = 'Welcome home',  // fallback if API returns nothing
}: {
  guestName: string;
  welcomeMessage?: string;
  signatureTitle?: string;
}) {
  return (
    <View style={styles.welcomeWrap}>
      <Image
        source={require('../assets/welcome-hayyakum.png')}
        style={styles.welcomeHayyakumImage}
        resizeMode="contain"
        accessible
        accessibilityLabel="حياكم"
      />
      <Text style={styles.welcomeTitle}>{welcomeMessage}</Text>
      {/* <Text style={styles.welcomeName}>{guestName}</Text> */}
    </View>
  );
});

// ─── Nav icon renderer (all fit in fixed 48×48 box via StyleSheet) ───────────
const NavIcon = React.memo(function NavIcon({ type }: { type: NavItemData['icon'] }) {
  const iconColor = COLORS.white;
  const stroke = 2;

  switch (type) {
    case 'health':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/health-menu1.png')}
            style={styles.iconHealthImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'dining':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/dining-menu.png')}
            style={styles.iconDiningImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'cart':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/hypermarket-menu.png')}
            style={styles.iconCartImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'plaza':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/ey-plaza-menu.png')}
            style={styles.iconPlazaImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'facilities':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/facilities-menu-icon.png')}
            style={styles.iconFacilitiesImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'channel':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/ethiad-channel-menu.png')}
            style={styles.iconChannelImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'tv':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/tv-channels-menu.png')}
            style={styles.iconTvImage}
            resizeMode="contain"
          />
        </View>
      );
    case 'notifications':
      return (
        <View style={styles.iconOuter}>
          <Image
            source={require('../assets/message-menu.png')}
            style={styles.iconMessageImage}
            resizeMode="contain"
            fadeDuration={0}
          />
        </View>
      );
    default:
      return null;
  }
});

// ─── Sub-component: Single nav item ─────────────────────────────────────────
const NavItem = React.memo(function NavItem({
  item,
  index,
  totalItems,
  isActive,
  isFocused,
  isFirst,
  isLast,
  isPreferredFocus,
  messageCount,
  onPress,
  onFocus,
}: {
  item: NavItemData;
  index: number;
  totalItems: number;
  isActive: boolean;
  isFocused: boolean;
  isFirst: boolean;
  isLast: boolean;
  isPreferredFocus: boolean;
  messageCount: number;
  onPress: () => void;
  onFocus: () => void;
}) {
  return (
    <TouchableHighlight
      onPress={onPress}
      onFocus={onFocus}
      underlayColor={isActive ? Colors.primaryDark : Colors.overlay.gold[35]}
      focusable
      {...(isPreferredFocus ? ({ hasTVPreferredFocus: true } as any) : null)}
    >
      {/* Outer wrapper — gold bg covers icon + label when active */}
      <View style={[
        styles.navItemWrapper,
        isActive && styles.navItemActive,
        isFocused && styles.navItemFocused,
      ]}>
        {/* Fixed-height icon row — all icons sit at exactly the same vertical position */}
        <View style={styles.navIconBox}>
          <NavIcon type={item.icon} />
          {item.icon === 'notifications' && (
            <View style={styles.messagesCountBadge} pointerEvents="none">
              <Text style={styles.messagesCountBadgeText}>
                {messageCount > 99 ? '99+' : String(messageCount)}
              </Text>
            </View>
          )}
        </View>
        {/* Fixed-height label row — always starts at the same y position */}
        <View style={styles.navLabelBox}>
          <Text
            style={[styles.navItemLabel, isActive && styles.navItemLabelActive]}
            numberOfLines={2}
            textBreakStrategy="simple"
          >
            {item.label}
          </Text>
        </View>
      </View>
    </TouchableHighlight>
  );
});

// ─── Sub-component: Bottom nav bar ──────────────────────────────────────────
// Shows a sliding window of 7 items; scrolls when user navigates to next/prev.
const VISIBLE_NAV_COUNT = 7;

const BottomNavBar = React.memo(function BottomNavBar({
  items,
  activeIndex,
  focusedIndex,
  messageCount,
  roomNavLabel = 'Room NO: —',
  onSelectIndex,
  onFocusIndex,
  onNavItemPress,
}: {
  items: NavItemData[];
  activeIndex: number;
  focusedIndex: number;
  messageCount: number;
  roomNavLabel?: string;
  onSelectIndex: (index: number) => void;
  onFocusIndex: (index: number) => void;
  onNavItemPress?: (item: NavItemData, index: number) => void;
}) {
  const goPrev = useCallback(
    () => onFocusIndex(Math.max(0, focusedIndex - 1)),
    [onFocusIndex, focusedIndex],
  );
  const goNext = useCallback(
    () => onFocusIndex(Math.min(items.length - 1, focusedIndex + 1)),
    [onFocusIndex, focusedIndex, items.length],
  );

  // Sliding window: show only 7 items; when user moves, shift window to keep focused in view
  const visibleStart = Math.max(
    0,
    Math.min(focusedIndex - Math.floor(VISIBLE_NAV_COUNT / 2), items.length - VISIBLE_NAV_COUNT),
  );
  const visibleEnd = Math.min(visibleStart + VISIBLE_NAV_COUNT, items.length);
  const visibleItems = items.slice(visibleStart, visibleEnd);

  // Stable per-item callbacks — only recreated when the visible window shifts,
  // preventing NavItem (React.memo) from re-rendering due to new function refs.
  const itemHandlers = useMemo(
    () => visibleItems.map((item, localIndex) => {
      const realIndex = visibleStart + localIndex;
      return {
        onPress: () => {
          onSelectIndex(realIndex);
          onNavItemPress?.(item, realIndex);
        },
        onFocus: () => onFocusIndex(realIndex),
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleStart, visibleEnd, onSelectIndex, onFocusIndex, onNavItemPress],
  );

  return (
    <View style={styles.bottomNavBar}>
      {/* Room number — top left */}
      <Text style={styles.roomNoText}>{roomNavLabel}</Text>
      {/* Left arrow — aligned with nav icon row */}
      <TouchableHighlight
        onPress={goPrev}
        underlayColor={Colors.overlay.gold[10]}
        style={styles.navArrow}
      >
        <View style={styles.navArrowIconBox}>
          <Text style={styles.navArrowIcon}>{'\u2039'}</Text>
        </View>
      </TouchableHighlight>
      <View style={styles.navRow}>
        {visibleItems.map((item, localIndex) => {
          const realIndex = visibleStart + localIndex;
          const h = itemHandlers[localIndex];
          return (
            <NavItem
              key={item.id}
              item={item}
              index={realIndex}
              totalItems={items.length}
              isActive={realIndex === activeIndex}
              isFocused={realIndex === focusedIndex}
              isFirst={realIndex === 0}
              isLast={realIndex === items.length - 1}
              isPreferredFocus={realIndex === focusedIndex}
              messageCount={messageCount}
              onPress={h.onPress}
              onFocus={h.onFocus}
            />
          );
        })}
      </View>
      {/* Right arrow — aligned with nav icon row */}
      <TouchableHighlight
        onPress={goNext}
        underlayColor={Colors.overlay.gold[10]}
        style={styles.navArrow}
      >
        <View style={styles.navArrowIconBox}>
          <Text style={styles.navArrowIcon}>{'\u203A'}</Text>
        </View>
      </TouchableHighlight>
    </View>
  );
});

// ─── Main component ────────────────────────────────────────────────────────
export default function WelcomeScreen({
  guestName = 'Guest',
  welcomeMessage = 'Welcome',
  signatureTitle,
  roomNavLabel = 'Room NO: —',
  temperature: temperatureProp,
  weatherCondition: weatherConditionProp,
  activeNavIndex = 3,
  navItems: navItemsProp = DEFAULT_NAV_ITEMS,
  hideNotificationsNav = false,
  backgroundImageSource = null,
  onNavItemPress,
  onNotificationsPress,
  notificationCount = 0,
  isActive = true,
}: WelcomeScreenProps) {
  const navItems = hideNotificationsNav
    ? navItemsProp.filter((item) => item.icon !== 'notifications')
    : navItemsProp;

  const headerClock = useAppHeaderClock({
    ...(temperatureProp !== undefined ? { temperature: temperatureProp } : {}),
    ...(weatherConditionProp !== undefined && weatherConditionProp.trim() !== ''
      ? { weatherCondition: weatherConditionProp }
      : {}),
  });
  const { date, time, temperature, weatherCondition } = headerClock;

  // Single atomic index — focus and selection are always the same value
  const [navIndex, setNavIndex] = React.useReducer(
    (_prev: number, next: number) => next,
    activeNavIndex,
  );
  const focusedNavIndex = navIndex;
  const selectedNavIndex = navIndex;

  // Refs so the key listener closure never goes stale
  const navIndexRef = useRef(navIndex);
  navIndexRef.current = navIndex;
  const navItemsRef = useRef(navItems);
  navItemsRef.current = navItems;
  const onNavItemPressRef = useRef(onNavItemPress);
  onNavItemPressRef.current = onNavItemPress;

  useEffect(() => {
    setNavIndex(activeNavIndex);
  }, [activeNavIndex]);

  // JS-driven remote navigation.
  // Key events ARE confirmed reaching JS (diagnostic log shows keyCode 21/22).
  // Native TV focus engine has no initial focused view so DPAD does nothing
  // natively — we drive everything from JS instead.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) return;
    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: { keyCode: number }) => {
        const kc = evt.keyCode;
        const count = navItemsRef.current.length;
        if (kc === 4) {
          // BACK on welcome screen → exit the app
          BackHandler.exitApp();
        } else if (kc === 21) {
          // DPAD_LEFT
          setNavIndex(Math.max(0, navIndexRef.current - 1));
        } else if (kc === 22) {
          // DPAD_RIGHT
          setNavIndex(Math.min(count - 1, navIndexRef.current + 1));
        } else if (kc === 23 || kc === 66 || kc === 109) {
          // DPAD_CENTER (OK) or ENTER — fire the highlighted item's action
          const idx = navIndexRef.current;
          const item = navItemsRef.current[idx];
          if (item) onNavItemPressRef.current?.(item, idx);
        }
      },
    );
    return () => sub.remove();
  }, [isActive]);

  const content = (
    <>
      {/* Header — logo left, time/weather right */}
      <AppHeader
        date={date}
        time={time}
        temperature={temperature}
        weatherCondition={weatherCondition}
      />
      <WelcomeText
        guestName={guestName}
        welcomeMessage={welcomeMessage}
        signatureTitle={signatureTitle}
      />
      <BottomNavBar
        items={navItems}
        activeIndex={selectedNavIndex}
        focusedIndex={focusedNavIndex}
        messageCount={notificationCount}
        roomNavLabel={roomNavLabel}
        onSelectIndex={(i) => setNavIndex(i)}
        onFocusIndex={(i) => setNavIndex(i)}
        onNavItemPress={onNavItemPress}
      />
    </>
  );

  if (backgroundImageSource) {
    return (
      <ImageBackground
        source={backgroundImageSource}
        resizeMode="cover"
        style={styles.container}
      >
        {content}
      </ImageBackground>
    );
  }

  return <View style={[styles.container, styles.containerFallback]}>{content}</View>;
}

// ─── Styles (1280×720 design, scaled) ───────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  },
  containerFallback: {
    backgroundColor: 'transparent',
  },
  welcomeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WINDOW_HEIGHT * 0.28,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  /** Calligraphy — slightly shorter box so title + block sit higher (still `contain`). */
  welcomeHayyakumImage: {
    width: s(680),
    height: s(132),
    marginBottom: s(4),
  },
  welcomeTitle: {
    marginTop: s(-8),
    fontFamily: FontFamily.medium,
    fontSize: s(72),
    color: Colors.white,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: s(76),
  },
  welcomeName: {
    fontFamily: FontFamily.medium,
    fontSize: s(72),
    color: Colors.white,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: s(76),
  },
  bottomNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: s(190),
    marginBottom: s(40),
    backgroundColor: 'rgba(40,52,62,0.88)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomNoText: {
    position: 'absolute',
    top: s(-32),
    left: s(24),
    fontFamily: FontFamily.bold,
    fontSize: s(20),
    color: COLORS.white,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  navArrow: {
    width: s(48),
    height: s(190),
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowIcon: {
    fontSize: s(100),
    lineHeight: s(100),
    color: COLORS.white,
    fontWeight: '300',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  navItemWrapper: {
    width: s(165),
    minWidth: s(165),
    height: s(190),
    paddingHorizontal: s(8),
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconBox: {
    width: s(80),
    height: s(80),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navItemTouch: {
    width: '100%',
    height: s(80),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  messagesCountBadge: {
    position: 'absolute',
    top: s(-4),
    right: s(4),
    minWidth: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: '#826332',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: s(5),
    zIndex: 10,
  },
  messagesCountBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: s(11),
    color: Colors.white,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconBox: {
    width: s(64),
    height: s(64),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  navLabelBox: {
    width: '100%',
    height: s(44),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: s(6),
  },
  navItemLabelWrap: {
    width: '100%',
    height: s(44),
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: s(6),
  },
  navItemActive: {
    backgroundColor: Colors.primary,
  },
  navItemActiveInner: {
    backgroundColor: Colors.primary,
    overflow: 'hidden',
  },
  navItemFocused: {
    transform: [{ scale: 1.05 }],
  },
  navItemInner: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemLabel: {
    fontFamily: FontFamily.book,
    fontSize: s(14),
    color: Colors.white,
    textAlign: 'center',
    width: '100%',
  },
  navItemLabelActive: {
    fontFamily: FontFamily.text,
    fontSize: s(14),
    color: Colors.white,
  },
  iconOuter: {
    width: s(72),
    height: s(72),
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconOuterRelative: {
    position: 'relative',
  },
  iconShield: {
    width: s(36),
    height: s(40),
    borderRadius: s(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCross: {
    fontFamily: FontFamily.bold,
    fontSize: s(20),
  },
  iconCircle: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconForkKnife: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(4),
  },
  iconFork: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconForkTines: {
    flexDirection: 'row',
    gap: 1,
  },
  iconForkTine: {
    width: 2,
    height: s(8),
  },
  iconForkHandle: {
    width: 2,
    height: s(12),
    marginTop: s(2),
  },
  iconKnife: {
    width: s(2),
    height: s(16),
    transform: [{ rotate: '-25deg' }],
  },
  iconPlaza: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(6),
    height: s(48),
  },
  iconPlazaTower: {
    width: s(14),
    height: s(36),
    borderRadius: 2,
  },
  iconPlazaTowerRight: {
    height: s(30),
  },
  iconFacilities: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(3),
  },
  iconFacilityCell: {
    width: s(12),
    height: s(12),
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFacilityP: {
    fontFamily: FontFamily.bold,
    fontSize: s(8),
  },
  iconDumbbell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDumbbellEnd: {
    width: s(5),
    height: s(8),
    borderRadius: s(2),
  },
  iconDumbbellBar: {
    width: s(6),
    height: 2,
    marginHorizontal: 1,
  },
  iconWifi: {
    width: s(12),
    height: s(12),
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconWifiBar: {
    width: 1,
    height: s(4),
    position: 'absolute',
    bottom: 0,
    left: 1,
  },
  iconWifiBarM: {
    height: s(7),
    left: s(4),
  },
  iconWifiBarR: {
    height: s(10),
    left: s(9),
  },
  iconHealthImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconFacilitiesImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconChannelImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconTvImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconMessageImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconNotificationsText: {
    fontSize: s(32),
    textAlign: 'center',
  },
  iconMessagesOutline: {
    width: s(36),
    height: s(28),
    borderWidth: 2,
    borderColor: Colors.white,
    borderRadius: s(6),
    backgroundColor: 'transparent',
  },
  iconPlazaImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconCartImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
  iconMonitor: {
    width: s(34),
    height: s(30),
    borderRadius: s(3),
    overflow: 'hidden',
    alignItems: 'center',
  },
  iconScreen: {
    width: '100%',
    height: s(20),
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconMonitorText: {
    fontFamily: FontFamily.bold,
    fontSize: s(9),
  },
  iconRemote: {
    width: s(12),
    height: s(6),
    borderRadius: 2,
    marginTop: s(1),
    alignSelf: 'center',
  },
  iconCartBasket: {
    position: 'absolute',
    width: s(32),
    height: s(18),
    borderTopWidth: 0,
    borderBottomLeftRadius: s(4),
    borderBottomRightRadius: s(4),
    top: s(10),
    left: s(7),
  },
  iconCartHandle: {
    position: 'absolute',
    width: s(14),
    height: 2,
    top: s(8),
    right: s(4),
    transform: [{ rotate: '-20deg' }],
  },
  iconCartWheel: {
    position: 'absolute',
    width: s(7),
    height: s(7),
    borderRadius: s(4),
    bottom: s(4),
    left: s(9),
  },
  iconCartWheelRight: {
    position: 'absolute',
    width: s(7),
    height: s(7),
    borderRadius: s(4),
    bottom: s(4),
    right: s(9),
  },
  iconDiningImage: {
    width: s(72),
    height: s(72),
    alignSelf: 'center',
  },
});

