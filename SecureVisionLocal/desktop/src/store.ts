import { create } from 'zustand';
import type { Camera, DiscoveredCamera, Recording, SystemStatus, AppSettings } from './shared/types';

// Ordena as câmeras conforme a disposição escolhida na grade (arrastar-e-soltar).
// Câmeras fora da lista (recém-adicionadas) entram no final, na ordem de cadastro.
export function orderCameras(cameras: Camera[], order: string[]): Camera[] {
  if (!order.length) return cameras;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...cameras].sort((a, b) => {
    const pa = pos.get(a.id) ?? order.length + a.createdAt;
    const pb = pos.get(b.id) ?? order.length + b.createdAt;
    return pa - pb;
  });
}

export type View =
  | 'live'
  | 'dashboard'
  | 'timeline'
  | 'recordings'
  | 'detections'
  | 'discovery'
  | 'settings';

interface AppState {
  view: View;
  cameras: Camera[];
  discovered: DiscoveredCamera[];
  recordings: Recording[];
  status: SystemStatus | null;
  settings: AppSettings | null;
  isScanning: boolean;
  gridLayout: number;
  cameraOrder: string[];
  selectedCameraId: string | null;
  sidebarOpen: boolean;

  setView: (view: View) => void;
  setGridLayout: (n: number) => void;
  swapCameras: (idA: string, idB: string) => Promise<void>;
  selectCamera: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;

  loadCameras: () => Promise<void>;
  loadRecordings: () => Promise<void>;
  loadStatus: () => Promise<void>;
  loadSettings: () => Promise<void>;
  scan: () => Promise<void>;
  addCamera: (cam: Camera) => void;
  updateCameraFields: (id: string, updates: Partial<Camera>) => Promise<void>;
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
  cameraOrder: [],
  selectedCameraId: null,
  sidebarOpen: true,

  setView: (view) => set({ view, sidebarOpen: false }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setGridLayout: (gridLayout) => {
    set({ gridLayout });
    // Persiste o layout escolhido para reabrir o app no mesmo formato.
    void window.svl.settings.update({ gridLayout });
  },
  // Troca a posição de duas câmeras na grade (drop de uma sobre a outra) e persiste.
  swapCameras: async (idA, idB) => {
    const ids = orderCameras(get().cameras, get().cameraOrder).map((c) => c.id);
    const ia = ids.indexOf(idA);
    const ib = ids.indexOf(idB);
    if (ia < 0 || ib < 0 || ia === ib) return;
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    set({ cameraOrder: ids });
    await window.svl.settings.update({ cameraOrder: ids });
  },
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
    set({ settings, gridLayout: settings.gridLayout, cameraOrder: settings.cameraOrder ?? [] });
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
  updateCameraFields: async (id, updates) => {
    const updated = await window.svl.cameras.update(id, updates);
    if (!updated) return;
    set({ cameras: get().cameras.map((c) => (c.id === id ? updated : c)) });
  },
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
