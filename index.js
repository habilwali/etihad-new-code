/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {
  startDefaultTvUdpPlaybackWarmup,
  startPrefetchEtihadChannelList,
  startPrefetchIptvTvChannels,
} from './src/services/channelListsPrefetch';
import App from './App';
import {name as appName} from './app.json';

// Begin channel list fetch + first-row stream warmup as soon as the JS bundle runs,
// before React mounts — saves time vs waiting for App’s useEffect (splash / welcome).
// Default preview multicast — proxy + HLS manifest before user opens TV Channel.
startDefaultTvUdpPlaybackWarmup();
startPrefetchIptvTvChannels();
startPrefetchEtihadChannelList();

AppRegistry.registerComponent(appName, () => App);
