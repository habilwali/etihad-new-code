import {apiClient, withRetry} from './api';

import type {Channel} from '@store/usePlayerStore';

export async function fetchChannels(): Promise<Channel[]> {
  return withRetry(async () => {
    const response = await apiClient.get<Channel[]>('/channels');
    return response.data;
  });
}

