import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  autoRecord: boolean;
  streamQuality: 'low' | 'medium' | 'high';
  gridLayout: '1x1' | '2x2' | '3x3';
  audioEnabled: boolean;
  storageUsed: number;
  storageTotal: number;

  setTheme: (theme: 'light' | 'dark') => void;
  setLanguage: (language: string) => void;
  toggleNotifications: () => void;
  toggleAutoRecord: () => void;
  setStreamQuality: (quality: 'low' | 'medium' | 'high') => void;
  setGridLayout: (layout: '1x1' | '2x2' | '3x3') => void;
  toggleAudio: () => void;
  setStorage: (used: number, total: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'pt-BR',
      notifications: true,
      autoRecord: true,
      streamQuality: 'medium',
      gridLayout: '2x2',
      audioEnabled: true,
      storageUsed: 45.2,
      storageTotal: 100,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleNotifications: () =>
        set((state) => ({ notifications: !state.notifications })),

      toggleAutoRecord: () =>
        set((state) => ({ autoRecord: !state.autoRecord })),

      setStreamQuality: (quality) => set({ streamQuality: quality }),

      setGridLayout: (layout) => set({ gridLayout: layout }),

      toggleAudio: () =>
        set((state) => ({ audioEnabled: !state.audioEnabled })),

      setStorage: (used, total) =>
        set({ storageUsed: used, storageTotal: total }),
    }),
    {
      name: 'securevision-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);