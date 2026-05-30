import {create} from 'zustand';

export type SupportedLanguage = 'en' | 'ar' | 'fr';

export interface GuestInfo {
  name: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
}

export interface AppState {
  guestInfo: GuestInfo | null;
  currentScreen: string;
  isMenuOpen: boolean;
  language: SupportedLanguage;
  setGuestInfo: (guestInfo: GuestInfo) => void;
  setCurrentScreen: (screen: string) => void;
  setMenuOpen: (isOpen: boolean) => void;
  setLanguage: (language: SupportedLanguage) => void;
}

export const useAppStore = create<AppState>(set => ({
  guestInfo: null,
  currentScreen: 'Home',
  isMenuOpen: false,
  language: 'en',
  setGuestInfo: guestInfo => set({guestInfo}),
  setCurrentScreen: currentScreen => set({currentScreen}),
  setMenuOpen: isMenuOpen => set({isMenuOpen}),
  setLanguage: language => set({language}),
}));

