export const remoteKeys = {
  DPAD_UP: 'up',
  DPAD_DOWN: 'down',
  DPAD_LEFT: 'left',
  DPAD_RIGHT: 'right',
  SELECT: 'select',
  ENTER: 'enter',
  BACK: 'back',
  MENU: 'menu',
  PLAY_PAUSE: 'playPause',
  FAST_FORWARD: 'fastForward',
  REWIND: 'rewind',
  VOLUME_UP: 'volumeUp',
  VOLUME_DOWN: 'volumeDown',
  CHANNEL_UP: 'channelUp',
  CHANNEL_DOWN: 'channelDown',
} as const;

export type RemoteKey = (typeof remoteKeys)[keyof typeof remoteKeys];

