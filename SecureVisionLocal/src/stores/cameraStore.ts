import { create } from 'zustand';
import type { Camera } from '@shared/types';

interface CameraState {
  cameras: Camera[];
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;

  setCameras: (cameras: Camera[]) => void;
  addCamera: (camera: Camera) => void;
  updateCamera: (id: string, updates: Partial<Camera>) => void;
  removeCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  selectedCameraId: null,
  isLoading: false,
  error: null,

  setCameras: (cameras) => set({ cameras }),

  addCamera: (camera) =>
    set((state) => ({ cameras: [...state.cameras, camera] })),

  updateCamera: (id, updates) =>
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === id ? { ...cam, ...updates } : cam
      ),
    })),

  removeCamera: (id) =>
    set((state) => ({
      cameras: state.cameras.filter((cam) => cam.id !== id),
    })),

  selectCamera: (id) => set({ selectedCameraId: id }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));

const mockCameras: Camera[] = [
  {
    id: '1',
    name: 'Entrada Principal',
    ip: '192.168.1.100',
    port: 554,
    protocol: 'rtsp',
    type: 'bullet',
    streamUrl: 'rtsp://192.168.1.100:554/stream',
    status: 'online',
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
    status: 'online',
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
    status: 'online',
    isRecording: true,
    hasPTZ: true,
    presetCount: 16,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

useCameraStore.getState().setCameras(mockCameras);