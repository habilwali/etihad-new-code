import {apiClient, withRetry} from './api';

import type {GuestInfo} from '@store/useAppStore';
import type {CartItem, Order} from '@store/useCartStore';

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl?: string;
}

export interface CreateOrderPayload {
  items: CartItem[];
}

export interface OrderResponse extends Order {}

export async function fetchGuestInfo(): Promise<GuestInfo> {
  return withRetry(async () => {
    const response = await apiClient.get<GuestInfo>('/guest/info');
    return response.data;
  });
}

export async function fetchRoomServiceMenu(): Promise<MenuItem[]> {
  return withRetry(async () => {
    const response = await apiClient.get<MenuItem[]>('/services/menu');
    return response.data;
  });
}

export async function createRoomServiceOrder(
  payload: CreateOrderPayload,
): Promise<OrderResponse> {
  return withRetry(async () => {
    const response = await apiClient.post<OrderResponse>(
      '/services/order',
      payload,
    );
    return response.data;
  });
}

export async function fetchOrderStatus(orderId: string): Promise<OrderResponse> {
  return withRetry(async () => {
    const response = await apiClient.get<OrderResponse>(
      `/services/order/${orderId}`,
    );
    return response.data;
  });
}

export async function postHousekeepingRequest(
  type: string,
): Promise<{success: boolean}> {
  return withRetry(async () => {
    const response = await apiClient.post<{success: boolean}>(
      '/housekeeping/request',
      {type},
    );
    return response.data;
  });
}

