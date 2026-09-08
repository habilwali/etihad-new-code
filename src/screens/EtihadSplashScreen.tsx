/** Copthorne Hotel Sharjah — TV splash screen. */

import React, {useCallback, useEffect, useRef} from 'react';
import {
  DeviceEventEmitter,
  Dimensions,
  Image,
  ImageBackground,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const {width: SW} = Dimensions.get('window');

const BG_IMAGE = require('../assets/copthorne/background.jpg');
const LOGO_IMAGE = require('../assets/copthorne/logo.png');
const MAX_SPLASH_MS = 3500;

export interface EtihadSplashProps {
  onFinish: () => void;
}

export default function EtihadSplashScreen({onFinish}: EtihadSplashProps) {
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

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', goHome);
    return () => sub.remove();
  }, [goHome]);

  return (
    <ImageBackground source={BG_IMAGE} style={s.root} resizeMode="cover">
      <LinearGradient
        colors={['rgba(255,255,255,0.97)', 'rgba(255,255,255,0.74)', 'rgba(255,255,255,0.18)']}
        locations={[0, 0.48, 1]}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 0.5}}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={s.logoCard}>
        <Image source={LOGO_IMAGE} style={s.logo} resizeMode="contain" />
      </View>
    </ImageBackground>
  );
}

const LOGO_WIDTH = SW * 0.34;
const LOGO_HEIGHT = LOGO_WIDTH * 0.48;

const s = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F5EF',
  },
  logoCard: {
    width: LOGO_WIDTH * 1.2,
    height: LOGO_HEIGHT * 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
