import { create } from 'zustand';

interface SettingsState {
  notifications: boolean;
  autoRecord: boolean;
  darkMode: boolean;
  streamQuality: 'low' | 'medium' | 'high';
  gridLayout: '1x1' | '2x2' | '3x3';
  audioEnabled: boolean;
  storageUsed: number;
  storageTotal: number;

  toggleNotifications: () => void;
  toggleAutoRecord: () => void;
  toggleDarkMode: () => void;
  setStreamQuality: (quality: 'low' | 'medium' | 'high') => void;
  setGridLayout: (layout: '1x1' | '2x2' | '3x3') => void;
  toggleAudio: () => void;
  setStorage: (used: number, total: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  notifications: true,
  autoRecord: true,
  darkMode: true,
  streamQuality: 'medium',
  gridLayout: '2x2',
  audioEnabled: true,
  storageUsed: 45.2,
  storageTotal: 100,

  toggleNotifications: () =>
    set((state) => ({ notifications: !state.notifications })),

  toggleAutoRecord: () =>
    set((state) => ({ autoRecord: !state.autoRecord })),

  toggleDarkMode: () =>
    set((state) => ({ darkMode: !state.darkMode })),

  setStreamQuality: (quality) => set({ streamQuality: quality }),

  setGridLayout: (layout) => set({ gridLayout: layout }),

  toggleAudio: () =>
    set((state) => ({ audioEnabled: !state.audioEnabled })),

  setStorage: (used, total) =>
    set({ storageUsed: used, storageTotal: total }),
}));