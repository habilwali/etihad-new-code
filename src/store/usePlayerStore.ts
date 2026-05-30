import {create} from 'zustand';

export type StreamStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'error'
  | 'reconnecting';

export interface Channel {
  id: string;
  number: number;
  name: string;
  url: string;
}

export interface PlayerState {
  channels: Channel[];
  currentChannel: Channel | null;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  streamStatus: StreamStatus;
  setChannels: (channels: Channel[]) => void;
  setCurrentChannel: (channel: Channel | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (isMuted: boolean) => void;
  setStreamStatus: (status: StreamStatus) => void;
}

export const usePlayerStore = create<PlayerState>(set => ({
  channels: [],
  currentChannel: null,
  isPlaying: false,
  volume: 0.5,
  isMuted: false,
  streamStatus: 'idle',
  setChannels: channels => set({channels}),
  setCurrentChannel: currentChannel => set({currentChannel}),
  setIsPlaying: isPlaying => set({isPlaying}),
  setVolume: volume => set({volume}),
  setMuted: isMuted => set({isMuted}),
  setStreamStatus: streamStatus => set({streamStatus}),
}));

