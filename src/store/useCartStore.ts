import {create} from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
}

export interface CartState {
  items: CartItem[];
  activeOrders: Order[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  activeOrders: [],
  addItem: item =>
    set(state => {
      const existing = state.items.find(i => i.id === item.id);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.id === item.id
              ? {...i, quantity: i.quantity + item.quantity}
              : i,
          ),
        };
      }
      return {items: [...state.items, item]};
    }),
  removeItem: id =>
    set(state => ({items: state.items.filter(item => item.id !== id)})),
  clearCart: () => set({items: []}),
  addOrder: order =>
    set(state => ({activeOrders: [...state.activeOrders, order]})),
  updateOrderStatus: (orderId, status) =>
    set(state => ({
      activeOrders: state.activeOrders.map(order =>
        order.id === orderId ? {...order, status} : order,
      ),
    })),
}));

