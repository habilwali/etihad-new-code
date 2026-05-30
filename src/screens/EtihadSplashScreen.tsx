/**
 * Etihad Plaza Hotel — TV Splash Screen
 * Logo on `background.jpg` — matches native window (`android:windowBackground` / iOS LaunchScreen).
 * Stays visible for MAX_SPLASH_MS so the home screen paints underneath before the fade-out.
 * Any key press skips immediately.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Image,
  ImageBackground,
  StyleSheet,
  Dimensions,
  DeviceEventEmitter,
  Platform,
} from 'react-native';

const { width: SW } = Dimensions.get('window');

const BG_IMAGE = require('../assets/background.jpg');
const LOGO_IMAGE = require('../assets/header/ethiad-logo-marketing.png');

// Keep splash visible long enough for the home component tree to fully paint underneath.
// On a slow TV (1 GB RAM) inflation can take 1-2 s; 3500 ms gives comfortable headroom.
const MAX_SPLASH_MS = 3500;

export interface EtihadSplashProps {
  onFinish: () => void;
}

export default function EtihadSplashScreen({ onFinish }: EtihadSplashProps) {
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const goHome = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const maxT = setTimeout(() => {
      if (!cancelled) goHome();
    }, MAX_SPLASH_MS);
    return () => {
      cancelled = true;
      clearTimeout(maxT);
    };
  }, [goHome]);

  // Any remote key press skips the splash early.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', goHome);
    return () => sub.remove();
  }, [goHome]);

  return (
    <ImageBackground source={BG_IMAGE} style={s.root} resizeMode="cover">
      <Image source={LOGO_IMAGE} style={s.logo} resizeMode="contain" />
    </ImageBackground>
  );
}

// Match native splash_logo size (~160dp) to avoid size jump when React mounts
const LOGO_WIDTH = SW * 0.17;
const LOGO_HEIGHT = LOGO_WIDTH * 0.31;

const s = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    // Fallback while background.jpg is decoding — keeps splash opaque on first cold launch.
    backgroundColor: '#28343E',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
