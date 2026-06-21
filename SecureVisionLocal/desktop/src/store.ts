import { create } from 'zustand';
import type { Camera, DiscoveredCamera, Recording, SystemStatus, AppSettings } from './shared/types';

export type View = 'live' | 'recordings' | 'detections' | 'discovery' | 'settings';

interface AppState {
  view: View;
  cameras: Camera[];
  discovered: DiscoveredCamera[];
  recordings: Recording[];
  status: SystemStatus | null;
  settings: AppSettings | null;
  isScanning: boolean;
  gridLayout: number;
  selectedCameraId: string | null;

  setView: (view: View) => void;
  setGridLayout: (n: number) => void;
  selectCamera: (id: string | null) => void;

  loadCameras: () => Promise<void>;
  loadRecordings: () => Promise<void>;
  loadStatus: () => Promise<void>;
  loadSettings: () => Promise<void>;
  scan: () => Promise<void>;
  addCamera: (cam: Camera) => void;
  removeCamera: (id: string) => Promise<void>;
  setCameraStatus: (id: string, status: Camera['status']) => void;
  toggleContinuous: (id: string, value: boolean) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  view: 'live',
  cameras: [],
  discovered: [],
  recordings: [],
  status: null,
  settings: null,
  isScanning: false,
  gridLayout: 4,
  selectedCameraId: null,

  setView: (view) => set({ view }),
  setGridLayout: (gridLayout) => set({ gridLayout }),
  selectCamera: (selectedCameraId) => set({ selectedCameraId }),

  loadCameras: async () => {
    const cameras = await window.svl.cameras.list();
    set({ cameras });
  },
  loadRecordings: async () => {
    const recordings = await window.svl.recording.list();
    set({ recordings });
  },
  loadStatus: async () => {
    const status = await window.svl.system.status();
    set({ status });
  },
  loadSettings: async () => {
    const settings = await window.svl.settings.get();
    set({ settings, gridLayout: settings.gridLayout });
  },
  scan: async () => {
    set({ isScanning: true, discovered: [] });
    try {
      const discovered = await window.svl.discovery.scan({ timeoutMs: 5000 });
      set({ discovered });
    } finally {
      set({ isScanning: false });
    }
  },
  addCamera: (cam) => set({ cameras: [...get().cameras, cam] }),
  removeCamera: async (id) => {
    await window.svl.cameras.remove(id);
    set({ cameras: get().cameras.filter((c) => c.id !== id) });
  },
  setCameraStatus: (id, status) =>
    set({ cameras: get().cameras.map((c) => (c.id === id ? { ...c, status } : c)) }),
  toggleContinuous: async (id, value) => {
    const updated = await window.svl.cameras.update(id, { recordContinuous: value });
    set({
      cameras: get().cameras.map((c) =>
        c.id === id ? { ...c, recordContinuous: updated?.recordContinuous ?? value } : c,
      ),
    });
  },
}));
