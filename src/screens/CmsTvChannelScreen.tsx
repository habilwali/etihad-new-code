/**
 * TV Channels — CMS-driven horizontal categories (getPackages) + channel list (getChannels per package).
 * Feeds the same ChannelScreen layout as the former static TV_CHANNELS_DATA.
 */

import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ChannelScreen from './ChannelScreen';
import {
  logDevAllChannelList,
  type ChannelDataConfig,
  type ChannelItem,
} from '../data/channelData';
import {resolveCmsChannelStreamUrl} from '../config/cmsEndpoints';
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {getDeviceMacForWelcomeApi} from '../utils/getDeviceMacForWelcome';
import {
  fetchIptvChannels,
  fetchIptvPackages,
  type IptvChannelRow,
  type IptvPackageRow,
  type IptvPackagesResult,
} from '../services/iptvCmsApi';
import {scheduleIptvFirstRowPlaybackWarmup} from '../services/channelListsPrefetch';

function hashHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 35% 42%)`;
}

function cmsRowToChannelItem(
  ch: IptvChannelRow,
  packageId: number,
): ChannelItem {
  const offline = /offline|disabled|down/i.test(String(ch.status || ''));
  return {
    id: ch.id,
    cat: String(packageId),
    name: ch.name,
    program: ch.status ? String(ch.status) : 'Live',
    time: '—',
    progress: 0,
    hd: true,
    live: !offline,
    color: hashHue(ch.name),
    videoUrl: resolveCmsChannelStreamUrl(ch.stream_url),
  };
}

function packagesErrorMessage(
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
      return 'Unable to read this device.';
    case 'network':
      return res.message || 'Network error.';
    default:
      return res.message || 'Could not load packages';
  }
}

async function buildChannelConfig(
  mac: string,
  packages: IptvPackageRow[],
): Promise<ChannelItem[]> {
  const results = await Promise.all(
    packages.map(p => fetchIptvChannels(p.id, mac)),
  );
  const items: ChannelItem[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < packages.length; i++) {
    const res = results[i];
    const pkg = packages[i];
    if (!res.ok) {
      continue;
    }
    for (const ch of res.channels) {
      if (seen.has(ch.id)) {
        continue;
      }
      seen.add(ch.id);
      items.push(cmsRowToChannelItem(ch, pkg.id));
    }
  }
  logDevAllChannelList('cmsTvChannelScreen', items);
  return items;
}

export interface CmsTvChannelScreenProps {
  onBack: () => void;
  isActive?: boolean;
}

export default function CmsTvChannelScreen({
  onBack,
  isActive = true,
}: CmsTvChannelScreenProps) {
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [config, setConfig] = useState<ChannelDataConfig | null>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      setErrorMsg('');
      setConfig(null);
      const mac = await getDeviceMacForWelcomeApi();
      if (cancelled) {
        return;
      }
      const pkgRes = await fetchIptvPackages(mac);
      if (cancelled) {
        return;
      }
      if (!pkgRes.ok) {
        setLoadState('error');
        setErrorMsg(packagesErrorMessage(pkgRes));
        return;
      }
      if (pkgRes.packages.length === 0) {
        setLoadState('error');
        setErrorMsg('No packages available for this device.');
        return;
      }
      const channels = await buildChannelConfig(mac, pkgRes.packages);
      if (cancelled) {
        return;
      }
      if (channels.length === 0) {
        setLoadState('error');
        setErrorMsg('No channels assigned for this device.');
        return;
      }
      const categories = [
        {id: 'all', label: 'All Channels'},
        ...pkgRes.packages.map(p => ({
          id: String(p.id),
          label: p.name,
        })),
      ];
      const cfg: ChannelDataConfig = {
        sidebarTitle: 'CHANNELS',
        categories,
        channels,
      };
      scheduleIptvFirstRowPlaybackWarmup(cfg);
      setConfig(cfg);
      setLoadState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, reloadToken]);

  if (loadState === 'error') {
    return (
      <View style={st.fallback}>
        <Text style={st.errorTitle}>Channels unavailable</Text>
        <Text style={st.errorBody}>{errorMsg}</Text>
        <TouchableOpacity
          style={st.retryBtn}
          onPress={() => setReloadToken(t => t + 1)}
          focusable>
          <Text style={st.retryBtnTxt}>TRY AGAIN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.backLink} onPress={onBack} focusable>
          <Text style={st.backLinkTxt}>‹ BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadState === 'loading' || !config) {
    return (
      <View style={st.fallback}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={st.fallbackTxt}>Loading TV channels…</Text>
      </View>
    );
  }

  return (
    <ChannelScreen
      key={`cms-tv-${config.channels.length}-${config.categories.length}-${reloadToken}`}
      onBack={onBack}
      isActive={isActive}
      config={config}
    />
  );
}

const st = StyleSheet.create({
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

