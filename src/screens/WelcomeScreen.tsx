/**
 * Copthorne Hotel Sharjah — Welcome / Home screen (1280×720 TV).
 *
 * Layout follows the approved light Copthorne reference:
 * - Copthorne brand + weather header
 * - soft white fade over the API-provided background image
 * - left-aligned hotel welcome copy
 * - light glass menu cards with gold line icons
 * - gold active tile and compact hotel footer
 *
 * The background image source and API image-loading mechanism are intentionally
 * untouched. This screen only adds visual overlays on top of that image.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import LinearGradient from 'react-native-linear-gradient';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {AppHeader} from '../components/common/AppHeader';
import {useAppHeaderClock} from '../hooks/useAppHeaderClock';

const {width: WINDOW_WIDTH, height: WINDOW_HEIGHT} = Dimensions.get('window');
const DESIGN_WIDTH = 1280;
const scale = WINDOW_WIDTH / DESIGN_WIDTH;
const s = (n: number) => Math.round(n * scale);

export interface NavItemData {
  id: string;
  icon:
    | 'health'
    | 'dining'
    | 'plaza'
    | 'facilities'
    | 'tv'
    | 'notifications'
    | 'apps'
    | 'cart'
    | 'channel';
  label: string;
}

export interface WelcomeScreenProps {
  onNavItemPress?: (item: NavItemData, index: number) => void;
  onNotificationsPress?: () => void;
  notificationCount?: number;
  guestName?: string;
  welcomeMessage?: string;
  signatureTitle?: string;
  roomNavLabel?: string;
  temperature?: number;
  weatherCondition?: string;
  activeNavIndex?: number;
  navItems?: NavItemData[];
  hideNotificationsNav?: boolean;
  backgroundImageSource?: ImageSourcePropType | null;
  isActive?: boolean;
}

const DEFAULT_NAV_ITEMS: NavItemData[] = [
  {id: '1', icon: 'tv', label: 'Live TV'},
  {id: '2', icon: 'dining', label: 'Dining'},
  {id: '3', icon: 'facilities', label: 'Hotel Services'},
  {id: '4', icon: 'plaza', label: 'Explore Sharjah'},
  {id: '5', icon: 'health', label: 'Wellness & Fitness'},
  {id: '6', icon: 'notifications', label: 'Messages'},
  {id: '7', icon: 'apps', label: 'Apps'},
];

const MENU_ICON_SOURCE: Record<NavItemData['icon'], any> = {
  tv: require('../assets/copthorne/icon_live_tv.png'),
  dining: require('../assets/copthorne/icon_dining.png'),
  facilities: require('../assets/copthorne/icon_hotel_services.png'),
  plaza: require('../assets/copthorne/icon_explore_sharjah.png'),
  health: require('../assets/copthorne/icon_wellness.png'),
  notifications: require('../assets/copthorne/icon_messages.png'),
  apps: require('../assets/copthorne/icon_apps.png'),
  cart: require('../assets/copthorne/icon_apps.png'),
  channel: require('../assets/copthorne/icon_live_tv.png'),
};

const NavIcon = React.memo(function NavIcon({
  type,
  active,
}: {
  type: NavItemData['icon'];
  active: boolean;
}) {
  return (
    <Image
      source={MENU_ICON_SOURCE[type]}
      style={styles.navIcon}
      resizeMode="contain"
      tintColor={active ? Colors.white : Colors.primary}
      fadeDuration={0}
    />
  );
});

const NavItem = React.memo(function NavItem({
  item,
  index,
  active,
  focused,
  preferred,
  messageCount,
  onPress,
  onFocus,
}: {
  item: NavItemData;
  index: number;
  active: boolean;
  focused: boolean;
  preferred: boolean;
  messageCount: number;
  onPress: () => void;
  onFocus: () => void;
}) {
  return (
    <TouchableHighlight
      onPress={onPress}
      onFocus={onFocus}
      activeOpacity={1}
      underlayColor={active ? Colors.primaryDark : 'rgba(168,122,43,0.10)'}
      focusable
      {...(preferred ? ({hasTVPreferredFocus: true} as any) : null)}
      style={styles.navTouch}>
      <View
        style={[
          styles.navCard,
          active && styles.navCardActive,
          focused && !active && styles.navCardFocused,
        ]}>
        <View style={styles.iconWrap}>
          <NavIcon type={item.icon} active={active} />
          {item.icon === 'notifications' && messageCount > 0 && (
            <View style={styles.messageBadge} pointerEvents="none">
              <Text style={styles.messageBadgeText}>
                {messageCount > 99 ? '99+' : String(messageCount)}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.navLabel, active && styles.navLabelActive]}
          numberOfLines={2}>
          {item.label}
        </Text>
      </View>
    </TouchableHighlight>
  );
});

function WelcomeCopy({roomNavLabel}: {roomNavLabel?: string}) {
  const showRoom = !!roomNavLabel && !/[—-]\s*$/.test(roomNavLabel.trim());
  return (
    <View style={styles.copyWrap}>
      <Text style={styles.preheader}>WELCOME TO</Text>
      <Text style={styles.hotelTitle}>Copthorne Hotel{`\n`}Sharjah</Text>
      <Text style={styles.hotelDesc}>
        Experience comfort, convenience and{`\n`}warm hospitality in the heart of Sharjah.
      </Text>
      <View style={styles.shortGoldRule} />
      <Text style={styles.warmCopy}>We are delighted{`\n`}to have you with us.</Text>
      {showRoom && (
        <View style={styles.roomPill}>
          <Text style={styles.roomPillText}>{roomNavLabel}</Text>
        </View>
      )}
    </View>
  );
}

export default function WelcomeScreen({
  guestName = 'Guest',
  welcomeMessage = 'Welcome',
  signatureTitle,
  roomNavLabel,
  temperature,
  weatherCondition,
  activeNavIndex = 6,
  navItems = DEFAULT_NAV_ITEMS,
  hideNotificationsNav = false,
  backgroundImageSource = null,
  onNavItemPress,
  notificationCount = 0,
  isActive = true,
}: WelcomeScreenProps) {
  void guestName;
  void welcomeMessage;
  void signatureTitle;

  const items = useMemo(
    () =>
      hideNotificationsNav
        ? navItems.filter(item => item.icon !== 'notifications')
        : navItems,
    [hideNotificationsNav, navItems],
  );

  const safeInitial = Math.max(0, Math.min(items.length - 1, activeNavIndex));
  const [focusedIndex, setFocusedIndex] = useState(safeInitial);
  const focusedIndexRef = useRef(safeInitial);
  const itemsRef = useRef(items);
  const onPressRef = useRef(onNavItemPress);
  itemsRef.current = items;
  onPressRef.current = onNavItemPress;
  focusedIndexRef.current = focusedIndex;

  useEffect(() => {
    const next = Math.max(0, Math.min(items.length - 1, activeNavIndex));
    focusedIndexRef.current = next;
    setFocusedIndex(next);
  }, [activeNavIndex, items.length]);

  const selectIndex = useCallback((idx: number) => {
    const next = Math.max(0, Math.min(itemsRef.current.length - 1, idx));
    focusedIndexRef.current = next;
    setFocusedIndex(next);
  }, []);

  useEffect(() => {
    if (!isActive || Platform.OS !== 'android') {
      return;
    }
    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: {keyCode?: number}) => {
        const kc = Number(evt?.keyCode ?? -1);
        if (kc === 4) {
          BackHandler.exitApp();
          return;
        }
        if (kc === 21) {
          selectIndex(focusedIndexRef.current - 1);
          return;
        }
        if (kc === 22) {
          selectIndex(focusedIndexRef.current + 1);
          return;
        }
        if (kc === 23 || kc === 66 || kc === 109) {
          const idx = focusedIndexRef.current;
          const item = itemsRef.current[idx];
          if (item) {
            onPressRef.current?.(item, idx);
          }
        }
      },
    );
    return () => sub.remove();
  }, [isActive, selectIndex]);

  const clock = useAppHeaderClock({
    ...(temperature !== undefined ? {temperature} : {}),
    ...(weatherCondition && weatherCondition.trim().length > 0
      ? {weatherCondition}
      : {}),
  });

  const content = (
    <View style={styles.container}>
      {/* Reference-style soft white shading. This sits above the image only;
          it never changes the API image URI, resize mode, caching, or loader. */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.98)',
          'rgba(255,255,255,0.92)',
          'rgba(255,255,255,0.64)',
          'rgba(255,255,255,0.16)',
          'rgba(255,255,255,0.00)',
        ]}
        locations={[0, 0.25, 0.46, 0.67, 1]}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 0.5}}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.00)',
          'rgba(255,255,255,0.16)',
          'rgba(255,255,255,0.90)',
          'rgba(255,255,255,0.98)',
        ]}
        locations={[0, 0.62, 0.83, 1]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <AppHeader
        date={clock.date}
        time={clock.time}
        temperature={clock.temperature}
        weatherCondition={clock.weatherCondition}
      />

      <WelcomeCopy roomNavLabel={roomNavLabel} />

      <View style={styles.bottomNav}>
        <View style={styles.arrowSlot} pointerEvents="none">
          <Image
            source={require('../assets/copthorne/arrow_left.png')}
            style={styles.arrowIcon}
            resizeMode="contain"
          />
        </View>

        <View style={styles.navRow}>
          {items.map((item, index) => {
            const focused = focusedIndex === index;
            const active = focused;
            return (
              <NavItem
                key={item.id}
                item={item}
                index={index}
                active={active}
                focused={focused}
                preferred={isActive && index === safeInitial}
                messageCount={notificationCount}
                onFocus={() => selectIndex(index)}
                onPress={() => onNavItemPress?.(item, index)}
              />
            );
          })}
        </View>

        <View style={styles.arrowSlot} pointerEvents="none">
          <Image
            source={require('../assets/copthorne/arrow_right.png')}
            style={styles.arrowIcon}
            resizeMode="contain"
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLeft}>COPTHORNE HOTEL SHARJAH</Text>
        <Text style={styles.footerRight}>MILLENNIUM HOTELS AND RESORTS</Text>
      </View>
    </View>
  );

  if (backgroundImageSource) {
    return (
      <ImageBackground
        source={backgroundImageSource}
        style={styles.container}
        resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  copyWrap: {
    position: 'absolute',
    left: s(56),
    top: s(176),
    width: s(470),
  },
  preheader: {
    fontFamily: FontFamily.medium,
    fontSize: s(16),
    lineHeight: s(20),
    color: Colors.text.dark,
    letterSpacing: s(5.2),
    includeFontPadding: false,
  },
  hotelTitle: {
    marginTop: s(9),
    fontFamily: 'serif',
    fontSize: s(48),
    lineHeight: s(51),
    color: Colors.text.dark,
    includeFontPadding: false,
  },
  hotelDesc: {
    marginTop: s(15),
    fontFamily: FontFamily.book,
    fontSize: s(16),
    lineHeight: s(24),
    color: Colors.text.dark,
    includeFontPadding: false,
  },
  shortGoldRule: {
    width: s(52),
    height: s(4),
    marginTop: s(18),
    backgroundColor: Colors.primary,
  },
  warmCopy: {
    marginTop: s(16),
    fontFamily: 'serif',
    fontSize: s(25),
    lineHeight: s(29),
    fontStyle: 'italic',
    color: Colors.primary,
    includeFontPadding: false,
  },
  roomPill: {
    alignSelf: 'flex-start',
    marginTop: s(13),
    borderWidth: 1,
    borderColor: 'rgba(168,122,43,0.45)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: s(12),
    paddingHorizontal: s(12),
    paddingVertical: s(5),
  },
  roomPillText: {
    fontFamily: FontFamily.book,
    fontSize: s(11),
    color: Colors.text.dark,
    letterSpacing: s(0.6),
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: s(54),
    height: s(146),
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(168,122,43,0.20)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,122,43,0.12)',
    paddingVertical: s(8),
  },
  arrowSlot: {
    width: s(54),
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    width: s(28),
    height: s(62),
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: s(6),
  },
  navTouch: {
    flex: 1,
    borderRadius: s(7),
    overflow: 'hidden',
  },
  navCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: s(7),
    borderWidth: 1,
    borderColor: 'rgba(168,122,43,0.22)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: s(5),
    paddingVertical: s(8),
  },
  navCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    transform: [{scale: 1.025}],
  },
  navCardFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  iconWrap: {
    width: s(62),
    height: s(62),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navIcon: {
    width: s(54),
    height: s(54),
  },
  navLabel: {
    marginTop: s(3),
    fontFamily: FontFamily.book,
    fontSize: s(13),
    lineHeight: s(17),
    color: Colors.text.dark,
    textAlign: 'center',
    includeFontPadding: false,
  },
  navLabelActive: {
    color: Colors.white,
    fontFamily: FontFamily.medium,
  },
  messageBadge: {
    position: 'absolute',
    top: s(-4),
    right: s(-2),
    minWidth: s(21),
    height: s(21),
    borderRadius: s(11),
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.white,
    paddingHorizontal: s(5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: s(10),
    color: Colors.white,
    includeFontPadding: false,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: s(54),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(45),
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  footerLeft: {
    fontFamily: FontFamily.book,
    fontSize: s(8),
    color: Colors.text.dark,
    letterSpacing: s(3.2),
  },
  footerRight: {
    fontFamily: FontFamily.book,
    fontSize: s(8),
    color: Colors.text.dark,
    letterSpacing: s(3.0),
  },
});
