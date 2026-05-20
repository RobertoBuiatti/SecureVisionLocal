import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Camera } from '@shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
}

export const useCameraStore = create<CameraState>()(
  persist(
    (set, get) => ({
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
        const state = get();
        if (state.isInitialized) return;
        if (state.isLoading) return;

        set({ isLoading: true, error: null });

        const existingCameras = state.cameras;

        if (existingCameras.length === 0) {
          const defaultCameras = getDefaultCameras();
          set({
            cameras: defaultCameras,
            isLoading: false,
            isInitialized: true
          });
        } else {
          set({ isLoading: false, isInitialized: true });
        }
      },
    }),
    {
      name: 'securevision-cameras',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cameras: state.cameras }),
    }
  )
);

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