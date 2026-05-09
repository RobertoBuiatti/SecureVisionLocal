import { create } from 'zustand';
import type { Camera } from '@shared/types';
import { storageService } from '@services/storage/storageService';

interface CameraState {
  cameras: Camera[];
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  setCameras: (cameras: Camera[]) => void;
  addCamera: (camera: Camera) => void;
  updateCamera: (id: string, updates: Partial<Camera>) => void;
  removeCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  persistCameras: () => Promise<void>;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  cameras: [],
  selectedCameraId: null,
  isLoading: false,
  error: null,
  isInitialized: false,

  setCameras: (cameras) => set({ cameras }),

  addCamera: (camera) =>
    set((state) => ({ cameras: [...state.cameras, camera] })),

  updateCamera: (id, updates) =>
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === id ? { ...cam, ...updates, updatedAt: Date.now() } : cam
      ),
    })),

  removeCamera: (id) =>
    set((state) => ({
      cameras: state.cameras.filter((cam) => cam.id !== id),
      selectedCameraId: state.selectedCameraId === id ? null : state.selectedCameraId,
    })),

  selectCamera: (id) => set({ selectedCameraId: id }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  initialize: async () => {
    if (get().isInitialized) return;
    
    set({ isLoading: true, error: null });
    try {
      const cameras = await storageService.getCameras();
      if (cameras.length === 0) {
        const defaultCameras = getDefaultCameras();
        set({ cameras: defaultCameras, isLoading: false, isInitialized: true });
        await storageService.saveCameras(defaultCameras);
      } else {
        set({ cameras, isLoading: false, isInitialized: true });
      }
    } catch (error) {
      set({ error: 'Failed to load cameras', isLoading: false, isInitialized: true });
    }
  },

  persistCameras: async () => {
    try {
      await storageService.saveCameras(get().cameras);
    } catch (error) {
      console.error('[CameraStore] Failed to persist cameras:', error);
    }
  },
}));

function getDefaultCameras(): Camera[] {
  return [
    {
      id: '1',
      name: 'Entrada Principal',
      ip: '192.168.1.100',
      port: 554,
      protocol: 'rtsp',
      type: 'bullet',
      streamUrl: 'rtsp://192.168.1.100:554/stream',
      status: 'offline',
      isRecording: true,
      hasPTZ: true,
      presetCount: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '2',
      name: 'Garagem',
      ip: '192.168.1.101',
      port: 554,
      protocol: 'rtsp',
      type: 'dome',
      streamUrl: 'rtsp://192.168.1.101:554/stream',
      status: 'offline',
      isRecording: false,
      hasPTZ: true,
      presetCount: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '3',
      name: 'Fundos',
      ip: '192.168.1.102',
      port: 554,
      protocol: 'rtsp',
      type: 'bullet',
      streamUrl: 'rtsp://192.168.1.102:554/stream',
      status: 'offline',
      isRecording: false,
      hasPTZ: false,
      presetCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '4',
      name: 'Portão',
      ip: '192.168.1.103',
      port: 554,
      protocol: 'rtsp',
      type: 'ptz',
      streamUrl: 'rtsp://192.168.1.103:554/stream',
      status: 'offline',
      isRecording: true,
      hasPTZ: true,
      presetCount: 16,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}