import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  ImageBackground,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {EmergencyAlertProvider} from './src/context/EmergencyAlertContext';
import {
  NotificationProvider,
  useNotifications,
} from './src/context/NotificationContext';
import {EmergencyAlertModal} from './src/components/EmergencyAlertModal';
import {UpdateModal} from './src/components/UpdateModal';
import {useAppUpdate} from './src/hooks/useAppUpdate';
import {useAlertListener} from './src/hooks/useAlertListener';
import {useNotificationListener} from './src/hooks/useNotificationListener';
import {useWelcomeGuest} from './src/hooks/useWelcomeGuest';
import {useBackgroundImageUri} from './src/hooks/useBackgroundImage';
import EtihadSplashScreen from './src/screens/EtihadSplashScreen';
import WelcomeScreen, {NavItemData} from './src/screens/WelcomeScreen';
import FacilitiesScreen from './src/screens/FacilitiesScreen';
import EtihadChannelScreen from './src/screens/EtihadChannelScreen';
import EtihadChannelsScreen from './src/screens/EtihadChannelsScreen';
import EtihadDiningScreen from './src/screens/EtihadDiningScreen';
import EtihadPlazaScreen from './src/screens/EtihadPlazaScreen';
import OccupationalHealthSafetyScreen from './src/screens/OccupationalHealthSafetyScreen';
import EtihadHypermarketScreen from './src/screens/EtihadHypermarketScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import {
  startPrefetchEtihadChannelList,
  startPrefetchIptvTvChannels,
} from './src/services/channelListsPrefetch';

// Diagnostic: log every hardware key received from the physical remote.
function useDiagnosticKeyLog() {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    let subscription: {remove: () => void} | null = null;
    try {
      const KeyEvent = require('react-native-keyevent').default;
      KeyEvent.onKeyDownListener(
        (evt: {keyCode: number; pressedKey: string}) => {
          console.log(
            '[REMOTE] keyDown  keyCode=' +
              evt.keyCode +
              '  key=' +
              evt.pressedKey,
          );
        },
      );
      subscription = {remove: () => KeyEvent.removeKeyDownListener()};
    } catch (e) {
      console.warn('[REMOTE] react-native-keyevent not available:', e);
    }
    return () => subscription?.remove();
  }, []);
}

// Screen fade wrapper — used for screen transitions AFTER splash is gone.
// isActive=true → opacity 1 (120ms), isActive=false → opacity 0 (80ms).
function AnimatedScreen({
  isActive,
  children,
}: {
  isActive: boolean;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isActive ? 1 : 0,
      duration: isActive ? 120 : 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isActive, opacity]);

  return (
    <Animated.View
      style={[styles.screen, {opacity}]}
      pointerEvents={isActive ? 'auto' : 'none'}>
      {children}
    </Animated.View>
  );
}

function AppContent(): React.JSX.Element {
  // Splash is rendered as a full-screen overlay on top of the home.
  // Home mounts at FULL OPACITY from the start so when the splash fades out
  // the home is immediately visible — no blank flash, no double-opacity ghost.
  const [splashDone, setSplashDone] = useState(false);

  // Start listeners immediately — data loads while splash is visible.
  useAlertListener(true);
  useNotificationListener(true);
  const welcomeGuest = useWelcomeGuest(true);
  const backgroundImageUri = useBackgroundImageUri();
  const {unreadCount} = useNotifications();
  const [screen, setScreen] = useState<
    | 'welcome'
    | 'facilities'
    | 'channel'
    | 'etihadChannels'
    | 'dining'
    | 'plaza'
    | 'health'
    | 'hypermarket'
    | 'notifications'
  >('welcome');
  const screenRef = useRef(screen);
  screenRef.current = screen;

  /** RN only emits hardwareBackPress from activity onBackPressed; MainActivity no longer swallows BACK in dispatchKeyEvent, so this runs after JS onKeyDown. Consume back when not on home so the default handler does not exit the app. */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenRef.current !== 'welcome') {
        setScreen('welcome');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  // Lazy-mount secondary screens: each mounts only the first time the user
  // navigates to it, then stays mounted so back-navigation is instant.
  // This avoids the post-splash JS spike of mounting all 8 screens at once.
  const [mountedScreens, setMountedScreens] = useState<Set<string>>(
    new Set<string>(),
  );
  const shouldMount = (name: string) =>
    screen === name || mountedScreens.has(name);

  useEffect(() => {
    if (screen !== 'welcome') {
      setMountedScreens(prev => {
        if (prev.has(screen)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(screen);
        return next;
      });
    }
  }, [screen]);

  useDiagnosticKeyLog();

  const handleSplashFinish = React.useCallback(() => {
    setSplashDone(true);
  }, []);

  useEffect(() => {
    startPrefetchIptvTvChannels();
    startPrefetchEtihadChannelList();
  }, []);

  const commonProps = {
    guestName: welcomeGuest.guestName,
  } as const;

  const welcomeScreenExtra = {
    welcomeMessage: welcomeGuest.welcomeMessage,
    signatureTitle: welcomeGuest.signatureTitle,
    roomNavLabel: welcomeGuest.roomNavLabel,
  };

  const backgroundSource =
    backgroundImageUri != null && backgroundImageUri.length > 0
      ? {uri: backgroundImageUri}
      : require('./src/assets/background.jpg');

  return (
    <ImageBackground
      source={backgroundSource}
      style={styles.container}
      resizeMode="cover">
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/*
        AnimatedScreen receives isActive={screen === 'welcome'} — NOT gated by splashDone.
        This means the Welcome screen's AnimatedScreen initialises at opacity=1 and stays
        there the whole time. The splash overlay sits on top and hides it; when the splash
        fades out, home is already at opacity=1 — no blank flash, no ghost text.

        WelcomeScreen itself receives isActive gated by splashDone so D-pad keys are
        suppressed while the splash is visible.
      */}
      <AnimatedScreen isActive={screen === 'welcome'}>
        <WelcomeScreen
          {...commonProps}
          {...welcomeScreenExtra}
          isActive={screen === 'welcome' && splashDone}
          activeNavIndex={3}
          backgroundImageSource={null}
          onNotificationsPress={() => setScreen('notifications')}
          notificationCount={unreadCount}
          onNavItemPress={(item: NavItemData) => {
            if (item.icon === 'health') {
              setScreen('health');
            } else if (item.icon === 'cart') {
              setScreen('hypermarket');
            } else if (item.icon === 'facilities') {
              setScreen('facilities');
            } else if (item.icon === 'channel') {
              setScreen('etihadChannels');
            } else if (item.icon === 'tv') {
              setScreen('channel');
            } else if (item.icon === 'dining') {
              setScreen('dining');
            } else if (item.icon === 'plaza') {
              setScreen('plaza');
            } else if (item.icon === 'notifications') {
              setScreen('notifications');
            }
          }}
        />
      </AnimatedScreen>

      {shouldMount('health') && (
        <AnimatedScreen isActive={screen === 'health'}>
          <OccupationalHealthSafetyScreen
            {...commonProps}
            isActive={screen === 'health'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('facilities') && (
        <AnimatedScreen isActive={screen === 'facilities'}>
          <FacilitiesScreen
            {...commonProps}
            isActive={screen === 'facilities'}
            backgroundImageSource={null}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('channel') && (
        <AnimatedScreen isActive={screen === 'channel'}>
          <EtihadChannelScreen
            isActive={screen === 'channel'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('etihadChannels') && (
        <AnimatedScreen isActive={screen === 'etihadChannels'}>
          <EtihadChannelsScreen
            isActive={screen === 'etihadChannels'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('dining') && (
        <AnimatedScreen isActive={screen === 'dining'}>
          <EtihadDiningScreen
            isActive={screen === 'dining'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('plaza') && (
        <AnimatedScreen isActive={screen === 'plaza'}>
          <EtihadPlazaScreen
            isActive={screen === 'plaza'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('hypermarket') && (
        <AnimatedScreen isActive={screen === 'hypermarket'}>
          <EtihadHypermarketScreen
            isActive={screen === 'hypermarket'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}
      {shouldMount('notifications') && (
        <AnimatedScreen isActive={screen === 'notifications'}>
          <NotificationScreen
            isActive={screen === 'notifications'}
            onBack={() => setScreen('welcome')}
          />
        </AnimatedScreen>
      )}

      {/* Splash overlay — solid background, unmounts instantly when done so the logo
          can never ghost over the home content on slow TVs. */}
      {!splashDone && (
        <View
          style={[StyleSheet.absoluteFillObject, {backgroundColor: '#28343E'}]}
          pointerEvents="box-none">
          <EtihadSplashScreen onFinish={handleSplashFinish} />
        </View>
      )}
    </ImageBackground>
  );
}

function AppUpdateLayer(): React.JSX.Element {
  const {modalVisible, updateData, dismiss} = useAppUpdate();
  return (
    <UpdateModal
      visible={modalVisible}
      updateData={updateData}
      onDismiss={dismiss}
    />
  );
}

function App(): React.JSX.Element {
  return (
    <EmergencyAlertProvider>
      <NotificationProvider>
        <AppContent />
        <EmergencyAlertModal />
        <AppUpdateLayer />
      </NotificationProvider>
    </EmergencyAlertProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default App;
