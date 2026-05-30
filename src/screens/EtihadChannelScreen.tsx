/**
 * Etihad TV Channels — same CMS IPTV pipeline as legacy TV list; data may be
 * prefetched from app mount (see channelListsPrefetch + App.tsx).
 */

import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ChannelScreen from './ChannelScreen';
import type {ChannelDataConfig} from '../data/channelData';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {AppHeader} from '../components/common/AppHeader';
import {useAppHeaderClock} from '../hooks/useAppHeaderClock';
import {useRemoteKeys} from '../hooks/useRemoteKeys';
import {
  awaitIptvTvChannelConfig,
  peekIptvTvChannelConfig,
  resetIptvTvChannelPrefetch,
} from '../services/channelListsPrefetch';

function readIptvInitialState(): {
  loadState: 'loading' | 'ready' | 'error';
  config: ChannelDataConfig | null;
  errorMsg: string;
} {
  const peek = peekIptvTvChannelConfig();
  if (peek?.ok) {
    return {loadState: 'ready', config: peek.config, errorMsg: ''};
  }
  if (peek && !peek.ok) {
    return {loadState: 'error', config: null, errorMsg: peek.message};
  }
  return {loadState: 'loading', config: null, errorMsg: ''};
}

export interface EtihadChannelScreenProps {
  onBack: () => void;
  isActive?: boolean;
}

export default function EtihadChannelScreen({
  onBack,
  isActive = true,
}: EtihadChannelScreenProps) {
  const headerClock = useAppHeaderClock();
  const [reloadToken, setReloadToken] = useState(0);
  const initial = readIptvInitialState();
  const [loadState, setLoadState] = useState(initial.loadState);
  const [errorMsg, setErrorMsg] = useState(initial.errorMsg);
  const [config, setConfig] = useState<ChannelDataConfig | null>(
    initial.config,
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    let cancelled = false;

    if (reloadToken > 0) {
      resetIptvTvChannelPrefetch();
    }

    const peek = reloadToken === 0 ? peekIptvTvChannelConfig() : null;
    if (peek?.ok) {
      setConfig(peek.config);
      setLoadState('ready');
      setErrorMsg('');
      return () => {
        cancelled = true;
      };
    }
    if (peek && !peek.ok) {
      setConfig(null);
      setLoadState('error');
      setErrorMsg(peek.message);
      return () => {
        cancelled = true;
      };
    }

    setLoadState('loading');
    setErrorMsg('');
    setConfig(null);

    awaitIptvTvChannelConfig().then(res => {
      if (cancelled) {
        return;
      }
      if (res.ok) {
        setConfig(res.config);
        setLoadState('ready');
        setErrorMsg('');
      } else {
        setConfig(null);
        setLoadState('error');
        setErrorMsg(res.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isActive, reloadToken]);

  const onFallback = loadState !== 'ready';
  useRemoteKeys({
    isActive: isActive && onFallback,
    onBack,
  });

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive || !onFallback) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [isActive, onFallback, onBack]);

  if (loadState === 'error') {
    return (
      <View style={st.fallbackRoot}>
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={st.fallback}>
          <Text style={st.errorTitle}>Channels unavailable</Text>
          <Text style={st.errorBody}>{errorMsg}</Text>
          <TouchableOpacity
            style={st.retryBtn}
            onPress={() => setReloadToken(t => t + 1)}
            focusable>
            <Text style={st.retryBtnTxt}>TRY AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.backLink}
            onPress={onBack}
            focusable
            hasTVPreferredFocus>
            <Text style={st.backLinkTxt}>‹ BACK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loadState === 'loading' || !config) {
    return (
      <View style={st.fallbackRoot}>
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={st.fallback}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={st.fallbackTxt}>Loading TV channels…</Text>
        </View>
      </View>
    );
  }

  return (
    <ChannelScreen
      key={`etihad-tv-${config.channels.length}-${config.categories.length}-${reloadToken}`}
      onBack={onBack}
      isActive={isActive}
      config={config}
    />
  );
}

const st = StyleSheet.create({
  fallbackRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallback: {
    flex: 1,
    backgroundColor: Colors.background.dark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  fallbackTxt: {
    fontFamily: FontFamily.book,
    color: Colors.text.muted,
    fontSize: 12,
    marginTop: 8,
  },
  errorTitle: {
    fontFamily: FontFamily.medium,
    color: Colors.primary,
    fontSize: 16,
    marginBottom: 8,
  },
  errorBody: {
    fontFamily: FontFamily.book,
    color: Colors.text.light,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 4,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnTxt: {
    fontFamily: FontFamily.medium,
    color: Colors.primary,
    fontSize: 11,
    letterSpacing: 2,
  },
  backLink: {marginTop: 8, padding: 12},
  backLinkTxt: {
    fontFamily: FontFamily.medium,
    color: Colors.primary,
    fontSize: 12,
    letterSpacing: 2,
  },
});
